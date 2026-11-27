import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'

// Fixture data: user01 has Rossiya, Lightning and Ashes and It Never Happened in the first library.
// user02 also has It Never Happened
const user01Id = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'
const otherUserLibraryId = '01J9XDD1NAFHP0159FYT245D8X'

const rossiyaId = '01J9W9P6M5S0VRKVSRX3Q9T3W7'
const lightningId = '01J9W9PGE06ANTMG3Y24KGCAFF'
const itNeverHappenedId = '01J9WA3W9TE5NG1H21PTK9VS4Q'
const solitudeId = '01JBSEARCH0000000000000001'
const primerId = '01JBSEARCH0000000000000002'
const removedId = '01JBSEARCH0000000000000003'

// Extra books of user01 in the second library, to search by accented authors, special characters and library
const extraUserBooks = [
  {
    _id: solitudeId,
    libraries: [secondLibraryId],
    userId: user01Id,
    bookTitle: 'One Hundred Years of Solitude',
    bookAuthors: ['Gabriel García Márquez'],
    bookId: '01JBSEARCHB000000000000001',
    bookIsbn13: '9780307474728',
    bookIsbn10: '0307474720',
    notes: null,
    readingStatus: null,
    finishedAt: null,
    rating: null,
    bookCover: { source: 'open_library', value: null },
    createdAt: new Date('2000-01-01T00:00:00.000Z'),
    updatedAt: new Date('2000-01-01T00:00:00.000Z')
  },
  {
    _id: primerId,
    libraries: [secondLibraryId],
    userId: user01Id,
    bookTitle: 'C++ Primer (5th Edition)',
    bookAuthors: ['Stanley B. Lippman'],
    bookId: '01JBSEARCHB000000000000002',
    bookIsbn13: '9780321714114',
    bookIsbn10: '0321714113',
    notes: null,
    readingStatus: null,
    finishedAt: null,
    rating: null,
    bookCover: { source: 'open_library', value: null },
    createdAt: new Date('2000-01-01T00:00:00.000Z'),
    updatedAt: new Date('2000-01-01T00:00:00.000Z')
  },
  // Removed from its last library: it keeps its data but is in no library
  {
    _id: removedId,
    libraries: [],
    userId: user01Id,
    bookTitle: 'Removed Primer',
    bookAuthors: ['Nobody'],
    bookId: '01JBSEARCHB000000000000003',
    bookIsbn13: '9780000000002',
    bookIsbn10: '0000000002',
    notes: null,
    readingStatus: null,
    finishedAt: null,
    rating: null,
    bookCover: { source: 'open_library', value: null },
    createdAt: new Date('2000-01-01T00:00:00.000Z'),
    updatedAt: new Date('2000-01-01T00:00:00.000Z')
  }
]

let authHeader: string

async function listUserBooks (params: Record<string, string | string[]>): Promise<{ status: number, body: any }> {
  const url = new URL('/user-books', testUtils.TESTS_BASE_URL)
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, item)
    }
  }
  const response = await fetch(url, { headers: { Authorization: authHeader } })
  return { status: response.status, body: await response.json() }
}

async function patchUserBook (id: string, body: object): Promise<{ status: number, body: any }> {
  const response = await fetch(new URL(`/user-books/${id}`, testUtils.TESTS_BASE_URL), {
    method: 'PATCH',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: response.status, body: await response.json() }
}

function ids (body: any): string[] {
  return body.results.map((result: any) => result.id)
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await userBooksDao.collection.insertMany(extraUserBooks as any)
  const { accessToken } = await testUtils.login('user01@email.com', 'Password123!')
  authHeader = testUtils.buildAuthorizationHeader(accessToken)
})

afterAll(async () => {
  await mongo.clean()
})

describe('GET /user-books?search', () => {
  it('should match part of the title', async () => {
    const { status, body } = await listUserBooks({ search: 'ossi' })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([rossiyaId])
    expect(body.paginationInfo.total).toBe(1)
  })

  it('should be case insensitive', async () => {
    const { status, body } = await listUserBooks({ search: 'LIGHTNING' })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([lightningId])
  })

  it('should match part of an author', async () => {
    const { status, body } = await listUserBooks({ search: 'guzlow' })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([lightningId])
  })

  it('should distinguish accents', async () => {
    const accented = await listUserBooks({ search: 'garcía' })
    const unaccented = await listUserBooks({ search: 'garcia' })

    expect(ids(accented.body)).toEqual([solitudeId])
    expect(ids(unaccented.body)).toEqual([])
  })

  it('should match an exact ISBN-13, with or without hyphens', async () => {
    const plain = await listUserBooks({ search: '9780595385294' })
    const hyphenated = await listUserBooks({ search: '978-0-595-38529-4' })

    expect(ids(plain.body)).toEqual([rossiyaId])
    expect(ids(hyphenated.body)).toEqual([rossiyaId])
  })

  it('should match an exact ISBN-10', async () => {
    const { status, body } = await listUserBooks({ search: '059538529X' })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([rossiyaId])
  })

  it('should match part of an ISBN', async () => {
    const { status, body } = await listUserBooks({ search: '0595385' })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([rossiyaId])
  })

  it('should match special characters literally', async () => {
    const parenthesis = await listUserBooks({ search: 'C++ Primer (5' })
    // No book has an asterisk; as a regex it would match everything
    const asterisk = await listUserBooks({ search: '.*' })

    expect(parenthesis.status).toBe(200)
    expect(ids(parenthesis.body)).toEqual([primerId])
    expect(asterisk.status).toBe(200)
    expect(ids(asterisk.body)).toEqual([])
  })

  it('should only return books of the user', async () => {
    const { status, body } = await listUserBooks({ search: 'never happened' })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([itNeverHappenedId])
  })

  it('should only return books of the requested library', async () => {
    const inSecond = await listUserBooks({ search: 'primer', libraryId: secondLibraryId })
    const inFirst = await listUserBooks({ search: 'primer', libraryId: firstLibraryId })

    expect(ids(inSecond.body)).toEqual([primerId])
    expect(inSecond.body.paginationInfo.total).toBe(1)
    expect(ids(inFirst.body)).toEqual([])
    expect(inFirst.body.paginationInfo.total).toBe(0)
  })

  it('should fail to search in a library of another user', async () => {
    const { status } = await listUserBooks({ search: 'never', libraryId: otherUserLibraryId })

    expect(status).toBe(403)
  })

  it('should fail to list a library of another user along with an own one', async () => {
    const { status } = await listUserBooks({ libraryId: [firstLibraryId, otherUserLibraryId] })

    expect(status).toBe(403)
  })

  it('should accept the same library repeated in the filter', async () => {
    const { status, body } = await listUserBooks({ search: 'primer', libraryId: [secondLibraryId, secondLibraryId] })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([primerId])
  })

  it('should not list books removed from all their libraries', async () => {
    const all = await listUserBooks({})
    const searched = await listUserBooks({ search: 'primer' })

    expect(ids(all.body)).not.toContain(removedId)
    expect(ids(searched.body)).toEqual([primerId])
    expect(searched.body.paginationInfo.total).toBe(1)
  })

  it('should count only the matches and paginate them without repeating books', async () => {
    // "i" appears in every book of user01
    const pages = await Promise.all([0, 2, 4].map(async (skip) =>
      await listUserBooks({ search: 'i', skip: String(skip), limit: '2' })
    ))
    const pagedIds = pages.flatMap((page) => ids(page.body))

    expect(pages.map((page) => page.body.paginationInfo.total)).toEqual([5, 5, 5])
    expect(new Set(pagedIds).size).toBe(5)
    expect(pagedIds).toEqual([...pagedIds].sort().reverse())
  })

  it('should ignore an empty search', async () => {
    const { status, body } = await listUserBooks({ search: '   ' })

    expect(status).toBe(200)
    expect(body.paginationInfo.total).toBe(5)
  })

  it('should fail with a search longer than 100 characters', async () => {
    const { status, body } = await listUserBooks({ search: 'a'.repeat(101) })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['search'])
  })
})

describe('PATCH /user-books/:id', () => {
  it('should reject an opinion on a book that is not in any library', async () => {
    const { status, body } = await patchUserBook(removedId, { rating: 8, notes: 'not mine anymore', readingStatus: null, finishedAt: null })

    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
    expect(body.message).toBe('user book not found')
    const stored = await userBooksDao.collection.findOne({ _id: removedId })
    expect(stored?.rating).toBeNull()
    expect(stored?.notes).toBeNull()
  })

  it('should accept the opinion again once the book is back in a library', async () => {
    await userBooksDao.collection.updateOne({ _id: removedId }, { $set: { libraries: [secondLibraryId] } })

    try {
      const { status, body } = await patchUserBook(removedId, { rating: 8, notes: 'mine again', readingStatus: null, finishedAt: null })

      expect(status).toBe(200)
      expect(body.results.attributes.rating).toBe(8)
      expect(body.results.attributes.notes).toBe('mine again')
    } finally {
      await userBooksDao.collection.updateOne({ _id: removedId }, { $set: { libraries: [] } })
    }
  })

  it('should change the update date but not the creation date', async () => {
    const before = new Date()
    const { status, body } = await patchUserBook(primerId, { rating: 7, notes: null, readingStatus: null, finishedAt: null })

    expect(status).toBe(200)
    expect(body.results.attributes.createdAt).toBe('2000-01-01T00:00:00.000Z')
    expect(new Date(body.results.attributes.updatedAt).getTime()).toBeGreaterThanOrEqual(before.getTime())
    const stored = await userBooksDao.collection.findOne({ _id: primerId })
    expect(stored?.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})

describe('PATCH /user-books/:id - reading status', () => {
  const opinion = { rating: null, notes: null }

  /** A day as YYYY-MM-DD, counted from today in UTC. */
  function utcDay (offsetDays: number): string {
    return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  it('should start without a reading status', async () => {
    const { status, body } = await listUserBooks({ libraryId: secondLibraryId })

    expect(status).toBe(200)
    for (const result of body.results) {
      expect(result.attributes.readingStatus).toBeNull()
      expect(result.attributes.finishedAt).toBeNull()
    }
  })

  it.each(['to_read', 'reading', 'read', null])('should set the status %s without a finish date', async (readingStatus) => {
    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus, finishedAt: null })

    expect(status).toBe(200)
    expect(body.results.attributes.readingStatus).toBe(readingStatus)
    expect(body.results.attributes.finishedAt).toBeNull()
  })

  it('should store the finish date of a read book as a day at 00:00 UTC', async () => {
    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus: 'read', finishedAt: '2026-03-14' })

    expect(status).toBe(200)
    expect(body.results.attributes.readingStatus).toBe('read')
    expect(body.results.attributes.finishedAt).toBe('2026-03-14')
    const stored = await userBooksDao.collection.findOne({ _id: primerId })
    expect(stored?.finishedAt).toEqual(new Date('2026-03-14T00:00:00.000Z'))
  })

  it('should clear the finish date when a read book goes back to another status', async () => {
    await patchUserBook(primerId, { ...opinion, readingStatus: 'read', finishedAt: '2026-03-14' })

    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus: 'to_read', finishedAt: null })

    expect(status).toBe(200)
    expect(body.results.attributes.finishedAt).toBeNull()
    const stored = await userBooksDao.collection.findOne({ _id: primerId })
    expect(stored?.readingStatus).toBe('to_read')
    expect(stored?.finishedAt).toBeNull()
  })

  it.each(['to_read', 'reading', null])('should reject a finish date with the status %s', async (readingStatus) => {
    const before = await userBooksDao.collection.findOne({ _id: primerId })

    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus, finishedAt: '2026-03-14' })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['finishedAt'])
    expect(body.validationError[0].message).toBe('only a read book can have a finish date')
    expect(await userBooksDao.collection.findOne({ _id: primerId })).toEqual(before)
  })

  it('should accept tomorrow in UTC, which is already today ahead of UTC', async () => {
    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus: 'read', finishedAt: utcDay(1) })

    expect(status).toBe(200)
    expect(body.results.attributes.finishedAt).toBe(utcDay(1))
  })

  it('should reject a finish date in the future', async () => {
    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus: 'read', finishedAt: utcDay(2) })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['finishedAt'])
    expect(body.validationError[0].message).toBe('the finish date cannot be in the future')
  })

  it.each(['14/03/2026', '2026-02-30', '2026-03-14T10:00:00.000Z', ''])('should reject the finish date %j', async (finishedAt) => {
    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus: 'read', finishedAt })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['finishedAt'])
  })

  it('should reject an unknown status', async () => {
    const { status, body } = await patchUserBook(primerId, { ...opinion, readingStatus: 'abandoned', finishedAt: null })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['readingStatus'])
  })

  it.each(['readingStatus', 'finishedAt'])('should require %s', async (field) => {
    const fullBody: Record<string, unknown> = { ...opinion, readingStatus: null, finishedAt: null }
    const { [field]: _missing, ...body } = fullBody

    const response = await patchUserBook(primerId, body)

    expect(response.status).toBe(400)
    expect(response.body.validationError[0].path).toEqual([field])
  })
})

describe('GET /user-books?readingStatus&readYear', () => {
  const readingId = '01JBSTATUS0000000000000001'
  const toReadId = '01JBSTATUS0000000000000002'

  function extraBook (_id: string, readingStatus: string, n: number): object {
    return {
      _id,
      libraries: [secondLibraryId],
      userId: user01Id,
      bookTitle: `Status book ${n}`,
      bookAuthors: ['Somebody'],
      bookId: `01JBSTATUSB00000000000000${n}`,
      bookIsbn13: `978000000010${n}`,
      bookIsbn10: null,
      notes: null,
      rating: null,
      readingStatus,
      finishedAt: null,
      bookCover: { source: 'open_library', value: null },
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
      updatedAt: new Date('2000-01-01T00:00:00.000Z')
    }
  }

  async function setStatus (id: string, readingStatus: string | null, finishedAt: string | null): Promise<void> {
    await userBooksDao.collection.updateOne(
      { _id: id },
      { $set: { readingStatus: readingStatus as any, finishedAt: finishedAt == null ? null : new Date(finishedAt) } }
    )
  }

  beforeAll(async () => {
    await setStatus(rossiyaId, 'read', '2026-03-14T00:00:00.000Z')
    await setStatus(solitudeId, 'read', '2026-01-01T00:00:00.000Z')
    await setStatus(lightningId, 'read', '2025-12-31T00:00:00.000Z')
    await setStatus(primerId, 'read', null)
    await setStatus(itNeverHappenedId, null, null)
    // Read in 2026, but removed from all its libraries: never listed
    await setStatus(removedId, 'read', '2026-05-01T00:00:00.000Z')
    await userBooksDao.collection.insertMany([extraBook(readingId, 'reading', 1), extraBook(toReadId, 'to_read', 2)] as any)
  })

  afterAll(async () => {
    await userBooksDao.collection.deleteMany({ _id: { $in: [readingId, toReadId] } })
  })

  it('should list the read books by the day they were finished, those without it at the end', async () => {
    const { status, body } = await listUserBooks({ readingStatus: 'read' })

    expect(status).toBe(200)
    expect(ids(body)).toEqual([rossiyaId, solitudeId, lightningId, primerId])
    expect(body.paginationInfo.total).toBe(4)
  })

  it.each([
    ['reading', [readingId]],
    ['to_read', [toReadId]],
    ['none', [itNeverHappenedId]]
  ])('should list the books with the status %s', async (readingStatus, expected) => {
    const { status, body } = await listUserBooks({ readingStatus })

    expect(status).toBe(200)
    expect(ids(body)).toEqual(expected)
    expect(body.paginationInfo.total).toBe(expected.length)
  })

  it.each([
    ['2026', [rossiyaId, solitudeId]],
    ['2025', [lightningId]],
    ['2024', []]
  ])('should list the books read in %s, from the 1st of January to the 31st of December', async (readYear, expected) => {
    const { status, body } = await listUserBooks({ readingStatus: 'read', readYear })

    expect(status).toBe(200)
    expect(ids(body)).toEqual(expected)
    expect(body.paginationInfo.total).toBe(expected.length)
  })

  it('should combine the status with the library and the search', async () => {
    const inLibrary = await listUserBooks({ readingStatus: 'read', libraryId: secondLibraryId })
    const searched = await listUserBooks({ readingStatus: 'read', search: 'primer' })
    const inLibraryAndYear = await listUserBooks({ readingStatus: 'read', readYear: '2026', libraryId: firstLibraryId })

    expect(ids(inLibrary.body)).toEqual([solitudeId, primerId])
    expect(ids(searched.body)).toEqual([primerId])
    expect(ids(inLibraryAndYear.body)).toEqual([rossiyaId])
  })

  it('should paginate the read books without repeating them', async () => {
    const pages = await Promise.all([0, 1, 2, 3].map(async (skip) =>
      await listUserBooks({ readingStatus: 'read', skip: String(skip), limit: '1' })
    ))

    expect(pages.flatMap((page) => ids(page.body))).toEqual([rossiyaId, solitudeId, lightningId, primerId])
  })

  it('should keep the newest first with any other status', async () => {
    const { body } = await listUserBooks({ libraryId: secondLibraryId })

    expect(ids(body)).toEqual([...ids(body)].sort().reverse())
  })

  it('should reject an unknown status', async () => {
    const { status, body } = await listUserBooks({ readingStatus: 'abandoned' })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['readingStatus'])
  })

  it.each(['26', '2026-01', 'abcd'])('should reject the year %s', async (readYear) => {
    const { status, body } = await listUserBooks({ readingStatus: 'read', readYear })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['readYear'])
  })

  it.each<Record<string, string>>([{}, { readingStatus: 'reading' }, { readingStatus: 'none' }])('should reject a year without the status read: %j', async (params) => {
    const { status, body } = await listUserBooks({ ...params, readYear: '2026' })

    expect(status).toBe(400)
    expect(body.validationError[0].path).toEqual(['readYear'])
    expect(body.validationError[0].message).toBe('readYear requires readingStatus=read')
  })
})
