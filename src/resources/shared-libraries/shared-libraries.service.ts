import { CollectionResultObject, SingleResultObject, StreamResultObject } from '../../results.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import { LibraryNotFoundError } from '../libraries/libraries.error.js'
import { DBSharedLibrary, SharedLibrariesListFilter } from '../libraries/libraries.interfaces.js'
import userBooksDao from '../user-books/user-books.dao.js'
import userBooksService from '../user-books/user-books.service.js'
import { DownloadFormat } from '../user-books/user-books.interfaces.js'
import usersDao from '../users/users.dao.js'
import notificationsDao from '../notifications/notifications.dao.js'
import { runInTransaction } from '../../transaction-helper.js'
import { SharedLibraryEntity } from './shared-libraries.entity.js'
import { SharedLibraryOwnerEntity } from './shared-library-owners.entity.js'
import { SharedLibraryBookEntity } from './shared-library-books.entity.js'

type SharedLibrariesQuery = Pick<SharedLibrariesListFilter, 'search' | 'ownerId'>

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

  /** The names of the owners are in their users: the ones that match are found before searching the libraries. */
  private async toListFilter (userId: string, { search, ownerId }: SharedLibrariesQuery): Promise<SharedLibrariesListFilter> {
    if (search == null || search === '') return { ownerId }

    const ownerIds = await librariesDao.findSharedOwnerIds(userId)
    return { ownerId, search, matchingOwnerIds: await usersDao.findIdsByName(ownerIds, search) }
  }

  async list (userId: string, page: Page, query: SharedLibrariesQuery = {}): Promise<CollectionResultObject<SharedLibraryEntity>> {
    const filter = await this.toListFilter(userId, query)
    const [libraries, total] = await Promise.all([
      librariesDao.listShared(userId, page.skip, page.limit, filter),
      librariesDao.countShared(userId, filter)
    ])

    return new CollectionResultObject(await this.toEntities(libraries), { ...page, total })
  }

  /** Who shares libraries with the user, by name. Sorted and paginated here because the names are in the users. */
  async listOwners (userId: string, page: Page): Promise<CollectionResultObject<SharedLibraryOwnerEntity>> {
    const counts = new Map((await librariesDao.countSharedByOwner(userId)).map(owner => [owner.userId, owner.count]))
    const owners = await usersDao.findByIds([...counts.keys()])
    const entities = owners
      .map(owner => new SharedLibraryOwnerEntity(owner, counts.get(owner.id) ?? 0))
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, 'es')
        // The id keeps the order of the owners with the same name
        return byName !== 0 ? byName : a.id.localeCompare(b.id)
      })

    return new CollectionResultObject(entities.slice(page.skip, page.skip + page.limit), { ...page, total: entities.length })
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

  /** The same files as the owner gets: they have neither the ratings nor the notes */
  async download (libraryId: string, userId: string, format?: DownloadFormat): Promise<StreamResultObject> {
    const library = await this.getAccess(libraryId, userId)
    return await userBooksService.exportLibrary({ ...library, id: library._id }, format)
  }

  async leave (libraryId: string, userId: string): Promise<void> {
    await runInTransaction(async (session) => {
      if (!await librariesDao.removeMember(libraryId, userId, session)) {
        throw new LibraryNotFoundError('library not found')
      }
      await notificationsDao.deleteLibraryShared(libraryId, userId, session)
      return true
    })
  }
}

export default new SharedLibrariesService()
