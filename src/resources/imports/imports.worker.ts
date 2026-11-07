import { BooksApiError, SourcesUnavailableError } from '../../error/errors.js'
import logger from '../../logger.js'
import { runInTransaction } from '../../transaction-helper.js'
import { getBookFromSourcesApis } from '../../utils.js'
import { BookEntity } from '../books/books.entity.js'
import booksService from '../books/books.service.js'
import librariesDao from '../libraries/libraries.dao.js'
import userBooksDao from '../user-books/user-books.dao.js'
import importItemsDao from './import-items.dao.js'
import { ImportItemEntity } from './import-items.entity.js'
import { QUEUE_CHECK_INTERVAL_MS, SOURCES_PAUSE_MS } from './imports.constants.js'
import importsDao from './imports.dao.js'
import { ImportEntity } from './imports.entity.js'
import { ImportItemOutcome, ImportStatus } from './imports.interfaces.js'

class LibraryDeletedError extends Error {}

/**
 * Processes imports one at a time, row by row. All the state lives in Mongo: each result is saved
 * straight away, and only `queued` rows are processed, so after a restart it resumes where it was.
 * It assumes a single backend instance per environment.
 */
export class ImportsWorker {
  private started = false
  private stopping = false
  private wakeUpRequested = false
  private loop: Promise<void> | null = null
  private queueCheckTimer: NodeJS.Timeout | null = null

  constructor (private readonly sourcesPauseMs = SOURCES_PAUSE_MS) {}

  async start (): Promise<void> {
    await this.requeueInterrupted()
    this.started = true
    this.queueCheckTimer = setInterval(() => this.notify(), QUEUE_CHECK_INTERVAL_MS)
    this.queueCheckTimer.unref()
    this.notify()
  }

  /** Waits for the current row. The import stays `running` and is resumed on the next start */
  async stop (): Promise<void> {
    this.stopping = true
    if (this.queueCheckTimer != null) clearInterval(this.queueCheckTimer)
    await this.loop
  }

  /** Does nothing if the worker has not been started, as on the server used by the integration tests */
  notify (): void {
    if (!this.started || this.stopping) return

    this.wakeUpRequested = true
    if (this.loop != null) return

    this.loop = this.runLoop()
      .catch((error) => { logger.error('error in imports worker', { error }) })
      .finally(() => {
        this.loop = null
        if (this.wakeUpRequested) this.notify()
      })
  }

  async requeueInterrupted (): Promise<void> {
    await importsDao.requeueRunning()
  }

  private async runLoop (): Promise<void> {
    while (this.wakeUpRequested && !this.stopping) {
      this.wakeUpRequested = false
      await this.processQueue()
    }
    this.wakeUpRequested = false
  }

  async processQueue (): Promise<void> {
    while (!this.stopping) {
      const importToProcess = await importsDao.claimNext()
      if (importToProcess == null) return

      await this.processImport(importToProcess)
    }
  }

  private async processImport (importToProcess: ImportEntity): Promise<void> {
    try {
      while (!this.stopping) {
        // Its library may have been deleted while it was running, and the import along with it
        if (await importsDao.findById(importToProcess.id) == null) return

        const item = await importItemsDao.findNextQueued(importToProcess.id)
        if (item == null) {
          await importsDao.finish(importToProcess.id, ImportStatus.Completed)
          return
        }

        await this.processItem(importToProcess, item)
      }
    } catch (error) {
      if (error instanceof LibraryDeletedError) return

      logger.error(`import ${importToProcess.id} failed`, { error })
      await importsDao.finish(importToProcess.id, ImportStatus.Failed)
        .catch((finishError) => { logger.error(`could not mark import ${importToProcess.id} as failed`, { error: finishError }) })
    }
  }

  private async processItem (importToProcess: ImportEntity, item: ImportItemEntity): Promise<void> {
    try {
      if (item.isbn13 == null) throw new Error('a queued row must have an isbn13')

      const book = await this.findBook(item.isbn13)
      const outcome = await this.addToLibrary(importToProcess, book)
      await importItemsDao.setOutcome(item.id, outcome, book.title)
    } catch (error) {
      if (error instanceof LibraryDeletedError) throw error

      await importItemsDao.setOutcome(item.id, this.failureOutcome(importToProcess, item, error), null)
    }
  }

  private failureOutcome (importToProcess: ImportEntity, item: ImportItemEntity, error: unknown): ImportItemOutcome {
    if (error instanceof BooksApiError) return ImportItemOutcome.NotFound
    if (error instanceof SourcesUnavailableError) return ImportItemOutcome.SourceError

    logger.error(`import ${importToProcess.id}: unexpected error in row ${item.row}`, { error })
    return ImportItemOutcome.InternalError
  }

  /** Books already in the catalog neither wait nor use up any quota */
  private async findBook (isbn13: string): Promise<BookEntity> {
    const bookInCatalog = await booksService.fetchByIsbn(isbn13)
    if (bookInCatalog != null) return bookInCatalog

    try {
      return await booksService.ensureBookExistsInBooks(await getBookFromSourcesApis(isbn13))
    } finally {
      await new Promise(resolve => setTimeout(resolve, this.sourcesPauseMs))
    }
  }

  private async addToLibrary (importToProcess: ImportEntity, book: BookEntity): Promise<ImportItemOutcome> {
    const { libraryId, userId } = importToProcess

    return await runInTransaction(async (session) => {
      const userBook = await userBooksDao.findByUserAndBook(userId, book.id, session)
      if (userBook?.libraries.includes(libraryId) === true) {
        return ImportItemOutcome.AlreadyInLibrary
      }

      const upserted = await userBooksDao.upsert(libraryId, userId, book, session)
      if (upserted == null) throw new Error('should not happen')

      const library = await librariesDao.addBookIdToLibrary(libraryId, upserted.id, session)
      if (library == null) throw new LibraryDeletedError()

      return ImportItemOutcome.Added
    })
  }
}

export default new ImportsWorker()
