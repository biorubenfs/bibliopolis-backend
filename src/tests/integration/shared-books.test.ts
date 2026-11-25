import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ulid } from 'ulid'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import usersDao from '../../resources/users/users.dao.js'
import { Role } from '../../resources/users/users.interfaces.js'

// Ana, user01, has Rossiya, Lightning and Ashes and It Never Happened in the first library
const anaId = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'
const thirdLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WFA'
const anaRossiyaId = '01J9W9P6M5S0VRKVSRX3Q9T3W7'
const anaItNeverHappenedId = '01J9WA3W9TE5NG1H21PTK9VS4Q'

// Luis, user02, has Secondhand Time and, like Ana, It Never Happened
const luisId = '01J9XDBGCX8QM0GW67T7QGKS41'
const luisLibraryId = '01J9XDD1NAFHP0159FYT245D8X'
const luisItNeverHappenedId = '01J9XDF6YJWYZ7EC2MDR8R58MW'

// Everything is shared with the reader
const readerId = '01JZSHARED0000000000000003'
const adminId = '01J9BK7YX0D5NHHBN70Q4N7P69'

const rossiyaId = '01J9KKFS6CKTSVY0ETH9A7PHXW'
const lightningId = '01J9KKFTWAKVR1HGHCER50JJMQ'
const itNeverHappenedId = '01J9KKFQRP6H3F30CNT21G1DWT'
const secondhandId = '01J9KKG5ZN2MMPHV4M3E5JR98V'
// From the one that any of the owners added last
const allBookIds = [itNeverHappenedId, secondhandId, lightningId, rossiyaId]

const readerAuth = testUtils.buildAuthorizationHeader(makeJwt(readerId, Role.Regular))
const anaAuth = testUtils.buildAuthorizationHeader(makeJwt(anaId, Role.Regular))
const adminAuth = testUtils.buildAuthorizationHeader(makeJwt(adminId, Role.Admin))

async function get (path: string, auth: string | null = readerAuth): Promise<{ status: number, body: any, text: string }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), {
    headers: auth != null ? { Authorization: auth } : {}
  })
  const text = await response.text()
  return { status: response.status, body: JSON.parse(text), text }
}

async function list (query = '', auth = readerAuth): Promise<{ ids: string[], total: number, body: any, text: string }> {
  const { status, body, text } = await get(`/shared-books${query}`, auth)
  expect(status).toBe(200)
  return { ids: body.results.map((result: any) => result.id), total: body.paginationInfo.total, body, text }
}

/** The libraries of a book in the list */
async function listedLibraries (bookId: string): Promise<any[]> {
  const { body } = await list()
  return body.results.find((result: any) => result.id === bookId).attributes.libraries
}

async function people (bookId: string): Promise<any[]> {
  const { status, body } = await get(`/shared-books/${bookId}`)
  expect(status).toBe(200)
  return body.results.attributes.people
}

async function shareRatings (...libraryIds: string[]): Promise<void> {
  await librariesDao.collection.updateMany({ _id: { $in: libraryIds } }, { $set: { shareRatings: true } })
}

async function addToLibrary (userBookId: string, libraryId: string): Promise<void> {
  await userBooksDao.collection.updateOne({ _id: userBookId }, { $addToSet: { libraries: libraryId } })
}

/** A copy of It Never Happened */
async function insertCopy (userId: string, libraries: string[], rating: number | null = null, notes: string | null = null): Promise<void> {
  const copy = await userBooksDao.collection.findOne({ _id: anaItNeverHappenedId })
  if (copy == null) throw new Error('missing fixture')
  await userBooksDao.collection.insertOne({ ...copy, _id: ulid(), userId, libraries, rating, notes })
}

// Every test starts with the first library of Ana and the one of Luis shared with the reader
beforeEach(async () => {
  await mongo.clean()
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  const now = new Date()
  await usersDao.collection.insertOne({
    _id: readerId, email: 'reader@email.com', name: 'Reader', password: 'not-a-hash', avatar: 'base64', role: Role.Regular, createdAt: now, updatedAt: now
  })
  await usersDao.collection.updateOne({ _id: anaId }, { $set: { name: 'Ana' } })
  await usersDao.collection.updateOne({ _id: luisId }, { $set: { name: 'Luis' } })
  await librariesDao.collection.updateOne({ _id: firstLibraryId }, { $set: { name: 'Travels' } })
  await librariesDao.collection.updateOne({ _id: secondLibraryId }, { $set: { name: 'Novels' } })
  await librariesDao.collection.updateOne({ _id: thirdLibraryId }, { $set: { name: 'Private' } })
  await librariesDao.collection.updateOne({ _id: luisLibraryId }, { $set: { name: 'Classics' } })
  await userBooksDao.collection.updateOne({ _id: anaItNeverHappenedId }, { $set: { rating: 9, notes: 'notes of Ana' } })
  await userBooksDao.collection.updateOne({ _id: luisItNeverHappenedId }, { $set: { rating: 4, notes: 'notes of Luis' } })
  await librariesDao.addMember(firstLibraryId, readerId)
  await librariesDao.addMember(luisLibraryId, readerId)
})

afterAll(async () => {
  await mongo.clean()
})

describe('access to the shared books', () => {
  it.each(['/shared-books', `/shared-books/${rossiyaId}`])('GET %s - should fail without token or as an admin', async (path) => {
    const withoutToken = await get(path, null)
    const admin = await get(path, adminAuth)

    expect(withoutToken.status).toBe(401)
    expect(withoutToken.body.errorCode).toBe(ApiRestErrorCode.TokenNotProvidedError)
    expect(admin.status).toBe(403)
    expect(admin.body.errorCode).toBe(ApiRestErrorCode.PermissionError)
  })

  it('should not include the books of the own libraries, also of the ones shared with others', async () => {
    expect((await list('', anaAuth)).ids).toEqual([])
    expect((await get(`/shared-books/${rossiyaId}`, anaAuth)).status).toBe(404)
  })

  it.each([
    ['the owner removes the member', async () => { await librariesDao.removeMember(firstLibraryId, readerId) }],
    ['the library is deleted', async () => {
      await librariesDao.delete(firstLibraryId)
      await userBooksDao.deleteAll(firstLibraryId, anaId)
    }],
    ['the book is removed from the library', async () => {
      await userBooksDao.collection.updateMany({ userId: anaId }, { $set: { libraries: [thirdLibraryId] } })
    }]
  ])('should end when %s', async (_reason, endAccess) => {
    expect((await get(`/shared-books/${rossiyaId}`)).status).toBe(200)

    await endAccess()

    expect((await list()).ids).toEqual([itNeverHappenedId, secondhandId])
    expect((await people(itNeverHappenedId)).map(person => person.ownerName)).toEqual(['Luis'])
    const { status, body } = await get(`/shared-books/${rossiyaId}`)
    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
    expect(body.message).toBe('shared book not found')
  })

  it('should give the same answer for an unknown book', async () => {
    const unknown = await get(`/shared-books/${ulid()}`)
    const notShared = await get(`/shared-books/${rossiyaId}`, anaAuth)

    expect(unknown).toEqual(notShared)
  })
})

describe('GET /shared-books', () => {
  it('should return exactly the public data of each book, once, with the libraries of everyone who shares it', async () => {
    await shareRatings(firstLibraryId, luisLibraryId)

    const { body, ids, total } = await list()

    expect(ids).toEqual(allBookIds)
    expect(total).toBe(4)
    expect(body.results[0]).toEqual({
      type: 'shared-books',
      id: itNeverHappenedId,
      attributes: {
        bookTitle: 'It Never Happened',
        bookAuthors: [],
        bookCoverUrl: null,
        bookIsbn13: '9781732539419',
        bookIsbn10: '1732539413',
        own: null,
        libraries: [
          { id: luisLibraryId, name: 'Classics', ownerName: 'Luis' },
          { id: firstLibraryId, name: 'Travels', ownerName: 'Ana' }
        ]
      }
    })
    expect(body.paginationInfo).toEqual({ skip: 0, limit: 10, total: 4 })
  })

  it('should list several libraries of the same owner, only the shared ones', async () => {
    await addToLibrary(anaRossiyaId, secondLibraryId)
    await addToLibrary(anaRossiyaId, thirdLibraryId)
    await librariesDao.addMember(secondLibraryId, readerId)
    // Shared, but with someone else
    await librariesDao.addMember(thirdLibraryId, luisId)

    const { ids, total, text } = await list()

    expect(ids).toEqual(allBookIds)
    expect(total).toBe(4)
    expect(await listedLibraries(rossiyaId)).toEqual([
      { id: secondLibraryId, name: 'Novels', ownerName: 'Ana' },
      { id: firstLibraryId, name: 'Travels', ownerName: 'Ana' }
    ])
    expect(text).not.toContain(thirdLibraryId)
    expect(text).not.toContain('Private')
  })

  it('should never return the opinions nor the ids of the owners', async () => {
    await shareRatings(firstLibraryId, luisLibraryId)

    const { text } = await list()

    for (const hidden of ['notes of Ana', 'notes of Luis', 'ating":9', 'ating":4', anaId, luisId, '@email.com']) {
      expect(text).not.toContain(hidden)
    }
  })

  it('should paginate the books without repeating nor skipping any', async () => {
    const pages = await Promise.all([0, 1, 2, 3, 4].map(async skip => await list(`?skip=${skip}&limit=1`)))

    expect(pages.flatMap(page => page.ids)).toEqual(allBookIds)
    expect(pages.map(page => page.total)).toEqual([4, 4, 4, 4, 4])
  })

  it('should return an empty list when nothing is shared, or the shared libraries have no books', async () => {
    await librariesDao.removeMember(firstLibraryId, readerId)
    await librariesDao.removeMember(luisLibraryId, readerId)
    expect((await list()).body).toEqual({ results: [], paginationInfo: { skip: 0, limit: 10, total: 0 } })

    await librariesDao.addMember(secondLibraryId, readerId)
    expect((await list()).body).toEqual({ results: [], paginationInfo: { skip: 0, limit: 10, total: 0 } })
  })

  it.each([
    ['part of the title', 'ossi', [rossiyaId]],
    ['an author', 'GUZLOW', [lightningId]],
    ['an ISBN-13 with hyphens', '978-0-595-38529-4', [rossiyaId]],
    ['an ISBN-10', '059538529X', [rossiyaId]],
    ['a book of two owners, once', 'never', [itNeverHappenedId]],
    ['several books', 'ha', [itNeverHappenedId, secondhandId]],
    ['special characters, literally', '.*', []],
    ['a broken pattern, literally', '(', []],
    ['the notes', 'notes of', []],
    ['nothing, when it is empty', '  ', allBookIds]
  ])('should search by %s', async (_reason, search, expected) => {
    const { ids, total } = await list(`?search=${encodeURIComponent(search)}`)

    expect(ids).toEqual(expected)
    expect(total).toBe(expected.length)
  })

  it('should not find the books that are only in libraries without access', async () => {
    await userBooksDao.collection.updateOne({ _id: anaRossiyaId }, { $set: { libraries: [thirdLibraryId] } })

    expect(await list('?search=rossiya')).toMatchObject({ ids: [], total: 0 })
  })

  it.each(['limit=101', 'skip=-1', `search=${'a'.repeat(101)}`, 'search=a&search=b'])('should fail with %s', async (query) => {
    const { status, body } = await get(`/shared-books?${query}`)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })
})

describe('GET /shared-books/:id', () => {
  it('should return exactly the public data of the book, with the people who share it', async () => {
    await shareRatings(firstLibraryId, luisLibraryId)

    const { status, body } = await get(`/shared-books/${itNeverHappenedId}`)

    expect(status).toBe(200)
    expect(body).toEqual({
      results: {
        type: 'shared-books',
        id: itNeverHappenedId,
        attributes: {
          bookTitle: 'It Never Happened',
          bookAuthors: [],
          bookCoverUrl: null,
          bookIsbn13: '9781732539419',
          bookIsbn10: '1732539413',
          own: null,
          people: [
            { ownerName: 'Ana', sharesRatings: true, rating: 9, libraries: [{ id: firstLibraryId, name: 'Travels' }] },
            { ownerName: 'Luis', sharesRatings: true, rating: 4, libraries: [{ id: luisLibraryId, name: 'Classics' }] }
          ]
        }
      }
    })
  })

  it('should return the ratings of more than two people, also with the same name', async () => {
    const otherAnaId = ulid()
    const now = new Date()
    await usersDao.collection.insertOne({
      _id: otherAnaId, email: 'ana2@email.com', name: 'Ana', password: 'not-a-hash', avatar: '', role: Role.Regular, createdAt: now, updatedAt: now
    })
    const library = await librariesDao.create({ name: 'Others' }, otherAnaId)
    await librariesDao.addMember(library.id, readerId)
    await insertCopy(otherAnaId, [library.id], 1)
    await shareRatings(firstLibraryId, luisLibraryId, library.id)

    expect((await people(itNeverHappenedId)).map(({ ownerName, rating }) => [ownerName, rating]))
      .toEqual([['Ana', 9], ['Ana', 1], ['Luis', 4]])
  })

  it('should return each person once, with all the libraries they share', async () => {
    await addToLibrary(anaItNeverHappenedId, secondLibraryId)
    await addToLibrary(anaItNeverHappenedId, thirdLibraryId)
    await librariesDao.addMember(secondLibraryId, readerId)

    const [ana] = await people(itNeverHappenedId)

    expect(ana.libraries).toEqual([{ id: secondLibraryId, name: 'Novels' }, { id: firstLibraryId, name: 'Travels' }])
  })

  it('should tell a missing rating from a hidden one', async () => {
    await shareRatings(firstLibraryId)
    await userBooksDao.collection.updateOne({ _id: anaItNeverHappenedId }, { $set: { rating: null } })

    const [ana, luis] = await people(itNeverHappenedId)

    expect(ana).toMatchObject({ sharesRatings: true, rating: null })
    expect(luis).toMatchObject({ sharesRatings: false, rating: null })
  })

  it('should show the rating if any of the libraries with the book shares it', async () => {
    await addToLibrary(anaItNeverHappenedId, secondLibraryId)
    await librariesDao.addMember(secondLibraryId, readerId)
    await shareRatings(secondLibraryId)

    expect((await people(itNeverHappenedId))[0]).toMatchObject({ sharesRatings: true, rating: 9 })
  })

  it('should hide the rating if only other libraries share it', async () => {
    // Shared with the reader, but without the book
    await librariesDao.addMember(secondLibraryId, readerId)
    // With the book, but not shared with the reader
    await addToLibrary(anaItNeverHappenedId, thirdLibraryId)
    await shareRatings(secondLibraryId, thirdLibraryId, luisLibraryId)

    const [ana, luis] = await people(itNeverHappenedId)

    expect(ana).toEqual({ ownerName: 'Ana', sharesRatings: false, rating: null, libraries: [{ id: firstLibraryId, name: 'Travels' }] })
    expect(luis).toMatchObject({ sharesRatings: true, rating: 4 })
  })

  it('should not even read the hidden ratings, the notes nor the libraries without access', async () => {
    await shareRatings(luisLibraryId)
    await addToLibrary(anaItNeverHappenedId, thirdLibraryId)
    const libraries = await librariesDao.findAccessible(readerId)

    const copies = await userBooksDao.findSharedCopies([itNeverHappenedId], libraries)
    const rated = await userBooksDao.findSharedCopiesWithRatings(itNeverHappenedId, libraries)

    expect(copies).toHaveLength(2)
    for (const copy of copies) {
      expect(copy).not.toHaveProperty('rating')
      expect(copy).not.toHaveProperty('notes')
    }
    expect(rated.map(copy => copy.rating)).toEqual([null, 4])
    expect(copies.map(copy => copy.libraries).sort()).toEqual([[firstLibraryId], [luisLibraryId]])
    expect(rated.map(copy => copy.libraries)).toEqual([[firstLibraryId], [luisLibraryId]])
    for (const copy of rated) {
      expect(copy).not.toHaveProperty('notes')
    }
  })

  it('should not return the notes nor the ids of the owners', async () => {
    await shareRatings(firstLibraryId, luisLibraryId)

    const { text } = await get(`/shared-books/${itNeverHappenedId}`)

    for (const hidden of ['notes of Ana', 'notes of Luis', anaId, luisId, '@email.com']) {
      expect(text).not.toContain(hidden)
    }
  })
})

describe('own opinion on the shared books', () => {
  async function own (): Promise<any[]> {
    const { body } = await list()
    const { body: detail } = await get(`/shared-books/${itNeverHappenedId}`)
    const listed = body.results.find((result: any) => result.id === itNeverHappenedId)
    return [listed.attributes.own, detail.results.attributes.own]
  }

  it.each([
    ['rated', 7, 'my notes'],
    ['not rated', null, null]
  ])('should be returned when the book is in an own library: %s', async (_reason, rating, notes) => {
    const library = await librariesDao.create({ name: 'Mine' }, readerId)
    await insertCopy(readerId, [library.id], rating, notes)

    expect(await own()).toEqual([{ rating, notes }, { rating, notes }])
    // The own copy is not one more of the shared ones
    expect(await people(itNeverHappenedId)).toHaveLength(2)
    expect((await list()).ids).toEqual(allBookIds)
  })

  it('should not be returned when the book was removed from all the own libraries', async () => {
    await insertCopy(readerId, [], 7, 'my notes')

    expect(await own()).toEqual([null, null])
  })
})
