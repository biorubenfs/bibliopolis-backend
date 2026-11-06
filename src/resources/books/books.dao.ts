import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { DBBook, NewBookDao } from './books.interfaces.js'
import { BookEntity } from './books.entity.js'
import { isNotNull } from '../../utils.js'

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

  async list (skip: number, limit: number): Promise<readonly BookEntity[]> {
    const dbBooks = await this.collection.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()

    return dbBooks.map(dbBookToEntity).filter(isNotNull)
  }

  async count (): Promise<number> {
    const total = await this.collection.countDocuments()
    return total
  }
}

export default new BooksDao()
