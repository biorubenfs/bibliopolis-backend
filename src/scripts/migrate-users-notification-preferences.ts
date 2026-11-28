import mongo from '../mongo.js'
import usersDao from '../resources/users/users.dao.js'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../resources/users/users.interfaces.js'

/** Gives every user the default notification preferences. It creates no notifications. Safe to run more than once. */
async function migrateUsersNotificationPreferences (): Promise<void> {
  await mongo.start()

  const result = await usersDao.collection.updateMany(
    { notificationPreferences: { $exists: false } },
    { $set: { notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES } } }
  )

  console.log(`Users migrated: notificationPreferences ${result.modifiedCount}`)
  await mongo.stop()
}

await migrateUsersNotificationPreferences()
