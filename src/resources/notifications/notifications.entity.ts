import { Entity, EntityType } from '../../entity.js'
import { DBNotification } from './notifications.interfaces.js'

/** A notification with its title already filled in. */
export class NotificationEntity extends Entity<EntityType.Notifications> {
  readonly notificationType: DBNotification['type']
  readonly title: string
  readonly data: DBNotification['data']
  readonly readAt: Date | null
  readonly createdAt: Date

  constructor (data: DBNotification, title: string) {
    super(EntityType.Notifications, data._id)
    this.notificationType = data.type
    this.title = title
    this.data = data.data
    this.readAt = data.readAt
    this.createdAt = data.createdAt
  }

  attributes (): Object {
    return {
      type: this.notificationType,
      title: this.title,
      data: this.data,
      readAt: this.readAt,
      createdAt: this.createdAt
    }
  }
}
