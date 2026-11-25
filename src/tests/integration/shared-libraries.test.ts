import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ulid } from 'ulid'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import { DBUserBook } from '../../resources/user-books/user-books.interfaces.js'
import usersDao from '../../resources/users/users.dao.js'
import { DBUser, Role } from '../../resources/users/users.interfaces.js'
import robohashApi from '../../resources/users/robohash/robohash.api.js'
import usersService from '../../resources/users/users.service.js'

// The owner, user01, shares the first library: Rossiya, Lightning and Ashes and It Never Happened
const ownerId = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'
const ownerRossiyaId = '01J9W9P6M5S0VRKVSRX3Q9T3W7'
const ownerItNeverHappenedId = '01J9WA3W9TE5NG1H21PTK9VS4Q'

// The guest, user02, also has It Never Happened
const guestId = '01J9XDBGCX8QM0GW67T7QGKS41'
const guestLibraryId = '01J9XDD1NAFHP0159FYT245D8X'
const guestItNeverHappenedId = '01J9XDF6YJWYZ7EC2MDR8R58MW'

// Another guest, without libraries nor books
const otherGuestId = '01JZSHARED0000000000000002'
const adminId = '01J9BK7YX0D5NHHBN70Q4N7P69'

const rossiyaBookId = '01J9KKFS6CKTSVY0ETH9A7PHXW'
const lightningBookId = '01J9KKFTWAKVR1HGHCER50JJMQ'
const itNeverHappenedBookId = '01J9KKFQRP6H3F30CNT21G1DWT'
// The books of the first library, from the newest one to the oldest one
const firstLibraryBookIds = [itNeverHappenedBookId, lightningBookId, rossiyaBookId]

const OWNER_NOTES = 'private thoughts of the owner'
const GUEST_NOTES = 'private thoughts of the guest'

const ownerAuth = testUtils.buildAuthorizationHeader(makeJwt(ownerId, Role.Regular))
const guestAuth = testUtils.buildAuthorizationHeader(makeJwt(guestId, Role.Regular))
const otherGuestAuth = testUtils.buildAuthorizationHeader(makeJwt(otherGuestId, Role.Regular))
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

async function get (path: string, auth = guestAuth): Promise<{ status: number, body: any, text: string }> {
  return await request('GET', path, auth)
}

async function setShareRatings (libraryId: string, shareRatings: boolean): Promise<void> {
  const { status } = await request('PATCH', `/libraries/${libraryId}`, ownerAuth, { shareRatings })
  expect(status).toBe(200)
}

async function memberIds (libraryId: string): Promise<string[]> {
  const library = await librariesDao.findById(libraryId)
  return library?.members.map(member => member.userId) ?? []
}

function ids (body: any): string[] {
  return body.results.map((result: any) => result.id)
}

/** The attributes of a book in the books of a shared library */
async function getSharedBook (bookId: string, libraryId = firstLibraryId, auth = guestAuth): Promise<any> {
  const { status, body } = await get(`/shared-libraries/${libraryId}/books`, auth)
  expect(status).toBe(200)
  return body.results.find((result: any) => result.id === bookId).attributes
}

function newUser (id: string, email: string, name: string): DBUser {
  const now = new Date()
  return { _id: id, email, name, password: 'not-a-hash', avatar: 'base64', role: Role.Regular, createdAt: now, updatedAt: now }
}

function newGuestRossiya (data: Partial<DBUserBook>): DBUserBook {
  const now = new Date()
  return {
    _id: ulid(),
    libraries: [],
    userId: guestId,
    bookId: rossiyaBookId,
    bookTitle: 'Rossiya',
    bookAuthors: ['Alex Shishin'],
    bookCover: { source: null, value: null },
    bookIsbn13: '9780595385294',
    bookIsbn10: '059538529X',
    rating: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...data
  }
}

// Every test starts from the same data, with the first library shared with the guest
beforeEach(async () => {
  await mongo.clean()
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await usersDao.collection.insertOne(newUser(otherGuestId, 'guest@email.com', 'Other guest'))
  await userBooksDao.collection.updateOne({ _id: ownerRossiyaId }, { $set: { rating: 9, notes: OWNER_NOTES } })
  await userBooksDao.collection.updateOne({ _id: ownerItNeverHappenedId }, { $set: { rating: 4, notes: OWNER_NOTES } })
  await userBooksDao.collection.updateOne({ _id: guestItNeverHappenedId }, { $set: { rating: 7, notes: GUEST_NOTES } })
  await librariesDao.addMember(firstLibraryId, guestId)
})

afterAll(async () => {
  await mongo.clean()
})

describe('access to the shared libraries', () => {
  const routes: Array<[string, string]> = [
    ['GET', '/shared-libraries'],
    ['GET', `/shared-libraries/${firstLibraryId}`],
    ['GET', `/shared-libraries/${firstLibraryId}/books`],
    ['DELETE', `/shared-libraries/${firstLibraryId}`]
  ]

  it.each(routes)('%s %s - should fail without token', async (method, path) => {
    const { status, body } = await request(method, path, null)

    expect(status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.TokenNotProvidedError)
  })

  it.each(routes)('%s %s - should be forbidden to an admin', async (method, path) => {
    const { status, body } = await request(method, path, adminAuth)

    expect(status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.PermissionError)
    expect(await memberIds(firstLibraryId)).toEqual([guestId])
  })

  // The same answer for a library that does not exist and for one without access, its owner included
  it.each(routes.slice(1))('%s %s - should not exist for who is not a member', async (method, path) => {
    const notMember = await request(method, path, otherGuestAuth)
    const owner = await request(method, path, ownerAuth)
    const unknown = await request(method, path.replace(firstLibraryId, ulid()), guestAuth)

    expect(unknown.status).toBe(404)
    expect(unknown.body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
    expect(unknown.body.message).toBe('library not found')
    expect(notMember).toEqual(unknown)
    expect(owner).toEqual(unknown)
    expect(await memberIds(firstLibraryId)).toEqual([guestId])
  })

  it('a member should not get any other permission on the library', async () => {
    const book = { title: 'Rossiya', isbn13: '9780595385294', isbn10: null }
    const library = `/libraries/${firstLibraryId}`
    const importForm = new FormData()
    importForm.set('file', new Blob(['isbn\n9780595385294'], { type: 'text/csv' }), 'books.csv')
    importForm.set('libraryId', firstLibraryId)

    const responses = await Promise.all([
      request('GET', library, guestAuth),
      request('PATCH', library, guestAuth, { name: 'renamed by a guest' }),
      request('DELETE', library, guestAuth),
      request('POST', `${library}/books`, guestAuth, book),
      request('DELETE', `${library}/books/${ownerRossiyaId}`, guestAuth),
      request('GET', `${library}/members`, guestAuth),
      request('POST', `${library}/members`, guestAuth, { email: 'guest@email.com' }),
      request('DELETE', `${library}/members/${guestId}`, guestAuth),
      request('GET', `/user-books?libraryId=${firstLibraryId}`, guestAuth),
      request('GET', `/user-books?userId=${ownerId}`, guestAuth),
      request('GET', `/user-books/download?libraryId=${firstLibraryId}`, guestAuth),
      request('GET', `/imports?libraryId=${firstLibraryId}`, guestAuth),
      fetch(new URL('/imports', testUtils.TESTS_BASE_URL), {
        method: 'POST',
        headers: { Authorization: guestAuth },
        body: importForm
      })
    ])

    expect(responses.map(response => response.status)).toEqual(responses.map(() => 403))
    expect(await librariesDao.collection.findOne({ _id: firstLibraryId, name: 'sample first library' })).not.toBeNull()
    expect(await userBooksDao.count({ userId: ownerId, librariesIds: [firstLibraryId] })).toBe(3)
  })

  it('a member should not read nor change the user books of the owner', async () => {
    const read = await request('GET', `/user-books/${ownerRossiyaId}`, guestAuth)
    const changed = await request('PATCH', `/user-books/${ownerRossiyaId}`, guestAuth, { rating: 1, notes: null })

    expect(read.status).toBe(404)
    expect(changed.status).toBe(404)
    expect((await userBooksDao.findById(ownerRossiyaId))?.rating).toBe(9)
  })
})

describe('GET /shared-libraries', () => {
  it('should return exactly the public data of the libraries', async () => {
    const { status, body } = await get('/shared-libraries')

    expect(status).toBe(200)
    expect(body).toEqual({
      results: [{
        type: 'shared-libraries',
        id: firstLibraryId,
        attributes: {
          name: 'sample first library',
          description: 'description of the sample first library',
          ownerName: 'user01',
          booksCount: 3,
          shareRatings: false,
          sharedAt: expect.any(String)
        }
      }],
      paginationInfo: { skip: 0, limit: 10, total: 1 }
    })
  })

  it('should list the most recently shared first, also from different owners, and paginate them', async () => {
    // Not in the order of the libraries, and along with another member
    const sharedAt = { [secondLibraryId]: 1000, [guestLibraryId]: 3000, [firstLibraryId]: 2000 }
    for (const [libraryId, time] of Object.entries(sharedAt)) {
      const members = [{ userId: ulid(), createdAt: new Date(9000) }, { userId: otherGuestId, createdAt: new Date(time) }]
      await librariesDao.collection.updateOne({ _id: libraryId }, { $set: { members } })
    }

    const { body } = await get('/shared-libraries', otherGuestAuth)
    expect(ids(body)).toEqual([guestLibraryId, firstLibraryId, secondLibraryId])
    expect(body.results.map((result: any) => result.attributes.sharedAt)).toEqual([
      new Date(3000).toISOString(), new Date(2000).toISOString(), new Date(1000).toISOString()
    ])
    const ownerNames = new Map(body.results.map((result: any) => [result.id, result.attributes.ownerName]))
    expect(ownerNames).toEqual(new Map([[firstLibraryId, 'user01'], [secondLibraryId, 'user01'], [guestLibraryId, 'user02']]))

    const pages = await Promise.all([0, 1, 2].map(async skip => await get(`/shared-libraries?skip=${skip}&limit=1`, otherGuestAuth)))
    expect(pages.flatMap(page => ids(page.body))).toEqual(ids(body))
    expect(pages.map(page => page.body.paginationInfo.total)).toEqual([3, 3, 3])
  })

  it('should return an empty list when nothing is shared', async () => {
    const { status, body } = await get('/shared-libraries', otherGuestAuth)

    expect(status).toBe(200)
    expect(body.results).toEqual([])
    expect(body.paginationInfo).toEqual({ skip: 0, limit: 10, total: 0 })
  })

  it('should not list to the owner the libraries they share', async () => {
    const { body } = await get('/shared-libraries', ownerAuth)

    expect(body.results).toEqual([])
  })

  it('should fail with an invalid pagination', async () => {
    const { status, body } = await get('/shared-libraries?limit=101')

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })
})

describe('GET /shared-libraries?search=', () => {
  // Shared with the other guest by two owners, the most recently shared first
  const sharedIds = [guestLibraryId, secondLibraryId, firstLibraryId]

  async function search (text: string, query = ''): Promise<{ ids: string[], total: number }> {
    const { status, body } = await get(`/shared-libraries?search=${encodeURIComponent(text)}${query}`, otherGuestAuth)
    expect(status).toBe(200)
    return { ids: ids(body), total: body.paginationInfo.total }
  }

  beforeEach(async () => {
    await usersDao.collection.updateOne({ _id: ownerId }, { $set: { name: 'Ana Bright' } })
    await usersDao.collection.updateOne({ _id: guestId }, { $set: { name: 'Luis' } })

    const libraries = [
      { _id: firstLibraryId, name: 'Crime novels', description: 'Detectives', sharedAt: 1000 },
      { _id: secondLibraryId, name: 'Poetry', description: null, sharedAt: 2000 },
      { _id: guestLibraryId, name: 'Travels', description: 'Novels and diaries (2020)', sharedAt: 3000 }
    ]
    for (const { _id, name, description, sharedAt } of libraries) {
      const members = [{ userId: otherGuestId, createdAt: new Date(sharedAt) }]
      await librariesDao.collection.updateOne({ _id }, { $set: { name, description, members } })
    }
  })

  it.each([
    ['the name', 'poet', [secondLibraryId]],
    ['the description', 'detectives', [firstLibraryId]],
    ['the name or the description', 'NOVELS', [guestLibraryId, firstLibraryId]],
    ['the name of the owner', 'bright', [secondLibraryId, firstLibraryId]],
    ['a part of a word', 'uis', [guestLibraryId]],
    ['text with spaces around', '  poetry  ', [secondLibraryId]],
    ['special characters, literally', '(2020)', [guestLibraryId]],
    ['a pattern, literally', '.*', []],
    ['nothing', 'unknown', []]
  ])('should match %s', async (_field, text, expected) => {
    expect(await search(text)).toEqual({ ids: expected, total: expected.length })
  })

  it('should not search in the email of the owner, nor in their role or id', async () => {
    for (const text of ['user01', '@email.com', 'regular', ownerId]) {
      expect(await search(text)).toEqual({ ids: [], total: 0 })
    }
  })

  it('should not find libraries that are not shared with the user', async () => {
    // Of the same owner, and matching by its own name and by the name of the owner
    await librariesDao.create({ name: 'Romance novels' }, ownerId)
    expect((await search('novels')).ids).toEqual([guestLibraryId, firstLibraryId])
    expect((await search('ana')).ids).toEqual([secondLibraryId, firstLibraryId])

    await librariesDao.removeMember(firstLibraryId, otherGuestId)
    expect(await search('crime')).toEqual({ ids: [], total: 0 })
    expect((await search('ana')).ids).toEqual([secondLibraryId])
  })

  it('should find the libraries by the current name of their owner', async () => {
    await usersDao.collection.updateOne({ _id: ownerId }, { $set: { name: 'Marta' } })

    expect((await search('bright')).ids).toEqual([])
    expect((await search('marta')).ids).toEqual([secondLibraryId, firstLibraryId])
  })

  it('should paginate the matching libraries', async () => {
    expect(await search('novels', '&limit=1')).toEqual({ ids: [guestLibraryId], total: 2 })
    expect(await search('novels', '&limit=1&skip=1')).toEqual({ ids: [firstLibraryId], total: 2 })
  })

  it.each(['', '   '])('should ignore an empty search (%j)', async (text) => {
    expect(await search(text)).toEqual({ ids: sharedIds, total: 3 })
  })

  it.each([
    ['too long', `search=${'a'.repeat(101)}`],
    ['repeated', 'search=a&search=b']
  ])('should fail with a search %s', async (_reason, query) => {
    const { status, body } = await get(`/shared-libraries?${query}`, otherGuestAuth)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })
})

describe('GET /shared-libraries/:id', () => {
  it('should return the same data as the list', async () => {
    const { status, body } = await get(`/shared-libraries/${firstLibraryId}`)
    const { body: list } = await get('/shared-libraries')

    expect(status).toBe(200)
    expect(body).toEqual({ results: list.results[0] })
  })

  it('should tell whether the ratings are shared', async () => {
    await setShareRatings(firstLibraryId, true)

    const { body } = await get(`/shared-libraries/${firstLibraryId}`)
    const { body: list } = await get('/shared-libraries')

    expect(body.results.attributes.shareRatings).toBe(true)
    expect(list.results[0].attributes.shareRatings).toBe(true)
  })
})

describe('GET /shared-libraries/:id/books', () => {
  it('should return exactly the public data of the books, identified by the book of the catalog', async () => {
    await setShareRatings(firstLibraryId, true)

    const { status, body } = await get(`/shared-libraries/${firstLibraryId}/books`)

    expect(status).toBe(200)
    expect(body).toEqual({
      results: [
        {
          type: 'shared-library-books',
          id: itNeverHappenedBookId,
          attributes: {
            bookTitle: 'It Never Happened',
            bookAuthors: [],
            bookCoverUrl: null,
            bookIsbn13: '9781732539419',
            bookIsbn10: '1732539413',
            ownerRating: 4,
            own: { rating: 7, notes: GUEST_NOTES }
          }
        },
        {
          type: 'shared-library-books',
          id: lightningBookId,
          attributes: {
            bookTitle: 'Lightning and Ashes',
            bookAuthors: ['John Guzlowski'],
            bookCoverUrl: null,
            bookIsbn13: '9780974326450',
            bookIsbn10: '0974326453',
            ownerRating: null,
            own: null
          }
        },
        {
          type: 'shared-library-books',
          id: rossiyaBookId,
          attributes: {
            bookTitle: 'Rossiya',
            bookAuthors: ['Alex Shishin'],
            bookCoverUrl: null,
            bookIsbn13: '9780595385294',
            bookIsbn10: '059538529X',
            ownerRating: 9,
            own: null
          }
        }
      ],
      paginationInfo: { skip: 0, limit: 10, total: 3 }
    })
  })

  it('should paginate the books without repeating them', async () => {
    const pages = await Promise.all([0, 2].map(async skip => await get(`/shared-libraries/${firstLibraryId}/books?skip=${skip}&limit=2`)))

    expect(pages.map(page => ids(page.body))).toEqual([firstLibraryBookIds.slice(0, 2), firstLibraryBookIds.slice(2)])
    expect(pages.map(page => page.body.paginationInfo.total)).toEqual([3, 3])
  })

  it.each([
    ['ossi', [rossiyaBookId]],
    ['GUZLOW', [lightningBookId]],
    ['978-0-595-38529-4', [rossiyaBookId]],
    ['059538529X', [rossiyaBookId]],
    ['.*', []],
    // A book of the guest that is not in the shared library
    ['secondhand', []]
  ])('should search the books by %s', async (search, expected) => {
    const { status, body } = await get(`/shared-libraries/${firstLibraryId}/books?search=${encodeURIComponent(search)}`)

    expect(status).toBe(200)
    expect(ids(body)).toEqual(expected)
    expect(body.paginationInfo.total).toBe(expected.length)
  })

  it('should return an empty list for a library without books', async () => {
    await librariesDao.addMember(secondLibraryId, guestId)

    const { status, body } = await get(`/shared-libraries/${secondLibraryId}/books`)

    expect(status).toBe(200)
    expect(body.results).toEqual([])
    expect(body.paginationInfo.total).toBe(0)
  })

  it('should fail with a search longer than 100 characters', async () => {
    const { status, body } = await get(`/shared-libraries/${firstLibraryId}/books?search=${'a'.repeat(101)}`)

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['search'])
  })
})

describe('privacy of the owner', () => {
  it('should not show any rating of the owner unless they are shared', async () => {
    const { body } = await get(`/shared-libraries/${firstLibraryId}/books`)

    expect(ids(body)).toEqual(firstLibraryBookIds)
    expect(body.results.map((result: any) => result.attributes.ownerRating)).toEqual([null, null, null])
  })

  it('should hide the ratings again when the owner stops sharing them', async () => {
    await setShareRatings(firstLibraryId, true)
    expect((await getSharedBook(rossiyaBookId)).ownerRating).toBe(9)

    await setShareRatings(firstLibraryId, false)
    expect((await getSharedBook(rossiyaBookId)).ownerRating).toBeNull()
  })

  it('should not even read the private data from the database', async () => {
    const page = { skip: 0, limit: 10 }
    const bookFields = ['bookAuthors', 'bookCover', 'bookId', 'bookIsbn10', 'bookIsbn13', 'bookTitle']

    const withoutRatings = await userBooksDao.listShared(ownerId, firstLibraryId, undefined, false, page)
    const withRatings = await userBooksDao.listShared(ownerId, firstLibraryId, undefined, true, page)

    expect(withoutRatings.map(book => Object.keys(book).sort())).toEqual([bookFields, bookFields, bookFields])
    expect(withRatings.map(book => Object.keys(book).sort())).toEqual(withRatings.map(() => [...bookFields, 'rating']))
  })

  it.each([true, false])('should never show the notes of the owner, with shareRatings %s', async (shareRatings) => {
    await setShareRatings(firstLibraryId, shareRatings)
    await librariesDao.addMember(firstLibraryId, otherGuestId)

    const responses = await Promise.all([
      get('/shared-libraries'),
      get(`/shared-libraries/${firstLibraryId}`),
      get(`/shared-libraries/${firstLibraryId}/books`)
    ])

    for (const { status, text } of responses) {
      expect(status).toBe(200)
      expect(text).not.toContain(OWNER_NOTES)
      expect(text).not.toContain(ownerId)
      expect(text).not.toContain('user01@email.com')
      // Nor the other members
      expect(text).not.toContain(otherGuestId)
    }
  })

  it('should not find the books by the notes of the owner', async () => {
    const { body } = await get(`/shared-libraries/${firstLibraryId}/books?search=thoughts`)

    expect(body.results).toEqual([])
    expect(body.paginationInfo.total).toBe(0)
  })

  it('should share the rating of a book only in the library that shares them', async () => {
    await userBooksDao.collection.updateOne({ _id: ownerRossiyaId }, { $push: { libraries: secondLibraryId } })
    await librariesDao.collection.updateOne({ _id: secondLibraryId }, { $push: { books: ownerRossiyaId } })
    await librariesDao.addMember(secondLibraryId, guestId)
    await librariesDao.addMember(firstLibraryId, otherGuestId)
    await setShareRatings(secondLibraryId, true)

    expect((await getSharedBook(rossiyaBookId, firstLibraryId)).ownerRating).toBeNull()
    expect((await getSharedBook(rossiyaBookId, secondLibraryId)).ownerRating).toBe(9)
    // Who only sees the first library does not see the rating
    expect((await getSharedBook(rossiyaBookId, firstLibraryId, otherGuestAuth)).ownerRating).toBeNull()
  })
})

describe('own opinion of the member', () => {
  it('should be shown even if the owner does not share the ratings', async () => {
    const book = await getSharedBook(itNeverHappenedBookId)

    expect(book.ownerRating).toBeNull()
    expect(book.own).toEqual({ rating: 7, notes: GUEST_NOTES })
  })

  it('should be empty, and not null, for an own book without rating', async () => {
    await userBooksDao.collection.updateOne({ _id: guestItNeverHappenedId }, { $set: { rating: null, notes: null } })

    expect((await getSharedBook(itNeverHappenedBookId)).own).toEqual({ rating: null, notes: null })
  })

  it('should be null for a book that is not in any own library', async () => {
    expect((await getSharedBook(rossiyaBookId)).own).toBeNull()
  })

  it('should be hidden, but kept, when the book is removed from every own library', async () => {
    const guestRossiya = newGuestRossiya({ rating: 2, notes: GUEST_NOTES })
    await userBooksDao.collection.insertOne(guestRossiya)
    expect((await getSharedBook(rossiyaBookId)).own).toBeNull()

    await userBooksDao.collection.updateOne({ _id: guestRossiya._id }, { $set: { libraries: [guestLibraryId] } })
    expect((await getSharedBook(rossiyaBookId)).own).toEqual({ rating: 2, notes: GUEST_NOTES })
  })

  it('should not be shown to the other guests nor to the owner', async () => {
    await librariesDao.addMember(firstLibraryId, otherGuestId)

    const otherGuest = await get(`/shared-libraries/${firstLibraryId}/books`, otherGuestAuth)
    const owner = await get(`/user-books?libraryId=${firstLibraryId}`, ownerAuth)

    expect(otherGuest.body.results.map((result: any) => result.attributes.own)).toEqual([null, null, null])
    expect(otherGuest.text).not.toContain(GUEST_NOTES)
    expect(owner.status).toBe(200)
    expect(owner.text).not.toContain(GUEST_NOTES)
  })

  it('should be available after adding the book of a shared library to an own one', async () => {
    const added = await request('POST', `/libraries/${guestLibraryId}/books`, guestAuth, {
      title: 'Rossiya',
      isbn13: '9780595385294',
      isbn10: null,
      authors: ['Alex Shishin']
    })

    expect(added.status).toBe(201)
    expect((await getSharedBook(rossiyaBookId)).own).toEqual({ rating: null, notes: null })
  })
})

describe('own books of the member', () => {
  it('should not change when a library is shared with them', async () => {
    const shared = await get('/user-books')
    await librariesDao.removeMember(firstLibraryId, guestId)
    const notShared = await get('/user-books')

    expect(shared.body).toEqual(notShared.body)
    expect(shared.body.paginationInfo.total).toBe(2)
    expect((await get('/libraries')).body.paginationInfo.total).toBe(1)
  })
})

describe('name changes', () => {
  // On the service and without RoboHash: the HTTP server runs in another process and would call it
  async function rename (userId: string, name: string): Promise<void> {
    const getImage = vi.spyOn(robohashApi, 'getImage').mockResolvedValue(new ArrayBuffer(0))
    try {
      await usersService.updateUser(userId, { name })
    } finally {
      getImage.mockRestore()
    }
  }

  it('should show the new name of the owner to the members', async () => {
    expect((await get(`/shared-libraries/${firstLibraryId}`)).body.results.attributes.ownerName).toBe('user01')

    await rename(ownerId, 'Renamed owner')

    const { body } = await get(`/shared-libraries/${firstLibraryId}`)
    const { body: list } = await get('/shared-libraries')
    expect(body.results.attributes.ownerName).toBe('Renamed owner')
    expect(list.results[0].attributes.ownerName).toBe('Renamed owner')
  })

  it('should show the new name of a member to the owner, and keep their access', async () => {
    const before = await get(`/libraries/${firstLibraryId}/members`, ownerAuth)
    expect(before.body.results[0].attributes.name).toBe('user02')

    await rename(guestId, 'Renamed guest')

    const { body } = await get(`/libraries/${firstLibraryId}/members`, ownerAuth)
    expect(body.results).toEqual([{
      ...before.body.results[0],
      attributes: { ...before.body.results[0].attributes, name: 'Renamed guest' }
    }])
    expect((await get(`/shared-libraries/${firstLibraryId}`)).status).toBe(200)
  })
})

describe('end of the access', () => {
  async function expectNoAccess (): Promise<void> {
    expect((await get(`/shared-libraries/${firstLibraryId}`)).status).toBe(404)
    expect((await get(`/shared-libraries/${firstLibraryId}/books`)).status).toBe(404)
    expect((await get('/shared-libraries')).body.paginationInfo.total).toBe(0)
  }

  it('should end when the owner removes the member, with the same token', async () => {
    expect((await get(`/shared-libraries/${firstLibraryId}`)).status).toBe(200)

    const { status } = await request('DELETE', `/libraries/${firstLibraryId}/members/${guestId}`, ownerAuth)

    expect(status).toBe(204)
    await expectNoAccess()
  })

  it('should end when the member leaves, and only for them', async () => {
    await librariesDao.addMember(firstLibraryId, otherGuestId)

    const { status } = await request('DELETE', `/shared-libraries/${firstLibraryId}`, guestAuth)

    expect(status).toBe(204)
    await expectNoAccess()
    expect((await get(`/shared-libraries/${firstLibraryId}`, otherGuestAuth)).status).toBe(200)
    // The library and the books of the owner are still there
    expect((await get(`/user-books?libraryId=${firstLibraryId}`, ownerAuth)).body.paginationInfo.total).toBe(3)

    const again = await request('DELETE', `/shared-libraries/${firstLibraryId}`, guestAuth)
    expect(again.status).toBe(404)
  })

  it('should end when the library is deleted', async () => {
    const { status } = await request('DELETE', `/libraries/${firstLibraryId}`, ownerAuth)

    expect(status).toBe(204)
    await expectNoAccess()
  })

  it('should be recovered when the owner invites them again', async () => {
    await request('DELETE', `/shared-libraries/${firstLibraryId}`, guestAuth)

    const { status } = await request('POST', `/libraries/${firstLibraryId}/members`, ownerAuth, { email: 'user02@email.com' })

    expect(status).toBe(201)
    expect((await get(`/shared-libraries/${firstLibraryId}`)).status).toBe(200)
  })
})
