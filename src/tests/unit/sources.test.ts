import { afterEach, describe, expect, it, vi } from 'vitest'
import config from '../../config.js'
import { BooksApiError, SourcesUnavailableError } from '../../error/errors.js'
import googleBooksApi from '../../resources/sources/google-books/google-books.api.js'
import openLibraryApi from '../../resources/sources/open-library/open-library.api.js'
import { getBookFromSourcesApis } from '../../utils.js'

const ISBN = '9780306406157'

type SourceResponse = (url: URL) => Response

const json = (body: unknown, status = 200): SourceResponse => () => new Response(JSON.stringify(body), { status })
const notJson: SourceResponse = () => new Response('<html>oops</html>', { status: 200 })
const networkFailure: SourceResponse = () => { throw new TypeError('fetch failed') }
const timeout: SourceResponse = () => { throw new DOMException('The operation timed out', 'TimeoutError') }

const googleFound = json({
  items: [{
    id: 'google-id',
    volumeInfo: {
      title: 'Google title',
      authors: ['Google author'],
      industryIdentifiers: [{ type: 'ISBN_13', identifier: ISBN }]
    }
  }]
})
const googleNotFound = json({ totalItems: 0 })
const googleWithoutUsableData = json({ items: [{ id: 'google-id', volumeInfo: {} }] })
const openLibraryFound = json({ title: 'Open Library title', isbn_13: [ISBN] })
const notFound = json({ error: 'not found' }, 404)
const tooManyRequests = json({ error: 'slow down' }, 429)
const serverError = json({ error: 'boom' }, 500)

function stubSources (google: SourceResponse, openLibrary: SourceResponse): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = new URL(input)
    if (url.hostname === config.googleBooks.domain.hostname) return google(url)
    if (url.hostname === config.openLibrary.domain.hostname) return openLibrary(url)
    throw new Error(`Unexpected request to ${url.hostname}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getBookFromSourcesApis', () => {
  it.each([
    ['Google Books found, Open Library not found', googleFound, notFound],
    ['Google Books found, Open Library failed', googleFound, serverError]
  ])('should return the Google Books data: %s', async (_name, google, openLibrary) => {
    stubSources(google, openLibrary)

    const book = await getBookFromSourcesApis(ISBN)

    expect(book.title).toBe('Google title')
  })

  it.each([
    ['Google Books not found, Open Library found', googleNotFound, openLibraryFound],
    ['Google Books failed, Open Library found', tooManyRequests, openLibraryFound]
  ])('should return the Open Library data: %s', async (_name, google, openLibrary) => {
    stubSources(google, openLibrary)

    const book = await getBookFromSourcesApis(ISBN)

    expect(book.title).toBe('Open Library title')
  })

  it.each([
    ['Google Books without items, Open Library 404', googleNotFound, notFound],
    ['Google Books 404, Open Library 404', notFound, notFound],
    ['Google Books without usable data, Open Library 404', googleWithoutUsableData, notFound]
  ])('should throw a not found error: %s', async (_name, google, openLibrary) => {
    stubSources(google, openLibrary)

    await expect(getBookFromSourcesApis(ISBN)).rejects.toBeInstanceOf(BooksApiError)
  })

  it.each([
    ['Google Books 429, Open Library not found', tooManyRequests, notFound],
    ['Google Books 500, Open Library failed', serverError, serverError],
    ['Google Books network failure, Open Library not found', networkFailure, notFound],
    ['Google Books timeout, Open Library not found', timeout, notFound],
    ['Google Books invalid JSON, Open Library not found', notJson, notFound],
    ['Google Books not found, Open Library 429', googleNotFound, tooManyRequests],
    ['Google Books not found, Open Library 500', googleNotFound, serverError],
    ['Google Books not found, Open Library network failure', googleNotFound, networkFailure],
    ['Google Books not found, Open Library timeout', googleNotFound, timeout],
    ['Google Books not found, Open Library invalid JSON', googleNotFound, notJson],
    ['Google Books without usable data, Open Library failed', googleWithoutUsableData, serverError]
  ])('should throw a sources unavailable error: %s', async (_name, google, openLibrary) => {
    stubSources(google, openLibrary)

    await expect(getBookFromSourcesApis(ISBN)).rejects.toBeInstanceOf(SourcesUnavailableError)
  })

  it('should still return the book when one of its authors cannot be fetched', async () => {
    const bookWithAuthor = json({ title: 'Open Library title', isbn_13: [ISBN], authors: [{ key: '/authors/OL1A' }] })
    stubSources(notFound, (url) => url.pathname.startsWith('/authors/') ? serverError(url) : bookWithAuthor(url))

    const book = await getBookFromSourcesApis(ISBN)

    expect(book.title).toBe('Open Library title')
    expect(book.authors).toEqual([])
  })

  describe('should keep the requested isbn when the sources answer with another one', () => {
    const REQUESTED_ISBN13 = '9780297166047'
    const REQUESTED_ISBN10 = '0297166042'

    const volume = (title: string, industryIdentifiers: ReadonlyArray<{ type: string, identifier: string }>): unknown => ({
      id: `${title}-id`,
      volumeInfo: { title, industryIdentifiers }
    })
    const otherEditionIdentifiers = [
      { type: 'ISBN_10', identifier: '0349116903' },
      { type: 'ISBN_13', identifier: '9780349116907' }
    ]
    const requestedIdentifiers = [
      { type: 'ISBN_10', identifier: REQUESTED_ISBN10 },
      { type: 'ISBN_13', identifier: REQUESTED_ISBN13 }
    ]

    it('when the first Google Books volume is another edition and the requested one comes later', async () => {
      stubSources(json({
        items: [volume('Other edition', otherEditionIdentifiers), volume('Requested edition', requestedIdentifiers)]
      }), notFound)

      const book = await getBookFromSourcesApis(REQUESTED_ISBN13)

      expect(book.isbn13).toBe(REQUESTED_ISBN13)
      expect(book.isbn10).toBe(REQUESTED_ISBN10)
    })

    it('when the only Google Books volume is another edition', async () => {
      stubSources(json({ items: [volume('Other edition', otherEditionIdentifiers)] }), notFound)

      const book = await getBookFromSourcesApis(REQUESTED_ISBN13)

      expect(book.isbn13).toBe(REQUESTED_ISBN13)
      expect(book.isbn10).toBe(REQUESTED_ISBN10)
    })

    it('when the first Google Books volume has no isbn and Open Library lists several', async () => {
      stubSources(
        json({ items: [volume('Volume without isbn', [{ type: 'OTHER', identifier: 'UOM:39015010875964' }])] }),
        json({ title: 'Open Library title', isbn_10: ['0349116903', REQUESTED_ISBN10] })
      )

      const book = await getBookFromSourcesApis(REQUESTED_ISBN13)

      expect(book.isbn13).toBe(REQUESTED_ISBN13)
      expect(book.isbn10).toBe(REQUESTED_ISBN10)
    })

    it('when only Open Library has the book and it lists several', async () => {
      stubSources(googleNotFound, json({ title: 'Open Library title', isbn_10: ['0349116903', REQUESTED_ISBN10] }))

      const book = await getBookFromSourcesApis(REQUESTED_ISBN13)

      expect(book.isbn13).toBe(REQUESTED_ISBN13)
      expect(book.isbn10).toBe(REQUESTED_ISBN10)
    })

    it('when the book is requested by its isbn10', async () => {
      stubSources(json({ items: [volume('Other edition', otherEditionIdentifiers)] }), notFound)

      const book = await getBookFromSourcesApis(REQUESTED_ISBN10)

      expect(book.isbn13).toBe(REQUESTED_ISBN13)
      expect(book.isbn10).toBe(REQUESTED_ISBN10)
    })

    it('without an isbn10 when the requested isbn13 has no equivalent', async () => {
      stubSources(json({ items: [volume('Other edition', otherEditionIdentifiers)] }), notFound)

      const book = await getBookFromSourcesApis('9791034902305')

      expect(book.isbn13).toBe('9791034902305')
      expect(book.isbn10).toBeNull()
    })

    // Known limitation: there is no reliable way to tell which volume is right, see docs/api/external.md
    it('while the rest of the data still comes from the first volume', async () => {
      stubSources(json({
        items: [volume('Other edition', otherEditionIdentifiers), volume('Requested edition', requestedIdentifiers)]
      }), notFound)

      const book = await getBookFromSourcesApis(REQUESTED_ISBN13)

      expect(book.title).toBe('Other edition')
    })
  })
})

describe('source requests', () => {
  it('Google Books should send a timeout signal', async () => {
    const fetchMock = stubSources(googleNotFound, notFound)

    await googleBooksApi.fetchBookByIsbn(ISBN)

    expect(fetchMock.mock.lastCall?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('Open Library should send a timeout signal', async () => {
    const fetchMock = stubSources(googleNotFound, notFound)

    await openLibraryApi.fetchBookByIsbn(ISBN)

    expect(fetchMock.mock.lastCall?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
