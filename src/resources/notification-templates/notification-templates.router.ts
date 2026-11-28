import { Router } from 'express'
import handler from '../../handler.js'
import bodyValidator from '../../middlewares/body-validator.middleware.js'
import { HttpStatusCode } from '../../types.js'
import { updateNotificationTemplateSchema } from './notification-templates.schemas.js'
import notificationTemplatesService from './notification-templates.service.js'

const notificationTemplatesRouter = Router()

notificationTemplatesRouter.get('/', handler(async () => {
  const result = await notificationTemplatesService.list()
  return { status: HttpStatusCode.OK, data: result }
}))

notificationTemplatesRouter.put('/:type', bodyValidator(updateNotificationTemplateSchema), handler(async (req) => {
  const result = await notificationTemplatesService.update(req.params.type, req.body.title, req.userId ?? '')
  return { status: HttpStatusCode.OK, data: result }
}))

export default notificationTemplatesRouter
