import { Entity, EntityType } from '../../entity.js'
import { DBNotificationTemplate } from '../notifications/notifications.interfaces.js'
import { NOTIFICATION_TYPES, NotificationType, TemplateVariable } from '../notifications/notifications.types.js'

/** The template of a notification type, with what an admin needs to edit it. Its id is the type. */
export class NotificationTemplateEntity extends Entity<EntityType.NotificationTemplates> {
  readonly title: string
  readonly defaultTitle: string
  readonly variables: readonly TemplateVariable[]
  /** Whether users can turn this type off */
  readonly optional: boolean
  /** Both null while the template is the default one */
  readonly updatedAt: Date | null
  readonly updatedBy: string | null

  constructor (type: NotificationType, stored: DBNotificationTemplate | null) {
    super(EntityType.NotificationTemplates, type)
    const definition = NOTIFICATION_TYPES[type]
    this.title = stored?.title ?? definition.defaultTitle
    this.defaultTitle = definition.defaultTitle
    this.variables = definition.variables
    this.optional = definition.preference != null
    this.updatedAt = stored?.updatedAt ?? null
    this.updatedBy = stored?.updatedBy ?? null
  }

  attributes (): Object {
    return {
      title: this.title,
      defaultTitle: this.defaultTitle,
      variables: this.variables,
      optional: this.optional,
      updatedAt: this.updatedAt,
      updatedBy: this.updatedBy
    }
  }
}
