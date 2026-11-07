import { Router } from 'express'
import { z } from 'zod'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import { uploadCsv } from '../../middlewares/csv-upload.middleware.js'
import { queryPaginationValidator } from '../../middlewares/pagination-validator.middleware.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { HttpStatusCode } from '../../types.js'
import { parseSkipLimitQP } from '../../utils.js'
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
  const { dryRun } = req.query as z.infer<typeof createImportQuerySchema>

  if (dryRun === 'true') {
    const result = await importsService.dryRun(req.file, req.body, req.userId ?? '')
    return { status: HttpStatusCode.OK, data: result }
  }

  const result = await importsService.create(req.file, req.body, req.userId ?? '')
  return { status: HttpStatusCode.Accepted, data: result }
}))

importsRouter.get('/', queryParamsValidator(listImportsQuerySchema), queryPaginationValidator, handler(async (req) => {
  const { libraryId } = req.query as z.infer<typeof listImportsQuerySchema>
  const result = await importsService.list(libraryId, req.userId ?? '', parseSkipLimitQP(req))
  return { status: HttpStatusCode.OK, data: result }
}))

importsRouter.get('/:id', handler(async (req) => {
  const result = await importsService.get(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

importsRouter.get('/:id/items', queryParamsValidator(listImportItemsQuerySchema), queryPaginationValidator, handler(async (req) => {
  const { outcome, pending } = req.query as z.infer<typeof listImportItemsQuerySchema>
  const filter = {
    outcomes: outcome != null ? [outcome].flat() : undefined,
    pending: pending != null ? pending === 'true' : undefined
  }
  const result = await importsService.listItems(req.params.id, req.userId ?? '', filter, parseSkipLimitQP(req))
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
