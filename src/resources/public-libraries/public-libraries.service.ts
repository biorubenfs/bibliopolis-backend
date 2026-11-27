import { CollectionResultObject } from '../../results.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import { PublicLibrariesListFilter } from '../libraries/libraries.interfaces.js'
import usersDao from '../users/users.dao.js'
import { PublicLibraryEntity } from './public-libraries.entity.js'

/**
 * The list of the public libraries of other users. Their details and books are read through the shared libraries,
 * which give access to the public ones too.
 */
class PublicLibrariesService {
  /** The names of the owners are in their users: the ones that match are found before searching the libraries. */
  private async toListFilter (userId: string, search?: string): Promise<PublicLibrariesListFilter> {
    if (search == null || search === '') return {}

    const ownerIds = await librariesDao.findPublicOwnerIds(userId)
    return { search, matchingOwnerIds: await usersDao.findIdsByName(ownerIds, search) }
  }

  async list (userId: string, page: Page, search?: string): Promise<CollectionResultObject<PublicLibraryEntity>> {
    const filter = await this.toListFilter(userId, search)
    const [libraries, total] = await Promise.all([
      librariesDao.listPublic(userId, page.skip, page.limit, filter),
      librariesDao.countPublic(userId, filter)
    ])

    // The names are not copied into the libraries because their owners can change them
    const owners = await usersDao.findByIds([...new Set(libraries.map(library => library.userId))])
    const ownerNames = new Map(owners.map(owner => [owner.id, owner.name]))
    const entities = libraries.map(library => new PublicLibraryEntity(library, ownerNames.get(library.userId) ?? ''))

    return new CollectionResultObject(entities, { ...page, total })
  }
}

export default new PublicLibrariesService()
