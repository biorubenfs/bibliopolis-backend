import { Router } from 'express'
import userBooksService from './user-books.service.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import handler from '../../handler.js'
import { HttpStatusCode } from '../../types.js'
import { userBooksQuerySchema, userBookUpdateSchema, userBooksDownloadQuerySchema } from './user-books.schemas.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'

const userBooksRouter = Router()

userBooksRouter.get('/', queryParamsValidator(userBooksQuerySchema), handler(async (req) => {
  const { skip, limit, userId, libraryId, search } = req.query
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
    { skip, limit },
    req.userId ?? '',
    filter
  )
  return { status: HttpStatusCode.OK, data: result }
}))

userBooksRouter.get('/download', queryParamsValidator(userBooksDownloadQuerySchema), handler(async (req) => {
  const { libraryId, format } = req.query

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
