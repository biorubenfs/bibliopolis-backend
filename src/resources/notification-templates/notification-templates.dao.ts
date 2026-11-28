import { ClientSession } from 'mongodb'
import Dao from '../../dao.js'
import { DBNotificationTemplate } from '../notifications/notifications.interfaces.js'
import { NotificationType } from '../notifications/notifications.types.js'

/** Only the templates an admin has changed are stored: the others are the defaults of NOTIFICATION_TYPES. */
class NotificationTemplatesDao extends Dao<DBNotificationTemplate> {
  constructor () {
    super('notification_templates')
  }

  async findByType (type: NotificationType, session?: ClientSession): Promise<DBNotificationTemplate | null> {
    return await this.collection.findOne({ _id: type }, { session })
  }

  async list (): Promise<readonly DBNotificationTemplate[]> {
    return await this.collection.find().toArray()
  }

  async upsert (type: NotificationType, title: string, adminId: string): Promise<DBNotificationTemplate> {
    const template: DBNotificationTemplate = { _id: type, title, updatedAt: new Date(), updatedBy: adminId }
    await this.collection.replaceOne({ _id: type }, template, { upsert: true })
    return template
  }
}

export default new NotificationTemplatesDao()
