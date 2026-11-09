import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ulid } from 'ulid'
import { ApiRestErrorCode } from '../../error/types.js'
import mongo from '../../mongo.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import { DBLibrary } from '../../resources/libraries/libraries.interfaces.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import { DBUserBook, UserBookRating } from '../../resources/user-books/user-books.interfaces.js'
import usersDao from '../../resources/users/users.dao.js'
import { DBUser, Role } from '../../resources/users/users.interfaces.js'
import testUtils from '../utils/utils.js'

const now = new Date()

function user (role: Role): DBUser {
  const id = ulid()
  return { _id: id, name: `user ${id}`, email: `${id.toLowerCase()}@email.com`, password: 'hash', role, avatar: 'avatar', createdAt: now, updatedAt: now }
}

function library (userId: string, books: string[]): DBLibrary {
  return { _id: ulid(), name: `library ${books.length}`, description: '', userId, books, isFavorite: false, tagIds: [], createdAt: now, updatedAt: now }
}

function userBook (userId: string, rating: UserBookRating | null, libraries: string[] = []): DBUserBook {
  const id = ulid()
  return {
    _id: id,
    libraries,
    bookId: ulid(),
    bookTitle: `title ${id}`,
    bookAuthors: ['author'],
    bookCover: { source: null, value: null },
    bookIsbn13: '9780000000000',
    bookIsbn10: null,
    rating,
    notes: null,
    userId,
    createdAt: now,
    updatedAt: now
  }
}

const reader = user(Role.Regular)
const otherReader = user(Role.Regular)
const newReader = user(Role.Regular)
const admin = user(Role.Admin)

const adminAuth = testUtils.buildAuthorizationHeader(makeJwt(admin._id, Role.Admin))
const regularAuth = testUtils.buildAuthorizationHeader(makeJwt(reader._id, Role.Regular))

async function get (path: string, auth: string): Promise<{ status: number, body: any }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), { headers: { Authorization: auth } })
  return { status: response.status, body: await response.json() }
}

beforeAll(async () => {
  // reader: three libraries (one empty), a book in two libraries and five books in none
  const inTwo = userBook(reader._id, null)
  const first = userBook(reader._id, 9)
  const second = userBook(reader._id, 7)
  const big = library(reader._id, [first._id, second._id, inTwo._id])
  const small = library(reader._id, [inTwo._id])
  const empty = library(reader._id, [])
  const readerBooks = [
    { ...first, libraries: [big._id] },
    { ...second, libraries: [big._id] },
    { ...inTwo, libraries: [big._id, small._id] },
    userBook(reader._id, 9),
    userBook(reader._id, null),
    userBook(reader._id, 3),
    userBook(reader._id, 10),
    userBook(reader._id, 7)
  ]

  // otherReader: data that must not be mixed with the reader's
  const otherBooks = [userBook(otherReader._id, 1), userBook(otherReader._id, 1)]
  const otherLibrary = library(otherReader._id, otherBooks.map((book) => book._id))

  await usersDao.collection.insertMany([reader, otherReader, newReader, admin])
  await librariesDao.collection.insertMany([big, small, empty, { ...otherLibrary }])
  await userBooksDao.collection.insertMany([...readerBooks, ...otherBooks.map((book) => ({ ...book, libraries: [otherLibrary._id] }))])
})

afterAll(async () => {
  await mongo.clean()
})

describe('GET /users/:id/stats', () => {
  it('should give the figures of a regular user, counting the books in no library', async () => {
    const { status, body } = await get(`/users/${reader._id}/stats`, adminAuth)

    expect(status).toBe(200)
    expect(body.results).toEqual({
      type: 'user-stats',
      attributes: {
        libraries: { count: 3, averageBooks: 4 / 3, largestBooks: 3 },
        books: { total: 8, rated: 6, unrated: 2, withoutLibrary: 5 },
        ratings: {
          average: 7.5,
          distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, 7: 2, 8: 0, 9: 2, 10: 1 }
        }
      }
    })
  })

  it('should give only figures, never names or titles', async () => {
    const { body } = await get(`/users/${reader._id}/stats`, adminAuth)

    expect(JSON.stringify(body)).not.toMatch(/library |title /)
  })

  it('should give zeros to a user without libraries or books', async () => {
    const { status, body } = await get(`/users/${newReader._id}/stats`, adminAuth)

    expect(status).toBe(200)
    expect(body.results.attributes).toEqual({
      libraries: { count: 0, averageBooks: 0, largestBooks: null },
      books: { total: 0, rated: 0, unrated: 0, withoutLibrary: 0 },
      ratings: {
        average: null,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
      }
    })
  })

  it.each([
    ['a user that does not exist', ulid()],
    ['an admin, who has no libraries', admin._id]
  ])('should answer 404 for %s', async (_, id) => {
    const { status, body } = await get(`/users/${id}/stats`, adminAuth)

    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
  })

  it('should be forbidden to a regular user, even for their own figures', async () => {
    const { status, body } = await get(`/users/${reader._id}/stats`, regularAuth)

    expect(status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.PermissionError)
  })
})

describe('GET /users/:id', () => {
  it('should give the user without the avatar or the password', async () => {
    const { status, body } = await get(`/users/${reader._id}`, adminAuth)

    expect(status).toBe(200)
    expect(body.results).toEqual({
      type: 'users',
      id: reader._id,
      attributes: { name: reader.name, email: reader.email, role: Role.Regular, createdAt: now.toISOString(), updatedAt: now.toISOString() }
    })
  })

  it('should answer 404 for a user that does not exist', async () => {
    const { status } = await get(`/users/${ulid()}`, adminAuth)

    expect(status).toBe(404)
  })

  it('should be forbidden to a regular user', async () => {
    const { status } = await get(`/users/${otherReader._id}`, regularAuth)

    expect(status).toBe(403)
  })

  it('should not take «me» as an id', async () => {
    const { status, body } = await get('/users/me', regularAuth)

    expect(status).toBe(200)
    expect(body.results.id).toBe(reader._id)
  })
})
