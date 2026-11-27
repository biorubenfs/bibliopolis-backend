import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import { Role } from '../../resources/users/users.interfaces.js'
import mongo from '../../mongo.js'
import booksDao from '../../resources/books/books.dao.js'
import { ApiRestErrorCode } from '../../error/types.js'

const baseUrl = new URL(testUtils.TESTS_BASE_URL)
const token = makeJwt('01J9BHWZ8N4B1JBSAFCBKQGERS', Role.Regular)
const authHeader = testUtils.buildAuthorizationHeader(token)

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
})

afterAll(async () => {
  await mongo.clean()
})

describe('books tests', async () => {
  it('GET /books - should fail without token', async () => {
    const url = new URL('/books', baseUrl)
    const response = await fetch(url, {
      method: 'GET'
    })

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.TokenNotProvidedError)
  })

  it('GET /books/:id - should get a book', async () => {
    const url = new URL('/books/01J9KKFT64VX47TEDXMBBFRHTV', baseUrl)
    const response = await fetch(url, { method: 'GET', headers: { Authorization: authHeader } })
    const body = await response.json()

    expect(response.status).equals(200)
    expect(body).to.have.property('results')
    expect(body.results).to.have.property('type').equals('books')
    expect(body.results).to.have.property('id').equals('01J9KKFT64VX47TEDXMBBFRHTV')
    expect(body.results).to.have.property('attributes')

    const attributes = body.results.attributes
    expect(attributes.title).to.be.a('string').equals('Underground : Life and Survival in the Russian Black Market')
  })

  it('GET /books - should get a list of books paginated', async () => {
    const url = new URL('/books', baseUrl)
    const skip = 1
    const limit = 8

    /* setting pagination query params */
    url.searchParams.set('skip', skip.toString())
    url.searchParams.set('limit', limit.toString())

    const response = await fetch(url, { method: 'GET', headers: { Authorization: authHeader } })
    const body = await response.json()

    expect(response.status).equals(200)
    expect(body.results).to.be.an('array').of.length(limit)
    expect(body).to.have.property('paginationInfo')
    expect(body.paginationInfo.limit).to.be.a('number').equals(limit)
    expect(body.paginationInfo.skip).to.be.a('number').equals(skip)
    expect(body.paginationInfo.total).to.be.a('number').equals(12)

    // Newest first by id: the second newest book of the test data
    const firstBook = body.results.at(0).attributes
    expect(firstBook).to.have.property('title').equals('Eyewitness to History')
  })
})

describe('GET /books?hasCover=', () => {
  // The newest book of the test data; the others have a cover
  const NEWEST_BOOK_ID = '01J9KKG5ZN2MMPHV4M3E5JR98V'
  const SECOND_NEWEST_BOOK_ID = '01J9KKG3X20MDEXAMYSSQZJ21Y'
  let originalCover: unknown

  beforeAll(async () => {
    const book = await booksDao.collection.findOne({ _id: NEWEST_BOOK_ID })
    originalCover = book?.cover
    await booksDao.collection.updateOne({ _id: NEWEST_BOOK_ID }, { $set: { cover: { source: null, value: null } } })
  })

  afterAll(async () => {
    await booksDao.collection.updateOne({ _id: NEWEST_BOOK_ID }, { $set: { cover: originalCover as any } })
  })

  async function list (query: string): Promise<{ status: number, body: any }> {
    const response = await fetch(new URL(`/books?${query}`, baseUrl), { headers: { Authorization: authHeader } })
    return { status: response.status, body: await response.json() }
  }

  it('should list only the books with a cover, newest first', async () => {
    const { status, body } = await list('hasCover=true&limit=1')

    expect(status).toBe(200)
    expect(body.results.map((book: any) => book.id)).toEqual([SECOND_NEWEST_BOOK_ID])
    expect(body.paginationInfo.total).toBe(11)
  })

  it('should list only the books without a cover', async () => {
    const { status, body } = await list('hasCover=false')

    expect(status).toBe(200)
    expect(body.results.map((book: any) => book.id)).toEqual([NEWEST_BOOK_ID])
    expect(body.paginationInfo.total).toBe(1)
  })

  it('should combine with the search', async () => {
    const newest = await booksDao.collection.findOne({ _id: NEWEST_BOOK_ID })

    const withCover = await list(`hasCover=true&search=${encodeURIComponent(newest?.title ?? '')}`)
    const withoutCover = await list(`hasCover=false&search=${encodeURIComponent(newest?.title ?? '')}`)

    expect(withCover.body.results.map((book: any) => book.id)).not.toContain(NEWEST_BOOK_ID)
    expect(withoutCover.body.results.map((book: any) => book.id)).toEqual([NEWEST_BOOK_ID])
  })

  it('should reject a value that is not a boolean', async () => {
    const { status, body } = await list('hasCover=yes')

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })
})
