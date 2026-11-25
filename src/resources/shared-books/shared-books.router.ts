import { Router } from 'express'
import handler from '../../handler.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { HttpStatusCode } from '../../types.js'
import { sharedBooksQuerySchema } from './shared-books.schemas.js'
import sharedBooksService from './shared-books.service.js'

const sharedBooksRouter = Router()

sharedBooksRouter.get('/', queryParamsValidator(sharedBooksQuerySchema), handler(async (req) => {
  const { skip, limit, search } = req.query
  const result = await sharedBooksService.list(req.userId ?? '', { skip, limit }, search)
  return { status: HttpStatusCode.OK, data: result }
}))

sharedBooksRouter.get('/:id', handler(async (req) => {
  const result = await sharedBooksService.get(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

export default sharedBooksRouter
