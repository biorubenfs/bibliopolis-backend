import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import { Role } from '../../resources/users/users.interfaces.js'
import mongo from '../../mongo.js'
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
