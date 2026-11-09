import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { escapeRegExp, isNotNull } from '../../utils.js'
import { DBLibrary, LibrariesListFilter, LibrariesStats, NewLibrary, UpdateLibrary } from './libraries.interfaces.js'
import { LibraryEntity } from './libraries.entity.js'
import { ClientSession, Filter } from 'mongodb'

function dbLibraryToEntity (dbLibrary: DBLibrary | null): LibraryEntity | null {
  return dbLibrary == null ? null : new LibraryEntity(dbLibrary)
}

function listLibrariesMongoFilter (userId: string, filter: LibrariesListFilter): Filter<DBLibrary> {
  const { search, favorites, tagIds } = filter
  const mongoFilter: Filter<DBLibrary> = {
    userId,
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
  }

  async create (newLibrary: NewLibrary, userId: string): Promise<LibraryEntity> {
    const now = new Date()
    const dbLibrary: DBLibrary = {
      name: newLibrary.name,
      description: newLibrary.description,
      _id: ulid(),
      books: [],
      isFavorite: false,
      tagIds: newLibrary.tagIds ?? [],
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

  async count (userId: string, filter: LibrariesListFilter = {}): Promise<number> {
    const mongoFilter = listLibrariesMongoFilter(userId, filter)
    const total = await this.collection.countDocuments(mongoFilter)
    return total
  }

  /** Removes a deleted tag from the libraries of the user. */
  async removeTagFromLibraries (tagId: string, userId: string, session?: ClientSession): Promise<void> {
    await this.collection.updateMany({ userId, tagIds: tagId }, { $pull: { tagIds: tagId } }, { session })
  }

  async addBookIdToLibrary (libraryId: string, bookId: string, session?: ClientSession): Promise<LibraryEntity | null> {
    const updatedLibrary: DBLibrary | null = await this.collection.findOneAndUpdate(
      { _id: libraryId },
      { $addToSet: { books: bookId } },
      { returnDocument: 'after', session })
    return dbLibraryToEntity(updatedLibrary)
  }

  async removeBookIdFromLibrary (libraryId: string, userBooksId: string): Promise<LibraryEntity | null> {
    const updatedLibrary = await this.collection.findOneAndUpdate(
      { _id: libraryId },
      { $pull: { books: userBooksId } },
      { returnDocument: 'after' }
    )
    return dbLibraryToEntity(updatedLibrary)
  }

  async statsByUser (userId: string): Promise<LibrariesStats> {
    const [stats] = await this.collection.aggregate<LibrariesStats>([
      { $match: { userId } },
      { $project: { size: { $size: '$books' } } },
      { $group: { _id: null, count: { $sum: 1 }, totalBooks: { $sum: '$size' }, largestBooks: { $max: '$size' } } },
      { $project: { _id: 0, count: 1, totalBooks: 1, largestBooks: 1 } }
    ]).toArray()

    // Without libraries, $group returns no document
    return stats ?? { count: 0, totalBooks: 0, largestBooks: null }
  }
}

export default new LibrariesDao()
