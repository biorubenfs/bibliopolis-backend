import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiRestErrorCode } from '../../error/types.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import { Role } from '../../resources/users/users.interfaces.js'
import testUtils from '../utils/utils.js'

const adminAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BK7YX0D5NHHBN70Q4N7P69', Role.Admin))
const regularAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BHWZ8N4B1JBSAFCBKQGERS', Role.Regular))

async function get (path: string, auth: string): Promise<{ status: number, body: any }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), { headers: { Authorization: auth } })
  return { status: response.status, body: await response.json() }
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks, MockDataSet.Tags)
})

afterAll(async () => {
  await mongo.clean()
})

describe('routes by role', () => {
  // An admin has no libraries: it manages the catalog and the users from the backoffice
  it.each([
    ['/libraries'],
    ['/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'],
    ['/user-books'],
    ['/imports?libraryId=01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'],
    ['/tags']
  ])('GET %s - should be forbidden to an admin', async (path) => {
    const { status, body } = await get(path, adminAuth)

    expect(status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.PermissionError)
  })

  it.each([
    ['/libraries'],
    ['/user-books'],
    ['/tags']
  ])('GET %s - should still be allowed to a regular user', async (path) => {
    const { status } = await get(path, regularAuth)

    expect(status).toBe(200)
  })

  it('GET /users - should be forbidden to a regular user with a 403', async () => {
    const { status, body } = await get('/users', regularAuth)

    expect(status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.PermissionError)
  })
})
