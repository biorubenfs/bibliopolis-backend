import { MongoServerError } from 'mongodb'
import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { runInTransaction } from '../../transaction-helper.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import { MAX_TAGS_PER_USER } from './tags.constants.js'
import tagsDao from './tags.dao.js'
import { TagEntity } from './tags.entity.js'
import { TagLimitReachedError, TagNameConflictError, TagNotFoundError, TagPermissionsError } from './tags.error.js'
import { NewTag, UpdateTag } from './tags.interfaces.js'

class TagsService {
  /** A personal tag cannot share its name with another tag of the user or with a global tag. */
  private async checkNameAvailable (name: string, userId: string, excludeTagId?: string): Promise<void> {
    const existing = await tagsDao.findUsableByName(name, userId)
    if (existing != null && existing.id !== excludeTagId) {
      throw new TagNameConflictError(`there is already a tag with name ${name}`)
    }
  }

  /** Only the owner can change a personal tag; global tags cannot be changed by users. */
  private async getOwnedTag (id: string, userId: string): Promise<TagEntity> {
    const tag = await tagsDao.findById(id)
    if (tag == null) {
      throw new TagNotFoundError('tag not found')
    }
    if (tag.userId == null) {
      throw new TagPermissionsError('global tags cannot be modified')
    }
    if (tag.userId !== userId) {
      throw new TagPermissionsError('tag not found')
    }
    return tag
  }

  async list (userId: string, page: Page): Promise<CollectionResultObject<TagEntity>> {
    const [tags, total] = await Promise.all([
      tagsDao.list(userId, page.skip, page.limit),
      tagsDao.count(userId)
    ])
    return new CollectionResultObject(tags, { ...page, total })
  }

  async create (body: NewTag, userId: string): Promise<SingleResultObject<TagEntity>> {
    if (await tagsDao.countOwnedBy(userId) >= MAX_TAGS_PER_USER) {
      throw new TagLimitReachedError(`a user cannot have more than ${MAX_TAGS_PER_USER} tags`)
    }
    await this.checkNameAvailable(body.name, userId)

    try {
      return new SingleResultObject(await tagsDao.create(body, userId))
    } catch (error) {
      // The same tag created twice at once: the unique index rejects the second one
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new TagNameConflictError(`there is already a tag with name ${body.name}`)
      }
      throw error
    }
  }

  async update (id: string, body: UpdateTag, userId: string): Promise<SingleResultObject<TagEntity>> {
    await this.getOwnedTag(id, userId)
    if (body.name != null) {
      await this.checkNameAvailable(body.name, userId, id)
    }

    try {
      const updated = await tagsDao.update(id, body)
      if (updated == null) {
        throw new TagNotFoundError('tag not found')
      }
      return new SingleResultObject(updated)
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new TagNameConflictError(`there is already a tag with name ${String(body.name)}`)
      }
      throw error
    }
  }

  /** Deletes the tag and removes it from the libraries of its owner. */
  async delete (id: string, userId: string): Promise<void> {
    const tag = await this.getOwnedTag(id, userId)

    await runInTransaction(async (session) => {
      await librariesDao.removeTagFromLibraries(tag.id, userId, session)
      await tagsDao.delete(tag.id, session)
      // runInTransaction treats a null or undefined result as an aborted transaction
      return true
    })
  }
}

export default new TagsService()
