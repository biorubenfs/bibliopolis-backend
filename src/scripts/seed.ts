import { DataSetType, loadDataInDb, MockDataSet } from '../load-data.js'
import mongo from '../mongo.js'

async function seedDatabase (): Promise<void> {
  await mongo.start()

  await mongo.db().dropDatabase()
  await loadDataInDb(DataSetType.Seed, MockDataSet.Books, MockDataSet.Libraries, MockDataSet.UserBooks, MockDataSet.Users, MockDataSet.Tags)

  await mongo.stop()
}

await seedDatabase()
