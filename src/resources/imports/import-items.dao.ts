import { ClientSession, Filter } from 'mongodb'
import { ulid } from 'ulid'
import Dao from '../../dao.js'
import { ImportItemEntity } from './import-items.entity.js'
import {
  ACTION_REQUIRED_OUTCOMES,
  DBImportItem,
  ImportItemOutcome,
  ImportItemResolution,
  ImportItemsFilter,
  ImportOutcomeCount,
  NewImportItem,
  RETRYABLE_OUTCOMES,
  UnresolvedIsbn
} from './imports.interfaces.js'

function dbImportItemToEntity (dbItem: DBImportItem | null): ImportItemEntity | null {
  return dbItem == null ? null : new ImportItemEntity(dbItem)
}

/** A row is pending if it requires action, nobody has resolved it and its book has not reached the library another way */
function pendingFilter (isbnsInLibrary: readonly string[]): Filter<DBImportItem> {
  return {
    outcome: { $in: [...ACTION_REQUIRED_OUTCOMES] },
    resolution: null,
    $or: [{ isbn13: null }, { isbn13: { $nin: [...isbnsInLibrary] } }]
  }
}

function listFilter (importId: string, filter: ImportItemsFilter, isbnsInLibrary: readonly string[]): Filter<DBImportItem> {
  const mongoFilter: Filter<DBImportItem> = { importId }

  if (filter.outcomes != null) {
    mongoFilter.outcome = { $in: [...filter.outcomes] }
  }
  if (filter.pending === true) {
    mongoFilter.$and = [pendingFilter(isbnsInLibrary)]
  }
  if (filter.pending === false) {
    mongoFilter.$nor = [pendingFilter(isbnsInLibrary)]
  }

  return mongoFilter
}

class ImportItemsDao extends Dao<DBImportItem> {
  constructor () {
    super('import_items')
  }

  async init (): Promise<void> {
    await this.collection.createIndex({ importId: 1, row: 1 })
  }

  async createMany (importId: string, items: readonly NewImportItem[], session: ClientSession): Promise<void> {
    await this.collection.insertMany(
      items.map(item => ({ ...item, _id: ulid(), importId, bookTitle: null, resolution: null })),
      { session }
    )
  }

  async findById (importId: string, id: string): Promise<ImportItemEntity | null> {
    return dbImportItemToEntity(await this.collection.findOne({ _id: id, importId }))
  }

  async findNextQueued (importId: string): Promise<ImportItemEntity | null> {
    return dbImportItemToEntity(await this.collection.findOne(
      { importId, outcome: ImportItemOutcome.Queued },
      { sort: { row: 1 } }
    ))
  }

  /** How many rows of each outcome has each import, and how many of them nobody has resolved. Counted in the database. */
  async countByOutcome (importIds: readonly string[]): Promise<ImportOutcomeCount[]> {
    return await this.collection.aggregate<ImportOutcomeCount>([
      { $match: { importId: { $in: [...importIds] } } },
      {
        $group: {
          _id: { importId: '$importId', outcome: '$outcome' },
          count: { $sum: 1 },
          unresolved: { $sum: { $cond: [{ $eq: ['$resolution', null] }, 1, 0] } }
        }
      },
      { $project: { _id: 0, importId: '$_id.importId', outcome: '$_id.outcome', count: 1, unresolved: 1 } }
    ]).toArray()
  }

  /** The ISBNs of the unresolved rows that require action: they are pending unless the book has reached the library */
  async findUnresolvedIsbns (importIds: readonly string[]): Promise<UnresolvedIsbn[]> {
    return await this.collection
      .find(
        { importId: { $in: [...importIds] }, outcome: { $in: [...ACTION_REQUIRED_OUTCOMES] }, resolution: null, isbn13: { $ne: null } },
        { projection: { _id: 0, importId: 1, isbn13: 1 } }
      )
      .toArray() as UnresolvedIsbn[]
  }

  async list (importId: string, filter: ImportItemsFilter, isbnsInLibrary: readonly string[], skip: number, limit: number): Promise<ImportItemEntity[]> {
    const dbItems = await this.collection.find(listFilter(importId, filter, isbnsInLibrary))
      .sort({ row: 1 })
      .skip(skip)
      .limit(limit)
      .toArray()
    return dbItems.map(dbItem => new ImportItemEntity(dbItem))
  }

  async count (importId: string, filter: ImportItemsFilter, isbnsInLibrary: readonly string[]): Promise<number> {
    return await this.collection.countDocuments(listFilter(importId, filter, isbnsInLibrary))
  }

  async setOutcome (id: string, outcome: ImportItemOutcome, bookTitle: string | null): Promise<void> {
    await this.collection.updateOne({ _id: id }, { $set: { outcome, bookTitle } })
  }

  async setResolution (importId: string, id: string, resolution: ImportItemResolution | null): Promise<ImportItemEntity | null> {
    return dbImportItemToEntity(await this.collection.findOneAndUpdate(
      { _id: id, importId },
      { $set: { resolution } },
      { returnDocument: 'after' }
    ))
  }

  async countRetryable (importId: string): Promise<number> {
    return await this.collection.countDocuments({ importId, outcome: { $in: [...RETRYABLE_OUTCOMES] }, resolution: null })
  }

  async requeueRetryable (importId: string, session: ClientSession): Promise<void> {
    await this.collection.updateMany(
      { importId, outcome: { $in: [...RETRYABLE_OUTCOMES] }, resolution: null },
      { $set: { outcome: ImportItemOutcome.Queued } },
      { session }
    )
  }

  async deleteByImports (importIds: readonly string[], session?: ClientSession): Promise<void> {
    await this.collection.deleteMany({ importId: { $in: [...importIds] } }, { session })
  }
}

export default new ImportItemsDao()
