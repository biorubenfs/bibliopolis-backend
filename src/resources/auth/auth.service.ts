import { TokenResultObject } from '../../results.js'
import bcrypt from 'bcryptjs'
import { Login } from './auth.interfaces.js'
import { InvalidLoginError } from './auth.error.js'
import { makeJwt } from './auth.utils.js'
import usersService from '../users/users.service.js'

class AuthService {
  async login (body: Login): Promise<TokenResultObject> {
    let user

    try {
      user = await usersService.getByEmail(body.email)
    } catch (error) {
      if (typeof error === 'object' && error != null && 'statusCode' in error && error.statusCode === 404) {
        // do nothing
      } else {
        throw error
      }
    }

    const isPasswordValid = (user != null)
      ? await bcrypt.compare(body.password, user.password)
      : false

    if (user == null || !isPasswordValid) {
      throw new InvalidLoginError('invalid email or password')
    }

    const accessToken = makeJwt(user.id, user.role)

    return new TokenResultObject(accessToken)
  }
}

export default new AuthService()
