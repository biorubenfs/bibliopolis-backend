import { Router } from 'express'
import usersService from './users.service.js'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import { createUserSchema, updatePasswordSchema, updateUserSchema, usersQuerySchema } from './users.schemas.js'
import { checkAdmin } from '../../middlewares/jwt.middleware.js'
import { queryPaginationValidator } from '../../middlewares/pagination-validator.middleware.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { parseSkipLimitQP } from '../../utils.js'
import { HttpStatusCode } from '../../types.js'

const usersRouter = Router()

usersRouter.post('/', checkAdmin, bodyValidator(createUserSchema), handler(async (req) => {
  const result = await usersService.signup(req.body)
  return { status: HttpStatusCode.Created, data: result }
}))

/* maybe we could remove this service because is redundante with auth/me service */
usersRouter.get('/me', handler(async (req) => {
  const result = await usersService.getById(req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

usersRouter.get('/', checkAdmin, queryParamsValidator(usersQuerySchema), queryPaginationValidator, handler(async (req) => {
  // already validated by queryParamsValidator, parsed again to apply the trim
  const { search } = usersQuerySchema.parse(req.query)
  const result = await usersService.list(parseSkipLimitQP(req), { search })
  return { status: HttpStatusCode.OK, data: result }
}))

usersRouter.patch('/me/password', bodyValidator(updatePasswordSchema), handler(async (req) => {
  const result = await usersService.updatePassword(req.userId ?? '', req.body.currentPassword, req.body.newPassword)
  return { status: HttpStatusCode.OK, data: result }
}))

usersRouter.patch('/me', bodyValidator(updateUserSchema), handler(async (req) => {
  const result = await usersService.updateUser(req.userId ?? '', req.body)
  return { status: HttpStatusCode.OK, data: result }
}))

// After the /me routes, so that «me» is not taken as an id
usersRouter.get('/:id', checkAdmin, handler(async (req) => {
  const result = await usersService.getByIdWithoutAvatar(req.params.id)
  return { status: HttpStatusCode.OK, data: result }
}))

usersRouter.get('/:id/stats', checkAdmin, handler(async (req) => {
  const result = await usersService.getStats(req.params.id)
  return { status: HttpStatusCode.OK, data: result }
}))

usersRouter.post('/:id/password-reset', checkAdmin, handler(async (req) => {
  const result = await usersService.resetPassword(req.params.id)
  return { status: HttpStatusCode.OK, data: result }
}))

export default usersRouter
