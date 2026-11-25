import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiRestErrorCode } from '../../error/types.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import { Role } from '../../resources/users/users.interfaces.js'
import testUtils from '../utils/utils.js'

const userAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BHWZ8N4B1JBSAFCBKQGERS', Role.Regular))
const adminAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BK7YX0D5NHHBN70Q4N7P69', Role.Admin))
const libraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'

async function get (path: string, query: Record<string, string>, auth: string): Promise<{ status: number, body: any }> {
  const url = new URL(path, testUtils.TESTS_BASE_URL)
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value))
  const response = await fetch(url, { headers: { Authorization: auth } })
  return { status: response.status, body: await response.json() }
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
})

afterAll(async () => {
  await mongo.clean()
})

describe.each([
  ['/books', userAuth],
  ['/libraries', userAuth],
  ['/user-books', userAuth],
  ['/tags', userAuth],
  [`/imports?libraryId=${libraryId}`, userAuth],
  ['/imports/any-import/items', userAuth],
  ['/users', adminAuth]
])('pagination of GET %s', (path, auth) => {
  it.each([
    ['skip', '-1', 'skip must be a number >= 0'],
    ['skip', 'abc', 'skip must be a number >= 0'],
    ['skip', '', 'skip must be a number >= 0'],
    ['limit', '0', 'limit must be a number > 0 and <= 100'],
    ['limit', '101', 'limit must be a number > 0 and <= 100'],
    ['limit', 'abc', 'limit must be a number > 0 and <= 100']
  ])('should return 400 with %s=%s', async (param, value, message) => {
    const { status, body } = await get(path, { [param]: value }, auth)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
    expect(body.message).toBe('invalid query params')
    expect(body.validationError).toEqual([expect.objectContaining({ path: [param], message })])
  })
})

describe.each([
  ['/books', userAuth],
  ['/libraries', userAuth],
  ['/user-books', userAuth],
  ['/tags', userAuth],
  [`/imports?libraryId=${libraryId}`, userAuth],
  ['/users', adminAuth]
])('pagination values of GET %s', (path, auth) => {
  it('should use skip=0 and limit=10 by default', async () => {
    const { status, body } = await get(path, {}, auth)

    expect(status).toBe(200)
    expect(body.paginationInfo).toMatchObject({ skip: 0, limit: 10 })
  })

  it('should apply the requested skip and limit', async () => {
    const { status, body } = await get(path, { skip: '1', limit: '100' }, auth)

    expect(status).toBe(200)
    expect(body.paginationInfo).toMatchObject({ skip: 1, limit: 100 })
  })
})

describe('query params of a listing with filters', () => {
  it('should apply the transformed filters and the pagination together', async () => {
    const { status, body } = await get('/libraries', { search: '  sample  ', skip: '1', limit: '1' }, userAuth)

    expect(status).toBe(200)
    expect(body.paginationInfo).toEqual({ skip: 1, limit: 1, total: 3 })
    expect(body.results).toHaveLength(1)
  })

  it('should ignore the unknown query params', async () => {
    const { status } = await get('/libraries', { unknown: 'value' }, userAuth)

    expect(status).toBe(200)
  })

  it('should report the errors of the filters and of the pagination together', async () => {
    const { status, body } = await get('/libraries', { favorites: 'false', skip: '-1' }, userAuth)

    expect(status).toBe(400)
    expect(body.validationError.map((issue: { path: string[] }) => issue.path[0]).sort()).toEqual(['favorites', 'skip'])
  })
})
