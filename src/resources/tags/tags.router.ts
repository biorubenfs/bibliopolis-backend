import { Router } from 'express'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { paginationQuerySchema } from '../../pagination.schema.js'
import { HttpStatusCode } from '../../types.js'
import { newTagSchema, updateTagSchema } from './tags.schemas.js'
import tagsService from './tags.service.js'

const tagsRouter = Router()

tagsRouter.get('/', queryParamsValidator(paginationQuerySchema), handler(async (req) => {
  const { skip, limit } = req.query
  const result = await tagsService.list(req.userId ?? '', { skip, limit })
  return { status: HttpStatusCode.OK, data: result }
}))

tagsRouter.post('/', bodyValidator(newTagSchema), handler(async (req) => {
  const result = await tagsService.create(req.body, req.userId ?? '')
  return { status: HttpStatusCode.Created, data: result }
}))

tagsRouter.patch('/:id', bodyValidator(updateTagSchema), handler(async (req) => {
  const result = await tagsService.update(req.params.id, req.body, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

tagsRouter.delete('/:id', handler(async (req) => {
  await tagsService.delete(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.NoContent, data: null }
}))

export default tagsRouter
