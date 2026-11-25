import { Router } from 'express'
import handler from '../../handler.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { paginationQuerySchema } from '../../pagination.schema.js'
import { HttpStatusCode } from '../../types.js'
import { sharedLibrariesQuerySchema, sharedLibraryBooksQuerySchema } from './shared-libraries.schemas.js'
import sharedLibrariesService from './shared-libraries.service.js'

const sharedLibrariesRouter = Router()

sharedLibrariesRouter.get('/', queryParamsValidator(sharedLibrariesQuerySchema), handler(async (req) => {
  const { skip, limit, search, owner } = req.query
  const result = await sharedLibrariesService.list(req.userId ?? '', { skip, limit }, { search, ownerId: owner })
  return { status: HttpStatusCode.OK, data: result }
}))

sharedLibrariesRouter.get('/owners', queryParamsValidator(paginationQuerySchema), handler(async (req) => {
  const { skip, limit } = req.query
  const result = await sharedLibrariesService.listOwners(req.userId ?? '', { skip, limit })
  return { status: HttpStatusCode.OK, data: result }
}))

sharedLibrariesRouter.get('/:id', handler(async (req) => {
  const result = await sharedLibrariesService.get(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

sharedLibrariesRouter.get('/:id/books', queryParamsValidator(sharedLibraryBooksQuerySchema), handler(async (req) => {
  const { skip, limit, search } = req.query
  const result = await sharedLibrariesService.listBooks(req.params.id, req.userId ?? '', { skip, limit }, search)
  return { status: HttpStatusCode.OK, data: result }
}))

sharedLibrariesRouter.delete('/:id', handler(async (req) => {
  await sharedLibrariesService.leave(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.NoContent, data: null }
}))

export default sharedLibrariesRouter
