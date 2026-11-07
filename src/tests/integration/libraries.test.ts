import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import librariesService from '../../resources/libraries/libraries.service.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import importsDao from '../../resources/imports/imports.dao.js'
import importItemsDao from '../../resources/imports/import-items.dao.js'
import { ImportItemOutcome, ImportStatus } from '../../resources/imports/imports.interfaces.js'
import { Role } from '../../resources/users/users.interfaces.js'
import { ApiRestErrorCode } from '../../error/types.js'

const librariesUrl = new URL('/libraries', testUtils.TESTS_BASE_URL)
const userBooksUrl = new URL('/user-books', testUtils.TESTS_BASE_URL)
const userId = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const userEmail = 'user01@email.com'
const userPassword = 'Password123!'

let authHeader: string

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await librariesDao.init()
  const { accessToken } = await testUtils.login(userEmail, userPassword)
  authHeader = testUtils.buildAuthorizationHeader(accessToken)
})

afterAll(async () => {
  await mongo.clean()
})

describe('libraries tests jwt protected routes', async () => {
  it('GET /libraries - should fail without token', async () => {
    const response = await fetch(librariesUrl, {
      method: 'GET'
    })

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.TokenNotProvidedError)
  })
})

describe('libraries CRUD basic tests', async () => {
  it('GET /libraries - should list user libraries', async () => {
    const response = await fetch(librariesUrl, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'GET'
    })

    const body = await response.json()

    expect(response.status).equals(200)
    expect(body.results.length).equals(3)
  })

  it('GET /libraries?search=first - should list user libraries using search', async () => {
    const url = new URL('/libraries?search=first', testUtils.TESTS_BASE_URL)
    const response = await fetch(url.href, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'GET'
    })

    const body = await response.json()

    expect(response.status).equals(200)
    expect(body.results.length).equals(1)
  })

  async function listLibraries (query: Record<string, string | string[]>): Promise<{ status: number, body: any }> {
    const url = new URL('/libraries', testUtils.TESTS_BASE_URL)
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, item)
      }
    }
    const response = await fetch(url.href, {
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      method: 'GET'
    })
    return { status: response.status, body: await response.json() }
  }

  it('GET /libraries?search - should match partial words in the name', async () => {
    const { status, body } = await listLibraries({ search: 'seco' })

    expect(status).equals(200)
    expect(body.results.length).equals(1)
    expect(body.results[0].attributes.name).equals('sample second library')
  })

  it('GET /libraries?search - should be case insensitive', async () => {
    const { status, body } = await listLibraries({ search: 'THIRD' })

    expect(status).equals(200)
    expect(body.results.length).equals(1)
    expect(body.results[0].attributes.name).equals('sample third library')
  })

  it('GET /libraries?search - should match the description', async () => {
    const { status, body } = await listLibraries({ search: 'description of the sample first' })

    expect(status).equals(200)
    expect(body.results.length).equals(1)
    expect(body.results[0].attributes.name).equals('sample first library')
  })

  it('GET /libraries?search - should only return libraries of the user', async () => {
    const { status, body } = await listLibraries({ search: 'user02' })

    expect(status).equals(200)
    expect(body.results.length).equals(0)
  })

  it('GET /libraries?search - should match regex special characters literally', async () => {
    const { status, body } = await listLibraries({ search: '.*' })

    expect(status).equals(200)
    expect(body.results.length).equals(0)
    expect(body.paginationInfo.total).equals(0)
  })

  it('GET /libraries?search - should ignore a blank search', async () => {
    const { status, body } = await listLibraries({ search: '   ' })

    expect(status).equals(200)
    expect(body.results.length).equals(3)
  })

  it('GET /libraries?search - should apply the search to the pagination total', async () => {
    const { status, body } = await listLibraries({ search: 'library', limit: '2' })

    expect(status).equals(200)
    expect(body.results.length).equals(2)
    expect(body.paginationInfo.total).equals(3)
  })

  it('GET /libraries?search - should fail with more than one search param', async () => {
    const { status, body } = await listLibraries({ search: ['first', 'second'] })

    expect(status).equals(400)
    expect(body.errorCode).equals(ApiRestErrorCode.ValidationError)
  })

  it('GET /libraries?search - should fail with a search longer than 100 characters', async () => {
    const { status, body } = await listLibraries({ search: 'a'.repeat(101) })

    expect(status).equals(400)
    expect(body.errorCode).equals(ApiRestErrorCode.ValidationError)
  })

  it('POST /libraries - should create a library', async () => {
    const body = { name: 'new library', description: 'description of the new library' }
    const response = await fetch(librariesUrl, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(201)
  })

  it('POST /libraries - should fail to create a library with existing name', async () => {
    const body = { name: 'sample first library', description: 'description of the sample first library' }
    const response = await fetch(librariesUrl, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(409)
  })

  it('PATCH /libraries/:id - should update a owned library', async () => {
    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WEX', librariesUrl)
    const body = { name: 'updated library name', description: 'updated description' }
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(200)
  })

  it('PATCH /libraries/:id - should fail to update a non-owned library', async () => {
    const url = new URL('/libraries/01J9XDD1NAFHP0159FYT245D8X', librariesUrl)
    const body = { name: 'updated library name', description: 'updated description' }
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(403)
  })

  it('PATCH /libraries/:id - should fail to update a library with existing name', async () => {
    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ', librariesUrl)
    const body = { name: 'updated library name', description: 'updated description' }
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(409)
  })

  it('DELETE /libraries/:id - should remove a owned library', async () => {
    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ', librariesUrl)
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    })

    expect(response.status).equals(204)
  })

  it('DELETE /libraries/:id - should fail to remove a non-owned library', async () => {
    const url = new URL('/libraries/01J9XDD1NAFHP0159FYT245D8X', librariesUrl)
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    })

    expect(response.status).equals(403)
  })

  it('deleting a library should leave everything as it was when a step fails', async () => {
    const libraryId = '01JZDE1ETEFA11STRANSACT10N'
    const userBookId = '01J9W9P6M5S0VRKVSRX3Q9T3W7'
    const importId = '01JZDE1ETEFA11STRANSACT1MP'
    const now = new Date()
    await librariesDao.collection.insertOne({
      _id: libraryId,
      name: 'library whose deletion fails',
      description: 'library whose deletion fails',
      books: [userBookId],
      userId,
      createdAt: now,
      updatedAt: now
    })
    await userBooksDao.collection.updateOne({ _id: userBookId }, { $push: { libraries: libraryId } })
    await importsDao.collection.insertOne({
      _id: importId,
      userId,
      libraryId,
      fileName: 'books.csv',
      status: ImportStatus.Queued,
      createdAt: now,
      updatedAt: now,
      finishedAt: null
    })
    await importItemsDao.collection.insertOne({
      _id: '01JZDE1ETEFA11STRANSACT1TM',
      importId,
      row: 2,
      rawIsbn: '9788408292609',
      isbn13: '9788408292609',
      outcome: ImportItemOutcome.Queued,
      bookTitle: null,
      resolution: null
    })

    // The HTTP server runs in another process, so the failure can only be simulated on the service
    const deleteImports = vi.spyOn(importsDao, 'deleteByLibrary').mockRejectedValue(new Error('database is down'))
    try {
      await expect(librariesService.delete(libraryId, userId, Role.Regular)).rejects.toThrow('database is down')
    } finally {
      deleteImports.mockRestore()
    }

    expect(await librariesDao.collection.countDocuments({ _id: libraryId })).equals(1)
    expect(await userBooksDao.collection.countDocuments({ _id: userBookId, libraries: libraryId })).equals(1)
    expect(await importsDao.collection.countDocuments({ libraryId })).equals(1)
    expect(await importItemsDao.collection.countDocuments({ importId })).equals(1)

    // Once the failure is gone, the deletion can be repeated and removes everything
    await librariesService.delete(libraryId, userId, Role.Regular)

    expect(await librariesDao.collection.countDocuments({ _id: libraryId })).equals(0)
    expect(await userBooksDao.collection.countDocuments({ libraries: libraryId })).equals(0)
    expect(await importsDao.collection.countDocuments({ libraryId })).equals(0)
    expect(await importItemsDao.collection.countDocuments({ importId })).equals(0)
  })
})

describe('libraries books management tests', async () => {
  it('POST /libraries/:id/books - should add a book to owned library', async () => {
    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WEX/books', librariesUrl)
    const body = {
      isbn13: '9781595581662',
      isbn10: null,
      title: "A people's history of World War II",
      authors: ['Marc Favreau'],
      cover: {
        source: 'open_library',
        value: '11492093'
      }
    }
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(201)
  })

  it('POST /libraries/:id/books - adding book to owned library should not increase user books counter', async () => {
    const bookId = '01J9KKFTWAKVR1HGHCER50JJMQ'

    /* maybe we should avoid to use direct database queries here */
    const counterBeforeAddingBook = await userBooksDao.collection.countDocuments({ userId, bookId })

    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WFA/books', librariesUrl)
    const body = {
      isbn13: '9780974326450',
      isbn10: '0595491898',
      title: 'Lightning and Ashes',
      authors: ['John Guzlowski'],
      cover: {
        source: 'open_library',
        value: '1715106'
      }
    }

    await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    const counterAfterAddingBook = await userBooksDao.collection.countDocuments({ userId, bookId })
    expect(counterBeforeAddingBook).equals(counterAfterAddingBook)
  })

  it('POST /libraries/:id/books - adding book to owned library should increase user books counter', async () => {
    const bookId = '01J9KKG3X20MDEXAMYSSQZJ21Y'

    const body = {
      title: 'Eyewitness to History',
      authors: ['John Carey'],
      cover: {
        source: 'open_library',
        value: '12545193'
      },
      isbn13: '9780380708956',
      isbn10: '0380708957'
    }

    /* maybe we should avoid to use direct database queries here */
    const counterBeforeAddingBook = await userBooksDao.collection.countDocuments({ userId, bookId })

    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WFA/books', librariesUrl)

    await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    const counterAfterAddingBook = await userBooksDao.collection.countDocuments({ userId, bookId })
    expect(counterBeforeAddingBook + 1).equals(counterAfterAddingBook)
  })

  it('POST /libraries/:id/books - should fail to add a existing book in a library', async () => {
    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WEX/books', librariesUrl)
    const body = {
      title: "A people's history of World War II",
      authors: ['Marc Favreau'],
      cover: {
        source: 'open_library',
        value: '11492093'
      },
      isbn13: '9781595581662',
      isbn10: null
    }
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(409)
  })

  it('POST /libraries/:id/books - should fail to add a non existing book to owned library', async () => {
    const url = new URL('/libraries/01J9W8VR2CFZW8PJ1Q8Y4Y5WEX', librariesUrl)
    const body = { id: '01J9KKFWF45DMVVGRS502SFAKE' }
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(404)
  })

  it('DELETE /libraries/:libraryId/books/:userBookId - should remove a book from owned library', async () => {
    const libraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
    const userBookId = '01J9W9PGE06ANTMG3Y24KGCAFF'
    const url = new URL(`/libraries/${libraryId}/books/${userBookId}`, librariesUrl)
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    })

    expect(response.status).equals(204)
  })

  it('DELETE /libraries/:libraryId/books/:userBookId - should fail to remove a non existing book in a owned library', async () => {
    const libraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
    const userBookId = '01J9W9PGE06ANTMG3Y24KGCAFAKE'
    const url = new URL(`/libraries/${libraryId}/books/${userBookId}`, librariesUrl)
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    })

    expect(response.status).equals(404)
  })

  it('POST /libraries/:id/books - should fail to add a book in a not owned library', async () => {
    const url = new URL('/libraries/01J9XDD1NAFHP0159FYT245D8X/books', librariesUrl)
    const body = {
      title: "A people's history of World War II",
      authors: ['Marc Favreau'],
      cover: {
        source: 'open_library',
        value: '11492093'
      },
      isbn13: '9781595581662',
      isbn10: null
    }
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(403)
  })

  it('DELETE /libraries/:libraryId/books/:userBookId - should fail to remove a book in a not owned library', async () => {
    const libraryId = '01J9XDD1NAFHP0159FYT245D8X'
    const userBookId = '01J9XDF6YJWYZ7EC2MDR8R58MW'
    const url = new URL(`/libraries/${libraryId}/books/${userBookId}`, librariesUrl)
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'DELETE'
    })

    expect(response.status).equals(403)
  })
})

// TODO: move to user-books tests
describe('user-books tests', async () => {
  it('GET /user-books - should fail without token', async () => {
    const url = new URL('/user-books', userBooksUrl)
    const response = await fetch(url, {
      method: 'GET'
    })

    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.errorCode).toBe(ApiRestErrorCode.TokenNotProvidedError)
  })

  it('GET /user-books?libraryId= - should list the books of a owned library', async () => {
    const libraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
    const url = new URL('/user-books', userBooksUrl)
    url.searchParams.set('libraryId', libraryId)
    // url.searchParams.set('userId', userId) // not needed

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'GET'
    })
    const responseBody = await response.json()

    expect(response.status).equals(200)
    expect(responseBody).to.have.property('results')
    expect(responseBody.results).to.be.an('array').of.length(3)
    expect(responseBody.results[0]).to.have.property('type').equals('user-books')
    expect(responseBody.results[0])
      .to.have.nested.property('attributes.libraries')
      .that.is.an('array')
      .that.includes(libraryId)
  })

  it('GET /user-books - should sort the books from newest to oldest id regardless of the insertion order', async () => {
    const earlierId = '01J9W9P6M5S0VRKVSRX3Q9T3W0'
    const userBook = await userBooksDao.collection.findOne({ _id: '01J9W9P6M5S0VRKVSRX3Q9T3W7' })
    if (userBook == null) throw new Error('fixture not found')
    await userBooksDao.collection.insertOne({ ...userBook, _id: earlierId })

    try {
      const response = await fetch(userBooksUrl, {
        headers: { Authorization: authHeader },
        method: 'GET'
      })
      const responseBody = await response.json()

      expect(response.status).equals(200)
      const ids: string[] = responseBody.results.map((userBook: { id: string }) => userBook.id)
      expect(ids[ids.length - 1]).equals(earlierId)
      expect(ids).toEqual([...ids].sort().reverse())
    } finally {
      await userBooksDao.collection.deleteOne({ _id: earlierId })
    }
  })

  it('GET /user-books?libraryId= - should fail to list books of a not owned library', async () => {
    const libraryId = '01J9XDD1NAFHP0159FYT245D8X'
    const url = new URL('/user-books', userBooksUrl)
    url.searchParams.set('libraryId', libraryId)
    // url.searchParams.set('userId', userId) // not needed

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'GET'
    })

    expect(response.status).equals(403)
  })

  it('PATCH /user-books/:bookId - should update a user book with rating and notes', async () => {
    const userBookId = '01J9W9P6M5S0VRKVSRX3Q9T3W7'

    const url = new URL(`user-books/${userBookId}`, testUtils.TESTS_BASE_URL)

    const body = { rating: 6, notes: 'loremipsum' }

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    const responseBody = await response.json()
    const userBook = responseBody.results

    expect(response.status).equals(200)
    expect(userBook.id).equals('01J9W9P6M5S0VRKVSRX3Q9T3W7')
    expect(userBook.type).equals('user-books')
    expect(userBook.attributes.rating).equals(body.rating)
    expect(userBook.attributes.notes).equals(body.notes)
  })

  it('PATCH /user-books/:bookId - should fail to update a user book', async () => {
    const userBookId = '01J9XDBGCX8QM0GW67T7QGKS41'

    const url = new URL(`user-books/${userBookId}`, testUtils.TESTS_BASE_URL)

    const body = { rating: 6, notes: 'loremipsum' }

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(404)
  })
})
