import { Router } from 'express'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'

import { addBookToLibrarySchema, librariesQuerySchema, newLibrarySchema } from './libraries.schemas.js'
import librariesService from './libraries.service.js'
import { Role } from '../users/users.interfaces.js'
import { queryPaginationValidator } from '../../middlewares/pagination-validator.middleware.js'
import { parseSkipLimitQP } from '../../utils.js'
import { HttpStatusCode } from '../../types.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'

const librariesRouter = Router()

librariesRouter.post('/', bodyValidator(newLibrarySchema), handler(async (req) => {
  const result = await librariesService.create(req.body, req.userId ?? '')
  return { status: HttpStatusCode.Created, data: result }
}))

librariesRouter.get('/:id', handler(async (req) => {
  const result = await librariesService.get(req.params.id, req.userId ?? '', req.role ?? Role.Regular)
  return { status: HttpStatusCode.OK, data: result }
}))

librariesRouter.get('/', queryParamsValidator(librariesQuerySchema), queryPaginationValidator, handler(async (req) => {
  // already validated by queryParamsValidator, parsed again to apply the trim
  const { search } = librariesQuerySchema.parse(req.query)
  const result = await librariesService.list(req.userId ?? '', req.role ?? Role.Regular, parseSkipLimitQP(req), search)
  return { status: HttpStatusCode.OK, data: result }
}))

librariesRouter.delete('/:id', handler(async (req) => {
  await librariesService.delete(req.params.id, req.userId ?? '', req.role ?? Role.Regular)
  return { status: HttpStatusCode.NoContent, data: null }
}))

librariesRouter.post('/:id/books', bodyValidator(addBookToLibrarySchema), handler(async (req) => {
  const result = await librariesService.addBook(req.params.id, req.body, req.userId ?? '')
  return { status: HttpStatusCode.Created, data: result }
}))

librariesRouter.delete('/:libraryId/books/:userBookId', handler(async (req) => {
  const result = await librariesService.removeBook(req.params.libraryId, req.params.userBookId, req.userId ?? '')
  return { status: HttpStatusCode.NoContent, data: result }
}))

librariesRouter.patch('/:id', bodyValidator(newLibrarySchema.partial()), handler(async (req) => {
  const result = await librariesService.update(req.params.id, req.body, req.userId ?? '', req.role ?? Role.Regular)
  return { status: HttpStatusCode.OK, data: result }
}))

// Libraries-books
// librariesRouter.get('/:id/books', queryPaginationValidator, handler(async (req) => {
//   const userId = req.userId ?? ''
//   const role = req.role ?? Role.Regular
//   const result = await userBooksService.list(parseSkipLimitQP(req), userId, role, { librariesIds: [req.params.id], userId })
//   return { status: HttpStatusCode.OK, data: result }
// }))

export default librariesRouter
