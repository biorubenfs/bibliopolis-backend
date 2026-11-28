import { ulid } from 'ulid'
import { ClientSession, Filter } from 'mongodb'
import Dao from '../../dao.js'
import { DBNotification, NewNotification, NotificationsListFilter } from './notifications.interfaces.js'
import { NotificationType } from './notifications.types.js'

function listNotificationsMongoFilter (userId: string, filter: NotificationsListFilter): Filter<DBNotification> {
  return filter.unread === true ? { userId, readAt: null } : { userId }
}

class NotificationsDao extends Dao<DBNotification> {
  constructor () {
    super('notifications')
  }

  async init (): Promise<void> {
    // The list and the unread count of a user
    await this.collection.createIndex({ userId: 1, createdAt: -1 })
    await this.collection.createIndex({ userId: 1, readAt: 1 })
    // The notifications of a library, removed along with the access to it
    await this.collection.createIndex(
      { 'data.libraryId': 1 },
      { partialFilterExpression: { type: NotificationType.LibraryShared } }
    )
  }

  async create (newNotification: NewNotification, session?: ClientSession): Promise<DBNotification> {
    const base = { _id: ulid(), readAt: null, createdAt: new Date() }
    // One branch per type, so that each one keeps the data of its own type
    const notification: DBNotification = newNotification.type === NotificationType.Welcome
      ? { ...newNotification, ...base }
      : { ...newNotification, ...base }
    await this.collection.insertOne(notification, { session })
    return notification
  }

  async list (userId: string, skip: number, limit: number, filter: NotificationsListFilter = {}): Promise<readonly DBNotification[]> {
    return await this.collection.find(listNotificationsMongoFilter(userId, filter))
      // _id breaks the ties between notifications created in the same millisecond
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()
  }

  async count (userId: string, filter: NotificationsListFilter = {}): Promise<number> {
    return await this.collection.countDocuments(listNotificationsMongoFilter(userId, filter))
  }

  /** null if the notification does not exist or is not the user's. Marking it read again keeps the first date. */
  async setRead (id: string, userId: string, read: boolean): Promise<DBNotification | null> {
    return await this.collection.findOneAndUpdate(
      { _id: id, userId },
      [{ $set: { readAt: read ? { $ifNull: ['$readAt', '$$NOW'] } : null } }],
      { returnDocument: 'after' }
    )
  }

  async setAllRead (userId: string): Promise<void> {
    await this.collection.updateMany({ userId, readAt: null }, { $currentDate: { readAt: true } })
  }

  /** The notifications that a library was shared, for one of its members or, without userId, for all of them. */
  async deleteLibraryShared (libraryId: string, userId: string | null, session?: ClientSession): Promise<void> {
    await this.collection.deleteMany(
      { type: NotificationType.LibraryShared, 'data.libraryId': libraryId, ...(userId != null ? { userId } : {}) },
      { session }
    )
  }
}

export default new NotificationsDao()
