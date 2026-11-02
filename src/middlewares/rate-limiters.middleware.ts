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
