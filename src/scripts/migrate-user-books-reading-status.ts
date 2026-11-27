import mongo from '../mongo.js'
import userBooksDao from '../resources/user-books/user-books.dao.js'

/** Gives every user book an empty reading status: nothing is known about the books added before it existed. Safe to run more than once. */
async function migrateUserBooksReadingStatus (): Promise<void> {
  await mongo.start()

  const status = await userBooksDao.collection.updateMany({ readingStatus: { $exists: false } }, { $set: { readingStatus: null } })
  const finishedAt = await userBooksDao.collection.updateMany({ finishedAt: { $exists: false } }, { $set: { finishedAt: null } })

  console.log(`User books migrated: readingStatus ${status.modifiedCount}, finishedAt ${finishedAt.modifiedCount}`)
  await mongo.stop()
}

await migrateUserBooksReadingStatus()
