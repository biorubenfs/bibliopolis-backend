import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Document, MongoServerError } from 'mongodb'
import { ulid } from 'ulid'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import { Role } from '../../resources/users/users.interfaces.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import booksDao from '../../resources/books/books.dao.js'
import booksService from '../../resources/books/books.service.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import { BooksSource } from '../../resources/sources/sources.types.js'
import { DBUserBook } from '../../resources/user-books/user-books.interfaces.js'

const booksUrl = new URL('/books', testUtils.TESTS_BASE_URL)
const user01Id = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const authHeader = testUtils.buildAuthorizationHeader(makeJwt('01J9BK7YX0D5NHHBN70Q4N7P69', Role.Admin))

const EXISTING_ISBN13 = '9781732539419'
const NEW_ISBN13_WITHOUT_ISBN10 = ['9791300000012', '9791300000029']
const NEW_ISBN13 = '9780000001115'

/** The stages of the winning plan, from the first one executed, e.g. ['IXSCAN', 'FETCH', 'SORT'] */
function planStages (plan: Document): string[] {
  const stages: string[] = []
  let stage = plan.queryPlanner.winningPlan.queryPlan ?? plan.queryPlanner.winningPlan
  while (stage != null) {
    stages.unshift(stage.stage)
    stage = stage.inputStage
  }
  return stages
}

async function postBook (isbn13: string, title = 'A book'): Promise<Response> {
  return await fetch(booksUrl, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'manual', title, authors: ['An author'], isbn: isbn13 })
  })
}

// The test server does not go through App, and mongo.clean() drops the indexes, so each suite creates them
beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await booksDao.init()
  await userBooksDao.init()
})

afterAll(async () => {
  await mongo.clean()
})

describe('books indexes', () => {
  it('POST /books - should reject a book whose isbn13 already exists', async () => {
    const response = await postBook(EXISTING_ISBN13)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ConflictError)
    expect(body.message).toBe(`there is already a book with isbn13 ${EXISTING_ISBN13}`)
  })

  it('POST /books - should allow several books without isbn10', async () => {
    const responses = await Promise.all(NEW_ISBN13_WITHOUT_ISBN10.map(async isbn13 => await postBook(isbn13)))

    expect(responses.map(response => response.status)).toEqual([201, 201])
  })

  it('POST /books - should create only one book when the same one is sent twice at once', async () => {
    const responses = await Promise.all([postBook(NEW_ISBN13), postBook(NEW_ISBN13)])

    expect(responses.map(response => response.status).sort((a, b) => a - b)).toEqual([201, 409])
    expect(await booksDao.collection.countDocuments({ isbn13: NEW_ISBN13 })).toBe(1)
  })

  it('should list the books from the _id index, without sorting in memory', async () => {
    const plan = await booksDao.collection.find({}).sort({ _id: -1 }).limit(10).explain('executionStats')

    expect(planStages(plan)).toEqual(['IXSCAN', 'FETCH', 'LIMIT'])
  })

  it('should use the indexes to find a book by isbn13 or isbn10', async () => {
    const plan = await booksDao.collection
      .find({ $or: [{ isbn13: '0000000000' }, { isbn10: '0000000000' }] })
      .explain('executionStats')

    expect(plan.executionStats.totalDocsExamined).toBe(0)
  })
})

describe('ensureBookExistsInBooks', () => {
  it('should return the same book when it is requested twice at once', async () => {
    const book = {
      title: 'A concurrent book',
      authors: ['An author'],
      isbn13: '9780000002112',
      isbn10: null,
      cover: { source: BooksSource.OPEN_LIBRARY, value: null }
    }

    const [first, second] = await Promise.all([
      booksService.ensureBookExistsInBooks(book),
      booksService.ensureBookExistsInBooks(book)
    ])

    expect(first.id).toBe(second.id)
    expect(await booksDao.collection.countDocuments({ isbn13: book.isbn13 })).toBe(1)
  })
})

describe('user books indexes', () => {
  it('should list the books of a user from an index, without sorting in memory', async () => {
    const plan = await userBooksDao.collection
      .find({ userId: user01Id, 'libraries.0': { $exists: true } })
      .sort({ _id: -1 })
      .limit(10)
      .explain('executionStats')

    expect(planStages(plan)).toEqual(['IXSCAN', 'FETCH', 'LIMIT'])
  })

  it('should list the books of a library from an index, without sorting in memory', async () => {
    const plan = await userBooksDao.collection
      .find({ userId: user01Id, libraries: { $in: [firstLibraryId] } })
      .sort({ _id: -1 })
      .limit(10)
      .explain('executionStats')

    expect(planStages(plan)).toEqual(['IXSCAN', 'FETCH', 'LIMIT'])
    expect(plan.executionStats.totalKeysExamined).toBe(plan.executionStats.nReturned)
  })

  it('should find the user books of a book by index', async () => {
    const plan = await userBooksDao.collection.find({ bookId: '0000000000' }).explain('executionStats')

    expect(planStages(plan)).toEqual(['IXSCAN', 'FETCH'])
    expect(plan.executionStats.totalDocsExamined).toBe(0)
  })

  it('should not allow a user to own the same book twice', async () => {
    const userBook = { userId: ulid(), bookId: ulid(), libraries: [] } as unknown as Omit<DBUserBook, '_id'>

    await userBooksDao.collection.insertOne({ ...userBook, _id: ulid() } as unknown as DBUserBook)

    await expect(userBooksDao.collection.insertOne({ ...userBook, _id: ulid() } as unknown as DBUserBook))
      .rejects.toSatisfy((error: unknown) => error instanceof MongoServerError && error.code === 11000)
  })
})
