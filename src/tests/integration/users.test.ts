import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'
import usersDao from '../../resources/users/users.dao.js'
import usersService from '../../resources/users/users.service.js'
import robohashApi from '../../resources/users/robohash/robohash.api.js'
import { ApiRestErrorCode } from '../../error/types.js'
import config from '../../config.js'
import { Role } from '../../resources/users/users.interfaces.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import testUtils from '../utils/utils.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import bcrypt from 'bcryptjs'
import { newPasswordSchema } from '../../resources/users/users.schemas.js'

const usersURL = new URL('/users', testUtils.TESTS_BASE_URL)

const adminToken = makeJwt('01J9BK7YX0D5NHHBN70Q4N7P69', Role.Admin)
const adminAuthHeader = testUtils.buildAuthorizationHeader(adminToken)

const token = makeJwt('01J9BHWZ8N4B1JBSAFCBKQGERS', Role.Regular)
const authHeader = testUtils.buildAuthorizationHeader(token)

beforeAll(async () => {
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await usersDao.init()
})

afterAll(async () => {
  await mongo.clean()
})

describe('users tests', async () => {
  it('default user admin should have been created', async () => {
    const response = await usersDao.collection.findOne(
      {
        name: config.defaultAdmin.name,
        role: Role.Admin
      })

    expect(response).to.be.not.equals(null)
    expect(response).to.have.property('name').equals(config.defaultAdmin.name)
  })

  it('POST /users - should create a regular user with a generated password', async () => {
    const response = await fetch(usersURL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminAuthHeader
      },
      method: 'POST',
      body: JSON.stringify({ name: 'user03', email: '  User03@Email.com ' })
    })
    const body = await response.json()

    expect(response.status).equals(201)
    expect(body.results.attributes).toMatchObject({ name: 'user03', email: 'user03@email.com', role: Role.Regular })
    expect(body.results.attributes).not.toHaveProperty('password')
    const { password } = body.meta
    expect(newPasswordSchema.safeParse(password).success).equals(true)

    // Only the hash is stored, and the generated password is the one that logs in
    const stored = await usersDao.collection.findOne({ _id: body.results.id })
    expect(stored?.password).not.equals(password)
    expect(await bcrypt.compare(password, stored?.password ?? '')).equals(true)
    const { accessToken } = await testUtils.login('USER03@email.com', password)
    expect(accessToken).toBeTypeOf('string')
  })

  it.each([
    ['a password', { name: 'foo', email: 'foo@email.com', password: 'password' }],
    ['a role', { name: 'foo', email: 'foo@email.com', role: Role.Admin }],
    ['no email', { name: 'foo' }],
    ['an invalid email', { name: 'foo', email: 'foo' }],
    ['an empty name', { name: ' ', email: 'foo@email.com' }]
  ])('POST /users - should reject a body with %s', async (_, body) => {
    const response = await fetch(usersURL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminAuthHeader
      },
      method: 'POST',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(400)
  })

  it('POST /users - should reject an email already registered, whatever its case', async () => {
    const response = await fetch(usersURL, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminAuthHeader
      },
      method: 'POST',
      body: JSON.stringify({ name: 'user01', email: 'USER01@email.com' })
    })

    expect(response.status).equals(409)
  })

  it('POST /users - should create only one user when the same email is sent twice at once', async () => {
    const send = async (): Promise<Response> => await fetch(usersURL, {
      headers: { 'Content-Type': 'application/json', Authorization: adminAuthHeader },
      method: 'POST',
      body: JSON.stringify({ name: 'twice', email: 'twice@email.com' })
    })

    const responses = await Promise.all([send(), send()])

    expect(responses.map(response => response.status).sort((a, b) => a - b)).toEqual([201, 409])
    expect(await usersDao.collection.countDocuments({ email: 'twice@email.com' })).equals(1)
  })

  it('POST /users - should be forbidden to a regular user', async () => {
    const response = await fetch(usersURL, {
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      method: 'POST',
      body: JSON.stringify({ name: 'foo', email: 'foo@email.com' })
    })
    const body = await response.json()

    expect(response.status).equals(403)
    expect(body.errorCode).equals(ApiRestErrorCode.PermissionError)
  })

  it('POST /users/:id/password-reset - should give a regular user a new generated password', async () => {
    const userId = '01J9XDBGCX8QM0GW67T7QGKS41'
    const response = await fetch(new URL(`/users/${userId}/password-reset`, usersURL), {
      headers: { Authorization: adminAuthHeader },
      method: 'POST'
    })
    const body = await response.json()

    expect(response.status).equals(200)
    expect(body.results.id).equals(userId)
    const { password } = body.meta
    expect(newPasswordSchema.safeParse(password).success).equals(true)
    const stored = await usersDao.collection.findOne({ _id: userId })
    expect(await bcrypt.compare(password, stored?.password ?? '')).equals(true)
  })

  it.each([
    ['the user is an admin', '01J9BK7YX0D5NHHBN70Q4N7P69', adminAuthHeader, 403],
    ['the requester is a regular user', '01J9XDBGCX8QM0GW67T7QGKS41', authHeader, 403],
    ['the user does not exist', '01J9XDBGCX8QM0GW67T7QGKXXX', adminAuthHeader, 404]
  ])('POST /users/:id/password-reset - should fail when %s', async (_, userId, auth, status) => {
    const before = await usersDao.collection.findOne({ _id: userId })

    const response = await fetch(new URL(`/users/${userId}/password-reset`, usersURL), {
      headers: { Authorization: auth },
      method: 'POST'
    })

    expect(response.status).equals(status)
    expect((await usersDao.collection.findOne({ _id: userId }))?.password).equals(before?.password)
  })

  it.each([
    ['part of the name', 'USER0', ['user03', 'user02', 'user01']],
    ['part of the email', 'twice@', ['twice']],
    ['regex characters, matched literally', '.*', []]
  ])('GET /users?search= - should find the users by %s, newest first', async (_, search, names) => {
    const response = await fetch(new URL(`/users?search=${encodeURIComponent(search)}`, usersURL), {
      headers: { Authorization: adminAuthHeader }
    })
    const body = await response.json()

    expect(response.status).equals(200)
    expect(body.results.map((user: any) => user.attributes.name)).toEqual(names)
    expect(body.paginationInfo.total).equals(names.length)
  })

  it('GET /users -  /users should get a user', async () => {
    const usersMeUrl = new URL('/users/me', usersURL)
    const response = await fetch(usersMeUrl, {
      headers: {
        Authorization: adminAuthHeader
      },
      method: 'GET'
    })

    expect(response.status).equals(200)
  })

  it('PATCH /users/me/password - should update user password', async () => {
    const updatePasswordUrl = new URL('/users/me/password', usersURL)

    const body = {
      currentPassword: 'Password123!',
      newPassword: 'Password123$'
    }

    const response = await fetch(updatePasswordUrl, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(200)
  })

  it('PATCH /users/me/password - should fail update user password with wrong current password', async () => {
    const updatePasswordUrl = new URL('/users/me/password', usersURL)

    const body = {
      currentPassword: 'PasswordFake',
      newPassword: 'Password123$'
    }

    const response = await fetch(updatePasswordUrl, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(400)
  })

  it.each([
    ['too short', 'a'.repeat(5)],
    ['too long', 'a'.repeat(21)]
  ])('PATCH /users/me/password - should reject a new password that is %s', async (_, newPassword) => {
    const response = await fetch(new URL('/users/me/password', usersURL), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'Password123$', newPassword })
    })

    expect(response.status).equals(400)
    expect(await response.json()).to.have.property('errorCode').not.equals(ApiRestErrorCode.InvalidPassword)
  })

  it('updateUser should save the name with the default avatar when RoboHash fails', async () => {
    // The HTTP server runs in another process, so the failure can only be simulated on the service
    const getImage = vi.spyOn(robohashApi, 'getImage').mockRejectedValue(new Error('RoboHash is down'))

    try {
      await usersService.updateUser('01J9BHWZ8N4B1JBSAFCBKQGERS', { name: 'no-robohash' })
    } finally {
      getImage.mockRestore()
    }

    const user = await usersDao.findById('01J9BHWZ8N4B1JBSAFCBKQGERS')
    expect(user?.name).equals('no-robohash')
    expect(user?.avatar).equals('')
  })

  it('PATCH /users/me should update a user', async () => {
    const updateUser = new URL('/users/me', usersURL)

    const body = {
      name: 'user01updated'
    }

    const response = await fetch(updateUser, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      method: 'PATCH',
      body: JSON.stringify(body)
    })

    expect(response.status).equals(200)
  })
})
