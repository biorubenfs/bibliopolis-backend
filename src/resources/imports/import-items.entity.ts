import { Entity, EntityType } from '../../entity.js'
import { DBImportItem, ImportItemOutcome, ImportItemResolution } from './imports.interfaces.js'

export class ImportItemEntity extends Entity<EntityType.ImportItems> {
  readonly importId: string
  readonly row: number
  readonly rawIsbn: string | null
  readonly isbn13: string | null
  readonly outcome: ImportItemOutcome
  readonly bookTitle: string | null
  readonly resolution: ImportItemResolution | null
  readonly pending: boolean

  constructor (private readonly data: DBImportItem, pending = false) {
    super(EntityType.ImportItems, data._id)
    this.importId = data.importId
    this.row = data.row
    this.rawIsbn = data.rawIsbn
    this.isbn13 = data.isbn13
    this.outcome = data.outcome
    this.bookTitle = data.bookTitle
    this.resolution = data.resolution
    this.pending = pending
  }

  // Whether it is pending depends on the current books of the library, so it is not stored
  withPending (pending: boolean): ImportItemEntity {
    return new ImportItemEntity(this.data, pending)
  }

  attributes (): Object {
    return {
      importId: this.importId,
      row: this.row,
      rawIsbn: this.rawIsbn,
      isbn13: this.isbn13,
      outcome: this.outcome,
      bookTitle: this.bookTitle,
      resolution: this.resolution,
      pending: this.pending
    }
  }
}
