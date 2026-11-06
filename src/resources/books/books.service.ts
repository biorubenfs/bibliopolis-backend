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

    // Check for duplicates by ISBN-13
    const existingByIsbn13 = await booksDao.findByIsbn13(isbn13)
    if (existingByIsbn13 != null) {
      throw new BookAlreadyExistsError(`there is already a book with isbn13 ${isbn13}`)
    }

    // Check for duplicates by ISBN-10 (if it exists)
    if (isbn10 != null) {
      const existingByIsbn10 = await booksDao.findByIsbn10(isbn10)
      if (existingByIsbn10 != null) {
        throw new BookAlreadyExistsError(`there is already a book with isbn10 ${isbn10}`)
      }
    }

    const bookData = {
      title: body.title,
      authors: body.authors,
      isbn13,
      isbn10,
      cover: body.cover
    }

    const newBook = await booksDao.create(bookData)
    return new SingleResultObject(newBook)
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

    const createdBook = await this.create(book)

    return createdBook.entity
  }
}

export default new BooksService()
