import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { escapeRegExp, isNotNull } from '../../utils.js'
import { DBUserBook, UpdateUserBook } from './user-books.interfaces.js'
import { UserBookEntity } from './user-books.entity.js'
import { AggregationCursor, ClientSession, Filter, WithId } from 'mongodb'
import { BookEntity } from '../books/books.entity.js'
import { BookSyncData } from '../books/books.interfaces.js'
import { ISBNUtils } from '../../utils/isbn.utils.js'

function dbUserBookToEntity (dbUserBook: DBUserBook | null): UserBookEntity | null {
  return dbUserBook == null ? null : new UserBookEntity(dbUserBook)
}

interface UserBooksFilter {
  librariesIds?: readonly string[]
  /** Only the books that are still in some library: a book removed from its last library keeps its data but is not listed */
  inAnyLibrary?: boolean
  userId?: string
  search?: string
}

/**
 * Literal search: an ISBN is matched exactly, under any of its two forms and with or without hyphens; anything else,
 * as a case-insensitive substring of the title, the authors or the ISBNs. User input is escaped so it is matched literally.
 */
function buildSearchMatch (search: string): Filter<DBUserBook> {
  const isbn = ISBNUtils.sanitizeIsbn(search)
  if (ISBNUtils.isValidIsbn13(isbn) || ISBNUtils.isValidIsbn10(isbn)) {
    return { $or: [{ bookIsbn13: isbn }, { bookIsbn10: isbn }] }
  }

  const pattern = { $regex: escapeRegExp(search), $options: 'i' }
  return {
    $or: [
      { bookTitle: pattern },
      { bookAuthors: pattern },
      { bookIsbn13: pattern },
      { bookIsbn10: pattern }
    ]
  }
}

function buildMongoFilter (filters: UserBooksFilter): Filter<DBUserBook> {
  return {
    ...(filters.librariesIds != null ? { libraries: { $in: [...filters.librariesIds] } } : {}),
    ...(filters.inAnyLibrary === true ? { 'libraries.0': { $exists: true } } : {}),
    ...(filters.userId != null ? { userId: filters.userId } : {}),
    ...(filters.search != null && filters.search !== '' ? buildSearchMatch(filters.search) : {})
  }
}

/*
 * Atlas Search alternative, disabled for now: it only works on MongoDB Atlas with the `user_books_search` index, cannot
 * be tested locally or in the CI, and behaves differently from the literal search. Kept as a starting point for a
 * future autocomplete with relevance ranking. To use it:
 * - `$search` must be the first stage of the pipeline, so `list` and `count` need an aggregation again
 * - put the user and library filters inside `compound.filter` instead of a later `$match`, so Atlas does not score
 *   and return the books of every user
 * - keep the relevance order: do not add a `$sort` after it
 * - skip the stage for an empty search
 *
 * function buildAtlasSearchStage (search: string): Document {
 *   return {
 *     $search: {
 *       index: 'user_books_search',
 *       compound: {
 *         should: [
 *           { autocomplete: { query: search, path: 'bookIsbn13' } },
 *           { autocomplete: { query: search, path: 'bookIsbn10' } },
 *           { autocomplete: { query: search, path: 'bookTitle' } },
 *           { text: { query: search, path: 'bookTitle' } },
 *           { text: { query: search, path: 'bookAuthors' } }
 *         ],
 *         minimumShouldMatch: 1
 *       }
 *     }
 *   }
 * }
 */

class UserBooksDao extends Dao<DBUserBook> {
  constructor () {
    super('user_books')
  }

  async init (): Promise<void> {
    await this.collection.createIndex({ userId: 1, bookId: 1 }, { unique: true })
    // Same order as list(), so the pages come out of the index without sorting every book of the user in memory
    await this.collection.createIndex({ userId: 1, _id: -1 })
    await this.collection.createIndex({ userId: 1, libraries: 1, _id: -1 })
    // syncBookData filters by book only: without this index it scans the whole collection
    await this.collection.createIndex({ bookId: 1 })
  }

  async findById (id: string): Promise<UserBookEntity | null> {
    const userBook = await this.collection.findOne({ _id: id })

    return dbUserBookToEntity(userBook)
  }

  async findByUserAndBook (userId: string, bookId: string, session?: ClientSession): Promise<UserBookEntity | null> {
    return dbUserBookToEntity(await this.collection.findOne({ userId, bookId }, { session }))
  }

  async findIsbn13InLibrary (userId: string, libraryId: string, isbns13: readonly string[]): Promise<string[]> {
    const dbUserBooks = await this.collection
      .find({ userId, libraries: libraryId, bookIsbn13: { $in: [...isbns13] } }, { projection: { bookIsbn13: 1 } })
      .toArray()
    return dbUserBooks.map(dbUserBook => dbUserBook.bookIsbn13)
  }

  async upsert (libraryId: string, userId: string, book: BookEntity, session: ClientSession): Promise<UserBookEntity | null> {
    const userBook = await this.collection.findOneAndUpdate(
      { userId, bookId: book.id },
      {
        $setOnInsert: {
          _id: ulid(),
          bookTitle: book.title,
          bookAuthors: book.authors,
          bookCover: book.cover,
          bookIsbn13: book.isbn13,
          bookIsbn10: book.isbn10,
          rating: null,
          notes: null
        },
        // A book can be added by hand while an import of the same book is running
        $addToSet: { libraries: libraryId }
      },
      { upsert: true, session, returnDocument: 'after' } // options
    )

    return dbUserBookToEntity(userBook)
  }

  async delete (libraryId: string, userBookId: string, userId: string, session: ClientSession): Promise<void> {
    await this.collection.updateOne(
      {
        _id: userBookId,
        libraries: libraryId,
        userId
      },
      { $pull: { libraries: libraryId } },
      { session })
  }

  async list (filters: UserBooksFilter, skip: number, limit: number): Promise<readonly UserBookEntity[]> {
    // Newest first: ULIDs sort by creation time. Without a sort the pages may overlap
    const dbUserBooks = await this.collection
      .find(buildMongoFilter(filters))
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    return dbUserBooks.map(dbUserBookToEntity).filter(isNotNull)
  }

  async listCursor (filters: Omit<UserBooksFilter, 'search'>): Promise<AggregationCursor<WithId<DBUserBook>>> {
    return this.collection.aggregate<WithId<DBUserBook>>([{ $match: buildMongoFilter(filters) }])
  }

  async count (filters: UserBooksFilter): Promise<number> {
    return await this.collection.countDocuments(buildMongoFilter(filters))
  }

  /**
   * Copies the corrected data of a book to every user book of it. The ISBNs are not copied because they
   * cannot change, and updatedAt is not touched: it reflects the changes of the reader.
   */
  async syncBookData (bookId: string, data: BookSyncData, session: ClientSession): Promise<number> {
    const result = await this.collection.updateMany(
      { bookId },
      { $set: { bookTitle: data.title, bookAuthors: data.authors, bookCover: data.cover } },
      { session }
    )
    return result.modifiedCount
  }

  async deleteAll (libraryId: string, userId: string, session?: ClientSession): Promise<void> {
    await this.collection.updateMany({ libraries: libraryId, userId }, { $pull: { libraries: libraryId } }, { session })
  }

  async update (id: string, userId: string, data: UpdateUserBook): Promise<UserBookEntity | null> {
    const upd = await this.collection.findOneAndUpdate(
      { _id: id, userId },
      {
        $set: { ...data }
      },
      {
        returnDocument: 'after'
      }
    )
    return dbUserBookToEntity(upd)
  }
}

export default new UserBooksDao()
