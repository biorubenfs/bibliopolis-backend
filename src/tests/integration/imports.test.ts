import { afterEach, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import config from '../../config.js'
import { ApiRestErrorCode } from '../../error/types.js'
import { DataSetType, loadDataInDb, MockDataSet } from '../../load-data.js'
import mongo from '../../mongo.js'
import { makeJwt } from '../../resources/auth/auth.utils.js'
import booksDao from '../../resources/books/books.dao.js'
import importItemsDao from '../../resources/imports/import-items.dao.js'
import { MAX_IMPORT_FILE_SIZE_BYTES, MAX_IMPORT_ROWS } from '../../resources/imports/imports.constants.js'
import importsDao from '../../resources/imports/imports.dao.js'
import { DBImportItem, ImportItemOutcome, ImportStatus } from '../../resources/imports/imports.interfaces.js'
import { ImportsWorker } from '../../resources/imports/imports.worker.js'
import librariesDao from '../../resources/libraries/libraries.dao.js'
import userBooksDao from '../../resources/user-books/user-books.dao.js'
import { Role } from '../../resources/users/users.interfaces.js'
import testUtils from '../utils/utils.js'

const USER_ID = '01J9BHWZ8N4B1JBSAFCBKQGERS'
const OTHER_USER_ID = '01J9XDBGCX8QM0GW67T7QGKS41'
const LIBRARY_ID = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEX'
const OTHER_LIBRARY_ID = '01J9W8VR2CFZW8PJ1Q8Y4Y5WEZ'

const ISBN_IN_LIBRARY = '9780595385294'
const ISBN_IN_CATALOG = '9781782437352'
const ISBN_NEW = '9780306406157'
const ISBN10_NEW = '0306406152'
const ISBN_OTHER = '9780439420891'
const ISBN_THIRD = '9781861972712'

const authHeader = testUtils.buildAuthorizationHeader(makeJwt(USER_ID, Role.Regular))
const otherAuthHeader = testUtils.buildAuthorizationHeader(makeJwt(OTHER_USER_ID, Role.Regular))

const realFetch = globalThis.fetch
const importsUrl = `${testUtils.TESTS_BASE_URL}/imports`

interface ImportForm {
  csv?: string | Buffer
  fileName?: string
  libraryId?: string
  isbnColumns?: readonly number[]
}

function buildForm ({ csv, fileName = 'books.csv', libraryId, isbnColumns = [] }: ImportForm): FormData {
  const form = new FormData()
  if (libraryId != null) form.append('libraryId', libraryId)
  isbnColumns.forEach(column => form.append('isbnColumns', String(column)))
  if (csv != null) form.append('file', new Blob([csv], { type: 'text/csv' }), fileName)
  return form
}

async function postImport (form: ImportForm, options: { dryRun?: boolean, auth?: string } = {}): Promise<{ status: number, body: any }> {
  const response = await realFetch(`${importsUrl}${options.dryRun === true ? '?dryRun=true' : ''}`, {
    method: 'POST',
    headers: { Authorization: options.auth ?? authHeader },
    body: buildForm(form)
  })
  return { status: response.status, body: await response.json() }
}

async function request (path: string, init: RequestInit = {}, auth = authHeader): Promise<{ status: number, body: any }> {
  const response = await realFetch(`${importsUrl}${path}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json' }
  })
  const text = await response.text()
  return { status: response.status, body: text === '' ? null : JSON.parse(text) }
}

function csvOf (...isbns: string[]): string {
  return ['isbn', ...isbns].join('\n') + '\n'
}

async function createImport (form: ImportForm): Promise<string> {
  const { status, body } = await postImport(form)
  expect(status).toBe(202)
  return body.results.id
}

async function createEmptyLibrary (name: string, userId = USER_ID): Promise<string> {
  return (await librariesDao.create({ name, description: '' }, userId)).id
}

type SourceResponse = (isbn: string) => Response | Promise<Response>

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })
const notInSources = (): Response => json({}, 404)
const tooManyRequests = (): Response => json({}, 429)
const inGoogleBooks = (isbn: string): Response => json({
  items: [{
    id: `google-${isbn}`,
    volumeInfo: {
      title: `Book ${isbn}`,
      authors: ['An author'],
      industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn }]
    }
  }]
})

/** The sources are simulated with a fetch stub: the worker of these tests runs in this process */
function stubSources (google: SourceResponse, openLibrary: SourceResponse = notInSources): ReturnType<typeof vi.fn> {
  const calls = vi.fn()
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(input)
    calls(url.href)
    if (url.hostname === config.googleBooks.domain.hostname) {
      return await google((url.searchParams.get('q') ?? '').replace('isbn:', ''))
    }
    if (url.hostname === config.openLibrary.domain.hostname) {
      return await openLibrary(url.pathname.replace('/isbn/', '').replace('.json', ''))
    }
    throw new Error(`Unexpected request to ${url.href}`)
  })
  return calls
}

async function itemsByOutcome (importId: string): Promise<Record<string, ImportItemOutcome>> {
  const items = await importItemsDao.collection.find({ importId }).toArray()
  return Object.fromEntries(items.map((item: DBImportItem) => [item.rawIsbn ?? `row-${item.row}`, item.outcome]))
}

const worker = new ImportsWorker(0)

beforeEach(async () => {
  await mongo.clean()
  await loadDataInDb(DataSetType.Test, MockDataSet.Books, MockDataSet.Users, MockDataSet.Libraries, MockDataSet.UserBooks)
  await importsDao.init()
  await importItemsDao.init()
  await userBooksDao.init()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await mongo.clean()
})

describe('POST /imports?dryRun=true', () => {
  it('should fail without token', async () => {
    const response = await realFetch(`${importsUrl}?dryRun=true`, { method: 'POST', body: buildForm({ csv: csvOf(ISBN_NEW), libraryId: LIBRARY_ID }) })

    expect(response.status).toBe(401)
  })

  it('should analyse the file without writing anything', async () => {
    const csv = [
      'Título;Autor/es;ISBN-13;ISBN-10',
      `Nuevo;Ana;${ISBN_NEW};`,
      `Duplicado;Ana;;${ISBN10_NEW}`,
      `Ya está;Luis;${ISBN_IN_LIBRARY};`,
      'Malo;Eva;123;',
      'Sin ISBN;Eva;;',
      ''
    ].join('\n')

    const { status, body } = await postImport({ csv, libraryId: LIBRARY_ID }, { dryRun: true })

    expect(status).toBe(200)
    expect(body.results.type).toBe('import-analysis')
    expect(body.results.attributes).toMatchObject({
      columns: [
        { index: 0, name: 'Título' },
        { index: 1, name: 'Autor/es' },
        { index: 2, name: 'ISBN-13' },
        { index: 3, name: 'ISBN-10' }
      ],
      isbnColumns: [2, 3],
      counts: { rows: 5, valid: 1, invalidIsbn: 1, missingIsbn: 1, duplicateInFile: 1, alreadyInLibrary: 1 }
    })
    expect(body.results.attributes).not.toHaveProperty('titleColumn')
    expect(body.results.attributes).not.toHaveProperty('authorsColumn')
    expect(body.results.attributes.sample[0]).toEqual({ row: 2, isbn: ISBN_NEW })
    expect(await importsDao.collection.countDocuments()).toBe(0)
    expect(await importItemsDao.collection.countDocuments()).toBe(0)
  })

  it('should answer 200 without isbn columns so that the user can choose one', async () => {
    const { status, body } = await postImport({ csv: `Código,Nombre\n${ISBN_NEW},Uno\n`, libraryId: LIBRARY_ID }, { dryRun: true })

    expect(status).toBe(200)
    expect(body.results.attributes.isbnColumns).toEqual([])
    expect(body.results.attributes.counts).toMatchObject({ rows: 1, valid: 0, missingIsbn: 1 })
  })

  it('should use the requested columns', async () => {
    const { body } = await postImport({ csv: `Código,Nombre\n${ISBN_NEW},Uno\n`, libraryId: LIBRARY_ID, isbnColumns: [0] }, { dryRun: true })

    expect(body.results.attributes.isbnColumns).toEqual([0])
    expect(body.results.attributes.counts.valid).toBe(1)
  })

  it('should read an export of the application without changing its headers', async () => {
    const exported = await realFetch(`${testUtils.TESTS_BASE_URL}/user-books/download?libraryId=${LIBRARY_ID}&format=csv`, {
      headers: { Authorization: authHeader }
    })
    const csv = await exported.text()
    const library = await librariesDao.findById(LIBRARY_ID)

    const { status, body } = await postImport({ csv, libraryId: LIBRARY_ID }, { dryRun: true })

    expect(status).toBe(200)
    expect(body.results.attributes.isbnColumns).toEqual([2, 3])
    expect(body.results.attributes.counts).toMatchObject({
      rows: library?.books.length,
      alreadyInLibrary: library?.books.length,
      valid: 0
    })
  })
})

describe('POST /imports validation', () => {
  const tooManyRows = csvOf(...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ISBN_NEW))

  it.each([true, false])('should apply the same file validations with dryRun=%s', async (dryRun) => {
    const missingFile = await postImport({ libraryId: LIBRARY_ID }, { dryRun })
    expect(missingFile.status).toBe(400)
    expect(missingFile.body.errorCode).toBe(ApiRestErrorCode.InvalidImportFile)

    const noRows = await postImport({ csv: 'isbn\n', libraryId: LIBRARY_ID }, { dryRun })
    expect(noRows.status).toBe(400)
    expect(noRows.body.errorCode).toBe(ApiRestErrorCode.InvalidImportFile)

    const binary = await postImport({ csv: Buffer.from([0x89, 0x50, 0x00, 0x0a, 0x00, 0x0a]), libraryId: LIBRARY_ID }, { dryRun })
    expect(binary.status).toBe(400)
    expect(binary.body.errorCode).toBe(ApiRestErrorCode.InvalidImportFile)

    const rows = await postImport({ csv: tooManyRows, libraryId: LIBRARY_ID }, { dryRun })
    expect(rows.status).toBe(400)
    expect(rows.body.errorCode).toBe(ApiRestErrorCode.ImportTooManyRows)
    expect(rows.body.message).toContain(String(MAX_IMPORT_ROWS))
  })

  it('should answer 413 when the file exceeds the size limit', async () => {
    const { status, body } = await postImport({ csv: Buffer.alloc(MAX_IMPORT_FILE_SIZE_BYTES + 1, 'a'), libraryId: LIBRARY_ID })

    expect(status).toBe(413)
    expect(body.errorCode).toBe(ApiRestErrorCode.ImportFileTooLarge)
  })

  it('should require a library', async () => {
    const { status, body } = await postImport({ csv: csvOf(ISBN_NEW) })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ValidationError)
  })

  it('should not create a library from a name and a description', async () => {
    const librariesBefore = await librariesDao.collection.countDocuments()
    const form = buildForm({ csv: csvOf(ISBN_NEW) })
    form.append('name', 'Biblioteca nueva')
    form.append('description', 'Desde CSV')

    const response = await realFetch(importsUrl, { method: 'POST', headers: { Authorization: authHeader }, body: form })

    expect(response.status).toBe(400)
    expect(await librariesDao.collection.countDocuments()).toBe(librariesBefore)
    expect(await importsDao.collection.countDocuments()).toBe(0)
  })

  it('should not allow a column that does not exist', async () => {
    const { status, body } = await postImport({ csv: csvOf(ISBN_NEW), libraryId: LIBRARY_ID, isbnColumns: [5] }, { dryRun: true })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.InvalidImportFile)
  })

  it.each([true, false])('should not allow using a library of another user with dryRun=%s', async (dryRun) => {
    const { status, body } = await postImport({ csv: csvOf(ISBN_NEW), libraryId: LIBRARY_ID }, { dryRun, auth: otherAuthHeader })

    expect(status).toBe(403)
    expect(body.errorCode).toBe(ApiRestErrorCode.PermissionError)
  })

  it('should answer 400 and create nothing without an isbn column', async () => {
    const { status, body } = await postImport({ csv: `nombre\n${ISBN_NEW}\n`, libraryId: LIBRARY_ID })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ImportWithoutIsbnColumn)
    expect(await importsDao.collection.countDocuments()).toBe(0)
  })

  it('should answer 400 and create nothing without any valid isbn', async () => {
    const { status, body } = await postImport({ csv: csvOf('123', '456'), libraryId: LIBRARY_ID })

    expect(status).toBe(400)
    expect(body.errorCode).toBe(ApiRestErrorCode.ImportWithoutValidIsbn)
    expect(await importsDao.collection.countDocuments()).toBe(0)
  })

  it('should answer 409 if the user already has an active import', async () => {
    await createImport({ csv: csvOf(ISBN_NEW), libraryId: LIBRARY_ID })

    const { status, body } = await postImport({ csv: csvOf(ISBN_OTHER), libraryId: OTHER_LIBRARY_ID })

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ImportAlreadyActive)
  })
})

describe('POST /imports', () => {
  it('should create the import and all its rows', async () => {
    const csv = `isbn,título\n${ISBN_NEW},Uno\n${ISBN10_NEW},Dos\n123,Tres\n,Cuatro\n`

    const { status, body } = await postImport({ csv, fileName: 'Mis libros ñ.csv', libraryId: LIBRARY_ID })

    expect(status).toBe(202)
    expect(body.results.type).toBe('imports')
    expect(body.results.attributes).toMatchObject({
      userId: USER_ID,
      libraryId: LIBRARY_ID,
      fileName: 'Mis libros ñ.csv',
      status: ImportStatus.Queued,
      finishedAt: null,
      counts: { total: 4, processed: 3, queued: 1, duplicateInFile: 1, invalidIsbn: 1, missingIsbn: 1, pending: 2 }
    })

    expect(await itemsByOutcome(body.results.id)).toEqual({
      [ISBN_NEW]: ImportItemOutcome.Queued,
      [ISBN10_NEW]: ImportItemOutcome.DuplicateInFile,
      123: ImportItemOutcome.InvalidIsbn,
      'row-5': ImportItemOutcome.MissingIsbn
    })
  })
})

describe('imports worker', () => {
  it('should add the books and save a result for each row', async () => {
    const importId = await createImport({
      csv: csvOf(ISBN_NEW, ISBN_IN_LIBRARY, ISBN_OTHER, ISBN10_NEW, '123'),
      libraryId: LIBRARY_ID
    })
    stubSources((isbn) => isbn === ISBN_NEW ? inGoogleBooks(isbn) : notInSources())

    await worker.processQueue()

    expect(await itemsByOutcome(importId)).toEqual({
      [ISBN_NEW]: ImportItemOutcome.Added,
      [ISBN_IN_LIBRARY]: ImportItemOutcome.AlreadyInLibrary,
      [ISBN_OTHER]: ImportItemOutcome.NotFound,
      [ISBN10_NEW]: ImportItemOutcome.DuplicateInFile,
      123: ImportItemOutcome.InvalidIsbn
    })

    const { body } = await request(`/${importId}`)
    expect(body.results.attributes.status).toBe(ImportStatus.Completed)
    expect(body.results.attributes.finishedAt).not.toBeNull()
    expect(body.results.attributes.counts).toMatchObject({ total: 5, processed: 5, queued: 0, added: 1, alreadyInLibrary: 1, notFound: 1, pending: 2 })

    const userBook = await userBooksDao.collection.findOne({ userId: USER_ID, bookIsbn13: ISBN_NEW })
    const library = await librariesDao.findById(LIBRARY_ID)
    expect(userBook?.libraries).toEqual([LIBRARY_ID])
    expect(library?.books).toContain(userBook?._id)
    expect(library?.books.filter(id => id === userBook?._id)).toHaveLength(1)
  })

  it('should not call the sources for a book that is in the catalog', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: LIBRARY_ID })
    const calls = stubSources(tooManyRequests)

    await worker.processQueue()

    expect(calls).not.toHaveBeenCalled()
    expect((await itemsByOutcome(importId))[ISBN_IN_CATALOG]).toBe(ImportItemOutcome.Added)
  })

  it('should add a book the user owns in another library to this one as well', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_IN_LIBRARY), libraryId: OTHER_LIBRARY_ID })
    stubSources(tooManyRequests)

    await worker.processQueue()

    expect((await itemsByOutcome(importId))[ISBN_IN_LIBRARY]).toBe(ImportItemOutcome.Added)
    const userBook = await userBooksDao.collection.findOne({ userId: USER_ID, bookIsbn13: ISBN_IN_LIBRARY })
    expect(userBook?.libraries).toEqual(expect.arrayContaining([LIBRARY_ID, OTHER_LIBRARY_ID]))
  })

  it('should report a 429 from a source as source_error, never as not_found', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_NEW), libraryId: LIBRARY_ID })
    stubSources(tooManyRequests)

    await worker.processQueue()

    expect((await itemsByOutcome(importId))[ISBN_NEW]).toBe(ImportItemOutcome.SourceError)
    const { body } = await request(`/${importId}`)
    expect(body.results.attributes.counts).toMatchObject({ sourceError: 1, notFound: 0, pending: 1, retryable: 1 })
  })

  it('should resume after a restart with rows left half done, without repeating them', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_NEW, ISBN_OTHER, ISBN_THIRD), libraryId: LIBRARY_ID })
    // A crash in the middle: the import is running and only its first row has a result
    await importsDao.collection.updateOne({ _id: importId }, { $set: { status: ImportStatus.Running } })
    await importItemsDao.collection.updateOne({ importId, rawIsbn: ISBN_NEW }, { $set: { outcome: ImportItemOutcome.NotFound } })

    const calls = stubSources(inGoogleBooks)
    const restartedWorker = new ImportsWorker(0)
    await restartedWorker.processQueue()
    expect(calls).not.toHaveBeenCalled()

    await restartedWorker.requeueInterrupted()
    await restartedWorker.processQueue()

    expect(await itemsByOutcome(importId)).toEqual({
      [ISBN_NEW]: ImportItemOutcome.NotFound,
      [ISBN_OTHER]: ImportItemOutcome.Added,
      [ISBN_THIRD]: ImportItemOutcome.Added
    })
    expect((await importsDao.findById(importId))?.status).toBe(ImportStatus.Completed)
  })

  it('should stop when the library is deleted halfway through', async () => {
    const importedLibraryId = await createEmptyLibrary('Para borrar')
    await createImport({ csv: csvOf(ISBN_NEW, ISBN_OTHER), libraryId: importedLibraryId })
    const calls = stubSources(inGoogleBooks)

    const response = await realFetch(`${testUtils.TESTS_BASE_URL}/libraries/${importedLibraryId}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader }
    })
    expect(response.status).toBe(204)

    await worker.processQueue()

    expect(calls).not.toHaveBeenCalled()
    expect(await userBooksDao.collection.countDocuments({ libraries: importedLibraryId })).toBe(0)
  })

  it('should not leave books in a deleted library when the deletion happens during a row', async () => {
    const importedLibraryId = await createEmptyLibrary('Se borra a medias')
    const importId = await createImport({ csv: csvOf(ISBN_NEW, ISBN_OTHER), libraryId: importedLibraryId })
    let deletedLibrary = false
    stubSources(async (isbn) => {
      if (!deletedLibrary) {
        deletedLibrary = true
        // Only the library is gone at this point, as if the deletion were still in progress
        await librariesDao.delete(importedLibraryId)
      }
      return inGoogleBooks(isbn)
    })

    await worker.processQueue()

    expect(await userBooksDao.collection.countDocuments({ libraries: importedLibraryId })).toBe(0)
    expect(await importItemsDao.collection.countDocuments({ importId, outcome: ImportItemOutcome.Added })).toBe(0)
  })

  it('should mark a row as internal_error and go on when something unexpected fails', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_NEW, ISBN_OTHER), libraryId: LIBRARY_ID })
    // Incompatible ISBNs make calculateIsbns throw an error that is neither a 404 nor a 503
    stubSources(async (isbn) => isbn === ISBN_NEW
      ? json({
        items: [{
          id: 'incompatible',
          volumeInfo: {
            title: 'Incompatible',
            industryIdentifiers: [{ type: 'ISBN_13', identifier: ISBN_NEW }, { type: 'ISBN_10', identifier: '0439420891' }]
          }
        }]
      })
      : inGoogleBooks(isbn))

    await worker.processQueue()

    expect(await itemsByOutcome(importId)).toEqual({
      [ISBN_NEW]: ImportItemOutcome.InternalError,
      [ISBN_OTHER]: ImportItemOutcome.Added
    })
    expect((await importsDao.findById(importId))?.status).toBe(ImportStatus.Completed)
  })

  it('should process the imports of several users, the oldest first', async () => {
    const first = await createImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: LIBRARY_ID })
    const otherLibraryId = await createEmptyLibrary('De otro usuario', OTHER_USER_ID)
    const { body } = await postImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: otherLibraryId }, { auth: otherAuthHeader })
    stubSources(tooManyRequests)

    await worker.processQueue()

    expect((await importsDao.findById(first))?.status).toBe(ImportStatus.Completed)
    expect((await importsDao.findById(body.results.id))?.status).toBe(ImportStatus.Completed)
  })

  it('should not process anything through notify if it has not been started', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: LIBRARY_ID })

    new ImportsWorker(0).notify()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect((await importsDao.findById(importId))?.status).toBe(ImportStatus.Queued)
  })

  it('should process the queue after start and stop cleanly', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: LIBRARY_ID })
    await importsDao.collection.updateOne({ _id: importId }, { $set: { status: ImportStatus.Running } })
    const startedWorker = new ImportsWorker(0)

    await startedWorker.start()
    await vi.waitFor(async () => {
      expect((await importsDao.findById(importId))?.status).toBe(ImportStatus.Completed)
    })
    await startedWorker.stop()

    expect((await itemsByOutcome(importId))[ISBN_IN_CATALOG]).toBe(ImportItemOutcome.Added)
  })
})

describe('POST /imports/:id/retry', () => {
  it('should queue the rows with a technical error and leave the rest untouched', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_NEW, ISBN_OTHER, ISBN_THIRD), libraryId: LIBRARY_ID })
    const failExceptThird: SourceResponse = (isbn) => json({}, isbn === ISBN_THIRD ? 404 : 429)
    stubSources(failExceptThird, failExceptThird)
    await worker.processQueue()

    const dismissed = await importItemsDao.collection.findOne({ importId, rawIsbn: ISBN_OTHER })
    await request(`/${importId}/items/${dismissed?._id ?? ''}`, { method: 'PATCH', body: JSON.stringify({ resolution: 'dismissed' }) })

    const { status, body } = await request(`/${importId}/retry`, { method: 'POST' })

    expect(status).toBe(202)
    expect(body.results.attributes).toMatchObject({ status: ImportStatus.Queued, finishedAt: null })
    expect(body.results.attributes.counts.queued).toBe(1)

    vi.unstubAllGlobals()
    stubSources(inGoogleBooks)
    await worker.processQueue()

    expect(await itemsByOutcome(importId)).toEqual({
      [ISBN_NEW]: ImportItemOutcome.Added,
      [ISBN_OTHER]: ImportItemOutcome.SourceError,
      [ISBN_THIRD]: ImportItemOutcome.NotFound
    })
  })

  it('should answer 409 if there is an active import', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_NEW), libraryId: LIBRARY_ID })

    const { status, body } = await request(`/${importId}/retry`, { method: 'POST' })

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ImportAlreadyActive)
  })

  it('should answer 409 if there is nothing to retry', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: LIBRARY_ID })
    await worker.processQueue()

    const { status, body } = await request(`/${importId}/retry`, { method: 'POST' })

    expect(status).toBe(409)
    expect(body.errorCode).toBe(ApiRestErrorCode.ConflictError)
  })

  it('should resume a failed import', async () => {
    const importId = await createImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: LIBRARY_ID })
    await importsDao.finish(importId, ImportStatus.Failed)

    const { status } = await request(`/${importId}/retry`, { method: 'POST' })
    await worker.processQueue()

    expect(status).toBe(202)
    expect((await importsDao.findById(importId))?.status).toBe(ImportStatus.Completed)
  })
})

describe('import report', () => {
  async function finishedImport (): Promise<string> {
    const importId = await createImport({
      csv: csvOf(ISBN_IN_CATALOG, ISBN_NEW, ISBN_OTHER, '123', ISBN_IN_CATALOG),
      libraryId: LIBRARY_ID
    })
    stubSources(notInSources)
    await worker.processQueue()
    vi.unstubAllGlobals()
    return importId
  }

  it('GET /imports?libraryId= should list the imports of a library, newest first', async () => {
    const first = await finishedImport()
    const second = await finishedImport()

    const { status, body } = await request(`?libraryId=${LIBRARY_ID}`)

    expect(status).toBe(200)
    expect(body.results.map((item: { id: string }) => item.id)).toEqual([second, first])
    expect(body.paginationInfo).toEqual({ skip: 0, limit: 10, total: 2 })
    expect(body.results[0].attributes.counts.total).toBe(5)
  })

  it('GET /imports should require the libraryId', async () => {
    const { status } = await request('')

    expect(status).toBe(400)
  })

  it('GET /imports/:id/items should paginate the rows in file order', async () => {
    const importId = await finishedImport()

    const { status, body } = await request(`/${importId}/items?limit=2&skip=1`)

    expect(status).toBe(200)
    expect(body.results.map((item: any) => item.attributes.row)).toEqual([3, 4])
    expect(body.results[0].type).toBe('import-items')
    expect(body.paginationInfo).toEqual({ skip: 1, limit: 2, total: 5 })
  })

  it('GET /imports/:id/items should filter by outcome', async () => {
    const importId = await finishedImport()

    const { body } = await request(`/${importId}/items?outcome=not_found&outcome=invalid_isbn`)

    expect(body.results.map((item: any) => item.attributes.outcome)).toEqual(['not_found', 'not_found', 'invalid_isbn'])
  })

  it('GET /imports/:id/items should reject an unknown outcome', async () => {
    const importId = await finishedImport()

    const { status } = await request(`/${importId}/items?outcome=unknown`)

    expect(status).toBe(400)
  })

  it('GET /imports/:id/items should filter by pending', async () => {
    const importId = await finishedImport()

    const pending = await request(`/${importId}/items?pending=true`)
    const notPending = await request(`/${importId}/items?pending=false`)

    expect(pending.body.results.map((item: any) => item.attributes.row)).toEqual([3, 4, 5])
    expect(pending.body.results.every((item: any) => item.attributes.pending === true)).toBe(true)
    expect(notPending.body.results.map((item: any) => item.attributes.row)).toEqual([2, 6])
  })

  it('a book that reaches the library another way should stop being pending', async () => {
    const importId = await finishedImport()

    const added = await realFetch(`${testUtils.TESTS_BASE_URL}/libraries/${LIBRARY_ID}/books`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'A mano', isbn13: ISBN_NEW, isbn10: null, authors: ['Alguien'] })
    })
    expect(added.status).toBe(201)

    const { body } = await request(`/${importId}/items?pending=true`)
    const report = await request(`/${importId}`)

    expect(body.results.map((item: any) => item.attributes.isbn13)).not.toContain(ISBN_NEW)
    expect(report.body.results.attributes.counts.pending).toBe(2)
    // It keeps its original result
    expect(report.body.results.attributes.counts.notFound).toBe(2)
  })

  it('PATCH /imports/:id/items/:itemId should resolve a row and allow undoing it', async () => {
    const importId = await finishedImport()
    const item = await importItemsDao.collection.findOne({ importId, rawIsbn: ISBN_NEW })
    const path = `/${importId}/items/${item?._id ?? ''}`

    const dismissed = await request(path, { method: 'PATCH', body: JSON.stringify({ resolution: 'dismissed' }) })
    expect(dismissed.status).toBe(200)
    expect(dismissed.body.results.attributes).toMatchObject({ resolution: 'dismissed', pending: false })

    const undone = await request(path, { method: 'PATCH', body: JSON.stringify({ resolution: null }) })
    expect(undone.body.results.attributes).toMatchObject({ resolution: null, pending: true })

    const manual = await request(path, { method: 'PATCH', body: JSON.stringify({ resolution: 'manual' }) })
    expect(manual.body.results.attributes).toMatchObject({ resolution: 'manual', pending: false })
  })

  it('PATCH should reject an unknown resolution, or a row that needs no action', async () => {
    const importId = await finishedImport()
    const added = await importItemsDao.collection.findOne({ importId, outcome: ImportItemOutcome.Added })
    const notFound = await importItemsDao.collection.findOne({ importId, outcome: ImportItemOutcome.NotFound })

    const invalid = await request(`/${importId}/items/${notFound?._id ?? ''}`, { method: 'PATCH', body: JSON.stringify({ resolution: 'other' }) })
    const notResolvable = await request(`/${importId}/items/${added?._id ?? ''}`, { method: 'PATCH', body: JSON.stringify({ resolution: 'dismissed' }) })

    expect(invalid.status).toBe(400)
    expect(notResolvable.status).toBe(409)
  })

  it('PATCH should answer 404 for a row of another import', async () => {
    const importId = await finishedImport()
    const otherImportId = await finishedImport()
    const item = await importItemsDao.collection.findOne({ importId: otherImportId })

    const { status } = await request(`/${importId}/items/${item?._id ?? ''}`, { method: 'PATCH', body: JSON.stringify({ resolution: 'dismissed' }) })

    expect(status).toBe(404)
  })

  it('should answer 404 for an import that does not exist', async () => {
    const { status, body } = await request('/does-not-exist')

    expect(status).toBe(404)
    expect(body.errorCode).toBe(ApiRestErrorCode.NotFoundError)
  })

  it('should not give access to the imports of another user', async () => {
    const importId = await finishedImport()
    const item = await importItemsDao.collection.findOne({ importId })

    const responses = await Promise.all([
      request(`/${importId}`, {}, otherAuthHeader),
      request(`/${importId}/items`, {}, otherAuthHeader),
      request(`?libraryId=${LIBRARY_ID}`, {}, otherAuthHeader),
      request(`/${importId}/items/${item?._id ?? ''}`, { method: 'PATCH', body: JSON.stringify({ resolution: 'dismissed' }) }, otherAuthHeader),
      request(`/${importId}/retry`, { method: 'POST' }, otherAuthHeader)
    ])

    expect(responses.map(response => response.status)).toEqual([403, 403, 403, 403, 403])
  })

  it('should not give an administrator access to the imports of another user', async () => {
    const importId = await finishedImport()
    const adminAuth = testUtils.buildAuthorizationHeader(makeJwt('01J9BK7YX0D5NHHBN70Q4N7P69', Role.Admin))

    const { status } = await request(`/${importId}`, {}, adminAuth)

    expect(status).toBe(403)
  })

  it('deleting a library should delete its imports and their rows', async () => {
    const importId = await finishedImport()
    await createImport({ csv: csvOf(ISBN_IN_CATALOG), libraryId: OTHER_LIBRARY_ID })

    const response = await realFetch(`${testUtils.TESTS_BASE_URL}/libraries/${LIBRARY_ID}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader }
    })

    expect(response.status).toBe(204)
    expect(await importsDao.findById(importId)).toBeNull()
    expect(await importItemsDao.collection.countDocuments({ importId })).toBe(0)
    expect(await importsDao.collection.countDocuments({ libraryId: OTHER_LIBRARY_ID })).toBe(1)
  })

  it('the catalog should keep a single book when an import finds it under an ISBN-10', async () => {
    const importId = await createImport({ csv: csvOf(ISBN10_NEW), libraryId: LIBRARY_ID })
    stubSources(inGoogleBooks)

    await worker.processQueue()

    expect((await itemsByOutcome(importId))[ISBN10_NEW]).toBe(ImportItemOutcome.Added)
    expect(await booksDao.collection.countDocuments({ isbn13: ISBN_NEW })).toBe(1)
  })
})
