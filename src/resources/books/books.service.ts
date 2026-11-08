import { MongoServerError } from 'mongodb'
import { CollectionResultObject, MiscResultObject, SingleResultObject } from '../../results.js'
import { runInTransaction } from '../../transaction-helper.js'
import { BookCover, Page } from '../../types.js'
import { ISBNUtils } from '../../utils/isbn.utils.js'
import { CoverSize, getBookFromSourcesApis, getCoverUrl } from '../../utils.js'
import { BookSyncData, CreateBook, NewBook, UpdateBook } from '../books/books.interfaces.js'
import { fetchCoverFromSource, fetchCoversFromSources } from '../sources/sources.covers.js'
import userBooksDao from '../user-books/user-books.dao.js'
import booksDao from './books.dao.js'
import { BookEntity } from './books.entity.js'
import { BookAlreadyExistsError, BookNotFoundError, CoverNotAvailableError } from './books.error.js'

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

  /** Adds a book to the catalog from the backoffice. */
  async createFromBackoffice (body: CreateBook): Promise<SingleResultObject<BookEntity>> {
    const isbns = ISBNUtils.isValidIsbn13(body.isbn)
      ? ISBNUtils.calculateIsbns(null, body.isbn)
      : ISBNUtils.calculateIsbns(body.isbn, null)

    // Checked before asking the sources, which are slow and rate limited
    const existing = await booksDao.findByIsbn(isbns.isbn13) ?? (isbns.isbn10 != null ? await booksDao.findByIsbn(isbns.isbn10) : null)
    if (existing != null) {
      throw new BookAlreadyExistsError(`there is already a book with isbn13 ${existing.isbn13}`)
    }

    if (body.mode === 'sources') {
      // Throws a 404 if no source has the book, so that the admin can add it by hand
      return await this.create(await getBookFromSourcesApis(body.isbn))
    }

    return await this.create({
      title: body.title,
      authors: body.authors,
      isbn13: isbns.isbn13,
      isbn10: isbns.isbn10,
      cover: { source: null, value: null }
    })
  }

  /** The cover that each source has for the book, for the admin to choose one. */
  async listCovers (id: string): Promise<MiscResultObject> {
    const book = (await this.getById(id)).entity
    const covers = await fetchCoversFromSources({ isbn13: book.isbn13, isbn10: book.isbn10 })

    return new MiscResultObject('book-covers', {
      covers: covers.map(cover => ({
        source: cover.source,
        value: cover.value,
        coverUrl: getCoverUrl(cover.source, cover.value, CoverSize.L)
      }))
    })
  }

  /** Corrects a book and copies the changes to the user books of it, in the same transaction. */
  async update (id: string, body: UpdateBook): Promise<SingleResultObject<BookEntity>> {
    const book = (await this.getById(id)).entity

    // The sources are asked before opening the transaction, so as not to keep it open while waiting for them
    let cover: BookCover | undefined
    if (body.coverSource === null) {
      cover = { source: null, value: null }
    } else if (body.coverSource !== undefined) {
      cover = await fetchCoverFromSource(body.coverSource, { isbn13: book.isbn13, isbn10: book.isbn10 }) ?? undefined
      if (cover === undefined) {
        throw new CoverNotAvailableError(`source ${body.coverSource} has no cover for this book`)
      }
    }

    const data: Partial<BookSyncData> = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.authors !== undefined ? { authors: body.authors } : {}),
      ...(cover !== undefined ? { cover } : {})
    }

    const updatedBook = await runInTransaction(async (session) => {
      const updated = await booksDao.update(id, data, session)
      if (updated == null) throw new BookNotFoundError(`book with id ${id} not found`)

      await userBooksDao.syncBookData(id, { title: updated.title, authors: updated.authors, cover: updated.cover }, session)
      return updated
    })

    return new SingleResultObject(updatedBook)
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

  async list (page: Page, search?: string): Promise<CollectionResultObject<BookEntity>> {
    const [books, total] = await Promise.all([
      await booksDao.list(page.skip, page.limit, search),
      await booksDao.count(search)
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
