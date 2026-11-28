import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ulid } from 'ulid'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import notificationsDao from '../../resources/notifications/notifications.dao.js'
import notificationTemplatesDao from '../../resources/notification-templates/notification-templates.dao.js'
import { DBNotification } from '../../resources/notifications/notifications.interfaces.js'
import { NotificationType } from '../../resources/notifications/notifications.types.js'
import robohashApi from '../../resources/users/robohash/robohash.api.js'
import usersDao from '../../resources/users/users.dao.js'
import { Role } from '../../resources/users/users.interfaces.js'

const ownerId = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const guestId = '01J9XDBGCX8QM0GW67T7QGKS41'
const adminId = '01J9BK7YX0D5NHHBN70Q4N7P69'
const guestEmail = 'user02@email.com'
// Fixture libraries of user01
const firstLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const secondLibraryId = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'

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

async function invite (libraryId = firstLibraryId, email = guestEmail): Promise<{ status: number, body: any }> {
  return await request('POST', `/libraries/${libraryId}/members`, ownerAuth, { email })
}

async function listNotifications (auth = guestAuth, query = ''): Promise<{ status: number, body: any }> {
  return await request('GET', `/notifications${query}`, auth)
}

async function insertNotification (overrides: Partial<DBNotification> = {}): Promise<DBNotification> {
  const welcome: DBNotification = {
    _id: ulid(),
    userId: guestId,
    type: NotificationType.Welcome,
    title: 'Hola, {{userName}}',
    data: {},
    values: { userName: 'user02' },
    readAt: null,
    createdAt: new Date()
  }
  // The overrides of a library-shared notification bring its type and its data along
  const notification: DBNotification = Object.assign(welcome, overrides)
  await notificationsDao.collection.insertOne(notification)
  return notification
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  // The test server does not go through App, and mongo.clean() drops the indexes
  await notificationsDao.init()
})

beforeEach(async () => {
  await notificationsDao.collection.deleteMany({})
  await notificationTemplatesDao.collection.deleteMany({})
  await librariesDao.collection.updateMany({}, { $set: { members: [] } })
  await usersDao.collection.updateMany({}, { $set: { notificationPreferences: { libraryShared: true } } })
})

afterAll(async () => {
  await mongo.clean()
})

describe('welcome notification', () => {
  it('should be created along with a user from the backoffice, with the current template', async () => {
    const getImage = vi.spyOn(robohashApi, 'getImage').mockRejectedValue(new Error('no network in tests'))
    try {
      await request('PUT', '/notification-templates/welcome', adminAuth, { title: 'Bienvenido a Bibliopolis, {{userName}}' })
      const { status, body } = await request('POST', '/users', adminAuth, { name: 'Juan', email: 'juan@email.com' })
      expect(status).toBe(201)

      const userAuth = testUtils.buildAuthorizationHeader(makeJwt(body.results.id, Role.Regular))
      const list = await listNotifications(userAuth)
      expect(list.status).toBe(200)
      expect(list.body).toEqual({
        results: [{
          type: 'notifications',
          id: expect.any(String),
          attributes: {
            type: 'welcome',
            title: 'Bienvenido a Bibliopolis, Juan',
            data: {},
            readAt: null,
            createdAt: expect.any(String)
          }
        }],
        paginationInfo: { skip: 0, limit: 10, total: 1 }
      })
    } finally {
      getImage.mockRestore()
    }
  })

  it('should not exist for the users that were already there', async () => {
    const { body } = await listNotifications()
    expect(body.results).toEqual([])
  })

  it('should give new users the default preferences', async () => {
    const getImage = vi.spyOn(robohashApi, 'getImage').mockRejectedValue(new Error('no network in tests'))
    try {
      const { body } = await request('POST', '/users', adminAuth, { name: 'Ana', email: 'ana@email.com' })
      expect(body.results.attributes.notificationPreferences).toEqual({ libraryShared: true })
    } finally {
      getImage.mockRestore()
    }
  })
})

describe('library-shared notification', () => {
  it('should be created when a library is shared, pointing to it', async () => {
    expect((await invite()).status).toBe(201)

    const { body } = await listNotifications()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].attributes).toEqual({
      type: 'library-shared',
      title: 'user01 ha compartido «sample first library» contigo',
      data: { libraryId: firstLibraryId, ownerId },
      readAt: null,
      createdAt: expect.any(String)
    })
  })

  it('should not be created when the member turned it off', async () => {
    const preferences = await request('PATCH', '/users/me/notification-preferences', guestAuth, { libraryShared: false })
    expect(preferences.status).toBe(200)
    expect(preferences.body.results.attributes.notificationPreferences).toEqual({ libraryShared: false })

    expect((await invite()).status).toBe(201)
    expect((await listNotifications()).body.results).toEqual([])
  })

  it('should not be created when the invitation fails', async () => {
    expect((await invite()).status).toBe(201)
    expect((await invite()).status).toBe(409)

    expect(await notificationsDao.collection.countDocuments({ userId: guestId })).toBe(1)
  })

  it('should show the current names of the owner and the library', async () => {
    await invite()
    await usersDao.collection.updateOne({ _id: ownerId }, { $set: { name: 'Ana' } })
    await librariesDao.collection.updateOne({ _id: firstLibraryId }, { $set: { name: 'Novela negra' } })

    try {
      const { body } = await listNotifications()
      expect(body.results[0].attributes.title).toBe('Ana ha compartido «Novela negra» contigo')
    } finally {
      await usersDao.collection.updateOne({ _id: ownerId }, { $set: { name: 'user01' } })
      await librariesDao.collection.updateOne({ _id: firstLibraryId }, { $set: { name: 'sample first library' } })
    }
  })

  it('should fall back to the values of when it was created if what they come from is gone', async () => {
    await insertNotification({
      type: NotificationType.LibraryShared,
      title: '{{ownerName}} ha compartido «{{libraryName}}» contigo',
      data: { libraryId: ulid(), ownerId: ulid() },
      values: { userName: 'user02', ownerName: 'Ana', libraryName: 'Borrada' }
    })

    const { body } = await listNotifications()
    expect(body.results[0].attributes.title).toBe('Ana ha compartido «Borrada» contigo')
  })

  it.each([
    ['the owner removes the member', async () => await request('DELETE', `/libraries/${firstLibraryId}/members/${guestId}`, ownerAuth)],
    ['the member leaves the library', async () => await request('DELETE', `/shared-libraries/${firstLibraryId}`, guestAuth)]
  ])('should be removed when %s, and only that one', async (_, removeAccess) => {
    await invite(firstLibraryId)
    await invite(secondLibraryId)

    expect((await removeAccess()).status).toBe(204)

    const { body } = await listNotifications()
    expect(body.results.map((notification: any) => notification.attributes.data.libraryId)).toEqual([secondLibraryId])
  })

  it('should be removed for every member when the library is deleted', async () => {
    const library = await librariesDao.create({ name: 'to be deleted' }, ownerId)
    await invite(library.id)
    await invite(firstLibraryId)

    expect((await request('DELETE', `/libraries/${library.id}`, ownerAuth)).status).toBe(204)

    const { body } = await listNotifications()
    expect(body.results.map((notification: any) => notification.attributes.data.libraryId)).toEqual([firstLibraryId])
  })
})

describe('GET /notifications', () => {
  it('should list only the notifications of the user, newest first, and filter the unread ones', async () => {
    const older = await insertNotification({ createdAt: new Date('2026-01-01'), readAt: new Date('2026-01-02') })
    const newer = await insertNotification({ createdAt: new Date('2026-02-01') })
    await insertNotification({ userId: ownerId, values: { userName: 'user01' } })

    const all = await listNotifications()
    expect(all.body.results.map((notification: any) => notification.id)).toEqual([newer._id, older._id])
    expect(all.body.paginationInfo.total).toBe(2)

    const unread = await listNotifications(guestAuth, '?unread=true')
    expect(unread.body.results.map((notification: any) => notification.id)).toEqual([newer._id])
    expect(unread.body.paginationInfo.total).toBe(1)
  })

  it('should paginate', async () => {
    for (let day = 1; day <= 3; day++) {
      await insertNotification({ createdAt: new Date(`2026-01-0${day}`) })
    }

    const { body } = await listNotifications(guestAuth, '?skip=1&limit=1')
    expect(body.results).toHaveLength(1)
    expect(body.paginationInfo).toEqual({ skip: 1, limit: 1, total: 3 })
  })

  it('should keep the title of the template it was created with', async () => {
    await insertNotification({ title: 'Hola, {{userName}}' })
    await request('PUT', '/notification-templates/welcome', adminAuth, { title: 'Adiós, {{userName}}' })

    const { body } = await listNotifications()
    expect(body.results[0].attributes.title).toBe('Hola, user02')
  })

  it('should reject an invalid filter', async () => {
    const { status } = await listNotifications(guestAuth, '?unread=yes')
    expect(status).toBe(400)
  })
})

describe('GET /notifications/unread-count', () => {
  it('should count the unread notifications of the user only', async () => {
    await insertNotification()
    await insertNotification()
    await insertNotification({ readAt: new Date() })
    await insertNotification({ userId: ownerId })

    const { status, body } = await request('GET', '/notifications/unread-count', guestAuth)
    expect(status).toBe(200)
    expect(body).toEqual({ results: { type: 'notifications-unread-count', attributes: { count: 2 } } })
  })
})

describe('PATCH /notifications/:id', () => {
  it('should mark a notification as read and keep the first date', async () => {
    const notification = await insertNotification()

    const first = await request('PATCH', `/notifications/${notification._id}`, guestAuth, { read: true })
    expect(first.status).toBe(200)
    expect(first.body.results.attributes.title).toBe('Hola, user02')
    const { readAt } = first.body.results.attributes
    expect(readAt).toEqual(expect.any(String))

    const again = await request('PATCH', `/notifications/${notification._id}`, guestAuth, { read: true })
    expect(again.body.results.attributes.readAt).toBe(readAt)
  })

  it('should mark a notification as unread', async () => {
    const notification = await insertNotification({ readAt: new Date() })

    const { body } = await request('PATCH', `/notifications/${notification._id}`, guestAuth, { read: false })
    expect(body.results.attributes.readAt).toBe(null)
  })

  it.each([
    ['of another user', async () => (await insertNotification({ userId: ownerId }))._id],
    ['that does not exist', async () => ulid()]
  ])('should not find a notification %s', async (_, id) => {
    const { status, body } = await request('PATCH', `/notifications/${await id()}`, guestAuth, { read: true })
    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
  })

  it.each([
    ['no body', undefined],
    ['a read that is not a boolean', { read: 'yes' }],
    ['other fields', { read: true, title: 'changed' }]
  ])('should reject %s', async (_, body) => {
    const notification = await insertNotification()
    const { status } = await request('PATCH', `/notifications/${notification._id}`, guestAuth, body)
    expect(status).toBe(400)
  })
})

describe('POST /notifications/read-all', () => {
  it('should mark every notification of the user as read, and no other', async () => {
    const read = await insertNotification({ readAt: new Date('2026-01-01') })
    await insertNotification()
    await insertNotification()
    const others = await insertNotification({ userId: ownerId })

    const { status } = await request('POST', '/notifications/read-all', guestAuth)
    expect(status).toBe(204)

    expect(await notificationsDao.collection.countDocuments({ userId: guestId, readAt: null })).toBe(0)
    expect((await notificationsDao.collection.findOne({ _id: read._id }))?.readAt).toEqual(new Date('2026-01-01'))
    expect((await notificationsDao.collection.findOne({ _id: others._id }))?.readAt).toBe(null)
  })
})

describe('PATCH /users/me/notification-preferences', () => {
  it.each([
    ['no libraryShared', {}],
    ['a libraryShared that is not a boolean', { libraryShared: 'no' }],
    ['other preferences', { libraryShared: true, welcome: false }]
  ])('should reject %s', async (_, body) => {
    const { status } = await request('PATCH', '/users/me/notification-preferences', guestAuth, body)
    expect(status).toBe(400)
  })

  it('should be forbidden to an admin', async () => {
    const { status } = await request('PATCH', '/users/me/notification-preferences', adminAuth, { libraryShared: false })
    expect(status).toBe(403)
  })

  it('should be returned by GET /auth/me', async () => {
    await request('PATCH', '/users/me/notification-preferences', guestAuth, { libraryShared: false })

    const { body } = await request('GET', '/auth/me', guestAuth)
    expect(body.results.attributes.notificationPreferences).toEqual({ libraryShared: false })
  })
})

describe('permissions', () => {
  it.each([
    ['GET', '/notifications'],
    ['GET', '/notifications/unread-count'],
    ['POST', '/notifications/read-all'],
    ['PATCH', `/notifications/${ulid()}`]
  ])('should forbid %s %s to an admin', async (method, path) => {
    const { status } = await request(method, path, adminAuth, method === 'PATCH' ? { read: true } : undefined)
    expect(status).toBe(403)
  })

  it('should require a token', async () => {
    const { status } = await request('GET', '/notifications', null)
    expect(status).toBe(401)
  })
})
