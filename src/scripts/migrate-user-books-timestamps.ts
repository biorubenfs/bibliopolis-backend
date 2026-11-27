import { AnyBulkWriteOperation } from 'mongodb'
import { decodeTime } from 'ulid'
import mongo from '../mongo.js'
import userBooksDao from '../resources/user-books/user-books.dao.js'
import { DBUserBook } from '../resources/user-books/user-books.interfaces.js'

/**
 * Gives a creation and an update date to the user books created before they were stored. The creation date comes from
 * the ULID of the book; the update date cannot be known, so it is the creation date too. Safe to run more than once.
 */
async function migrateUserBooksTimestamps (): Promise<void> {
  await mongo.start()

  const cursor = userBooksDao.collection.find(
    { $or: [{ createdAt: { $exists: false } }, { updatedAt: { $exists: false } }] },
    { projection: { _id: 1, createdAt: 1 } }
  )

  let operations: Array<AnyBulkWriteOperation<DBUserBook>> = []
  let migrated = 0
  for await (const userBook of cursor) {
    const createdAt = userBook.createdAt ?? new Date(decodeTime(userBook._id))
    operations.push({
      updateOne: {
        filter: { _id: userBook._id },
        update: { $set: { createdAt, updatedAt: createdAt } }
      }
    })
    if (operations.length === 500) {
      migrated += (await userBooksDao.collection.bulkWrite(operations)).modifiedCount
      operations = []
    }
  }
  if (operations.length > 0) {
    migrated += (await userBooksDao.collection.bulkWrite(operations)).modifiedCount
  }

  console.log(`User books migrated: ${migrated}`)
  await mongo.stop()
}

await migrateUserBooksTimestamps()
