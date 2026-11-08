import usersDao from './users.dao.js'
import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { CreateUser, Role, UpdateUser, UsersListFilter } from './users.interfaces.js'
import bcrypt from 'bcryptjs'
import config from '../../config.js'
import { InvalidCurrentPassword, UserEmailAlreadyExists, UserNotFoundError, UserPasswordResetForbiddenError } from './users.error.js'
import { UserEntity } from './users.entity.js'
import { Page } from '../../types.js'
import robohashApi from './robohash/robohash.api.js'
import { transformImageToBase64 } from '../../utils.js'
import logger from '../../logger.js'
import { MongoServerError } from 'mongodb'
import { generatePassword } from './users.utils.js'

const DEFAULT_AVATAR_BASE64 = '' // TODO: add a default avatar

export function hashPasswordSync (password: string): string {
  return bcrypt.hashSync(password, config.hashRounds)
}

class UsersService {
  /** Creates a regular user with a generated password, returned only here and never stored in plain text. */
  async signup (body: Pick<CreateUser, 'name' | 'email'>): Promise<SingleResultObject<UserEntity>> {
    const existingUser = await usersDao.findByEmail(body.email)
    if (existingUser != null) {
      throw new UserEmailAlreadyExists(`there is already a user registered with email ${body.email}`)
    }

    const password = generatePassword()

    // TODO: Decouple user creation from avatar creation. Create user with default or null avatar and update it asynchronously after fetching from RoboHash.
    const userData: CreateUser = {
      name: body.name,
      email: body.email,
      password: hashPasswordSync(password),
      avatar: await this.generateAvatar(body.name)
    }

    try {
      const newUser = await usersDao.create(userData, Role.Regular)
      return new SingleResultObject(newUser, { password })
    } catch (error) {
      // The unique index catches the concurrent signups that passed the check above
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new UserEmailAlreadyExists(`there is already a user registered with email ${body.email}`)
      }
      throw error
    }
  }

  /** Only for regular users: admins change their password from their profile. */
  async resetPassword (userId: string): Promise<SingleResultObject<UserEntity>> {
    const user = await this.getById(userId)
    if (user.entity.role !== Role.Regular) {
      throw new UserPasswordResetForbiddenError('only the password of a regular user can be reset')
    }

    const password = generatePassword()
    const updUser = await usersDao.updatePassword(userId, hashPasswordSync(password))
    if (updUser == null) {
      throw new UserNotFoundError('user not found')
    }

    return new SingleResultObject(updUser, { password })
  }

  async getById (id: string): Promise<SingleResultObject<UserEntity>> {
    const user = await usersDao.findById(id)
    if (user == null) {
      throw new UserNotFoundError('user not found')
    }

    return new SingleResultObject(user)
  }

  async getByEmail (email: string): Promise<UserEntity> {
    const user = await usersDao.findByEmail(email)

    if (user == null) {
      throw new UserNotFoundError('user not found')
    }

    return user
  }

  async list (page: Page, filter: UsersListFilter = {}): Promise<CollectionResultObject<UserEntity>> {
    const [users, total] = await Promise.all([
      await usersDao.list(page.skip, page.limit, filter),
      await usersDao.count(filter)
    ])

    return new CollectionResultObject(users, { ...page, total })
  }

  async updatePassword (userId: string, currentPassword: string, newPassword: string): Promise<SingleResultObject<UserEntity>> {
    const user = await this.getById(userId)

    const isPasswordValid = await bcrypt.compare(currentPassword, user.entity.password)

    if (!isPasswordValid) {
      throw new InvalidCurrentPassword('invalid current password')
    }

    const hashedPassword = hashPasswordSync(newPassword)
    const updUser = await usersDao.updatePassword(userId, hashedPassword)
    if (updUser == null) {
      throw new UserNotFoundError('user not found')
    }

    return new SingleResultObject(updUser)
  }

  async updateUser (userId: string, data: Omit<UpdateUser, 'avatar'>): Promise<SingleResultObject<UserEntity>> {
    const updData: UpdateUser = {
      ...data,
      avatar: await this.generateAvatar(data.name)
    }
    const updUser = await usersDao.updateUser(userId, updData)
    if (updUser == null) {
      throw new UserNotFoundError('user not found')
    }

    return new SingleResultObject(updUser)
  }

  /** A RoboHash failure must not block the operation: it falls back to the default avatar. */
  private async generateAvatar (name: string): Promise<string> {
    try {
      const avatar = await robohashApi.getImage(name)
      return transformImageToBase64(avatar)
    } catch (error) {
      logger.error('Error fetching avatar from RoboHash:', error)
      return DEFAULT_AVATAR_BASE64
    }
  }
}

export default new UsersService()
