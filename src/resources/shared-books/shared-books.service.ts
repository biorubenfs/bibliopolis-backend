import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import { AccessibleLibrary } from '../libraries/libraries.interfaces.js'
import userBooksDao from '../user-books/user-books.dao.js'
import { SharedUserBookCopy } from '../user-books/user-books.interfaces.js'
import usersDao from '../users/users.dao.js'
import { SharedBookDetailEntity, SharedBookEntity } from './shared-books.entity.js'
import { SharedBookNotFoundError } from './shared-books.error.js'
import { SharedBookLibrary, SharedBookPerson } from './shared-books.interfaces.js'

function byName (a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'es')
}

/**
 * The books of all the libraries shared with a user, each one once. The libraries are read on each request: they are
 * the only access to the books, so nothing is listed from the others that their owners have.
 */
class SharedBooksService {
  private async getOwnerNames (libraries: readonly AccessibleLibrary[]): Promise<ReadonlyMap<string, string>> {
    const owners = await usersDao.findByIds([...new Set(libraries.map(library => library.userId))])
    return new Map(owners.map(owner => [owner.id, owner.name]))
  }

  /** The libraries of a copy: it only has the ids of the ones shared with the user. */
  private toLibraries (copy: SharedUserBookCopy, libraries: readonly AccessibleLibrary[]): readonly SharedBookLibrary[] {
    return libraries
      .filter(library => copy.libraries.includes(library._id))
      .map(library => ({ id: library._id, name: library.name }))
      .sort(byName)
  }

  async list (userId: string, page: Page, search?: string): Promise<CollectionResultObject<SharedBookEntity>> {
    const libraries = await librariesDao.findAccessible(userId)
    if (libraries.length === 0) {
      return new CollectionResultObject<SharedBookEntity>([], { ...page, total: 0 })
    }

    const [bookIds, total, ownerNames] = await Promise.all([
      userBooksDao.listSharedBookIds(libraries, search, page),
      userBooksDao.countSharedBooks(libraries, search),
      this.getOwnerNames(libraries)
    ])
    const [copies, opinions] = await Promise.all([
      userBooksDao.findSharedCopies(bookIds, libraries),
      userBooksDao.findOpinions(userId, bookIds)
    ])

    const entities = bookIds.flatMap(bookId => {
      const bookCopies = copies.filter(copy => copy.bookId === bookId)
      // The book may have been removed from the libraries between both queries
      if (bookCopies.length === 0) return []

      const bookLibraries = bookCopies.flatMap(copy => this.toLibraries(copy, libraries)
        .map(library => ({ ...library, ownerName: ownerNames.get(copy.userId) ?? '' })))
      const opinion = opinions.find(opinion => opinion.bookId === bookId) ?? null
      return [new SharedBookEntity(bookCopies[0], opinion, bookLibraries.sort(byName))]
    })

    return new CollectionResultObject(entities, { ...page, total })
  }

  async get (bookId: string, userId: string): Promise<SingleResultObject<SharedBookDetailEntity>> {
    const libraries = await librariesDao.findAccessible(userId)
    const [copies, [opinion], ownerNames] = await Promise.all([
      userBooksDao.findSharedCopiesWithRatings(bookId, libraries),
      userBooksDao.findOpinions(userId, [bookId]),
      this.getOwnerNames(libraries)
    ])
    // Also for a book of the catalog that nobody shares: the user only has access to the shared ones
    if (copies.length === 0) {
      throw new SharedBookNotFoundError('shared book not found')
    }

    const people: SharedBookPerson[] = copies.map(copy => ({
      ownerName: ownerNames.get(copy.userId) ?? '',
      sharesRatings: copy.sharesRatings,
      rating: copy.rating,
      libraries: this.toLibraries(copy, libraries)
    }))
    people.sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'es'))

    return new SingleResultObject(new SharedBookDetailEntity(copies[0], opinion ?? null, people))
  }
}

export default new SharedBooksService()
