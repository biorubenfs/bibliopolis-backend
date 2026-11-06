import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import config from '../../config.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import booksDao from '../../resources/books/books.dao.js'
import { Role } from '../../resources/users/users.interfaces.js'
import Server from '../../server.js'
import { syncBooksFromSources } from '../../tasks/update-incomplete-books.task.js'
import testUtils from '../utils/utils.js'

// The server from global-setup runs in another process, out of reach of a fetch stub.
// This one shares the process with the stub, so its calls to the sources can be simulated.
const PORT = 3002
const baseUrl = `http://localhost:${PORT}`
const authHeader = testUtils.buildAuthorizationHeader(makeJwt('01J9BHWZ8N4B1JBSAFCBKQGERS', Role.Regular))

const ISBN_NOT_IN_CATALOG = '9780306406157'
const ISBN_IN_CATALOG = '9780880336062'

type SourceHandler = (url: URL) => Response

const realFetch = globalThis.fetch
const server = new Server(PORT)

const respond = (status: number, body: unknown = {}): SourceHandler => () => new Response(JSON.stringify(body), { status })
const notFound = respond(404)
const tooManyRequests = respond(429)
const networkFailure: SourceHandler = () => { throw new TypeError('fetch failed') }

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

async function getExternal (isbn: string): Promise<Response> {
  return await fetch(`${baseUrl}/external?isbn=${isbn}`, { headers: { Authorization: authHeader } })
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books)
  server.listen()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await server.stop()
  await mongo.clean()
})

describe('GET /external', () => {
  it('should return 404 when both sources answer that they do not have the book', async () => {
    stubSources(notFound, notFound)

    const response = await getExternal(ISBN_NOT_IN_CATALOG)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.ApiBooksError)
    expect(body.message).toBe('Book not found in any source')
  })

  it('should return 503 when a source is rate limited and the other does not have the book', async () => {
    stubSources(tooManyRequests, notFound)

    const response = await getExternal(ISBN_NOT_IN_CATALOG)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.errorCode).toBe(ApiRestErrorCode.SourcesUnavailable)
    expect(body.message).toBe('Book sources are currently unavailable')
  })

  it('should return 503 when both sources are down', async () => {
    stubSources(networkFailure, networkFailure)

    const response = await getExternal(ISBN_NOT_IN_CATALOG)

    expect(response.status).toBe(503)
  })

  it('should return the book when a source fails and the other finds it', async () => {
    stubSources(tooManyRequests, respond(200, { title: 'Open Library title', isbn_13: [ISBN_NOT_IN_CATALOG] }))

    const response = await getExternal(ISBN_NOT_IN_CATALOG)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results.attributes.title).toBe('Open Library title')
  })

  it('should not depend on the sources when the book is in the catalog', async () => {
    const sourceCalls = stubSources(networkFailure, networkFailure)

    const response = await getExternal(ISBN_IN_CATALOG)

    expect(response.status).toBe(200)
    expect(sourceCalls).not.toHaveBeenCalled()
  })
})

describe('syncBooksFromSources', () => {
  it('should keep processing books after the sources fail for one of them', async () => {
    const failingIsbn = '9780306406157'
    const workingIsbn = '9781861972712'
    const emptyBook = {
      title: 'Incomplete',
      authors: [],
      cover: { source: null, value: null },
      isbn10: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    await booksDao.collection.insertMany([
      { ...emptyBook, _id: 'sync-failing-book', isbn13: failingIsbn },
      { ...emptyBook, _id: 'sync-working-book', isbn13: workingIsbn }
    ])

    stubSources(
      (url) => {
        const query = url.searchParams.get('q')
        if (query === `isbn:${failingIsbn}`) return new Response('{}', { status: 429 })
        if (query !== `isbn:${workingIsbn}`) return new Response('{}', { status: 404 })
        return new Response(JSON.stringify({
          items: [{
            id: 'google-id',
            volumeInfo: {
              title: 'Incomplete',
              authors: ['New author'],
              industryIdentifiers: [{ type: 'ISBN_13', identifier: workingIsbn }]
            }
          }]
        }))
      },
      notFound
    )

    await syncBooksFromSources()

    const failingBook = await booksDao.collection.findOne({ _id: 'sync-failing-book' })
    const workingBook = await booksDao.collection.findOne({ _id: 'sync-working-book' })
    expect(failingBook?.authors).toEqual([])
    expect(workingBook?.authors).toEqual(['New author'])
  })
})
