import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { BookSyncData, DBBook, NewBookDao } from './books.interfaces.js'
import { BookEntity } from './books.entity.js'
import { escapeRegExp, isNotNull } from '../../utils.js'
import { ClientSession, Filter } from 'mongodb'
import { ISBNUtils } from '../../utils/isbn.utils.js'

function listBooksMongoFilter (search?: string): Filter<DBBook> {
  if (search == null || search === '') return {}

  // An ISBN is matched exactly, under any of its two forms; anything else, as a substring of the title or the authors
  const isbn = ISBNUtils.sanitizeIsbn(search)
  if (ISBNUtils.isValidIsbn13(isbn) || ISBNUtils.isValidIsbn10(isbn)) {
    return { $or: [{ isbn13: isbn }, { isbn10: isbn }] }
  }

  const pattern = { $regex: escapeRegExp(search), $options: 'i' }
  return { $or: [{ title: pattern }, { authors: pattern }] }
}

function dbBookToEntity (dbBook: DBBook | null): BookEntity | null {
  return dbBook == null ? null : new BookEntity(dbBook)
}

class BooksDao extends Dao<DBBook> {
  constructor () {
    super('books')
  }

  async init (): Promise<void> {
    await this.collection.createIndex({ isbn13: 1 }, { unique: true })
    // $gt instead of $type: the query planner only uses a partial index if the query implies its filter,
    // and it does not infer that from an equality on a string
    await this.collection.createIndex({ isbn10: 1 }, { unique: true, partialFilterExpression: { isbn10: { $gt: '' } } })
  }

  async create (newBook: NewBookDao): Promise<BookEntity> {
    const now = new Date()
    const dbBook: DBBook = {
      ...newBook,
      _id: ulid(),
      isbn13: newBook.isbn13,
      isbn10: newBook.isbn10,
      cover: newBook.cover,
      createdAt: now,
      updatedAt: now
    }
    await this.collection.insertOne(dbBook)

    return new BookEntity(dbBook)
  }

  async findByIsbn (isbn: string): Promise<BookEntity | null> {
    const dbBook = await this.collection.findOne({ $or: [{ isbn13: isbn }, { isbn10: isbn }] })

    return dbBookToEntity(dbBook)
  }

  async findById (id: string): Promise<BookEntity | null> {
    const dbBook = await this.collection.findOne({ _id: id })

    return dbBookToEntity(dbBook)
  }

  async list (skip: number, limit: number, search?: string): Promise<readonly BookEntity[]> {
    const dbBooks = await this.collection.find(listBooksMongoFilter(search)).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()

    return dbBooks.map(dbBookToEntity).filter(isNotNull)
  }

  async count (search?: string): Promise<number> {
    const total = await this.collection.countDocuments(listBooksMongoFilter(search))
    return total
  }

  async update (id: string, data: Partial<BookSyncData>, session?: ClientSession): Promise<BookEntity | null> {
    const dbBook = await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: 'after', session }
    )

    return dbBookToEntity(dbBook)
  }
}

export default new BooksDao()
