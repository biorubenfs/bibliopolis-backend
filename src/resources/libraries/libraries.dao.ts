import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { escapeRegExp, isNotNull } from '../../utils.js'
import { DBLibrary, LibrariesListFilter, LibraryMember, NewLibrary, UpdateLibrary } from './libraries.interfaces.js'
import { LibraryEntity } from './libraries.entity.js'
import { MAX_MEMBERS_PER_LIBRARY } from '../library-members/library-members.constants.js'
import { ClientSession, Filter } from 'mongodb'

function dbLibraryToEntity (dbLibrary: DBLibrary | null): LibraryEntity | null {
  return dbLibrary == null ? null : new LibraryEntity(dbLibrary)
}

function listLibrariesMongoFilter (userId: string, filter: LibrariesListFilter): Filter<DBLibrary> {
  const { ids, search, favorites, tagIds } = filter
  const mongoFilter: Filter<DBLibrary> = {
    userId,
    ...(ids != null && ids.length > 0 ? { _id: { $in: [...ids] } } : {}),
    ...(favorites === true ? { isFavorite: true } : {}),
    ...(tagIds != null && tagIds.length > 0 ? { tagIds: { $all: [...tagIds] } } : {})
  }

  if (search != null && search !== '') {
    // Case-insensitive substring match: user input is escaped so it is matched literally
    const pattern = { $regex: escapeRegExp(search), $options: 'i' }
    mongoFilter.$or = [{ name: pattern }, { description: pattern }]
  }

  return mongoFilter
}

class LibrariesDao extends Dao<DBLibrary> {
  constructor () {
    super('libraries')
  }

  async init (): Promise<void> {
    await this.collection.createIndex({ userId: 1 })
    // Same order as list(): favorites first, then by id
    await this.collection.createIndex({ userId: 1, isFavorite: -1, _id: 1 })
    await this.collection.createIndex({ userId: 1, tagIds: 1 })
    // The libraries shared with a user
    await this.collection.createIndex({ 'members.userId': 1 })
  }

  async create (newLibrary: NewLibrary, userId: string): Promise<LibraryEntity> {
    const now = new Date()
    const dbLibrary: DBLibrary = {
      name: newLibrary.name,
      description: newLibrary.description ?? null,
      _id: ulid(),
      books: [],
      isFavorite: false,
      shareRatings: false,
      tagIds: newLibrary.tagIds ?? [],
      members: [],
      userId,
      createdAt: now,
      updatedAt: now
    }

    await this.collection.insertOne(dbLibrary)
    return new LibraryEntity(dbLibrary)
  }

  async update (id: string, updateData: UpdateLibrary): Promise<LibraryEntity | null> {
    const now = new Date()
    const updateDoc: Partial<DBLibrary> = {
      ...updateData,
      updatedAt: now
    }

    const updatedLibrary = await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: updateDoc },
      { returnDocument: 'after' }
    )

    return dbLibraryToEntity(updatedLibrary)
  }

  async findById (id: string): Promise<LibraryEntity | null> {
    const dbLibrary = await this.collection.findOne({ _id: id })

    return dbLibraryToEntity(dbLibrary)
  }

  async findByUserAndName (name: string, userId: string): Promise<LibraryEntity | null> {
    const dbLibrary = await this.collection.findOne({ userId, name })
    return dbLibraryToEntity(dbLibrary)
  }

  async delete (id: string, session?: ClientSession): Promise<void> {
    await this.collection.deleteOne({ _id: id }, { session })
  }

  async list (userId: string, skip: number, limit: number, filter: LibrariesListFilter = {}): Promise<readonly LibraryEntity[]> {
    const mongoFilter = listLibrariesMongoFilter(userId, filter)
    const dbLibraries = await this.collection.find(mongoFilter)
      // Favorites first; _id keeps the pagination stable
      .sort({ isFavorite: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray()
    return dbLibraries.map(dbLibrary => dbLibraryToEntity(dbLibrary)).filter(isNotNull)
  }

  /** How many of the given libraries belong to the user. */
  async countByIds (ids: readonly string[], userId: string): Promise<number> {
    return await this.collection.countDocuments({ _id: { $in: [...ids] }, userId })
  }

  async count (userId: string, filter: LibrariesListFilter = {}): Promise<number> {
    const mongoFilter = listLibrariesMongoFilter(userId, filter)
    const total = await this.collection.countDocuments(mongoFilter)
    return total
  }

  /** Removes a deleted tag from the libraries of the user. */
  async removeTagFromLibraries (tagId: string, userId: string, session?: ClientSession): Promise<void> {
    await this.collection.updateMany({ userId, tagIds: tagId }, { $pull: { tagIds: tagId } }, { session })
  }

  /**
   * Adds a member, or returns null if the library does not exist, is full or already has that member. The filter makes
   * it atomic: neither the same user nor one over the limit can be added by simultaneous invitations.
   */
  async addMember (libraryId: string, userId: string): Promise<LibraryMember | null> {
    const member: LibraryMember = { userId, createdAt: new Date() }
    const result = await this.collection.updateOne(
      {
        _id: libraryId,
        'members.userId': { $ne: userId },
        [`members.${MAX_MEMBERS_PER_LIBRARY - 1}`]: { $exists: false }
      },
      { $push: { members: member } }
    )
    return result.modifiedCount > 0 ? member : null
  }

  /** Whether the user was a member. */
  async removeMember (libraryId: string, userId: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: libraryId, 'members.userId': userId },
      { $pull: { members: { userId } } }
    )
    return result.modifiedCount > 0
  }

  async addBookIdToLibrary (libraryId: string, bookId: string, session?: ClientSession): Promise<LibraryEntity | null> {
    const updatedLibrary: DBLibrary | null = await this.collection.findOneAndUpdate(
      { _id: libraryId },
      { $addToSet: { books: bookId } },
      { returnDocument: 'after', session })
    return dbLibraryToEntity(updatedLibrary)
  }

  async removeBookIdFromLibrary (libraryId: string, userBooksId: string, session?: ClientSession): Promise<LibraryEntity | null> {
    const updatedLibrary = await this.collection.findOneAndUpdate(
      { _id: libraryId },
      { $pull: { books: userBooksId } },
      { returnDocument: 'after', session }
    )
    return dbLibraryToEntity(updatedLibrary)
  }
}

export default new LibrariesDao()
