import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ulid } from 'ulid'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import tagsDao from '../../resources/tags/tags.dao.js'
import { MAX_TAGS_PER_USER } from '../../resources/tags/tags.constants.js'
import { ApiRestErrorCode } from '../../error/types.js'

// Fixtures: user01 owns Novela and Prestados, user02 owns Ensayo, Clásicos is global
const user01Id = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const user02Id = '01J9XDBGCX8QM0GW67T7QGKS41'
const novelaId = '01JZTAG0000000000000000001'
const prestadosId = '01JZTAG0000000000000000002'
const ensayoId = '01JZTAG0000000000000000003'
const clasicosId = '01JZTAG0000000000000000004'
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'
const thirdLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WFA'
const user02LibraryId = '01J9XDD1NAFHP0159FYT245D8X'

let user01Auth: string
let user02Auth: string

async function request (method: string, path: string, body?: object, auth = user01Auth): Promise<{ status: number, body: any }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  return { status: response.status, body: text !== '' ? JSON.parse(text) : null }
}

function ids (body: any): string[] {
  return body.results.map((result: any) => result.id)
}

async function storedTagIds (libraryId: string): Promise<string[] | undefined> {
  return (await librariesDao.collection.findOne({ _id: libraryId }))?.tagIds
}

// The test server does not go through App, and mongo.clean() drops the indexes, so each suite creates them
beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks, MockDataSet.Tags)
  await librariesDao.init()
  await tagsDao.init()
  user01Auth = testUtils.buildAuthorizationHeader((await testUtils.login('user01@email.com', 'Password123!')).accessToken)
  user02Auth = testUtils.buildAuthorizationHeader((await testUtils.login('user02@email.com', 'Password123!')).accessToken)
})

afterAll(async () => {
  await mongo.clean()
})

describe('tags', () => {
  it('GET /tags - should fail without token', async () => {
    const response = await fetch(new URL('/tags', testUtils.TESTS_BASE_URL))
    expect(response.status).toBe(401)
  })

  it('GET /tags - should list the user tags and the global ones, by name', async () => {
    const { status, body } = await request('GET', '/tags')

    expect(status).toBe(200)
    expect(ids(body)).toEqual([clasicosId, novelaId, prestadosId])
    expect(body.paginationInfo.total).toBe(3)
    expect(body.results[0].attributes).toEqual({
      name: 'Clásicos',
      color: 'purple',
      userId: null,
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z'
    })
  })

  it('POST /tags - should create a personal tag with the spaces normalized', async () => {
    const { status, body } = await request('POST', '/tags', { name: '  Novela   negra ', color: 'red' })

    expect(status).toBe(201)
    expect(body.results.attributes).toMatchObject({ name: 'Novela negra', color: 'red', userId: user01Id })
    expect(body.results.attributes.normalizedName).toBeUndefined()
  })

  it('POST /tags - should fail with the name of an own tag, ignoring case', async () => {
    const { status, body } = await request('POST', '/tags', { name: 'NOVELA', color: 'red' })

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ConflictError)
    expect(body.message).toBe('there is already a tag with name NOVELA')
  })

  it('POST /tags - should fail with the name of a global tag', async () => {
    const { status, body } = await request('POST', '/tags', { name: 'clásicos', color: 'red' })

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ConflictError)
  })

  it('POST /tags - should allow the name of another user tag', async () => {
    const { status } = await request('POST', '/tags', { name: 'Ensayo', color: 'teal' })

    expect(status).toBe(201)
  })

  it('POST /tags - should create only one tag when the same one is sent twice at once', async () => {
    const responses = await Promise.all([
      request('POST', '/tags', { name: 'Poesía', color: 'pink' }),
      request('POST', '/tags', { name: 'poesía', color: 'pink' })
    ])

    expect(responses.map(response => response.status).sort((a, b) => a - b)).toEqual([201, 409])
    expect(await tagsDao.collection.countDocuments({ userId: user01Id, normalizedName: 'poesía' })).toBe(1)
  })

  it.each([
    ['a name too short', { name: 'a', color: 'red' }],
    ['a name too long', { name: 'a'.repeat(21), color: 'red' }],
    ['a blank name', { name: '     ', color: 'red' }],
    ['a colour outside the palette', { name: 'Viajes', color: '#ff0000' }],
    ['no colour', { name: 'Viajes' }]
  ])('POST /tags - should fail with %s', async (_case, body) => {
    const response = await request('POST', '/tags', body)

    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it('PATCH /tags/:id - should rename a tag and change its colour', async () => {
    const { status, body } = await request('PATCH', `/tags/${prestadosId}`, { name: 'Prestados a amigos', color: 'yellow' })

    expect(status).toBe(200)
    expect(body.results.attributes).toMatchObject({ name: 'Prestados a amigos', color: 'yellow' })
    expect((await tagsDao.collection.findOne({ _id: prestadosId }))?.normalizedName).toBe('prestados a amigos')
  })

  it('PATCH /tags/:id - should allow changing only the case of its own name', async () => {
    const { status, body } = await request('PATCH', `/tags/${novelaId}`, { name: 'NOVELA' })
    expect(status).toBe(200)
    expect(body.results.attributes).toMatchObject({ name: 'NOVELA', color: 'green' })

    await request('PATCH', `/tags/${novelaId}`, { name: 'Novela' })
  })

  it('PATCH /tags/:id - should fail with the name of another own tag', async () => {
    const { status } = await request('PATCH', `/tags/${prestadosId}`, { name: 'novela' })

    expect(status).toBe(409)
  })

  it.each([
    ['a global tag', clasicosId, 403],
    ['a tag of another user', ensayoId, 403],
    ['a tag that does not exist', ulid(), 404]
  ])('PATCH /tags/:id - should fail to change %s', async (_case, tagId, status) => {
    const response = await request('PATCH', `/tags/${tagId}`, { color: 'red' })

    expect(response.status).toBe(status)
  })

  it.each([
    ['a global tag', clasicosId, 403],
    ['a tag of another user', ensayoId, 403],
    ['a tag that does not exist', ulid(), 404]
  ])('DELETE /tags/:id - should fail to delete %s', async (_case, tagId, status) => {
    const response = await request('DELETE', `/tags/${tagId}`)

    expect(response.status).toBe(status)
    expect(await tagsDao.collection.countDocuments({ _id: tagId })).toBe(status === 404 ? 0 : 1)
  })

  it(`POST /tags - should fail when the user already has ${MAX_TAGS_PER_USER} tags`, async () => {
    // user02 has one tag: fill up to the limit
    const now = new Date()
    await tagsDao.collection.insertMany(Array.from({ length: MAX_TAGS_PER_USER - 1 }, (_, i) => ({
      _id: ulid(),
      name: `Tag ${i}`,
      normalizedName: `tag ${i}`,
      color: 'grey' as const,
      userId: user02Id,
      createdAt: now,
      updatedAt: now
    })))

    const { status, body } = await request('POST', '/tags', { name: 'One more', color: 'red' }, user02Auth)

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.TagLimitReached)
    expect(body.message).toBe(`a user cannot have more than ${MAX_TAGS_PER_USER} tags`)

    await tagsDao.collection.deleteMany({ userId: user02Id, normalizedName: { $regex: '^tag ' } })
  })
})

describe('library tags', () => {
  it('POST /libraries - should create a library with tags, or with none', async () => {
    const withTags = await request('POST', '/libraries', { name: 'tagged library', description: 'description', tagIds: [novelaId, clasicosId] })
    const withoutTags = await request('POST', '/libraries', { name: 'untagged library', description: 'description' })

    expect(withTags.status).toBe(201)
    expect(withTags.body.results.attributes.tagIds).toEqual([novelaId, clasicosId])
    expect(withoutTags.status).toBe(201)
    expect(await storedTagIds(withoutTags.body.results.id)).toEqual([])

    await request('DELETE', `/libraries/${String(withTags.body.results.id)}`)
    await request('DELETE', `/libraries/${String(withoutTags.body.results.id)}`)
  })

  it('PATCH /libraries/:id - should replace the tags of a library', async () => {
    await request('PATCH', `/libraries/${firstLibraryId}`, { tagIds: [novelaId] })
    const { status, body } = await request('PATCH', `/libraries/${firstLibraryId}`, { tagIds: [novelaId, prestadosId] })
    await request('PATCH', `/libraries/${secondLibraryId}`, { tagIds: [novelaId, clasicosId] })

    expect(status).toBe(200)
    expect(body.results.attributes.tagIds).toEqual([novelaId, prestadosId])
    expect(await storedTagIds(secondLibraryId)).toEqual([novelaId, clasicosId])
  })

  it('PATCH /libraries/:id - editing only the name should keep the tags', async () => {
    const { status, body } = await request('PATCH', `/libraries/${firstLibraryId}`, { name: 'first library renamed' })

    expect(status).toBe(200)
    expect(body.results.attributes.tagIds).toEqual([novelaId, prestadosId])
  })

  it.each([
    ['a tag of another user', [ensayoId]],
    ['a tag that does not exist', [novelaId, ulid()]]
  ])('PATCH /libraries/:id - should fail to assign %s', async (_case, tagIds) => {
    const { status, body } = await request('PATCH', `/libraries/${thirdLibraryId}`, { tagIds })

    expect(status).toBe(404)
    expect(body.message).toBe('tag not found')
    expect(await storedTagIds(thirdLibraryId)).toEqual([])
  })

  it('POST /libraries - should fail to create a library with a tag of another user', async () => {
    const { status } = await request('POST', '/libraries', { name: 'stolen tag', description: 'description', tagIds: [ensayoId] })

    expect(status).toBe(404)
    expect(await librariesDao.collection.countDocuments({ name: 'stolen tag' })).toBe(0)
  })

  it.each([
    ['more than 5 tags', Array.from({ length: 6 }, () => ulid())],
    ['repeated tags', [novelaId, novelaId]],
    ['an invalid id', ['not-an-id']]
  ])('PATCH /libraries/:id - should fail with %s', async (_case, tagIds) => {
    const { status, body } = await request('PATCH', `/libraries/${thirdLibraryId}`, { tagIds })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it.each([
    ['one tag', `tags=${novelaId}`, [firstLibraryId, secondLibraryId]],
    ['several tags, which must all match', `tags=${novelaId},${prestadosId}`, [firstLibraryId]],
    ['a global tag', `tags=${clasicosId}`, [secondLibraryId]],
    ['tags and search', `tags=${novelaId}&search=second`, [secondLibraryId]],
    ['tags and favorites', `tags=${novelaId}&favorites=true`, []],
    ['a tag of another user', `tags=${ensayoId}`, []],
    ['an empty value', 'tags=', [firstLibraryId, secondLibraryId, thirdLibraryId]]
  ])('GET /libraries?tags - should filter by %s', async (_case, query, expected) => {
    const { status, body } = await request('GET', `/libraries?${query}`)

    expect(status).toBe(200)
    expect(ids(body)).toEqual(expected)
    expect(body.paginationInfo.total).toBe(expected.length)
  })

  it.each([
    ['more than 5 tags', `tags=${Array.from({ length: 6 }, () => ulid()).join(',')}`],
    ['an invalid id', 'tags=not-an-id'],
    ['a repeated param', `tags=${novelaId}&tags=${prestadosId}`]
  ])('GET /libraries?tags - should fail with %s', async (_case, query) => {
    const { status, body } = await request('GET', `/libraries?${query}`)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it('DELETE /tags/:id - should delete the tag and remove it from the libraries of the user', async () => {
    // user02 has a library with its own tag: it must not be touched
    await request('PATCH', `/libraries/${user02LibraryId}`, { tagIds: [ensayoId] }, user02Auth)

    const { status } = await request('DELETE', `/tags/${novelaId}`)

    expect(status).toBe(204)
    expect(await tagsDao.collection.countDocuments({ _id: novelaId })).toBe(0)
    expect(await storedTagIds(firstLibraryId)).toEqual([prestadosId])
    expect(await storedTagIds(secondLibraryId)).toEqual([clasicosId])
    expect(await storedTagIds(user02LibraryId)).toEqual([ensayoId])
  })
})
