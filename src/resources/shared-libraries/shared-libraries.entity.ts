import { EntityType, Entity } from '../../entity.js'
import { DBSharedLibrary, LibraryAccess } from '../libraries/libraries.interfaces.js'

/**
 * A library as a user who is not its owner sees it, as a member or because it is public: without the favorite mark, the
 * tags or the id of its owner.
 */
export class SharedLibraryEntity extends Entity<EntityType.SharedLibraries> {
  readonly name: string
  readonly description: string | null
  readonly ownerName: string
  readonly booksCount: number
  /** Always false for who is not a member */
  readonly shareRatings: boolean
  readonly isPublic: boolean
  readonly access: LibraryAccess
  /** When it was shared with the user; null for who is not a member */
  readonly sharedAt: Date | null

  constructor (data: DBSharedLibrary, ownerName: string) {
    super(EntityType.SharedLibraries, data._id)
    this.name = data.name
    this.description = data.description
    this.ownerName = ownerName
    this.booksCount = data.booksCount
    this.shareRatings = data.shareRatings
    this.isPublic = data.isPublic
    this.access = data.access
    this.sharedAt = data.sharedAt
  }

  attributes (): Object {
    return {
      name: this.name,
      description: this.description,
      ownerName: this.ownerName,
      booksCount: this.booksCount,
      shareRatings: this.shareRatings,
      isPublic: this.isPublic,
      access: this.access,
      sharedAt: this.sharedAt
    }
  }
}
