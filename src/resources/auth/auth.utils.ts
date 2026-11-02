import jwt from 'jsonwebtoken'
import config from '../../config.js'
import { Role } from '../users/users.interfaces.js'

export function makeJwt (userId: string, role: Role): string {
  const { secret, expirationTime } = config.jwt
  const token = jwt.sign({
    id: userId,
    role
  }, secret, { expiresIn: expirationTime }
  )

  return token
}
