import { ulid } from 'ulid'
import { ClientSession, Filter } from 'mongodb'
import Dao from '../../dao.js'
import { isNotNull } from '../../utils.js'
import { TagEntity } from './tags.entity.js'
import { DBTag, NewTag, UpdateTag } from './tags.interfaces.js'

function dbTagToEntity (dbTag: DBTag | null): TagEntity | null {
  return dbTag == null ? null : new TagEntity(dbTag)
}

export function normalizeTagName (name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

/** The tags a user can see and use: their own and the global ones. */
function usableBy (userId: string): Filter<DBTag> {
  return { userId: { $in: [userId, null] } }
}

class TagsDao extends Dao<DBTag> {
  constructor () {
    super('tags')
  }

  async init (): Promise<void> {
    // One name per owner; global tags (userId null) share their own namespace
    await this.collection.createIndex({ userId: 1, normalizedName: 1 }, { unique: true })
  }

  async create (newTag: NewTag, userId: string | null): Promise<TagEntity> {
    const now = new Date()
    const dbTag: DBTag = {
      _id: ulid(),
      name: newTag.name,
      normalizedName: normalizeTagName(newTag.name),
      color: newTag.color,
      userId,
      createdAt: now,
      updatedAt: now
    }
    await this.collection.insertOne(dbTag)
    return new TagEntity(dbTag)
  }

  async update (id: string, changes: UpdateTag): Promise<TagEntity | null> {
    const updateDoc: Partial<DBTag> = {
      ...(changes.name != null ? { name: changes.name, normalizedName: normalizeTagName(changes.name) } : {}),
      ...(changes.color != null ? { color: changes.color } : {}),
      updatedAt: new Date()
    }
    const updated = await this.collection.findOneAndUpdate({ _id: id }, { $set: updateDoc }, { returnDocument: 'after' })
    return dbTagToEntity(updated)
  }

  async delete (id: string, session?: ClientSession): Promise<void> {
    await this.collection.deleteOne({ _id: id }, { session })
  }

  async findById (id: string): Promise<TagEntity | null> {
    return dbTagToEntity(await this.collection.findOne({ _id: id }))
  }

  /** A tag usable by the user (own or global) with the same name, ignoring case. */
  async findUsableByName (name: string, userId: string): Promise<TagEntity | null> {
    return dbTagToEntity(await this.collection.findOne({ ...usableBy(userId), normalizedName: normalizeTagName(name) }))
  }

  async list (userId: string, skip: number, limit: number): Promise<readonly TagEntity[]> {
    const dbTags = await this.collection.find(usableBy(userId))
      .sort({ normalizedName: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray()
    return dbTags.map(dbTag => dbTagToEntity(dbTag)).filter(isNotNull)
  }

  async count (userId: string): Promise<number> {
    return await this.collection.countDocuments(usableBy(userId))
  }

  async countOwnedBy (userId: string): Promise<number> {
    return await this.collection.countDocuments({ userId })
  }

  /** How many of the given tags the user can use: equal to ids.length when all of them are valid. */
  async countUsable (ids: readonly string[], userId: string): Promise<number> {
    return await this.collection.countDocuments({ ...usableBy(userId), _id: { $in: [...ids] } })
  }
}

export default new TagsDao()
