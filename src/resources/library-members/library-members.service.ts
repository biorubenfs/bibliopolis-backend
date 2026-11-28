import { CollectionResultObject, SingleResultObject } from '../../results.js'
import { Page } from '../../types.js'
import librariesDao from '../libraries/libraries.dao.js'
import { LibraryNotFoundError } from '../libraries/libraries.error.js'
import { LibraryMember } from '../libraries/libraries.interfaces.js'
import librariesService from '../libraries/libraries.service.js'
import usersDao from '../users/users.dao.js'
import notificationsDao from '../notifications/notifications.dao.js'
import notificationsService from '../notifications/notifications.service.js'
import { runInTransaction } from '../../transaction-helper.js'
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
    const library = await librariesService.get(libraryId, ownerId)

    const user = await usersDao.findByEmail(email)
    // An admin has no access to the libraries: for the owner, it is as if the account did not exist
    if (user == null || user.role !== Role.Regular) {
      throw new UserNotFoundError('user not found')
    }
    if (user.id === ownerId) {
      throw new OwnerCannotBeMemberError('the owner cannot be a member of the library')
    }

    // Only a fallback: the name shown is looked up when the notification is read
    const ownerName = (await usersDao.findById(ownerId))?.name ?? ''

    const member = await runInTransaction(async (session) => {
      const added = await librariesDao.addMember(libraryId, user.id, session)
      if (added == null) {
        throw await this.explainRejectedMember(libraryId, user.id)
      }
      await notificationsService.notifyLibraryShared(user, library.entity, { id: ownerId, name: ownerName }, session)
      return added
    })
    return new SingleResultObject(new LibraryMemberEntity(member, user))
  }

  async remove (libraryId: string, memberUserId: string, ownerId: string): Promise<void> {
    await librariesService.get(libraryId, ownerId)

    await runInTransaction(async (session) => {
      if (!await librariesDao.removeMember(libraryId, memberUserId, session)) {
        throw new LibraryMemberNotFoundError('member not found')
      }
      // Without access, the notification would lead nowhere
      await notificationsDao.deleteLibraryShared(libraryId, memberUserId, session)
      return true
    })
  }
}

export default new LibraryMembersService()
