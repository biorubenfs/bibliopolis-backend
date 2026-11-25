import { Router } from 'express'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import { uploadCsv } from '../../middlewares/csv-upload.middleware.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { HttpStatusCode } from '../../types.js'
import {
  createImportQuerySchema,
  importRequestSchema,
  listImportItemsQuerySchema,
  listImportsQuerySchema,
  updateImportItemSchema
} from './imports.schemas.js'
import importsService from './imports.service.js'

const importsRouter = Router()

importsRouter.post('/', uploadCsv, queryParamsValidator(createImportQuerySchema), bodyValidator(importRequestSchema), handler(async (req) => {
  const { dryRun } = req.query

  if (dryRun === 'true') {
    const result = await importsService.dryRun(req.file, req.body, req.userId ?? '')
    return { status: HttpStatusCode.OK, data: result }
  }

  const result = await importsService.create(req.file, req.body, req.userId ?? '')
  return { status: HttpStatusCode.Accepted, data: result }
}))

importsRouter.get('/', queryParamsValidator(listImportsQuerySchema), handler(async (req) => {
  const { skip, limit, libraryId } = req.query
  const result = await importsService.list(libraryId, req.userId ?? '', { skip, limit })
  return { status: HttpStatusCode.OK, data: result }
}))

importsRouter.get('/:id', handler(async (req) => {
  const result = await importsService.get(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

importsRouter.get('/:id/items', queryParamsValidator(listImportItemsQuerySchema), handler(async (req) => {
  const { skip, limit, outcome, pending } = req.query
  const filter = {
    outcomes: outcome != null ? [outcome].flat() : undefined,
    pending: pending != null ? pending === 'true' : undefined
  }
  const result = await importsService.listItems(req.params.id, req.userId ?? '', filter, { skip, limit })
  return { status: HttpStatusCode.OK, data: result }
}))

importsRouter.patch('/:id/items/:itemId', bodyValidator(updateImportItemSchema), handler(async (req) => {
  const result = await importsService.updateItem(req.params.id, req.params.itemId, req.body.resolution, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

importsRouter.post('/:id/retry', handler(async (req) => {
  const result = await importsService.retry(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.Accepted, data: result }
}))

export default importsRouter
