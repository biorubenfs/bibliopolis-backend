import { Router } from 'express'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import { booksQuerySchema, createBookSchema, updateBookSchema } from './books.schema.js'
import booksService from './books.service.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { checkAdmin } from '../../middlewares/jwt.middleware.js'
import { HttpStatusCode } from '../../types.js'

const booksRouter = Router()

// Regular users add books to the catalog through POST /libraries/:id/books
booksRouter.post('/', checkAdmin, bodyValidator(createBookSchema), handler(async (req) => {
  const result = await booksService.createFromBackoffice(req.body)

  return { status: HttpStatusCode.Created, data: result }
}))

booksRouter.get('/:id/covers', checkAdmin, handler(async (req) => {
  const result = await booksService.listCovers(req.params.id)

  return { status: HttpStatusCode.OK, data: result }
}))

booksRouter.patch('/:id', checkAdmin, bodyValidator(updateBookSchema), handler(async (req) => {
  const result = await booksService.update(req.params.id, req.body)

  return { status: HttpStatusCode.OK, data: result }
}))

booksRouter.get('/:id', handler(async (req) => {
  const result = await booksService.getById(req.params.id)

  return { status: HttpStatusCode.OK, data: result }
}))

booksRouter.get('/', queryParamsValidator(booksQuerySchema), handler(async (req) => {
  const { skip, limit, search } = req.query
  const results = await booksService.list({ skip, limit }, search)

  return { status: HttpStatusCode.OK, data: results }
}))

export default booksRouter
