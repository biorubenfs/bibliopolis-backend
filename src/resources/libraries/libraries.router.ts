import { Router } from 'express'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'

import { addBookToLibrarySchema, librariesQuerySchema, newLibrarySchema, updateLibrarySchema } from './libraries.schemas.js'
import librariesService from './libraries.service.js'
import { HttpStatusCode } from '../../types.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { inviteLimiter } from '../../middlewares/rate-limiters.middleware.js'
import { paginationQuerySchema } from '../../pagination.schema.js'
import { inviteMemberSchema } from '../library-members/library-members.schemas.js'
import libraryMembersService from '../library-members/library-members.service.js'

const librariesRouter = Router()

librariesRouter.post('/', bodyValidator(newLibrarySchema), handler(async (req) => {
  const result = await librariesService.create(req.body, req.userId ?? '')
  return { status: HttpStatusCode.Created, data: result }
}))

librariesRouter.get('/:id', handler(async (req) => {
  const result = await librariesService.get(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

librariesRouter.get('/', queryParamsValidator(librariesQuerySchema), handler(async (req) => {
  const { skip, limit, ids, search, favorites, tags } = req.query
  const result = await librariesService.list(req.userId ?? '', { skip, limit }, { ids, search, favorites, tagIds: tags })
  return { status: HttpStatusCode.OK, data: result }
}))

librariesRouter.delete('/:id', handler(async (req) => {
  await librariesService.delete(req.params.id, req.userId ?? '')
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

librariesRouter.patch('/:id', bodyValidator(updateLibrarySchema), handler(async (req) => {
  const result = await librariesService.update(req.params.id, req.body, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

librariesRouter.get('/:id/members', queryParamsValidator(paginationQuerySchema), handler(async (req) => {
  const { skip, limit } = req.query
  const result = await libraryMembersService.list(req.params.id, req.userId ?? '', { skip, limit })
  return { status: HttpStatusCode.OK, data: result }
}))

librariesRouter.post('/:id/members', inviteLimiter, bodyValidator(inviteMemberSchema), handler(async (req) => {
  const result = await libraryMembersService.invite(req.params.id, req.body.email, req.userId ?? '')
  return { status: HttpStatusCode.Created, data: result }
}))

librariesRouter.delete('/:id/members/:userId', handler(async (req) => {
  await libraryMembersService.remove(req.params.id, req.params.userId, req.userId ?? '')
  return { status: HttpStatusCode.NoContent, data: null }
}))

export default librariesRouter
