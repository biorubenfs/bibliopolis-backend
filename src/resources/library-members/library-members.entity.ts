import { EntityType, Entity } from '../../entity.js'
import { LibraryMember } from '../libraries/libraries.interfaces.js'
import { UserEntity } from '../users/users.entity.js'

/** A member as the owner of the library sees it, identified by their user: only their name and email. */
export class LibraryMemberEntity extends Entity<EntityType.LibraryMembers> {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly createdAt: Date

  constructor (member: LibraryMember, user: Pick<UserEntity, 'name' | 'email'>) {
    super(EntityType.LibraryMembers, member.userId)
    this.userId = member.userId
    this.name = user.name
    this.email = user.email
    this.createdAt = member.createdAt
  }

  attributes (): Object {
    return {
      userId: this.userId,
      name: this.name,
      email: this.email,
      createdAt: this.createdAt
    }
  }
}
