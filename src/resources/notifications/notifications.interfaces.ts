import { NotificationType, TemplateVariable } from './notifications.types.js'

/** What a notification points to. The welcome notification points to nothing. */
export interface LibrarySharedData {
  libraryId: string
  ownerId: string
}

export type NotificationValues = Partial<Record<TemplateVariable, string>>

interface DBNotificationBase {
  _id: string
  /** Who receives it */
  userId: string
  /** The template as it was when the notification was created, with the variables still in it */
  title: string
  /** The values of the variables when the notification was created: only used if what they come from is gone */
  values: NotificationValues
  readAt: Date | null
  createdAt: Date
}

export interface DBWelcomeNotification extends DBNotificationBase {
  type: NotificationType.Welcome
  data: Record<string, never>
}

export interface DBLibrarySharedNotification extends DBNotificationBase {
  type: NotificationType.LibraryShared
  data: LibrarySharedData
}

export type DBNotification = DBWelcomeNotification | DBLibrarySharedNotification

export type NewNotification =
  Pick<DBWelcomeNotification, 'type' | 'userId' | 'title' | 'values' | 'data'> |
  Pick<DBLibrarySharedNotification, 'type' | 'userId' | 'title' | 'values' | 'data'>

export interface NotificationsListFilter {
  unread?: boolean
}

export interface DBNotificationTemplate {
  /** The notification type */
  _id: NotificationType
  title: string
  updatedAt: Date
  /** The admin who changed it last */
  updatedBy: string
}
