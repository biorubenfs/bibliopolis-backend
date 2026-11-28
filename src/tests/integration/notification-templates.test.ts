import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import notificationTemplatesDao from '../../resources/notification-templates/notification-templates.dao.js'
import { TEMPLATE_TITLE_MAX_LENGTH } from '../../resources/notifications/notifications.types.js'
import { Role } from '../../resources/users/users.interfaces.js'

const adminId = '01J9BK7YX0D5NHHBN70Q4N7P69'
const adminAuth = testUtils.buildAuthorizationHeader(makeJwt(adminId, Role.Admin))
const regularAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BHWZ8N4B1JBSAFCBKQGERS', Role.Regular))

async function request (method: string, path: string, auth: string, body?: object): Promise<{ status: number, body: any }> {
  const response = await fetch(new URL(path, testUtils.TESTS_BASE_URL), {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: body != null ? JSON.stringify(body) : undefined
  })
  return { status: response.status, body: await response.json() }
}

async function putTemplate (type: string, title: unknown, auth = adminAuth): Promise<{ status: number, body: any }> {
  return await request('PUT', `/notification-templates/${type}`, auth, { title })
}

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Users)
})

beforeEach(async () => {
  await notificationTemplatesDao.collection.deleteMany({})
})

afterAll(async () => {
  await mongo.clean()
})

describe('GET /notification-templates', () => {
  it('should list every type with its default template and its variables', async () => {
    const { status, body } = await request('GET', '/notification-templates', adminAuth)

    expect(status).toBe(200)
    expect(body).toEqual({
      results: [
        {
          type: 'notification-templates',
          id: 'welcome',
          attributes: {
            title: 'Te damos la bienvenida a Bibliopolis, {{userName}}',
            defaultTitle: 'Te damos la bienvenida a Bibliopolis, {{userName}}',
            variables: ['userName'],
            optional: false,
            updatedAt: null,
            updatedBy: null
          }
        },
        {
          type: 'notification-templates',
          id: 'library-shared',
          attributes: {
            title: '{{ownerName}} ha compartido «{{libraryName}}» contigo',
            defaultTitle: '{{ownerName}} ha compartido «{{libraryName}}» contigo',
            variables: ['userName', 'ownerName', 'libraryName'],
            optional: true,
            updatedAt: null,
            updatedBy: null
          }
        }
      ],
      paginationInfo: { skip: 0, limit: 2, total: 2 }
    })
  })

  it('should show the templates changed by an admin', async () => {
    await putTemplate('welcome', 'Bienvenido a Bibliopolis')

    const { body } = await request('GET', '/notification-templates', adminAuth)
    expect(body.results[0].attributes).toMatchObject({ title: 'Bienvenido a Bibliopolis', updatedBy: adminId, updatedAt: expect.any(String) })
  })
})

describe('PUT /notification-templates/:type', () => {
  it('should change the template, trimmed, and remember who did it', async () => {
    const { status, body } = await putTemplate('library-shared', '  {{ownerName}} te invita a «{{libraryName}}», {{userName}}  ')

    expect(status).toBe(200)
    expect(body.results.id).toBe('library-shared')
    expect(body.results.attributes).toMatchObject({
      title: '{{ownerName}} te invita a «{{libraryName}}», {{userName}}',
      updatedBy: adminId
    })
    expect(await notificationTemplatesDao.collection.countDocuments()).toBe(1)
  })

  it('should accept a template without variables, or with one repeated', async () => {
    expect((await putTemplate('welcome', 'Bienvenido')).status).toBe(200)
    expect((await putTemplate('welcome', '{{userName}}, {{userName}}')).status).toBe(200)
  })

  it.each([
    ['a variable of another type', '{{libraryName}} para ti'],
    ['an unknown variable', 'Hola, {{name}}'],
    ['a variable with spaces', 'Hola, {{ userName }}'],
    ['a variable that is not closed', 'Hola, {{userName'],
    ['braces left over', 'Hola, {{userName}}}}']
  ])('should reject %s', async (_, title) => {
    const { status, body } = await putTemplate('welcome', title)

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.InvalidTemplateVariable)
    expect(await notificationTemplatesDao.collection.countDocuments()).toBe(0)
  })

  it('should name the unknown variables and the available ones', async () => {
    const { body } = await putTemplate('welcome', '{{libraryName}} y {{name}} y {{name}}')
    expect(body.message).toBe('unknown variables: libraryName, name; available: userName')
  })

  it.each([
    ['an empty title', '   '],
    ['a title too long', 'a'.repeat(TEMPLATE_TITLE_MAX_LENGTH + 1)],
    ['a title that is not a string', 42]
  ])('should reject %s', async (_, title) => {
    const { status } = await putTemplate('welcome', title)
    expect(status).toBe(400)
  })

  it('should not find an unknown type', async () => {
    const { status, body } = await putTemplate('unknown', 'Hola')
    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
  })
})

describe('permissions', () => {
  it.each([
    ['GET', '/notification-templates'],
    ['PUT', '/notification-templates/welcome']
  ])('should forbid %s %s to a regular user', async (method, path) => {
    const { status } = await request(method, path, regularAuth, method === 'PUT' ? { title: 'Hola' } : undefined)
    expect(status).toBe(403)
  })
})
