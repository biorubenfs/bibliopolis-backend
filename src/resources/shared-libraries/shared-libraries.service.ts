import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import { LibraryNotFoundError } from '../libraries/libraries.error.js'
import { DBSharedLibrary } from '../libraries/libraries.interfaces.js'
import userBooksDao from '../user-books/user-books.dao.js'
import usersDao from '../users/users.dao.js'
import { SharedLibraryEntity } from './shared-libraries.entity.js'
import { SharedLibraryBookEntity } from './shared-library-books.entity.js'

/** Read-only access of the members to the libraries of other users. */
class SharedLibrariesService {
  /**
   * The only gate to a shared library, checked in the database on each request. Without access it does not exist:
   * the answer is the same for a library that was never shared, is no longer shared or has been deleted.
   */
  private async getAccess (libraryId: string, userId: string): Promise<DBSharedLibrary> {
    const library = await librariesDao.findShared(libraryId, userId)
    if (library == null) {
      throw new LibraryNotFoundError('library not found')
    }
    return library
  }

  /** The names are not copied into the libraries because their owners can change them. */
  private async toEntities (libraries: readonly DBSharedLibrary[]): Promise<readonly SharedLibraryEntity[]> {
    const owners = await usersDao.findByIds([...new Set(libraries.map(library => library.userId))])
    const ownerNames = new Map(owners.map(owner => [owner.id, owner.name]))
    return libraries.map(library => new SharedLibraryEntity(library, ownerNames.get(library.userId) ?? ''))
  }

  async list (userId: string, page: Page): Promise<CollectionResultObject<SharedLibraryEntity>> {
    const [libraries, total] = await Promise.all([
      librariesDao.listShared(userId, page.skip, page.limit),
      librariesDao.countShared(userId)
    ])

    return new CollectionResultObject(await this.toEntities(libraries), { ...page, total })
  }

  async get (libraryId: string, userId: string): Promise<SingleResultObject<SharedLibraryEntity>> {
    const library = await this.getAccess(libraryId, userId)
    const [entity] = await this.toEntities([library])

    return new SingleResultObject(entity)
  }

  async listBooks (libraryId: string, userId: string, page: Page, search?: string): Promise<CollectionResultObject<SharedLibraryBookEntity>> {
    const library = await this.getAccess(libraryId, userId)

    const [books, total] = await Promise.all([
      userBooksDao.listShared(library.userId, libraryId, search, library.shareRatings, page),
      userBooksDao.count({ userId: library.userId, librariesIds: [libraryId], search })
    ])

    const opinions = await userBooksDao.findOpinions(userId, books.map(book => book.bookId))
    const opinionsByBook = new Map(opinions.map(opinion => [opinion.bookId, opinion]))
    const entities = books.map(book => new SharedLibraryBookEntity(book, opinionsByBook.get(book.bookId) ?? null))

    return new CollectionResultObject(entities, { ...page, total })
  }

  async leave (libraryId: string, userId: string): Promise<void> {
    if (!await librariesDao.removeMember(libraryId, userId)) {
      throw new LibraryNotFoundError('library not found')
    }
  }
}

export default new SharedLibrariesService()
