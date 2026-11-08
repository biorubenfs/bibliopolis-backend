import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import config from '../../config.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import booksDao from '../../resources/books/books.dao.js'
import booksService from '../../resources/books/books.service.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import { BooksSource } from '../../resources/sources/sources.types.js'
import { Role } from '../../resources/users/users.interfaces.js'
import Server from '../../server.js'
import testUtils from '../utils/utils.js'

// The server from global-setup runs in another process, out of reach of a fetch stub.
// This one shares the process with the stub, so its calls to the sources can be simulated.
const PORT = 3003
const baseUrl = `http://localhost:${PORT}`
const adminAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BK7YX0D5NHHBN70Q4N7P69', Role.Admin))
const regularAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BHWZ8N4B1JBSAFCBKQGERS', Role.Regular))

// Owned by user01 and user02
const SHARED_BOOK_ID = '01J9KKFQRP6H3F30CNT21G1DWT'
const SHARED_BOOK_ISBN13 = '9781732539419'
const BOOK_WITH_ISBN10_ID = '01J9KKFRGTNGPM5GZ9AVWRR7PN'
const BOOK_WITH_ISBN10 = { isbn13: '9780880336062', isbn10: '0880336064' }
const ISBN_NEW = '9780306406157'
const ISBN10_NEW = '0306406152'

type SourceHandler = (url: URL) => Response

const realFetch = globalThis.fetch
const server = new Server(PORT)

const respond = (status: number, body: unknown = {}): SourceHandler => () => new Response(JSON.stringify(body), { status })
const notFound = respond(404)
const serverError = respond(500)
const googleVolume = (withImage: boolean): SourceHandler => respond(200, {
  items: [{
    id: 'google-volume-id',
    volumeInfo: {
      title: 'Google title',
      authors: ['Google author'],
      industryIdentifiers: [{ type: 'ISBN_13', identifier: ISBN_NEW }],
      ...(withImage ? { imageLinks: { thumbnail: 'x', smallThumbnail: 'x' } } : {})
    }
  }]
})
const openLibraryBook = (covers: number[]): SourceHandler => respond(200, { title: 'Open Library title', isbn_13: [ISBN_NEW], covers })

function stubSources (google: SourceHandler, openLibrary: SourceHandler): ReturnType<typeof vi.fn> {
  const sourceCalls = vi.fn()
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input)
    if (url.hostname === config.googleBooks.domain.hostname) {
      sourceCalls(url)
      return google(url)
    }
    if (url.hostname === config.openLibrary.domain.hostname) {
      sourceCalls(url)
      return openLibrary(url)
    }
    return await realFetch(input, init)
  })
  return sourceCalls
}

async function request (method: string, path: string, body?: unknown, auth = adminAuth): Promise<{ status: number, body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await response.text()
  return { status: response.status, body: text === '' ? null : JSON.parse(text) }
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await booksDao.init()
  server.listen()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await server.stop()
  await mongo.clean()
})

describe('POST /books', () => {
  it('should create a book with the data of the sources, cover included', async () => {
    stubSources(googleVolume(true), notFound)

    const { status, body } = await request('POST', '/books', { mode: 'sources', isbn: ISBN_NEW })

    expect(status).toBe(201)
    expect(body.results.attributes).toMatchObject({ title: 'Google title', authors: ['Google author'], isbn13: ISBN_NEW, isbn10: ISBN10_NEW })
    const book = await booksDao.collection.findOne({ isbn13: ISBN_NEW })
    expect(book?.cover).toEqual({ source: BooksSource.GOOGLE_BOOKS, value: 'google-volume-id' })
    await booksDao.collection.deleteOne({ isbn13: ISBN_NEW })
  })

  it('should return 404 when no source has the book, so that it can be added by hand', async () => {
    stubSources(notFound, notFound)

    const { status, body } = await request('POST', '/books', { mode: 'sources', isbn: ISBN_NEW })

    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.ApiBooksError)
    expect(await booksDao.collection.countDocuments({ isbn13: ISBN_NEW })).toBe(0)
  })

  it('should create a book by hand without cover, accepting an ISBN-10 with hyphens', async () => {
    const sourceCalls = stubSources(notFound, notFound)

    const { status, body } = await request('POST', '/books', { mode: 'manual', isbn: '0-306-40615-2', title: ' Manual title ', authors: [' Author '] })

    expect(status).toBe(201)
    expect(sourceCalls).not.toHaveBeenCalled()
    expect(body.results.attributes).toMatchObject({ title: 'Manual title', authors: ['Author'], isbn13: ISBN_NEW, isbn10: ISBN10_NEW, coverUrl: null })
    const book = await booksDao.collection.findOne({ isbn13: ISBN_NEW })
    expect(book?.cover).toEqual({ source: null, value: null })
  })

  it('should return 409 when the book is already in the catalog, without asking the sources', async () => {
    const sourceCalls = stubSources(googleVolume(true), notFound)

    const { status, body } = await request('POST', '/books', { mode: 'sources', isbn: ISBN10_NEW })

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ConflictError)
    expect(sourceCalls).not.toHaveBeenCalled()
  })

  it.each([
    ['a cover', { mode: 'manual', isbn: '9780134685991', title: 'Title', authors: ['Author'], cover: { source: 'open_library', value: '1' } }],
    ['no authors', { mode: 'manual', isbn: '9780134685991', title: 'Title', authors: [] }],
    ['an empty title', { mode: 'manual', isbn: '9780134685991', title: '  ', authors: ['Author'] }],
    ['an invalid ISBN', { mode: 'manual', isbn: '9780134685990', title: 'Title', authors: ['Author'] }],
    ['the title in the sources mode', { mode: 'sources', isbn: '9780134685991', title: 'Title' }],
    ['an unknown mode', { mode: 'other', isbn: '9780134685991' }]
  ])('should return 400 for a body with %s', async (_, body) => {
    const { status } = await request('POST', '/books', body)

    expect(status).toBe(400)
  })

  it('should return 403 to a regular user', async () => {
    const { status, body } = await request('POST', '/books', { mode: 'manual', isbn: '9780134685991', title: 'Title', authors: ['Author'] }, regularAuth)

    expect(status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.PermissionError)
  })
})

describe('GET /books?search=', () => {
  it.each([
    ['an ISBN-13', SHARED_BOOK_ISBN13, [SHARED_BOOK_ID]],
    ['an ISBN-10 with hyphens', '0-88033-606-4', [BOOK_WITH_ISBN10_ID]],
    ['part of the title, in another case', 'NEVER happ', [SHARED_BOOK_ID]],
    ['regex characters, matched literally', '.*', []]
  ])('should find the books by %s', async (_, search, ids) => {
    const { status, body } = await request('GET', `/books?search=${encodeURIComponent(search)}`)

    expect(status).toBe(200)
    expect(body.results.map((book: any) => book.id)).toEqual(ids)
    expect(body.paginationInfo.total).toBe(ids.length)
  })
})

describe('GET /books/:id/covers', () => {
  it('should return the cover of each source that has one', async () => {
    stubSources(googleVolume(true), openLibraryBook([123]))

    const { status, body } = await request('GET', `/books/${SHARED_BOOK_ID}/covers`)

    expect(status).toBe(200)
    expect(body.results.type).toBe('book-covers')
    expect(body.results.attributes.covers).toEqual([
      { source: BooksSource.GOOGLE_BOOKS, value: 'google-volume-id', coverUrl: expect.stringContaining('google-volume-id') },
      { source: BooksSource.OPEN_LIBRARY, value: '123', coverUrl: expect.stringContaining('123') }
    ])
  })

  it('should ask with the ISBN-10 when the source has no cover for the ISBN-13', async () => {
    stubSources(notFound, (url) => url.pathname.includes(BOOK_WITH_ISBN10.isbn10) ? openLibraryBook([456])(url) : notFound(url))

    const { body } = await request('GET', `/books/${BOOK_WITH_ISBN10_ID}/covers`)

    expect(body.results.attributes.covers).toEqual([
      { source: BooksSource.OPEN_LIBRARY, value: '456', coverUrl: expect.stringContaining('456') }
    ])
  })

  it('should skip a failing source', async () => {
    stubSources(serverError, openLibraryBook([123]))

    const { status, body } = await request('GET', `/books/${SHARED_BOOK_ID}/covers`)

    expect(status).toBe(200)
    expect(body.results.attributes.covers.map((cover: any) => cover.source)).toEqual([BooksSource.OPEN_LIBRARY])
  })

  it('should return 503 when every source fails', async () => {
    stubSources(serverError, serverError)

    const { status, body } = await request('GET', `/books/${SHARED_BOOK_ID}/covers`)

    expect(status).toBe(503)
    expect(body.errorCode).toBe(ApiRestErrorCode.SourcesUnavailable)
  })

  it('should return 404 for a book that does not exist', async () => {
    const { status } = await request('GET', '/books/01J9KKFQRP6H3F30CNT21G1XXX/covers')

    expect(status).toBe(404)
  })

  it('should return 403 to a regular user', async () => {
    const { status } = await request('GET', `/books/${SHARED_BOOK_ID}/covers`, undefined, regularAuth)

    expect(status).toBe(403)
  })
})

describe('PATCH /books/:id', () => {
  it('should correct the book and copy the changes to the user books of every user', async () => {
    const before = await userBooksDao.collection.find({ bookId: SHARED_BOOK_ID }).toArray()
    stubSources(googleVolume(true), notFound)

    const { status, body } = await request('PATCH', `/books/${SHARED_BOOK_ID}`, { title: ' Corrected title ', authors: ['First', 'Second'], coverSource: BooksSource.GOOGLE_BOOKS })

    expect(status).toBe(200)
    expect(body.results.attributes).toMatchObject({ title: 'Corrected title', authors: ['First', 'Second'], isbn13: SHARED_BOOK_ISBN13 })
    const book = await booksDao.collection.findOne({ _id: SHARED_BOOK_ID })
    expect(book?.cover).toEqual({ source: BooksSource.GOOGLE_BOOKS, value: 'google-volume-id' })

    const userBooks = await userBooksDao.collection.find({ bookId: SHARED_BOOK_ID }).toArray()
    expect(new Set(userBooks.map(userBook => userBook.userId)).size).toBe(2)
    for (const userBook of userBooks) {
      expect(userBook).toMatchObject({
        bookTitle: 'Corrected title',
        bookAuthors: ['First', 'Second'],
        bookCover: { source: BooksSource.GOOGLE_BOOKS, value: 'google-volume-id' },
        bookIsbn13: SHARED_BOOK_ISBN13
      })
      // updatedAt reflects the changes of the reader
      expect(userBook.updatedAt).toEqual(before.find(previous => previous._id === userBook._id)?.updatedAt)
    }
  })

  it('should leave the book without cover with coverSource null', async () => {
    const { status } = await request('PATCH', `/books/${SHARED_BOOK_ID}`, { coverSource: null })

    expect(status).toBe(200)
    expect((await booksDao.collection.findOne({ _id: SHARED_BOOK_ID }))?.cover).toEqual({ source: null, value: null })
    const userBooks = await userBooksDao.collection.find({ bookId: SHARED_BOOK_ID }).toArray()
    expect(userBooks.every(userBook => userBook.bookCover.source === null && userBook.bookCover.value === null)).toBe(true)
  })

  it('should return 422 when the source has no cover for the book', async () => {
    stubSources(googleVolume(false), notFound)

    const { status, body } = await request('PATCH', `/books/${SHARED_BOOK_ID}`, { title: 'Not saved', coverSource: BooksSource.GOOGLE_BOOKS })

    expect(status).toBe(422)
    expect(body.errorCode).toBe(ApiRestErrorCode.CoverNotAvailable)
    expect((await booksDao.collection.findOne({ _id: SHARED_BOOK_ID }))?.title).toBe('Corrected title')
  })

  it.each([
    ['an ISBN', { isbn13: '9780134685991' }],
    ['a cover value', { cover: { source: 'open_library', value: '1' } }],
    ['no fields', {}],
    ['an empty title', { title: ' ' }],
    ['an empty author', { authors: ['Author', ''] }],
    ['an unknown source', { coverSource: 'other' }]
  ])('should return 400 for a body with %s', async (_, body) => {
    const { status } = await request('PATCH', `/books/${SHARED_BOOK_ID}`, body)

    expect(status).toBe(400)
  })

  it('should return 404 for a book that does not exist', async () => {
    const { status } = await request('PATCH', '/books/01J9KKFQRP6H3F30CNT21G1XXX', { title: 'Title' })

    expect(status).toBe(404)
  })

  it('should return 403 to a regular user', async () => {
    const { status } = await request('PATCH', `/books/${SHARED_BOOK_ID}`, { title: 'Title' }, regularAuth)

    expect(status).toBe(403)
  })

  it('should roll back the book when the user books cannot be updated', async () => {
    const sync = vi.spyOn(userBooksDao, 'syncBookData').mockRejectedValue(new Error('database is down'))
    try {
      await expect(booksService.update(SHARED_BOOK_ID, { title: 'Rolled back' })).rejects.toThrow('database is down')
    } finally {
      sync.mockRestore()
    }

    expect((await booksDao.collection.findOne({ _id: SHARED_BOOK_ID }))?.title).toBe('Corrected title')
    const userBooks = await userBooksDao.collection.find({ bookId: SHARED_BOOK_ID }).toArray()
    expect(userBooks.every(userBook => userBook.bookTitle === 'Corrected title')).toBe(true)
  })
})
