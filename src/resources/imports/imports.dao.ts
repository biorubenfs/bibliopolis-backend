import { ClientSession } from 'mongodb'
import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { ImportEntity } from './imports.entity.js'
import { DBImport, ImportStatus } from './imports.interfaces.js'

function dbImportToEntity (dbImport: DBImport | null): ImportEntity | null {
  return dbImport == null ? null : new ImportEntity(dbImport)
}

class ImportsDao extends Dao<DBImport> {
  constructor () {
    super('imports')
  }

  async init (): Promise<void> {
    await this.collection.createIndex({ libraryId: 1, _id: -1 })
    await this.collection.createIndex({ status: 1, _id: 1 })
  }

  async create (newImport: Pick<DBImport, 'userId' | 'libraryId' | 'fileName'>, session: ClientSession): Promise<ImportEntity> {
    const now = new Date()
    const dbImport: DBImport = {
      ...newImport,
      _id: ulid(),
      status: ImportStatus.Queued,
      createdAt: now,
      updatedAt: now,
      finishedAt: null
    }

    await this.collection.insertOne(dbImport, { session })
    return new ImportEntity(dbImport)
  }

  async findById (id: string): Promise<ImportEntity | null> {
    return dbImportToEntity(await this.collection.findOne({ _id: id }))
  }

  async findActiveByUser (userId: string): Promise<ImportEntity | null> {
    return dbImportToEntity(await this.collection.findOne({
      userId,
      status: { $in: [ImportStatus.Queued, ImportStatus.Running] }
    }))
  }

  async list (libraryId: string, skip: number, limit: number): Promise<ImportEntity[]> {
    const dbImports = await this.collection.find({ libraryId })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()
    return dbImports.map(dbImport => new ImportEntity(dbImport))
  }

  async count (libraryId: string): Promise<number> {
    return await this.collection.countDocuments({ libraryId })
  }

  /** Takes the oldest import in the queue. Only one worker per environment is expected */
  async claimNext (): Promise<ImportEntity | null> {
    return dbImportToEntity(await this.collection.findOneAndUpdate(
      { status: ImportStatus.Queued },
      { $set: { status: ImportStatus.Running, updatedAt: new Date() } },
      { sort: { _id: 1 }, returnDocument: 'after' }
    ))
  }

  async requeueRunning (): Promise<void> {
    await this.collection.updateMany(
      { status: ImportStatus.Running },
      { $set: { status: ImportStatus.Queued, updatedAt: new Date() } }
    )
  }

  async requeue (id: string, session: ClientSession): Promise<ImportEntity | null> {
    return dbImportToEntity(await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: { status: ImportStatus.Queued, updatedAt: new Date(), finishedAt: null } },
      { returnDocument: 'after', session }
    ))
  }

  async finish (id: string, status: ImportStatus.Completed | ImportStatus.Failed): Promise<void> {
    const now = new Date()
    await this.collection.updateOne({ _id: id }, { $set: { status, updatedAt: now, finishedAt: now } })
  }

  async findIdsByLibrary (libraryId: string, session?: ClientSession): Promise<string[]> {
    const dbImports = await this.collection.find({ libraryId }, { projection: { _id: 1 }, session }).toArray()
    return dbImports.map(dbImport => dbImport._id)
  }

  async deleteByLibrary (libraryId: string, session?: ClientSession): Promise<void> {
    await this.collection.deleteMany({ libraryId }, { session })
  }
}

export default new ImportsDao()
