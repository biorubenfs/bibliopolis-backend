import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import booksDao from '../../resources/books/books.dao.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import usersDao from '../../resources/users/users.dao.js'
import testUtils from '../utils/utils.js'

const userId = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const libraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const userBookId = '01J9WA3W9TE5NG1H21PTK9VS4Q'
const isbnWithoutSources = '9791399093353'
const emptyCover = { source: null, value: null }

let authHeader: string

async function request (method: string, path: string, body?: object): Promise<Response> {
  return await fetch(new URL(path, testUtils.TESTS_BASE_URL), {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined
  })
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  const { accessToken } = await testUtils.login('user01@email.com', 'Password123!')
  authHeader = testUtils.buildAuthorizationHeader(accessToken)
})

afterAll(async () => {
  await mongo.clean()
})

describe('schema defaults reach the handlers', () => {
  it('POST /libraries/:id/books - a book without cover should keep the listings working', async () => {
    const created = await request('POST', `/libraries/${libraryId}/books`, {
      title: 'el horrible monstruo del espacio',
      isbn13: isbnWithoutSources,
      isbn10: null,
      authors: []
    })
    expect(created.status).toBe(201)

    const book = await booksDao.collection.findOne({ isbn13: isbnWithoutSources })
    const userBook = await userBooksDao.collection.findOne({ userId, bookId: book?._id })
    expect(book?.cover).toEqual(emptyCover)
    expect(userBook?.bookCover).toEqual(emptyCover)

    const userBooks = await request('GET', `/user-books?libraryId=${libraryId}`)
    expect(userBooks.status).toBe(200)

    const { results } = await userBooks.json()
    const listed = results.find((result: any) => result.attributes.bookIsbn13 === isbnWithoutSources)
    expect(listed.attributes.bookCoverUrl).toBeNull()
  })

  it('POST /books - a book without cover should be stored with the default cover', async () => {
    const isbn13 = '9780306406157'
    const created = await request('POST', '/books', { title: 'No cover', authors: [], isbn13 })
    expect(created.status).toBe(201)

    const book = await booksDao.collection.findOne({ isbn13 })
    expect(book?.cover).toEqual(emptyCover)
  })
})

describe('schema transforms reach the handlers', () => {
  it('POST /libraries - should store the name trimmed', async () => {
    const created = await request('POST', '/libraries', { name: '  trimmed name  ', description: 'description' })
    expect(created.status).toBe(201)

    const { results } = await created.json()
    expect(results.attributes.name).toBe('trimmed name')
  })

  it('POST /libraries/:id/books - should normalize the ISBN', async () => {
    const created = await request('POST', `/libraries/${libraryId}/books`, {
      title: 'Hyphenated ISBN',
      isbn13: '978-0-13-468599-1',
      isbn10: null,
      authors: [],
      cover: emptyCover
    })
    expect(created.status).toBe(201)

    const book = await booksDao.collection.findOne({ isbn13: '9780134685991' })
    expect(book?.title).toBe('Hyphenated ISBN')
  })
})

describe('fields outside the schema are not stored', () => {
  it('PATCH /users/me - should not allow changing the role', async () => {
    const response = await request('PATCH', '/users/me', { name: 'New name', role: 'admin' })
    expect(response.status).toBe(200)

    const user = await usersDao.collection.findOne({ _id: userId })
    expect(user?.name).toBe('New name')
    expect(user?.role).toBe('regular')
  })

  it('PATCH /libraries/:id - should not allow changing the owner', async () => {
    const response = await request('PATCH', `/libraries/${libraryId}`, { description: 'new', userId: 'someone-else' })
    expect(response.status).toBe(200)

    const library = await librariesDao.collection.findOne({ _id: libraryId })
    expect(library?.description).toBe('new')
    expect(library?.userId).toBe(userId)
  })

  it('PATCH /user-books/:id - should not allow changing the owner', async () => {
    const response = await request('PATCH', `/user-books/${userBookId}`, { rating: 5, notes: 'notes', userId: 'someone-else' })
    expect(response.status).toBe(200)

    const userBook = await userBooksDao.collection.findOne({ _id: userBookId })
    expect(userBook?.rating).toBe(5)
    expect(userBook?.userId).toBe(userId)
  })
})
