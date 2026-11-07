import { Entity, EntityType } from '../../entity.js'
import { DBImport, ImportCounts, ImportStatus } from './imports.interfaces.js'

export class ImportEntity extends Entity<EntityType.Imports> {
  readonly userId: string
  readonly libraryId: string
  readonly fileName: string
  readonly status: ImportStatus
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly finishedAt: Date | null
  readonly counts: ImportCounts | null

  constructor (private readonly data: DBImport, counts: ImportCounts | null = null) {
    super(EntityType.Imports, data._id)
    this.userId = data.userId
    this.libraryId = data.libraryId
    this.fileName = data.fileName
    this.status = data.status
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
    this.finishedAt = data.finishedAt
    this.counts = counts
  }

  // The counts are not stored: they are calculated from the rows when reading, so they cannot get out of sync
  withCounts (counts: ImportCounts): ImportEntity {
    return new ImportEntity(this.data, counts)
  }

  attributes (): Object {
    return {
      userId: this.userId,
      libraryId: this.libraryId,
      fileName: this.fileName,
      status: this.status,
      counts: this.counts,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      finishedAt: this.finishedAt
    }
  }
}
