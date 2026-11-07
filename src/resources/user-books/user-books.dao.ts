import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { isNotNull } from '../../utils.js'
import { DBUserBook, UpdateUserBook } from './user-books.interfaces.js'
import { UserBookEntity } from './user-books.entity.js'
import { AggregationCursor, Document, WithId, ClientSession } from 'mongodb'
import { BookEntity } from '../books/books.entity.js'
import config from '../../config.js'

function dbUserBookToEntity (dbUserBook: DBUserBook | null): UserBookEntity | null {
  return dbUserBook == null ? null : new UserBookEntity(dbUserBook)
}

function buildSearchAggregationPipeline (filters: { librariesIds?: readonly string[], userId?: string, search?: string }): Document[] {
  const searchFilters: any = {}
  if (filters.librariesIds != null) {
    searchFilters.libraries = { $in: filters.librariesIds }
  }
  if (filters.userId != null) {
    searchFilters.userId = filters.userId
  }

  const aggregate: Document[] = []

  // $search must be the first stage in the pipeline when using Atlas Search
  if (filters.search != null && config.environment !== 'local' && config.environment !== 'test') {
    // use atlas search
    aggregate.push({
      $search: {
        index: 'user_books_search',
        compound: {
          should: [
            {
              autocomplete: {
                query: filters.search,
                path: 'bookIsbn13'
              }
            },
            {
              autocomplete: {
                query: filters.search,
                path: 'bookIsbn10'
              }
            },
            {
              autocomplete: {
                query: filters.search,
                path: 'bookTitle'
              }
            },
            {
              text: {
                query: filters.search,
                path: 'bookTitle'
              }
            },
            {
              text: {
                query: filters.search,
                path: 'bookAuthors'
              }
            }
          ],
          minimumShouldMatch: 1
        }
      }
    })
  }

  // Add match filters
  aggregate.push({ $match: searchFilters })

  // search in mongo with regex for local/test environments
  if (filters.search != null && (config.environment === 'local' || config.environment === 'test')) {
    aggregate.push({
      $match: {
        $or: [
          { bookIsbn13: { $regex: filters.search, $options: 'i' } },
          { bookIsbn10: { $regex: filters.search, $options: 'i' } },
          { bookTitle: { $regex: filters.search, $options: 'i' } },
          { bookAuthors: { $regex: filters.search, $options: 'i' } }
        ]
      }
    })
  }

  return aggregate
}

class UserBooksDao extends Dao<DBUserBook> {
  constructor () {
    super('user_books')
  }

  async init (): Promise<void> {
    await this.collection.createIndex({ userId: 1, bookId: 1 }, { unique: true })
    await this.collection.createIndex({ libraries: 1 })
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

  async list (filters: { librariesIds?: readonly string[], userId?: string, search?: string }, skip: number, limit: number): Promise<readonly UserBookEntity[]> {
    const pipeline = buildSearchAggregationPipeline(filters)

    // Newest first: ULIDs sort by creation time. Without a sort the pages may overlap.
    // Search results keep their relevance order
    if (filters.search == null) {
      pipeline.push({ $sort: { _id: -1 } })
    }

    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: limit })

    const dbUserBooks = await this.collection
      .aggregate<DBUserBook>(pipeline)
      .toArray()

    return dbUserBooks.map(dbUserBookToEntity).filter(isNotNull)
  }

  async listCursor (filters: { librariesIds?: readonly string[], userId?: string }): Promise<AggregationCursor<WithId<DBUserBook>>> {
    const pipeline = buildSearchAggregationPipeline(filters)
    const dbUserBooksCursor = this.collection.aggregate<DBUserBook>(pipeline)

    return dbUserBooksCursor
  }

  async count (filters: { librariesIds?: readonly string[], userId?: string, search?: string }): Promise<number> {
    const pipeline = buildSearchAggregationPipeline(filters)

    pipeline.push({ $count: 'total' })

    const countResult = await this.collection.aggregate<{ total: number }>(pipeline).toArray()
    const total = countResult.length > 0 ? countResult[0].total : 0

    return total
  }

  async deleteAll (libraryId: string, userId: string): Promise<void> {
    /* add session to use in a transaction */
    await this.collection.updateMany({ libraries: libraryId, userId }, { $pull: { libraries: libraryId } })
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
