import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ulid } from 'ulid'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import { MAX_MEMBERS_PER_LIBRARY } from '../../resources/library-members/library-members.constants.js'
import usersDao from '../../resources/users/users.dao.js'
import { DBUser, Role } from '../../resources/users/users.interfaces.js'

const ownerId = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const guestId = '01J9XDBGCX8QM0GW67T7QGKS41'
const adminId = '01J9BK7YX0D5NHHBN70Q4N7P69'
const ownerEmail = 'user01@email.com'
const guestEmail = 'user02@email.com'
const adminEmail = 'admin01@email.com'
// Fixture libraries of user01
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'

// A guest without libraries of their own
const otherGuestId = '01JZSHARED0000000000000001'
const otherGuestEmail = 'guest@email.com'

const ownerAuth = testUtils.buildAuthorizationHeader(makeJwt(ownerId, Role.Regular))
const guestAuth = testUtils.buildAuthorizationHeader(makeJwt(guestId, Role.Regular))
const adminAuth = testUtils.buildAuthorizationHeader(makeJwt(adminId, Role.Admin))

async function request (method: string, path: string, auth: string | null, body?: object): Promise<{ status: number, body: any }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth != null ? { Authorization: auth } : {}) },
    body: body != null ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  const isJson = response.headers.get('content-type')?.includes('application/json') === true
  return { status: response.status, body: isJson ? JSON.parse(text) : text }
}

async function invite (email: unknown, libraryId = firstLibraryId, auth = ownerAuth): Promise<{ status: number, body: any }> {
  return await request('POST', `/libraries/${libraryId}/members`, auth, { email })
}

/** The ids of the members of a library, in the order in which they were added */
async function memberIds (libraryId = firstLibraryId): Promise<string[]> {
  const library = await librariesDao.findById(libraryId)
  return library?.members.map(member => member.userId) ?? []
}

function newUser (id: string, email: string, name: string): DBUser {
  const now = new Date()
  return { _id: id, email, name, password: 'not-a-hash', avatar: 'base64', role: Role.Regular, notificationPreferences: { libraryShared: true }, createdAt: now, updatedAt: now }
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await usersDao.collection.insertOne(newUser(otherGuestId, otherGuestEmail, 'Other guest'))
})

beforeEach(async () => {
  await librariesDao.collection.updateMany({}, { $set: { members: [] } })
})

afterAll(async () => {
  await mongo.clean()
})

describe('POST /libraries/:id/members', () => {
  it('should invite a user by email and answer with their name and email only', async () => {
    const { status, body } = await invite(guestEmail)

    expect(status).toBe(201)
    expect(body).toEqual({
      results: {
        type: 'library-members',
        id: guestId,
        attributes: { userId: guestId, name: 'user02', email: guestEmail, createdAt: expect.any(String) }
      }
    })

    const stored = await librariesDao.collection.findOne({ _id: firstLibraryId })
    expect(stored?.members).toEqual([{ userId: guestId, createdAt: new Date(body.results.attributes.createdAt) }])
    // Sharing a library does not count as editing it
    expect(stored?.updatedAt).toEqual(new Date('2000-01-01T00:00:00.000Z'))
  })

  it('should ignore the case and the surrounding spaces of the email', async () => {
    const { status, body } = await invite('  USER02@Email.com ')

    expect(status).toBe(201)
    expect(body.results.attributes.userId).toBe(guestId)
  })

  it.each([
    ['not-an-email'],
    [''],
    [undefined]
  ])('should fail with the email %s', async (email) => {
    const { status, body } = await invite(email)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
    expect(body.message).toBe('invalid body')
  })

  it('should answer the same to an unknown email and to the email of an admin', async () => {
    const unknown = await invite('nobody@email.com')
    const admin = await invite(adminEmail)

    expect(unknown.status).toBe(404)
    expect(unknown.body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
    expect(unknown.body.message).toBe('user not found')
    expect(admin).toEqual(unknown)
    expect(await memberIds()).toEqual([])
  })

  it('should not let the owner invite themselves', async () => {
    const { status, body } = await invite(ownerEmail)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
    expect(body.message).toBe('the owner cannot be a member of the library')
    expect(await memberIds()).toEqual([])
  })

  it('should not invite the same user twice', async () => {
    await invite(guestEmail)
    const { status, body } = await invite(guestEmail)

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ConflictError)
    expect(body.message).toBe('user is already a member of the library')
    expect(await memberIds()).toEqual([guestId])
  })

  it('should invite the user only once when the same invitation is sent twice at once', async () => {
    const responses = await Promise.all([invite(guestEmail), invite(guestEmail)])

    expect(responses.map(response => response.status).sort((a, b) => a - b)).toEqual([201, 409])
    expect(await memberIds()).toEqual([guestId])
  })

  it('should let the same user be a member of several libraries', async () => {
    expect((await invite(guestEmail, firstLibraryId)).status).toBe(201)
    expect((await invite(guestEmail, secondLibraryId)).status).toBe(201)
  })

  it('should reject the member over the limit', async () => {
    for (let i = 0; i < MAX_MEMBERS_PER_LIBRARY - 1; i++) {
      await librariesDao.addMember(firstLibraryId, ulid())
    }
    expect((await invite(guestEmail)).status).toBe(201)

    const { status, body } = await invite(otherGuestEmail)

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.LibraryMembersLimitReached)
    expect(body.message).toBe('a library cannot have more than 20 members')
    expect(await memberIds()).toHaveLength(MAX_MEMBERS_PER_LIBRARY)
    // Who is already a member is told so, even if the library is full
    expect((await invite(guestEmail)).body.message).toBe('user is already a member of the library')
    // The limit is per library
    expect((await invite(otherGuestEmail, secondLibraryId)).status).toBe(201)
  })

  it('should not exceed the limit with simultaneous invitations', async () => {
    const added = await Promise.all(Array.from({ length: MAX_MEMBERS_PER_LIBRARY * 2 }, async () =>
      await librariesDao.addMember(firstLibraryId, ulid())
    ))

    expect(added.filter(member => member != null)).toHaveLength(MAX_MEMBERS_PER_LIBRARY)
    expect(await memberIds()).toHaveLength(MAX_MEMBERS_PER_LIBRARY)
  })

  it('should not add a member to a library that has just been deleted', async () => {
    expect(await librariesDao.addMember(ulid(), guestId)).toBeNull()
  })

  it('should limit the failed invitations of each user, not the successful ones', async () => {
    const limitedId = ulid()
    const limitedAuth = testUtils.buildAuthorizationHeader(makeJwt(limitedId, Role.Regular))
    const now = new Date()
    const libraryId = ulid()
    await librariesDao.collection.insertOne({
      _id: libraryId,
      name: 'library of the limited user',
      description: null,
      books: [],
      isFavorite: false,
      shareRatings: false,
      tagIds: [],
      members: [],
      userId: limitedId,
      createdAt: now,
      updatedAt: now
    })

    try {
      expect((await invite(guestEmail, libraryId, limitedAuth)).status).toBe(201)
      for (let i = 0; i < 20; i++) {
        expect((await invite(`nobody${i}@email.com`, libraryId, limitedAuth)).status).toBe(404)
      }

      const { status, body } = await invite(otherGuestEmail, libraryId, limitedAuth)
      expect(status).toBe(429)
      expect(body.errorCode).toBe(ApiRestErrorCode.TooManyRequests)

      // Neither the other endpoints of the same user nor the other users, with the same IP, are limited
      expect((await request('GET', `/libraries/${libraryId}/members`, limitedAuth)).status).toBe(200)
      expect((await invite(guestEmail)).status).toBe(201)
    } finally {
      await librariesDao.collection.deleteOne({ _id: libraryId })
    }
  })
})

describe('GET /libraries/:id/members', () => {
  it('should list the members, the most recent first', async () => {
    await invite(guestEmail)
    await invite(otherGuestEmail)
    await invite(guestEmail, secondLibraryId)

    const { status, body } = await request('GET', `/libraries/${firstLibraryId}/members`, ownerAuth)

    expect(status).toBe(200)
    expect(body.paginationInfo).toEqual({ skip: 0, limit: 10, total: 2 })
    expect(body.results.map((result: any) => result.attributes)).toEqual([
      { userId: otherGuestId, name: 'Other guest', email: otherGuestEmail, createdAt: expect.any(String) },
      { userId: guestId, name: 'user02', email: guestEmail, createdAt: expect.any(String) }
    ])
  })

  it('should paginate the members', async () => {
    await invite(guestEmail)
    await invite(otherGuestEmail)

    const { status, body } = await request('GET', `/libraries/${firstLibraryId}/members?skip=1&limit=1`, ownerAuth)

    expect(status).toBe(200)
    expect(body.paginationInfo).toEqual({ skip: 1, limit: 1, total: 2 })
    expect(body.results.map((result: any) => result.attributes.userId)).toEqual([guestId])
  })

  it('should return an empty list for a library that is not shared', async () => {
    const { status, body } = await request('GET', `/libraries/${firstLibraryId}/members`, ownerAuth)

    expect(status).toBe(200)
    expect(body.results).toEqual([])
    expect(body.paginationInfo.total).toBe(0)
  })

  it('should fail with an invalid pagination', async () => {
    const { status, body } = await request('GET', `/libraries/${firstLibraryId}/members?limit=0`, ownerAuth)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })
})

describe('DELETE /libraries/:id/members/:userId', () => {
  it('should remove only that member from only that library', async () => {
    await invite(guestEmail)
    await invite(otherGuestEmail)
    await invite(guestEmail, secondLibraryId)

    const { status } = await request('DELETE', `/libraries/${firstLibraryId}/members/${guestId}`, ownerAuth)

    expect(status).toBe(204)
    expect(await memberIds(firstLibraryId)).toEqual([otherGuestId])
    expect(await memberIds(secondLibraryId)).toEqual([guestId])
  })

  it('should fail when the user is not a member', async () => {
    const { status, body } = await request('DELETE', `/libraries/${firstLibraryId}/members/${guestId}`, ownerAuth)

    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
    expect(body.message).toBe('member not found')
  })
})

describe('permissions on the members', () => {
  const cases: Array<[string, string, object | undefined]> = [
    ['GET', '', undefined],
    ['POST', '', { email: otherGuestEmail }],
    ['DELETE', `/${guestId}`, undefined]
  ]

  it.each(cases)('%s /libraries/:id/members%s - should be forbidden to a member', async (method, path, body) => {
    await invite(guestEmail)

    const response = await request(method, `/libraries/${firstLibraryId}/members${path}`, guestAuth, body)

    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe(ApiRestErrorCode.PermissionError)
    expect(await memberIds()).toEqual([guestId])
  })

  it.each(cases)('%s /libraries/:id/members%s - should be forbidden to an admin', async (method, path, body) => {
    const response = await request(method, `/libraries/${firstLibraryId}/members${path}`, adminAuth, body)

    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe(ApiRestErrorCode.PermissionError)
  })

  it.each(cases)('%s /libraries/:id/members%s - should fail without token', async (method, path, body) => {
    const response = await request(method, `/libraries/${firstLibraryId}/members${path}`, null, body)

    expect(response.status).toBe(401)
  })

  it.each(cases)('%s /libraries/:id/members%s - should fail with an unknown library', async (method, path, body) => {
    const response = await request(method, `/libraries/${ulid()}/members${path}`, ownerAuth, body)

    expect(response.status).toBe(404)
    expect(response.body.message).toBe('library not found')
  })
})

describe('shareRatings', () => {
  it('should be false in a new library, even if requested', async () => {
    const { status, body } = await request('POST', '/libraries', ownerAuth, { name: 'new library', shareRatings: true })

    expect(status).toBe(201)
    expect(body.results.attributes.shareRatings).toBe(false)
    expect((await librariesDao.collection.findOne({ _id: body.results.id }))?.shareRatings).toBe(false)

    await request('DELETE', `/libraries/${String(body.results.id)}`, ownerAuth)
  })

  it('should be changed by the owner without changing anything else', async () => {
    const before = await request('GET', `/libraries/${secondLibraryId}`, ownerAuth)
    const { status, body } = await request('PATCH', `/libraries/${secondLibraryId}`, ownerAuth, { shareRatings: true })

    expect(status).toBe(200)
    expect(body.results.attributes).toEqual({
      ...before.body.results.attributes,
      shareRatings: true,
      updatedAt: expect.any(String)
    })

    const { body: list } = await request('GET', '/libraries', ownerAuth)
    expect(list.results.map((result: any) => [result.id, result.attributes.shareRatings])).toEqual([
      [firstLibraryId, false],
      [secondLibraryId, true],
      ['01J9W8VR2CFZW8PJ1Q8Y4Y5WFA', false]
    ])

    const restored = await request('PATCH', `/libraries/${secondLibraryId}`, ownerAuth, { shareRatings: false })
    expect(restored.body.results.attributes.shareRatings).toBe(false)
  })

  it('should fail with a non boolean value', async () => {
    const { status, body } = await request('PATCH', `/libraries/${firstLibraryId}`, ownerAuth, { shareRatings: 'true' })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it('should not be changed by a member', async () => {
    await invite(guestEmail)
    const { status } = await request('PATCH', `/libraries/${firstLibraryId}`, guestAuth, { shareRatings: true })

    expect(status).toBe(403)
    expect((await librariesDao.collection.findOne({ _id: firstLibraryId }))?.shareRatings).toBe(false)
  })
})

describe('privacy of the members', () => {
  it('should not be exposed along with the library, nor written through it', async () => {
    await invite(guestEmail)

    const created = await request('POST', '/libraries', ownerAuth, { name: 'library with members', members: [{ userId: guestId }] })
    expect(created.status).toBe(201)
    expect(await memberIds(created.body.results.id)).toEqual([])
    await request('DELETE', `/libraries/${String(created.body.results.id)}`, ownerAuth)

    const updated = await request('PATCH', `/libraries/${firstLibraryId}`, ownerAuth, { isFavorite: false, members: [] })
    expect(updated.status).toBe(200)
    expect(await memberIds()).toEqual([guestId])

    const read = await request('GET', `/libraries/${firstLibraryId}`, ownerAuth)
    const list = await request('GET', '/libraries', ownerAuth)
    for (const library of [created.body.results, updated.body.results, read.body.results, ...list.body.results]) {
      expect(Object.keys(library.attributes).sort()).toEqual([
        'books', 'createdAt', 'description', 'isFavorite', 'name', 'shareRatings', 'tagIds', 'updatedAt', 'userId'
      ])
    }
  })
})
