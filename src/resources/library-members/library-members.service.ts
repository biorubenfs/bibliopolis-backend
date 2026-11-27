import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import { LibraryNotFoundError } from '../libraries/libraries.error.js'
import { LibraryMember } from '../libraries/libraries.interfaces.js'
import librariesService from '../libraries/libraries.service.js'
import usersDao from '../users/users.dao.js'
import { UserNotFoundError } from '../users/users.error.js'
import { Role } from '../users/users.interfaces.js'
import { MAX_MEMBERS_PER_LIBRARY } from './library-members.constants.js'
import { LibraryMemberEntity } from './library-members.entity.js'
import { AlreadyLibraryMemberError, LibraryMemberNotFoundError, LibraryMembersLimitReachedError, OwnerCannotBeMemberError } from './library-members.error.js'

/** The members of a library, managed by its owner: librariesService.get rejects anyone else. */
class LibraryMembersService {
  /** Tells why a member could not be added. It is only asked afterwards, so the check and the insertion stay atomic. */
  private async explainRejectedMember (libraryId: string, userId: string): Promise<Error> {
    const library = await librariesDao.findById(libraryId)
    if (library == null) {
      return new LibraryNotFoundError('library not found')
    }
    if (library.members.some(member => member.userId === userId)) {
      return new AlreadyLibraryMemberError('user is already a member of the library')
    }
    return new LibraryMembersLimitReachedError(`a library cannot have more than ${MAX_MEMBERS_PER_LIBRARY} members`)
  }

  async list (libraryId: string, ownerId: string, page: Page): Promise<CollectionResultObject<LibraryMemberEntity>> {
    const library = await librariesService.get(libraryId, ownerId)
    const { members } = library.entity

    // New members are added at the end: newest first
    const pageMembers: readonly LibraryMember[] = [...members].reverse().slice(page.skip, page.skip + page.limit)
    const users = await usersDao.findByIds(pageMembers.map(member => member.userId))
    const usersById = new Map(users.map(user => [user.id, user]))
    const entities = pageMembers.flatMap(member => {
      const user = usersById.get(member.userId)
      return user == null ? [] : [new LibraryMemberEntity(member, user)]
    })

    return new CollectionResultObject(entities, { ...page, total: members.length })
  }

  async invite (libraryId: string, email: string, ownerId: string): Promise<SingleResultObject<LibraryMemberEntity>> {
    await librariesService.get(libraryId, ownerId)

    const user = await usersDao.findByEmail(email)
    // An admin has no access to the libraries: for the owner, it is as if the account did not exist
    if (user == null || user.role !== Role.Regular) {
      throw new UserNotFoundError('user not found')
    }
    if (user.id === ownerId) {
      throw new OwnerCannotBeMemberError('the owner cannot be a member of the library')
    }

    const member = await librariesDao.addMember(libraryId, user.id)
    if (member == null) {
      throw await this.explainRejectedMember(libraryId, user.id)
    }
    return new SingleResultObject(new LibraryMemberEntity(member, user))
  }

  async remove (libraryId: string, memberUserId: string, ownerId: string): Promise<void> {
    await librariesService.get(libraryId, ownerId)

    if (!await librariesDao.removeMember(libraryId, memberUserId)) {
      throw new LibraryMemberNotFoundError('member not found')
    }
  }
}

export default new LibraryMembersService()
