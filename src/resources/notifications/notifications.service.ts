import { ClientSession } from 'mongodb'
import { CollectionResultObject, MiscResultObject, SingleResultObject } from '../../results.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import notificationTemplatesService from '../notification-templates/notification-templates.service.js'
import usersDao from '../users/users.dao.js'
import { UserEntity } from '../users/users.entity.js'
import notificationsDao from './notifications.dao.js'
import { NotificationEntity } from './notifications.entity.js'
import { NotificationNotFoundError } from './notifications.error.js'
import { DBNotification, NewNotification, NotificationsListFilter, NotificationValues } from './notifications.interfaces.js'
import { NOTIFICATION_TYPES, NotificationType, renderTemplate, TemplateVariable } from './notifications.types.js'

/** What the variables of a page of notifications are filled in with, looked up once for the whole page. */
interface ResolutionContext {
  userNames: Map<string, string>
  libraryNames: Map<string, string>
}

type Resolver = (notification: DBNotification, context: ResolutionContext) => string | undefined

/** Where each variable comes from when a notification is read, so that the names are always the current ones. */
const RESOLVERS: Readonly<Record<TemplateVariable, Resolver>> = {
  [TemplateVariable.UserName]: (notification, { userNames }) => userNames.get(notification.userId),
  [TemplateVariable.OwnerName]: (notification, { userNames }) =>
    notification.type === NotificationType.LibraryShared ? userNames.get(notification.data.ownerId) : undefined,
  [TemplateVariable.LibraryName]: (notification, { libraryNames }) =>
    notification.type === NotificationType.LibraryShared ? libraryNames.get(notification.data.libraryId) : undefined
}

interface NamedResource {
  id: string
  name: string
}

class NotificationsService {
  /** Created inside the transaction of the user, which is passed in the session. */
  async notifyWelcome (user: UserEntity, session?: ClientSession): Promise<void> {
    await this.create({
      type: NotificationType.Welcome,
      userId: user.id,
      title: await notificationTemplatesService.currentTitle(NotificationType.Welcome, session),
      data: {},
      values: { userName: user.name }
    }, user, session)
  }

  async notifyLibraryShared (member: UserEntity, library: NamedResource, owner: NamedResource, session?: ClientSession): Promise<void> {
    await this.create({
      type: NotificationType.LibraryShared,
      userId: member.id,
      title: await notificationTemplatesService.currentTitle(NotificationType.LibraryShared, session),
      data: { libraryId: library.id, ownerId: owner.id },
      values: { userName: member.name, ownerName: owner.name, libraryName: library.name }
    }, member, session)
  }

  /** A type the user turned off is not created at all. */
  private async create (notification: NewNotification, recipient: UserEntity, session?: ClientSession): Promise<void> {
    const { preference } = NOTIFICATION_TYPES[notification.type]
    if (preference != null && !recipient.notificationPreferences[preference]) return

    await notificationsDao.create(notification, session)
  }

  private async toEntities (notifications: readonly DBNotification[]): Promise<readonly NotificationEntity[]> {
    const userIds = new Set<string>()
    const libraryIds = new Set<string>()
    for (const notification of notifications) {
      userIds.add(notification.userId)
      if (notification.type === NotificationType.LibraryShared) {
        userIds.add(notification.data.ownerId)
        libraryIds.add(notification.data.libraryId)
      }
    }

    const [users, libraryNames] = await Promise.all([
      usersDao.findByIds([...userIds]),
      librariesDao.findNamesByIds([...libraryIds])
    ])
    const context: ResolutionContext = { userNames: new Map(users.map(user => [user.id, user.name])), libraryNames }

    return notifications.map(notification => new NotificationEntity(notification, this.render(notification, context)))
  }

  /** The current values, or the ones of when it was created if what they come from is gone. */
  private render (notification: DBNotification, context: ResolutionContext): string {
    const values: NotificationValues = { ...notification.values }
    for (const variable of NOTIFICATION_TYPES[notification.type].variables) {
      const current = RESOLVERS[variable](notification, context)
      if (current != null) values[variable] = current
    }
    return renderTemplate(notification.title, values)
  }

  async list (userId: string, page: Page, filter: NotificationsListFilter = {}): Promise<CollectionResultObject<NotificationEntity>> {
    const [notifications, total] = await Promise.all([
      notificationsDao.list(userId, page.skip, page.limit, filter),
      notificationsDao.count(userId, filter)
    ])

    return new CollectionResultObject(await this.toEntities(notifications), { ...page, total })
  }

  async countUnread (userId: string): Promise<MiscResultObject> {
    return new MiscResultObject('notifications-unread-count', { count: await notificationsDao.count(userId, { unread: true }) })
  }

  async setRead (id: string, userId: string, read: boolean): Promise<SingleResultObject<NotificationEntity>> {
    const notification = await notificationsDao.setRead(id, userId, read)
    // Someone else's notification does not exist for the user
    if (notification == null) {
      throw new NotificationNotFoundError('notification not found')
    }

    const [entity] = await this.toEntities([notification])
    return new SingleResultObject(entity)
  }

  async setAllRead (userId: string): Promise<void> {
    await notificationsDao.setAllRead(userId)
  }
}

export default new NotificationsService()
