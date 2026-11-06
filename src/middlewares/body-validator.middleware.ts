import { NextFunction, Request, RequestHandler, Response } from 'express'

import { z, ZodSchema } from 'zod'
import { InvalidBodyError } from '../error/errors.js'

function bodyValidator<TSchema extends ZodSchema> (schema: TSchema): RequestHandler<any, any, z.infer<TSchema>> {
  return function (req: Request, res: Response, next: NextFunction): void {
    const validationResult = schema.safeParse(req.body)

    if (!validationResult.success) {
      throw new InvalidBodyError('invalid body', validationResult.error.issues)
    }

    req.body = validationResult.data
    next()
  }
}

export default bodyValidator
