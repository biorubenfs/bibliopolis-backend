import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { ApiRestErrorCode } from '../../error/types.js'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import jwt, { JwtPayload } from 'jsonwebtoken'

const loginUrl = new URL('/auth/login', testUtils.TESTS_BASE_URL)
const refreshUrl = new URL('/auth/refresh', testUtils.TESTS_BASE_URL)
const logoutUrl = new URL('/auth/logout', testUtils.TESTS_BASE_URL)
const logoutAllUrl = new URL('/auth/logout-all', testUtils.TESTS_BASE_URL)
const meUrl = new URL('/auth/me', testUtils.TESTS_BASE_URL)

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
})

afterAll(async () => {
  await mongo.clean()
})

describe('login tests', () => {
  it('POST /auth/login - should do login and return a single access token without cookies', async () => {
    const response = await fetch(loginUrl, {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ email: 'user01@email.com', password: 'Password123!' })
    })

    const body = await response.json()

    expect(response.status).toBe(200)

    // Should return access token in body
    expect(body.results).toHaveProperty('type', 'auth')
    expect(body.results).toHaveProperty('attributes')
    expect(body.results.attributes).toHaveProperty('accessToken')
    expect(body.results.attributes.accessToken).toBeTypeOf('string')
    expect(body.results.attributes.accessToken.length).toBeGreaterThan(0)

    // Should not set any cookie (no refresh token)
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it('POST /auth/login - access token should expire in 7 days by default', async () => {
    const { accessToken } = await testUtils.login('user01@email.com', 'Password123!')

    const payload = jwt.decode(accessToken) as JwtPayload

    expect(payload.exp).toBeTypeOf('number')
    expect(payload.iat).toBeTypeOf('number')
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(7 * 24 * 60 * 60)
  })

  it('POST /auth/login - should fail to do login with wrong password', async () => {
    const response = await fetch(loginUrl, {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ email: 'user01@email.com', password: 'Palabra' })
    })

    const body = await response.json()
    expect(response.status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.InvalidCredentials)
  })

  it('POST /auth/login - should fail to do login with wrong email', async () => {
    const response = await fetch(loginUrl, {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ email: 'user@email.com', password: 'Palabra123$' })
    })

    const body = await response.json()
    expect(response.status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.InvalidCredentials)
  })

  it('POST /auth/login - should throw a body validation error', async () => {
    const response = await fetch(loginUrl, {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ email: 'user01@email.com' }) // falta password
    })

    const body = await response.json()
    expect(response.status).toBe(400)
    expect(body.message).toBe('invalid body')
    expect(body.validationError).toBeInstanceOf(Array)
    expect(body.validationError.length).toBe(1)
  })
})

describe('removed refresh token endpoints', () => {
  it('POST /auth/refresh - should not exist', async () => {
    const response = await fetch(refreshUrl, { method: 'POST' })

    expect(response.status).toBe(404)
  })

  it('POST /auth/logout - should not exist', async () => {
    const response = await fetch(logoutUrl, { method: 'POST' })

    expect(response.status).toBe(404)
  })

  it('POST /auth/logout-all - should not exist', async () => {
    const { accessToken } = await testUtils.login('user01@email.com', 'Password123!')

    const response = await fetch(logoutAllUrl, {
      method: 'POST',
      headers: { Authorization: testUtils.buildAuthorizationHeader(accessToken) }
    })

    expect(response.status).toBe(404)
  })
})

describe('me endpoint tests', () => {
  it('GET /auth/me - should get user info with valid access token', async () => {
    const { accessToken } = await testUtils.login('user01@email.com', 'Password123!')

    const response = await fetch(meUrl, {
      method: 'GET',
      headers: {
        Authorization: testUtils.buildAuthorizationHeader(accessToken)
      }
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results).toHaveProperty('type', 'users')
    expect(body.results).toHaveProperty('id', '01J9BHWZ8N4B1JBSAFCBKQGERS')
    expect(body.results.attributes).toHaveProperty('email', 'user01@email.com')
  })

  it('GET /auth/me - should fail without token', async () => {
    const response = await fetch(meUrl, {
      method: 'GET'
    })

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.TokenNotProvidedError)
  })

  it('GET /auth/me - should fail with invalid token', async () => {
    const response = await fetch(meUrl, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer invalid-token'
      }
    })

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.InvalidTokenError)
  })

  it('GET /auth/me - should fail with expired token', async () => {
    const expiredToken = jwt.sign({ id: '01J9BHWZ8N4B1JBSAFCBKQGERS', role: 'regular' }, 'test', { expiresIn: -10 })

    const response = await fetch(meUrl, {
      method: 'GET',
      headers: {
        Authorization: testUtils.buildAuthorizationHeader(expiredToken)
      }
    })

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.InvalidTokenError)
    expect(body.message).toBe('token expired')
  })
})
