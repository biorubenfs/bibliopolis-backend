import { Router } from 'express'
import userBooksService from './user-books.service.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import handler from '../../handler.js'
import { HttpStatusCode } from '../../types.js'
import { userBooksQuerySchema, userBookUpdateSchema, userBooksDownloadQuerySchema } from './user-books.schemas.js'
import { queryPaginationValidator } from '../../middlewares/pagination-validator.middleware.js'
import { parseSkipLimitQP } from '../../utils.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { z } from 'zod'

const userBooksRouter = Router()

userBooksRouter.get('/', queryParamsValidator(userBooksQuerySchema), queryPaginationValidator, handler(async (req) => {
  // Parsed again to get the transformed values (such as the trimmed search): the middleware only validates
  const { userId, libraryId, search } = userBooksQuerySchema.parse(req.query)
  // normalize libraryId to array
  const librariesIds = libraryId != null
    ? Array.isArray(libraryId) ? libraryId : [libraryId]
    : undefined
  const filter = {
    userId,
    librariesIds,
    search
  }
  const result = await userBooksService.list(
    parseSkipLimitQP(req),
    req.userId ?? '',
    filter
  )
  return { status: HttpStatusCode.OK, data: result }
}))

userBooksRouter.get('/download', queryParamsValidator(userBooksDownloadQuerySchema), handler(async (req) => {
  const { libraryId, format } = req.query as z.infer<typeof userBooksDownloadQuerySchema>

  const stream = await userBooksService.download(libraryId, req.userId ?? '', format)
  return { status: HttpStatusCode.OK, data: stream }
}))

userBooksRouter.get('/:id', handler(async (req) => {
  const result = await userBooksService.get(req.params.id, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

userBooksRouter.patch('/:id', bodyValidator(userBookUpdateSchema), handler(async (req) => {
  const result = await userBooksService.update(req.params.id, req.userId ?? '', req.body)
  return { status: HttpStatusCode.OK, data: result }
}))

export default userBooksRouter
