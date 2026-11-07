import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import { ApiRestErrorCode } from '../../error/types.js'

// Fixture libraries of user01, none of them favorite
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'
const thirdLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WFA'
const otherUserLibraryId = '01J9XDD1NAFHP0159FYT245D8X'

let authHeader: string

async function request (method: string, path: string, body?: object): Promise<{ status: number, body: any }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  return { status: response.status, body: text !== '' ? JSON.parse(text) : null }
}

async function setFavorite (libraryId: string, isFavorite: boolean): Promise<{ status: number, body: any }> {
  return await request('PATCH', `/libraries/${libraryId}`, { isFavorite })
}

function ids (body: any): string[] {
  return body.results.map((result: any) => result.id)
}

// The test server does not go through App, and mongo.clean() drops the indexes, so each suite creates them
beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await librariesDao.init()
  const { accessToken } = await testUtils.login('user01@email.com', 'Password123!')
  authHeader = testUtils.buildAuthorizationHeader(accessToken)
})

afterAll(async () => {
  await mongo.clean()
})

describe('library favorites', () => {
  it('GET /libraries - should return isFavorite in every library', async () => {
    const { status, body } = await request('GET', '/libraries')

    expect(status).toBe(200)
    expect(ids(body)).toEqual([firstLibraryId, secondLibraryId, thirdLibraryId])
    expect(body.results.map((result: any) => result.attributes.isFavorite)).toEqual([false, false, false])
  })

  it('POST /libraries - a new library should not be a favorite, even if requested', async () => {
    const { status, body } = await request('POST', '/libraries', {
      name: 'favorite on creation',
      description: 'description',
      isFavorite: true
    })

    expect(status).toBe(201)
    expect(body.results.attributes.isFavorite).toBe(false)

    const stored = await librariesDao.collection.findOne({ _id: body.results.id })
    expect(stored?.isFavorite).toBe(false)

    await request('DELETE', `/libraries/${String(body.results.id)}`)
  })

  it('PATCH /libraries/:id - should mark a library as favorite without changing anything else', async () => {
    const { status, body } = await setFavorite(thirdLibraryId, true)

    expect(status).toBe(200)
    expect(body.results.attributes.isFavorite).toBe(true)
    expect(body.results.attributes.name).toBe('sample third library')
    expect(body.results.attributes.description).toBe('description of the sample third library')
  })

  it('GET /libraries - should list the favorites first', async () => {
    const { status, body } = await request('GET', '/libraries')

    expect(status).toBe(200)
    expect(ids(body)).toEqual([thirdLibraryId, firstLibraryId, secondLibraryId])
  })

  it('GET /libraries - should keep the same order across pages', async () => {
    await setFavorite(secondLibraryId, true)

    const pages = await Promise.all([0, 1, 2].map(async skip => await request('GET', `/libraries?skip=${skip}&limit=1`)))

    // Favorites ordered by id, then the rest
    expect(pages.flatMap(page => ids(page.body))).toEqual([secondLibraryId, thirdLibraryId, firstLibraryId])
    expect(pages.map(page => page.body.paginationInfo.total)).toEqual([3, 3, 3])
  })

  it('GET /libraries?favorites=true - should list only the favorites', async () => {
    const { status, body } = await request('GET', '/libraries?favorites=true')

    expect(status).toBe(200)
    expect(ids(body)).toEqual([secondLibraryId, thirdLibraryId])
    expect(body.paginationInfo.total).toBe(2)
  })

  it('GET /libraries?favorites=true - should combine with the search', async () => {
    const { status, body } = await request('GET', '/libraries?favorites=true&search=third')

    expect(status).toBe(200)
    expect(ids(body)).toEqual([thirdLibraryId])
    expect(body.paginationInfo.total).toBe(1)
  })

  it('PATCH /libraries/:id - should unmark a favorite', async () => {
    const { status, body } = await setFavorite(secondLibraryId, false)
    expect(status).toBe(200)
    expect(body.results.attributes.isFavorite).toBe(false)

    const list = await request('GET', '/libraries?favorites=true')
    expect(ids(list.body)).toEqual([thirdLibraryId])
  })

  it('PATCH /libraries/:id - editing the name should keep the favorite', async () => {
    const { status, body } = await request('PATCH', `/libraries/${thirdLibraryId}`, { name: 'renamed third library' })

    expect(status).toBe(200)
    expect(body.results.attributes.isFavorite).toBe(true)
  })

  it.each(['false', 'yes', '1'])('GET /libraries?favorites=%s - should fail', async (value) => {
    const { status, body } = await request('GET', `/libraries?favorites=${value}`)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it('PATCH /libraries/:id - should fail with a non boolean isFavorite', async () => {
    const { status, body } = await request('PATCH', `/libraries/${firstLibraryId}`, { isFavorite: 'true' })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it('PATCH /libraries/:id - should fail to mark a library of another user', async () => {
    const { status } = await setFavorite(otherUserLibraryId, true)

    expect(status).toBe(403)
    const stored = await librariesDao.collection.findOne({ _id: otherUserLibraryId })
    expect(stored?.isFavorite).toBe(false)
  })
})
