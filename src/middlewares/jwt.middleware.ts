import { NextFunction, Request, Response } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import config from '../config.js'
import { Role } from '../resources/users/users.interfaces.js'
import { ExpiredTokenError, ForbiddenError, InvalidTokenError, TokenNotProvidedError } from '../error/errors.js'

// export function checkJwt (req: Request, res: Response, next: NextFunction): void {
//   const header = req.header('Authorization')
//   const token = header?.split(' ').at(1)

//   if (token == null) {
//     throw new TokenNotProvidedError('token not provided')
//   }

//   try {
//     const payload = jwt.verify(token, config.jwt.secret) as JWTPayload

//     req.userId = payload.id
//     req.role = payload.role

//     next()
//   } catch (error) {
//     throw new InvalidTokenError('invalid token')
//   }
// }

export function checkJwt (req: Request, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req)
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload

    assertPayload(payload)

    req.userId = payload.id
    req.role = payload.role

    return next()
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return next(new ExpiredTokenError('token expired'))
    }

    if (error instanceof TokenNotProvidedError) {
      return next(error)
    }

    return next(new InvalidTokenError('invalid token'))
  }
}

function extractToken (req: Request): string {
  // Try Authorization header first (Bearer token)
  const authHeader = req.header('Authorization')
  if (authHeader != null) {
    const token = authHeader.split(' ')[1]
    if (token != null) return token
  }

  throw new TokenNotProvidedError('token not provided')
}

function assertPayload (payload: JwtPayload): void {
  if (payload.id == null || payload.role == null) {
    throw new InvalidTokenError('invalid token')
  }
}

export function checkAdmin (req: Request, res: Response, next: NextFunction): void {
  if (req.role !== Role.Admin) {
    return next(new ForbiddenError('must be admin'))
  }
  next()
}

// Admins manage the catalog and the users from the backoffice: they have no libraries of their own
export function checkRegular (req: Request, res: Response, next: NextFunction): void {
  if (req.role !== Role.Regular) {
    return next(new ForbiddenError('must be a regular user'))
  }
  next()
}
