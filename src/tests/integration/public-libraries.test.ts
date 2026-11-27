import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import usersDao from '../../resources/users/users.dao.js'
import { DBUser, Role } from '../../resources/users/users.interfaces.js'

// The owner, user01, has three libraries (the third one is never public); the first one has Rossiya, Lightning and Ashes and It Never Happened
const ownerId = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'
const ownerRossiyaId = '01J9W9P6M5S0VRKVSRX3Q9T3W7'

// Another regular user, with one library and It Never Happened in it
const otherUserId = '01J9XDBGCX8QM0GW67T7QGKS41'
const otherUserLibraryId = '01J9XDD1NAFHP0159FYT245D8X'
const otherUserItNeverHappenedId = '01J9XDF6YJWYZ7EC2MDR8R58MW'

// A user without libraries nor books, who is never invited
const readerId = '01JZPUBLIC00000000000000R1'
const adminId = '01J9BK7YX0D5NHHBN70Q4N7P69'

const rossiyaBookId = '01J9KKFS6CKTSVY0ETH9A7PHXW'
const itNeverHappenedBookId = '01J9KKFQRP6H3F30CNT21G1DWT'

const OWNER_NOTES = 'private thoughts of the owner'
const OTHER_USER_NOTES = 'private thoughts of the other user'

const ownerAuth = testUtils.buildAuthorizationHeader(makeJwt(ownerId, Role.Regular))
const otherUserAuth = testUtils.buildAuthorizationHeader(makeJwt(otherUserId, Role.Regular))
const readerAuth = testUtils.buildAuthorizationHeader(makeJwt(readerId, Role.Regular))
const adminAuth = testUtils.buildAuthorizationHeader(makeJwt(adminId, Role.Admin))

async function request (method: string, path: string, auth: string | null, body?: object): Promise<{ status: number, body: any, text: string }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth != null ? { Authorization: auth } : {}) },
    body: body != null ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  const isJson = response.headers.get('content-type')?.includes('application/json') === true
  return { status: response.status, body: isJson ? JSON.parse(text) : null, text }
}

async function get (path: string, auth = readerAuth): Promise<{ status: number, body: any, text: string }> {
  return await request('GET', path, auth)
}

async function patchLibrary (libraryId: string, body: object, auth = ownerAuth): Promise<{ status: number, body: any }> {
  return await request('PATCH', `/libraries/${libraryId}`, auth, body)
}

async function setPublic (libraryId: string, isPublic: boolean, auth = ownerAuth): Promise<void> {
  const { status } = await patchLibrary(libraryId, { isPublic }, auth)
  expect(status).toBe(200)
}

/** Publishes the libraries at the given times, without going through the API, so the order is known. */
async function publishAt (publishedAt: Record<string, number>): Promise<void> {
  for (const [libraryId, time] of Object.entries(publishedAt)) {
    await librariesDao.collection.updateOne({ _id: libraryId }, { $set: { isPublic: true, publishedAt: new Date(time) } })
  }
}

function ids (body: any): string[] {
  return body.results.map((result: any) => result.id)
}

/** The attributes of a book in the books of a library of another user */
async function getBook (bookId: string, libraryId = firstLibraryId, auth = readerAuth): Promise<any> {
  const { status, body } = await get(`/shared-libraries/${libraryId}/books`, auth)
  expect(status).toBe(200)
  return body.results.find((result: any) => result.id === bookId).attributes
}

function newUser (id: string, email: string, name: string): DBUser {
  const now = new Date()
  return { _id: id, email, name, password: 'not-a-hash', avatar: 'base64', role: Role.Regular, createdAt: now, updatedAt: now }
}

// Every test starts from the same data: no library is public nor shared
beforeEach(async () => {
  await mongo.clean()
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await usersDao.collection.insertOne(newUser(readerId, 'reader@email.com', 'Reader'))
  await userBooksDao.collection.updateOne({ _id: ownerRossiyaId }, { $set: { rating: 9, notes: OWNER_NOTES } })
  await userBooksDao.collection.updateOne({ _id: otherUserItNeverHappenedId }, { $set: { rating: 7, notes: OTHER_USER_NOTES } })
})

afterAll(async () => {
  await mongo.clean()
})

describe('visibility of a library', () => {
  it('a new library should be private', async () => {
    const { status, body } = await request('POST', '/libraries', ownerAuth, { name: 'a new library', isPublic: true })

    expect(status).toBe(201)
    expect(body.results.attributes).toMatchObject({ isPublic: false, publishedAt: null })
    expect(await librariesDao.findById(body.results.id)).toMatchObject({ isPublic: false, publishedAt: null })
  })

  it('PATCH /libraries/:id - should make the library public, from now', async () => {
    const before = Date.now()
    const { status, body } = await patchLibrary(firstLibraryId, { isPublic: true })

    expect(status).toBe(200)
    expect(body.results.attributes.isPublic).toBe(true)
    const publishedAt = new Date(body.results.attributes.publishedAt).getTime()
    expect(publishedAt).toBeGreaterThanOrEqual(before)
    expect(publishedAt).toBeLessThanOrEqual(Date.now())
  })

  it('PATCH /libraries/:id - should keep the date when the library already is public', async () => {
    await publishAt({ [firstLibraryId]: 1000 })

    const isPublic = await patchLibrary(firstLibraryId, { isPublic: true })
    const otherChange = await patchLibrary(firstLibraryId, { name: 'a new name' })

    for (const { status, body } of [isPublic, otherChange]) {
      expect(status).toBe(200)
      expect(body.results.attributes).toMatchObject({ isPublic: true, publishedAt: new Date(1000).toISOString() })
    }
  })

  it('PATCH /libraries/:id - should make the library private again, without date', async () => {
    await publishAt({ [firstLibraryId]: 1000 })

    const { status, body } = await patchLibrary(firstLibraryId, { isPublic: false })

    expect(status).toBe(200)
    expect(body.results.attributes).toMatchObject({ isPublic: false, publishedAt: null })
  })

  it('PATCH /libraries/:id - should not be changed by other users', async () => {
    const { status } = await patchLibrary(firstLibraryId, { isPublic: true }, otherUserAuth)

    expect(status).toBe(403)
    expect(await librariesDao.findById(firstLibraryId)).toMatchObject({ isPublic: false, publishedAt: null })
  })

  it('PATCH /libraries/:id - should not be changed by the members', async () => {
    await librariesDao.addMember(firstLibraryId, readerId)

    const { status } = await patchLibrary(firstLibraryId, { isPublic: true }, readerAuth)

    expect(status).toBe(403)
    expect(await librariesDao.findById(firstLibraryId)).toMatchObject({ isPublic: false, publishedAt: null })
  })

  it.each([['true'], [1], [null]])('PATCH /libraries/:id - should fail with isPublic %j', async (isPublic) => {
    const { status, body } = await patchLibrary(firstLibraryId, { isPublic })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it('PATCH /libraries/:id - should not accept the date from the body', async () => {
    const { status, body } = await patchLibrary(firstLibraryId, { publishedAt: new Date(1000).toISOString() })

    expect(status).toBe(200)
    expect(body.results.attributes.publishedAt).toBeNull()
  })
})

describe('access to the public libraries', () => {
  it('GET /public-libraries - should fail without token', async () => {
    const { status, body } = await request('GET', '/public-libraries', null)

    expect(status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.TokenNotProvidedError)
  })

  it('GET /public-libraries - should be forbidden to an admin', async () => {
    const { status } = await get('/public-libraries', adminAuth)

    expect(status).toBe(403)
  })

  it.each(['', '/books', '/download?format=csv'])('GET /shared-libraries/:id%s - should be readable by any user once public', async (path) => {
    expect((await get(`/shared-libraries/${firstLibraryId}${path}`)).status).toBe(404)

    await setPublic(firstLibraryId, true)

    expect((await get(`/shared-libraries/${firstLibraryId}${path}`)).status).toBe(200)
  })

  it.each(['', '/books', '/download?format=csv'])('GET /shared-libraries/:id%s - should not exist once private again', async (path) => {
    await setPublic(firstLibraryId, true)
    await setPublic(firstLibraryId, false)

    const { status, body } = await get(`/shared-libraries/${firstLibraryId}${path}`)

    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
  })

  it('should still be shared with the members once private again', async () => {
    await librariesDao.addMember(firstLibraryId, readerId)
    await setPublic(firstLibraryId, true)
    await setPublic(firstLibraryId, false)

    expect((await get(`/shared-libraries/${firstLibraryId}`)).status).toBe(200)
  })

  it('should not give the owner their own library as the one of another user', async () => {
    await setPublic(firstLibraryId, true)

    expect((await get(`/shared-libraries/${firstLibraryId}`, ownerAuth)).status).toBe(404)
  })

  it('should not give any other permission on the library', async () => {
    await setPublic(firstLibraryId, true)

    const responses = await Promise.all([
      request('GET', `/libraries/${firstLibraryId}`, readerAuth),
      request('PATCH', `/libraries/${firstLibraryId}`, readerAuth, { name: 'not mine' }),
      request('DELETE', `/libraries/${firstLibraryId}`, readerAuth),
      request('GET', `/user-books/${ownerRossiyaId}`, readerAuth)
    ])

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 404])
    expect(await librariesDao.findById(firstLibraryId)).toMatchObject({ name: 'sample first library' })
  })

  it('DELETE /shared-libraries/:id - should not exist for who is not a member', async () => {
    await setPublic(firstLibraryId, true)

    const { status } = await request('DELETE', `/shared-libraries/${firstLibraryId}`, readerAuth)

    expect(status).toBe(404)
    expect((await get(`/shared-libraries/${firstLibraryId}`)).status).toBe(200)
  })

  it('a member who leaves a public library should still see it as public', async () => {
    await librariesDao.addMember(firstLibraryId, readerId)
    await setPublic(firstLibraryId, true)

    expect((await request('DELETE', `/shared-libraries/${firstLibraryId}`, readerAuth)).status).toBe(204)

    const { status, body } = await get(`/shared-libraries/${firstLibraryId}`)
    expect(status).toBe(200)
    expect(body.results.attributes).toMatchObject({ access: 'public', sharedAt: null })
  })

  it('should not list the public libraries among the shared ones', async () => {
    await setPublic(firstLibraryId, true)

    const { body } = await get('/shared-libraries')

    expect(body.results).toEqual([])
    expect(body.paginationInfo.total).toBe(0)
  })
})

describe('GET /shared-libraries/:id of a public library', () => {
  it('should tell who is not a member that they see it because it is public', async () => {
    await setPublic(firstLibraryId, true)

    const { status, body } = await get(`/shared-libraries/${firstLibraryId}`)

    expect(status).toBe(200)
    expect(body).toEqual({
      results: {
        type: 'shared-libraries',
        id: firstLibraryId,
        attributes: {
          name: 'sample first library',
          description: 'description of the sample first library',
          ownerName: 'user01',
          booksCount: 3,
          shareRatings: false,
          isPublic: true,
          access: 'public',
          sharedAt: null
        }
      }
    })
  })

  it('should tell the members that they are members, and that it is public', async () => {
    await librariesDao.addMember(firstLibraryId, readerId)
    await setPublic(firstLibraryId, true)
    await patchLibrary(firstLibraryId, { shareRatings: true })

    const { body } = await get(`/shared-libraries/${firstLibraryId}`)
    const { body: list } = await get('/shared-libraries')

    for (const attributes of [body.results.attributes, list.results[0].attributes]) {
      expect(attributes).toMatchObject({ isPublic: true, access: 'member', shareRatings: true, sharedAt: expect.any(String) })
    }
  })
})

describe('privacy of the owner of a public library', () => {
  beforeEach(async () => {
    await setPublic(firstLibraryId, true)
  })

  it('should not show the ratings to who is not a member, even when they are shared with the members', async () => {
    await patchLibrary(firstLibraryId, { shareRatings: true })
    await librariesDao.addMember(firstLibraryId, otherUserId)

    const { body } = await get(`/shared-libraries/${firstLibraryId}`)
    expect(body.results.attributes.shareRatings).toBe(false)
    expect((await getBook(rossiyaBookId)).ownerRating).toBeNull()
    // The members still see them
    expect((await getBook(rossiyaBookId, firstLibraryId, otherUserAuth)).ownerRating).toBe(9)
  })

  it('should show the own opinion of who reads it', async () => {
    const book = await getBook(itNeverHappenedBookId, firstLibraryId, otherUserAuth)

    expect(book.ownerRating).toBeNull()
    expect(book.own).toEqual({ rating: 7, notes: OTHER_USER_NOTES })
  })

  it('should never show the notes, the id nor the email of the owner, nor the members', async () => {
    await patchLibrary(firstLibraryId, { shareRatings: true })
    await librariesDao.addMember(firstLibraryId, otherUserId)

    const responses = await Promise.all([
      get('/public-libraries'),
      get(`/shared-libraries/${firstLibraryId}`),
      get(`/shared-libraries/${firstLibraryId}/books`)
    ])

    for (const { status, text } of responses) {
      expect(status).toBe(200)
      expect(text).not.toContain(OWNER_NOTES)
      expect(text).not.toContain(ownerId)
      expect(text).not.toContain('user01@email.com')
      expect(text).not.toContain(otherUserId)
    }
  })
})

describe('GET /public-libraries', () => {
  it('should return exactly the public data of the libraries', async () => {
    await publishAt({ [firstLibraryId]: 1000 })

    const { status, body } = await get('/public-libraries')

    expect(status).toBe(200)
    expect(body).toEqual({
      results: [{
        type: 'public-libraries',
        id: firstLibraryId,
        attributes: {
          name: 'sample first library',
          description: 'description of the sample first library',
          ownerName: 'user01',
          booksCount: 3,
          publishedAt: new Date(1000).toISOString()
        }
      }],
      paginationInfo: { skip: 0, limit: 10, total: 1 }
    })
  })

  it('should list the most recently published first, also from different owners, and paginate them', async () => {
    await publishAt({ [secondLibraryId]: 1000, [otherUserLibraryId]: 3000, [firstLibraryId]: 2000 })

    const { body } = await get('/public-libraries')
    expect(ids(body)).toEqual([otherUserLibraryId, firstLibraryId, secondLibraryId])
    const ownerNames = body.results.map((result: any) => result.attributes.ownerName)
    expect(ownerNames).toEqual(['user02', 'user01', 'user01'])

    const pages = await Promise.all([0, 1, 2].map(async skip => await get(`/public-libraries?skip=${skip}&limit=1`)))
    expect(pages.flatMap(page => ids(page.body))).toEqual(ids(body))
    expect(pages.map(page => page.body.paginationInfo.total)).toEqual([3, 3, 3])
  })

  it('should return an empty list when no library is public', async () => {
    const { status, body } = await get('/public-libraries')

    expect(status).toBe(200)
    expect(body.results).toEqual([])
    expect(body.paginationInfo).toEqual({ skip: 0, limit: 10, total: 0 })
  })

  it('should not list the own libraries', async () => {
    await publishAt({ [firstLibraryId]: 1000, [otherUserLibraryId]: 2000 })

    const { body } = await get('/public-libraries', ownerAuth)

    expect(ids(body)).toEqual([otherUserLibraryId])
    expect(body.paginationInfo.total).toBe(1)
  })

  it('should list the public libraries that are also shared with the user', async () => {
    await librariesDao.addMember(firstLibraryId, readerId)
    await publishAt({ [firstLibraryId]: 1000 })

    const { body } = await get('/public-libraries')

    expect(ids(body)).toEqual([firstLibraryId])
  })

  it('should not list the private libraries, even when they are shared with the user', async () => {
    await librariesDao.addMember(secondLibraryId, readerId)
    await publishAt({ [firstLibraryId]: 1000 })

    const { body } = await get('/public-libraries')

    expect(ids(body)).toEqual([firstLibraryId])
  })

  it('should fail with an invalid pagination', async () => {
    const { status, body } = await get('/public-libraries?limit=101')

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })
})

describe('GET /public-libraries?search=', () => {
  async function search (text: string, auth = readerAuth): Promise<{ ids: string[], total: number }> {
    const { status, body } = await get(`/public-libraries?search=${encodeURIComponent(text)}`, auth)
    expect(status).toBe(200)
    return { ids: ids(body), total: body.paginationInfo.total }
  }

  // The third library stays private
  beforeEach(async () => {
    await publishAt({ [firstLibraryId]: 1000, [secondLibraryId]: 2000, [otherUserLibraryId]: 3000 })
  })

  it.each([
    ['in the name, ignoring the case', 'SECOND', [secondLibraryId]],
    ['in the description', 'description of the sample first library user02', [otherUserLibraryId]],
    ['in the name of the owner', 'user01', [secondLibraryId, firstLibraryId]],
    ['literally', '.*', []]
  ])('should search %s', async (_case, text, expected) => {
    expect(await search(text)).toEqual({ ids: expected, total: expected.length })
  })

  it('should not find the private libraries', async () => {
    expect(await search('third')).toEqual({ ids: [], total: 0 })
  })

  it('should not find the own libraries by the name of the user', async () => {
    expect(await search('user01', ownerAuth)).toEqual({ ids: [], total: 0 })
  })

  it('should not search in the email of the owner', async () => {
    expect(await search('email.com')).toEqual({ ids: [], total: 0 })
  })

  it('should find the libraries by the current name of their owner', async () => {
    await usersDao.collection.updateOne({ _id: ownerId }, { $set: { name: 'Ana' } })

    expect(await search('ana')).toEqual({ ids: [secondLibraryId, firstLibraryId], total: 2 })
  })

  it.each(['', '   '])('should ignore an empty search (%j)', async (text) => {
    expect((await search(text)).total).toBe(3)
  })

  it('should fail with a search longer than 100 characters', async () => {
    const { status } = await get(`/public-libraries?search=${'a'.repeat(101)}`)

    expect(status).toBe(400)
  })
})
