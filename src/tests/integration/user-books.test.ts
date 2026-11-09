import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
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
