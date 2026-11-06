import { MongoServerError } from 'mongodb'
import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { Page } from '../../types.js'
import { ISBNUtils } from '../../utils/isbn.utils.js'
import { NewBook } from '../books/books.interfaces.js'
import booksDao from './books.dao.js'
import { BookEntity } from './books.entity.js'
import { BookAlreadyExistsError, BookNotFoundError } from './books.error.js'

class BooksService {
  async create (body: NewBook): Promise<SingleResultObject<BookEntity>> {
    const { isbn10, isbn13 } = ISBNUtils.calculateIsbns(body.isbn10, body.isbn13)

    try {
      const newBook = await booksDao.create({
        title: body.title,
        authors: body.authors,
        isbn13,
        isbn10,
        cover: body.cover
      })
      return new SingleResultObject(newBook)
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new BookAlreadyExistsError(error.keyPattern?.isbn10 != null
          ? `there is already a book with isbn10 ${String(isbn10)}`
          : `there is already a book with isbn13 ${isbn13}`)
      }
      throw error
    }
  }

  async fetchById (id: string): Promise<BookEntity | null> {
    return await booksDao.findById(id)
  }

  async getById (id: string): Promise<SingleResultObject<BookEntity>> {
    const book = await booksDao.findById(id)
    if (book == null) {
      throw new BookNotFoundError(`book with id ${id} not found`)
    }

    return new SingleResultObject(book)
  }

  async fetchByIsbn (isbn: string): Promise<BookEntity | null> {
    const book = await booksDao.findByIsbn(isbn)

    return book
  }

  async list (page: Page): Promise<CollectionResultObject<BookEntity>> {
    const [books, total] = await Promise.all([
      await booksDao.list(page.skip, page.limit),
      await booksDao.count()
    ])

    return new CollectionResultObject(books, { ...page, total })
  }

  async ensureBookExistsInBooks (book: NewBook): Promise<BookEntity> {
    if (book.isbn13 == null && book.isbn10 == null) {
      throw new BookNotFoundError('isbn13 or isbn10 must be provided')
    }
    const isbn = book.isbn13 ?? book.isbn10 as string
    const existingBook = await this.fetchByIsbn(isbn)

    if (existingBook != null) return existingBook

    try {
      const createdBook = await this.create(book)

      return createdBook.entity
    } catch (error) {
      if (!(error instanceof BookAlreadyExistsError)) throw error

      // Someone else created it since the check above, or it exists under its other ISBN
      const { isbn10, isbn13 } = ISBNUtils.calculateIsbns(book.isbn10, book.isbn13)
      const racedBook = await this.fetchByIsbn(isbn13) ?? (isbn10 != null ? await this.fetchByIsbn(isbn10) : null)
      if (racedBook == null) throw error

      return racedBook
    }
  }
}

export default new BooksService()
