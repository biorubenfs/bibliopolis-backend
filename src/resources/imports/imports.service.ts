import { CollectionResultObject, MiscResultObject, SingleResultObject } from '../../results.js'
import { runInTransaction } from '../../transaction-helper.js'
import { Page } from '../../types.js'
import { ClassifiedCsvRow, classifyRows, CsvColumn, CsvColumnSelection, CsvReadError, detectColumns, ParsedCsv, parseCsv } from '../../utils/csv-reader.utils.js'
import librariesService from '../libraries/libraries.service.js'
import { LibraryEntity } from '../libraries/libraries.entity.js'
import userBooksDao from '../user-books/user-books.dao.js'
import importItemsDao from './import-items.dao.js'
import { ImportItemEntity } from './import-items.entity.js'
import { ANALYSIS_SAMPLE_ROWS, MAX_FILE_NAME_LENGTH, MAX_IMPORT_ROWS } from './imports.constants.js'
import importsDao from './imports.dao.js'
import { ImportEntity } from './imports.entity.js'
import {
  ImportAlreadyActiveError,
  ImportItemNotResolvableError,
  ImportNothingToRetryError,
  ImportNotFoundError,
  ImportPermissionsError,
  ImportTooManyRowsError,
  ImportWithoutIsbnColumnError,
  ImportWithoutValidIsbnError,
  InvalidImportFileError
} from './imports.error.js'
import {
  ACTION_REQUIRED_OUTCOMES,
  ImportItemOutcome,
  ImportItemResolution,
  ImportItemsFilter,
  ImportRequest,
  ImportStatus,
  NewImportItem,
  RETRYABLE_OUTCOMES
} from './imports.interfaces.js'
import importsWorker from './imports.worker.js'

export interface ImportFile {
  originalname: string
  buffer: Buffer
}

interface ImportAnalysis {
  columns: readonly CsvColumn[]
  selection: CsvColumnSelection
  rows: readonly ClassifiedCsvRow[]
  library: LibraryEntity
}

const ROW_OUTCOMES: Record<ClassifiedCsvRow['classification'], ImportItemOutcome> = {
  valid: ImportItemOutcome.Queued,
  invalid_isbn: ImportItemOutcome.InvalidIsbn,
  missing_isbn: ImportItemOutcome.MissingIsbn,
  duplicate_in_file: ImportItemOutcome.DuplicateInFile
}

function readFile (file: ImportFile | undefined): ParsedCsv {
  if (file == null) {
    throw new InvalidImportFileError('a csv file is required')
  }

  try {
    return parseCsv(file.buffer)
  } catch (error) {
    if (error instanceof CsvReadError) throw new InvalidImportFileError(error.message)
    throw error
  }
}

function isPending (item: ImportItemEntity, isbnsInLibrary: ReadonlySet<string>): boolean {
  return ACTION_REQUIRED_OUTCOMES.includes(item.outcome) &&
    item.resolution == null &&
    (item.isbn13 == null || !isbnsInLibrary.has(item.isbn13))
}

class ImportsService {
  /** Reads and classifies the file. Shared by both modes: the review has to match what is imported */
  private async analyze (file: ImportFile | undefined, request: ImportRequest, userId: string): Promise<ImportAnalysis> {
    const library = (await librariesService.get(request.libraryId, userId)).entity

    const csv = readFile(file)

    if (csv.rows.length > MAX_IMPORT_ROWS) {
      throw new ImportTooManyRowsError(`the file has ${csv.rows.length} rows and the limit is ${MAX_IMPORT_ROWS}`)
    }

    const invalidColumn = request.isbnColumns?.find(column => column >= csv.columns.length)
    if (invalidColumn != null) {
      throw new InvalidImportFileError(`the file has no column with index ${invalidColumn}`)
    }

    const selection = { isbnColumns: request.isbnColumns ?? detectColumns(csv.columns).isbnColumns }

    return { columns: csv.columns, selection, rows: classifyRows(csv, selection), library }
  }

  async dryRun (file: ImportFile | undefined, request: ImportRequest, userId: string): Promise<MiscResultObject> {
    const { columns, selection, rows, library } = await this.analyze(file, request, userId)

    const validRows = rows.filter(row => row.classification === 'valid')
    const validIsbns = validRows.map(row => row.isbn13).filter(isbn13 => isbn13 != null)
    const isbnsInLibrary = await userBooksDao.findIsbn13InLibrary(userId, library.id, validIsbns)
    const countRows = (classification: ClassifiedCsvRow['classification']): number =>
      rows.filter(row => row.classification === classification).length

    return new MiscResultObject('import-analysis', {
      columns,
      ...selection,
      counts: {
        rows: rows.length,
        valid: validRows.length - isbnsInLibrary.length,
        invalidIsbn: countRows('invalid_isbn'),
        missingIsbn: countRows('missing_isbn'),
        duplicateInFile: countRows('duplicate_in_file'),
        alreadyInLibrary: isbnsInLibrary.length
      },
      sample: rows.slice(0, ANALYSIS_SAMPLE_ROWS).map(row => ({
        row: row.row,
        isbn: row.rawIsbn
      }))
    })
  }

  async create (file: ImportFile | undefined, request: ImportRequest, userId: string): Promise<SingleResultObject<ImportEntity>> {
    const { selection, rows, library } = await this.analyze(file, request, userId)

    if (selection.isbnColumns.length === 0) {
      throw new ImportWithoutIsbnColumnError('no isbn column has been detected or selected')
    }
    if (!rows.some(row => row.classification === 'valid')) {
      throw new ImportWithoutValidIsbnError('the file has no row with a valid isbn')
    }
    await this.checkNoActiveImport(userId)

    const items: NewImportItem[] = rows.map(({ row, rawIsbn, isbn13, classification }) => ({
      row,
      rawIsbn,
      isbn13,
      outcome: ROW_OUTCOMES[classification]
    }))

    const newImport = await runInTransaction(async (session) => {
      const created = await importsDao.create({
        userId,
        libraryId: library.id,
        fileName: (file?.originalname ?? '').slice(0, MAX_FILE_NAME_LENGTH)
      }, session)
      await importItemsDao.createMany(created.id, items, session)
      return created
    })

    importsWorker.notify()

    return new SingleResultObject(await this.withCounts(newImport))
  }

  async list (libraryId: string, userId: string, page: Page): Promise<CollectionResultObject<ImportEntity>> {
    await librariesService.get(libraryId, userId)

    const [imports, total] = await Promise.all([
      importsDao.list(libraryId, page.skip, page.limit),
      importsDao.count(libraryId)
    ])
    return new CollectionResultObject(await this.withCountsMany(imports), { ...page, total })
  }

  async get (id: string, userId: string): Promise<SingleResultObject<ImportEntity>> {
    return new SingleResultObject(await this.withCounts(await this.getOwnImport(id, userId)))
  }

  async listItems (id: string, userId: string, filter: ImportItemsFilter, page: Page): Promise<CollectionResultObject<ImportItemEntity>> {
    const ownImport = await this.getOwnImport(id, userId)
    const unresolvedIsbns = (await importItemsDao.findUnresolvedIsbns([id])).map(row => row.isbn13)
    const isbnsInLibrary = await this.findIsbnsInLibrary(ownImport, unresolvedIsbns)

    const [items, total] = await Promise.all([
      importItemsDao.list(id, filter, [...isbnsInLibrary], page.skip, page.limit),
      importItemsDao.count(id, filter, [...isbnsInLibrary])
    ])

    return new CollectionResultObject(
      items.map(item => item.withPending(isPending(item, isbnsInLibrary))),
      { ...page, total }
    )
  }

  async updateItem (id: string, itemId: string, resolution: ImportItemResolution | null, userId: string): Promise<SingleResultObject<ImportItemEntity>> {
    const ownImport = await this.getOwnImport(id, userId)
    const item = await importItemsDao.findById(id, itemId)

    if (item == null) {
      throw new ImportNotFoundError('import item not found')
    }
    if (!ACTION_REQUIRED_OUTCOMES.includes(item.outcome)) {
      throw new ImportItemNotResolvableError(`a row with outcome ${item.outcome} cannot be resolved`)
    }

    const updatedItem = await importItemsDao.setResolution(id, itemId, resolution)
    if (updatedItem == null) {
      throw new ImportNotFoundError('import item not found')
    }

    const candidateIsbns = isPending(updatedItem, new Set()) && updatedItem.isbn13 != null ? [updatedItem.isbn13] : []
    const isbnsInLibrary = await this.findIsbnsInLibrary(ownImport, candidateIsbns)
    return new SingleResultObject(updatedItem.withPending(isPending(updatedItem, isbnsInLibrary)))
  }

  async retry (id: string, userId: string): Promise<SingleResultObject<ImportEntity>> {
    const ownImport = await this.getOwnImport(id, userId)
    await this.checkNoActiveImport(userId)

    if (ownImport.status !== ImportStatus.Failed && await importItemsDao.countRetryable(id) === 0) {
      throw new ImportNothingToRetryError('the import has no rows to retry')
    }

    const requeuedImport = await runInTransaction(async (session) => {
      await importItemsDao.requeueRetryable(id, session)
      const requeued = await importsDao.requeue(id, session)
      if (requeued == null) throw new ImportNotFoundError('import not found')
      return requeued
    })

    importsWorker.notify()

    return new SingleResultObject(await this.withCounts(requeuedImport))
  }

  private async getOwnImport (id: string, userId: string): Promise<ImportEntity> {
    const ownImport = await importsDao.findById(id)

    if (ownImport == null) {
      throw new ImportNotFoundError('import not found')
    }
    if (ownImport.userId !== userId) {
      throw new ImportPermissionsError('import not found')
    }

    return ownImport
  }

  private async checkNoActiveImport (userId: string): Promise<void> {
    if (await importsDao.findActiveByUser(userId) != null) {
      throw new ImportAlreadyActiveError('user has already an import in progress')
    }
  }

  /** Which of the given ISBNs are already in the library of the import */
  private async findIsbnsInLibrary (ownImport: ImportEntity, isbns: readonly string[]): Promise<ReadonlySet<string>> {
    if (isbns.length === 0) return new Set()
    return new Set(await userBooksDao.findIsbn13InLibrary(ownImport.userId, ownImport.libraryId, isbns))
  }

  private async withCounts (ownImport: ImportEntity): Promise<ImportEntity> {
    const [withCounts] = await this.withCountsMany([ownImport])
    return withCounts
  }

  /** The counts of a page of imports with a fixed number of queries, instead of loading the rows of each one */
  private async withCountsMany (imports: readonly ImportEntity[]): Promise<ImportEntity[]> {
    if (imports.length === 0) return []
    const importIds = imports.map(imported => imported.id)

    const [outcomeCounts, unresolvedIsbns] = await Promise.all([
      importItemsDao.countByOutcome(importIds),
      importItemsDao.findUnresolvedIsbns(importIds)
    ])

    // The imports of a list belong to the same library: its books are checked once for all of them
    const isbnsInLibraryByLibrary = new Map<string, ReadonlySet<string>>()
    for (const imported of imports) {
      if (isbnsInLibraryByLibrary.has(imported.libraryId)) continue
      const libraryImportIds = new Set(imports.filter(other => other.libraryId === imported.libraryId).map(other => other.id))
      const isbns = unresolvedIsbns.filter(row => libraryImportIds.has(row.importId)).map(row => row.isbn13)
      isbnsInLibraryByLibrary.set(imported.libraryId, await this.findIsbnsInLibrary(imported, isbns))
    }

    return imports.map(imported => {
      const counts = outcomeCounts.filter(count => count.importId === imported.id)
      const isbnsInLibrary = isbnsInLibraryByLibrary.get(imported.libraryId) ?? new Set()
      const countOutcome = (outcome: ImportItemOutcome): number => counts.find(count => count.outcome === outcome)?.count ?? 0
      const countUnresolved = (outcomes: readonly ImportItemOutcome[]): number =>
        counts.filter(count => outcomes.includes(count.outcome)).reduce((sum, count) => sum + count.unresolved, 0)
      const total = counts.reduce((sum, count) => sum + count.count, 0)
      const queued = countOutcome(ImportItemOutcome.Queued)
      // An unresolved row whose book has reached the library another way is no longer pending
      const resolvedByLibrary = unresolvedIsbns.filter(row => row.importId === imported.id && isbnsInLibrary.has(row.isbn13)).length

      return imported.withCounts({
        total,
        processed: total - queued,
        queued,
        added: countOutcome(ImportItemOutcome.Added),
        alreadyInLibrary: countOutcome(ImportItemOutcome.AlreadyInLibrary),
        duplicateInFile: countOutcome(ImportItemOutcome.DuplicateInFile),
        notFound: countOutcome(ImportItemOutcome.NotFound),
        invalidIsbn: countOutcome(ImportItemOutcome.InvalidIsbn),
        missingIsbn: countOutcome(ImportItemOutcome.MissingIsbn),
        sourceError: countOutcome(ImportItemOutcome.SourceError),
        internalError: countOutcome(ImportItemOutcome.InternalError),
        pending: countUnresolved(ACTION_REQUIRED_OUTCOMES) - resolvedByLibrary,
        retryable: countUnresolved(RETRYABLE_OUTCOMES)
      })
    })
  }
}

export default new ImportsService()
