import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { runInTransaction } from '../../transaction-helper.js'
import { Page } from '../../types.js'
import { BookNotFoundError } from '../books/books.error.js'
import { NewBook } from '../books/books.interfaces.js'
import importItemsDao from '../imports/import-items.dao.js'
import importsDao from '../imports/imports.dao.js'
import booksService from '../books/books.service.js'
import userBooksDao from '../user-books/user-books.dao.js'
import { UserBookNotFoundError } from '../user-books/user-books.error.js'
import tagsDao from '../tags/tags.dao.js'
import { TagNotFoundError } from '../tags/tags.error.js'
import librariesDao from './libraries.dao.js'
import { LibraryEntity } from './libraries.entity.js'
import { BookAlreadyExistingInLibrary, BookNotFoundInLibraryError, LibraryNameConflictError, LibraryNotFoundError, LibraryPermissionsError } from './libraries.error.js'
import { LibrariesListFilter, NewLibrary, UpdateLibrary } from './libraries.interfaces.js'

class LibrariesService {
  private async checkLibraryNameAvailable (libraryName: string, userId: string, excludeLibraryId?: string): Promise<void> {
    const existingLibraries = await librariesDao.collection.find({ userId }).toArray()
    const comparableName = libraryName.trim().toLowerCase()
    if (existingLibraries.some(lib => lib.name.trim().toLowerCase() === comparableName && lib._id.toString() !== excludeLibraryId)) {
      throw new LibraryNameConflictError(`user has already a library with name ${libraryName}`)
    }
  }

  /** The tags of a library must be of its owner or global; other users' tags do not exist for them. */
  private async checkTagsUsable (tagIds: readonly string[], ownerId: string): Promise<void> {
    if (tagIds.length === 0) return
    if (await tagsDao.countUsable(tagIds, ownerId) !== tagIds.length) {
      throw new TagNotFoundError('tag not found')
    }
  }

  async create (body: NewLibrary, userId: string): Promise<SingleResultObject<LibraryEntity>> {
    await this.checkLibraryNameAvailable(body.name, userId)
    await this.checkTagsUsable(body.tagIds ?? [], userId)
    const newLibraryData = {
      ...body,
      name: body.name.trim()
    }
    const newLibrary = await librariesDao.create(newLibraryData, userId)
    return new SingleResultObject(newLibrary)
  }

  async update (id: string, body: UpdateLibrary, userId: string): Promise<SingleResultObject<LibraryEntity>> {
    const library = await this.get(id, userId)
    if (body.name != null) {
      await this.checkLibraryNameAvailable(body.name, userId, id)
    }

    if (library == null) {
      throw new LibraryNotFoundError('library not found')
    }
    if (body.tagIds != null) {
      await this.checkTagsUsable(body.tagIds, library.entity.userId)
    }

    const updatedLibrary = await librariesDao.update(id, body)
    if (updatedLibrary == null) {
      throw new LibraryNotFoundError('library not found')
    }

    return new SingleResultObject(updatedLibrary)
  }

  async get (id: string, userId: string): Promise<SingleResultObject<LibraryEntity>> {
    const library = await librariesDao.findById(id)

    if (library == null) {
      throw new LibraryNotFoundError('library not found')
    }

    if (library.userId !== userId) {
      throw new LibraryPermissionsError('library not found')
    }

    return new SingleResultObject(library)
  }

  async delete (id: string, userId: string): Promise<void> {
    const library = await this.get(id, userId)

    await runInTransaction(async (session) => {
      await librariesDao.delete(library.entity.id, session)
      await userBooksDao.deleteAll(id, library.entity.userId, session)
      await importItemsDao.deleteByImports(await importsDao.findIdsByLibrary(id, session), session)
      await importsDao.deleteByLibrary(id, session)
      // runInTransaction treats a null or undefined result as an aborted transaction
      return true
    })
  }

  async list (userId: string, page: Page, filter: LibrariesListFilter = {}): Promise<CollectionResultObject<LibraryEntity>> {
    const [libraries, total] = await Promise.all([
      librariesDao.list(userId, page.skip, page.limit, filter),
      librariesDao.count(userId, filter)
    ])

    const mockPaginationObject = { ...page, total }
    return new CollectionResultObject(libraries, mockPaginationObject)
  }

  async addBook (libraryId: string, newBookData: NewBook, userId: string): Promise<SingleResultObject<LibraryEntity>> {
    const library = await this.get(libraryId, userId)
    if (newBookData.isbn13 == null && newBookData.isbn10 == null) {
      throw new BookNotFoundError('isbn13 or isbn10 must be provided')
    }
    const newBookEntity = await booksService.ensureBookExistsInBooks(newBookData)

    const updatedLibrary = await runInTransaction<LibraryEntity>(async (session) => {
      const userBook = await userBooksDao.upsert(libraryId, userId, newBookEntity, session)
      if (userBook == null) throw new UserBookNotFoundError('user book not found')

      if (library.entity.books.includes(userBook.id)) {
        // do nothing else
        // return library.entity
        throw new BookAlreadyExistingInLibrary(`book with id ${newBookEntity.id} already exists in library ${libraryId}`)
      }

      const updated = await librariesDao.addBookIdToLibrary(library.entity.id, userBook.id, session)
      if (updated == null) throw new Error('should not happen')

      return updated
    })

    return new SingleResultObject(updatedLibrary)
  }

  async removeBook (libraryId: string, userBookId: string, userId: string): Promise<SingleResultObject<LibraryEntity>> {
    const library = await this.get(libraryId, userId)

    if (!library.entity.books.includes(userBookId)) {
      throw new BookNotFoundInLibraryError(`book with id ${userBookId} not found in library ${libraryId}`)
    }

    const updatedLibrary = await runInTransaction(async (session) => {
      const updatedLibrary = await librariesDao.removeBookIdFromLibrary(library.entity.id, userBookId)
      if (updatedLibrary == null) {
        throw new Error('should not happen')
      }

      await userBooksDao.delete(libraryId, userBookId, userId, session)

      return updatedLibrary
    })

    return new SingleResultObject(updatedLibrary)
  }
}

export default new LibrariesService()
