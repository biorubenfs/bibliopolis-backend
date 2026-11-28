import { ClientSession } from 'mongodb'
import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { hasStrayBraces, NOTIFICATION_TYPES, NotificationType, templateVariables } from '../notifications/notifications.types.js'
import notificationTemplatesDao from './notification-templates.dao.js'
import { NotificationTemplateEntity } from './notification-templates.entity.js'
import { InvalidTemplateVariableError, NotificationTemplateNotFoundError } from './notification-templates.error.js'

function isNotificationType (type: string): type is NotificationType {
  return Object.values<string>(NotificationType).includes(type)
}

class NotificationTemplatesService {
  /** The title new notifications of the type get: the one an admin set, or the default one. */
  async currentTitle (type: NotificationType, session?: ClientSession): Promise<string> {
    const stored = await notificationTemplatesDao.findByType(type, session)
    return stored?.title ?? NOTIFICATION_TYPES[type].defaultTitle
  }

  async list (): Promise<CollectionResultObject<NotificationTemplateEntity>> {
    const stored = new Map((await notificationTemplatesDao.list()).map(template => [template._id, template]))
    const entities = Object.values(NotificationType).map(type => new NotificationTemplateEntity(type, stored.get(type) ?? null))

    return new CollectionResultObject(entities, { skip: 0, limit: entities.length, total: entities.length })
  }

  /** Changes the title of the new notifications of the type. The ones already created keep theirs. */
  async update (type: string, title: string, adminId: string): Promise<SingleResultObject<NotificationTemplateEntity>> {
    if (!isNotificationType(type)) {
      throw new NotificationTemplateNotFoundError('notification template not found')
    }

    const allowed: readonly string[] = NOTIFICATION_TYPES[type].variables
    const unknown = [...new Set(templateVariables(title).filter(variable => !allowed.includes(variable)))]
    if (unknown.length > 0) {
      throw new InvalidTemplateVariableError(`unknown variables: ${unknown.join(', ')}; available: ${allowed.join(', ')}`)
    }
    if (hasStrayBraces(title)) {
      throw new InvalidTemplateVariableError('variables must be written as {{name}}')
    }

    const stored = await notificationTemplatesDao.upsert(type, title, adminId)
    return new SingleResultObject(new NotificationTemplateEntity(type, stored))
  }
}

export default new NotificationTemplatesService()
