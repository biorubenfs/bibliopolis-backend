import mongo from '../mongo.js'
import librariesDao from '../resources/libraries/libraries.dao.js'

/** Makes every library private: none was public before the field existed. Safe to run more than once. */
async function migrateLibrariesVisibility (): Promise<void> {
  await mongo.start()

  const isPublic = await librariesDao.collection.updateMany({ isPublic: { $exists: false } }, { $set: { isPublic: false } })
  const publishedAt = await librariesDao.collection.updateMany({ publishedAt: { $exists: false } }, { $set: { publishedAt: null } })

  console.log(`Libraries migrated: isPublic ${isPublic.modifiedCount}, publishedAt ${publishedAt.modifiedCount}`)
  await mongo.stop()
}

await migrateLibrariesVisibility()
