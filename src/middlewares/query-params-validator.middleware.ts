import { RequestHandler } from 'express'
import { z, ZodSchema } from 'zod'
import { InvalidBodyError } from '../error/errors.js'

export function queryParamsValidator<TSchema extends ZodSchema> (schema: TSchema): RequestHandler<any, any, any, z.infer<TSchema>> {
  return function (req, res, next): void {
    const validationResult = schema.safeParse(req.query)
    if (!validationResult.success) {
      throw new InvalidBodyError('invalid query params', validationResult.error.issues)
    }

    req.query = validationResult.data
    next()
  }
}
