import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import config from '../../config.js'
import mongo from '../../mongo.js'
import booksDao from '../../resources/books/books.dao.js'
import { BooksSource } from '../../resources/sources/sources.types.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import { syncBooksFromSources } from '../../tasks/update-incomplete-books.task.js'
import { BookCover } from '../../types.js'

const BOOK_ID = 'sync-book'
const ISBN = '9780306406157'
const NO_COVER: BookCover = { source: null, value: null }
const GOOGLE_COVER: BookCover = { source: BooksSource.GOOGLE_BOOKS, value: 'google-id' }
const OPEN_LIBRARY_COVER: BookCover = { source: BooksSource.OPEN_LIBRARY, value: '123' }
const OLD_DATE = new Date('2020-01-01T00:00:00.000Z')

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

function stubSources (google: unknown, openLibrary: unknown): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const { hostname } = new URL(input)
    if (hostname === config.googleBooks.domain.hostname) return google != null ? json(google) : json({}, 404)
    if (hostname === config.openLibrary.domain.hostname) return openLibrary != null ? json(openLibrary) : json({}, 404)
    throw new Error(`Unexpected request to ${hostname}`)
  })
}

function googleVolume (authors?: string[], hasCover = false): unknown {
  return {
    items: [{
      id: 'google-id',
      volumeInfo: {
        title: 'Title',
        authors,
        industryIdentifiers: [{ type: 'ISBN_13', identifier: ISBN }],
        imageLinks: hasCover ? { thumbnail: 'thumbnail', smallThumbnail: 'small' } : undefined
      }
    }]
  }
}

async function insertBook (authors: string[], cover: BookCover): Promise<void> {
  await booksDao.collection.insertOne({
    _id: BOOK_ID,
    title: 'Title',
    authors,
    cover,
    isbn13: ISBN,
    isbn10: null,
    createdAt: OLD_DATE,
    updatedAt: OLD_DATE
  })
  await userBooksDao.collection.insertOne({
    _id: 'sync-user-book',
    libraries: [],
    bookId: BOOK_ID,
    bookTitle: 'Title',
    bookAuthors: authors,
    bookCover: cover,
    bookIsbn13: ISBN,
    bookIsbn10: null,
    rating: null,
    notes: null,
    userId: 'sync-user',
    createdAt: OLD_DATE,
    updatedAt: OLD_DATE
  })
}

async function expectStoredData (authors: string[], cover: BookCover): Promise<void> {
  const book = await booksDao.collection.findOne({ _id: BOOK_ID })
  const userBook = await userBooksDao.collection.findOne({ _id: 'sync-user-book' })

  expect(book?.authors).toEqual(authors)
  expect(book?.cover).toEqual(cover)
  expect(userBook?.bookAuthors).toEqual(authors)
  expect(userBook?.bookCover).toEqual(cover)
}

beforeEach(async () => {
  await booksDao.collection.deleteMany({})
  await userBooksDao.collection.deleteMany({})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await mongo.clean()
})

describe('syncBooksFromSources', () => {
  it('should fill both fields when the book has neither', async () => {
    await insertBook([], NO_COVER)
    stubSources(googleVolume(['New author'], true), null)

    await syncBooksFromSources()

    await expectStoredData(['New author'], GOOGLE_COVER)
  })

  it('should keep the cover when the sources only bring authors', async () => {
    await insertBook([], OPEN_LIBRARY_COVER)
    stubSources(googleVolume(['New author']), null)

    await syncBooksFromSources()

    await expectStoredData(['New author'], OPEN_LIBRARY_COVER)
  })

  it('should keep the authors when the sources only bring a cover', async () => {
    await insertBook(['Existing author'], NO_COVER)
    stubSources(null, { title: 'Title', isbn_13: [ISBN], covers: [123] })

    await syncBooksFromSources()

    await expectStoredData(['Existing author'], OPEN_LIBRARY_COVER)
  })

  it('should not replace existing authors with the ones from the sources', async () => {
    await insertBook(['Handwritten author'], NO_COVER)
    stubSources(googleVolume(['Other author'], true), null)

    await syncBooksFromSources()

    await expectStoredData(['Handwritten author'], GOOGLE_COVER)
  })

  it('should not replace an existing cover with the one from the sources', async () => {
    await insertBook([], OPEN_LIBRARY_COVER)
    stubSources(googleVolume(['New author'], true), null)

    await syncBooksFromSources()

    await expectStoredData(['New author'], OPEN_LIBRARY_COVER)
  })

  it('should not touch the book when the sources do not bring what it is missing', async () => {
    await insertBook(['Existing author'], NO_COVER)
    stubSources(googleVolume(['Other author']), null)

    await syncBooksFromSources()

    const book = await booksDao.collection.findOne({ _id: BOOK_ID })
    expect(book?.updatedAt).toEqual(OLD_DATE)
    await expectStoredData(['Existing author'], NO_COVER)
  })
})
