import { rateLimit } from 'express-rate-limit'
import { TooManyRequestsError } from '../error/errors.js'

// Brute-force protection: max 10 failed login attempts per IP every 15 minutes
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new TooManyRequestsError('Too many failed login attempts, please try again later'))
  }
})

// Inviting tells whether an email has an account: max 20 failed invitations per user every 15 minutes.
// By user and not by IP: the route requires a token, and several users may share an IP
export const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.userId ?? '',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new TooManyRequestsError('Too many failed invitations, please try again later'))
  }
})
