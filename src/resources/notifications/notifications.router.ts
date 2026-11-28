import { Router } from 'express'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { HttpStatusCode } from '../../types.js'
import { notificationsQuerySchema, updateNotificationSchema } from './notifications.schemas.js'
import notificationsService from './notifications.service.js'

const notificationsRouter = Router()

notificationsRouter.get('/', queryParamsValidator(notificationsQuerySchema), handler(async (req) => {
  const { skip, limit, unread } = req.query
  const result = await notificationsService.list(req.userId ?? '', { skip, limit }, { unread })
  return { status: HttpStatusCode.OK, data: result }
}))

notificationsRouter.get('/unread-count', handler(async (req) => {
  const result = await notificationsService.countUnread(req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

notificationsRouter.post('/read-all', handler(async (req) => {
  await notificationsService.setAllRead(req.userId ?? '')
  return { status: HttpStatusCode.NoContent, data: null }
}))

notificationsRouter.patch('/:id', bodyValidator(updateNotificationSchema), handler(async (req) => {
  const result = await notificationsService.setRead(req.params.id, req.userId ?? '', req.body.read)
  return { status: HttpStatusCode.OK, data: result }
}))

export default notificationsRouter
