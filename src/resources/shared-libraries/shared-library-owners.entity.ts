import { EntityType, Entity } from '../../entity.js'
import { UserEntity } from '../users/users.entity.js'

/** A user who shares libraries with another one. Their email and role are private. */
export class SharedLibraryOwnerEntity extends Entity<EntityType.SharedLibraryOwners> {
  readonly name: string
  readonly librariesCount: number

  constructor (owner: UserEntity, librariesCount: number) {
    super(EntityType.SharedLibraryOwners, owner.id)
    this.name = owner.name
    this.librariesCount = librariesCount
  }

  attributes (): Object {
    return {
      name: this.name,
      librariesCount: this.librariesCount
    }
  }
}
