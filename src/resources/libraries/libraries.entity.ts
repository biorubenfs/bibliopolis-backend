import { EntityType, Entity } from '../../entity.js'
import { DBLibrary, LibraryMember } from './libraries.interfaces.js'

export class LibraryEntity extends Entity<EntityType.Libraries> {
  readonly name: string
  readonly description: string | null
  readonly userId: string
  readonly books: string[]
  readonly isFavorite: boolean
  /** Whether the members of the library see the ratings of the owner. The notes are never shared */
  readonly shareRatings: boolean
  readonly tagIds: string[]
  /** The users who can see the library, oldest first. Private: only its own endpoints expose them */
  readonly members: readonly LibraryMember[]
  /** Whether any user can see the library, without being invited */
  readonly isPublic: boolean
  /** When the library was last made public; null while it is private */
  readonly publishedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date

  constructor (data: DBLibrary) {
    super(EntityType.Libraries, data._id)
    this.name = data.name
    this.description = data.description
    this.userId = data.userId
    this.books = data.books
    this.isFavorite = data.isFavorite
    this.shareRatings = data.shareRatings
    this.tagIds = data.tagIds
    this.members = data.members
    this.isPublic = data.isPublic
    this.publishedAt = data.publishedAt
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
  }

  attributes (): Object {
    return {
      name: this.name,
      description: this.description,
      userId: this.userId,
      books: this.books,
      isFavorite: this.isFavorite,
      shareRatings: this.shareRatings,
      tagIds: this.tagIds,
      isPublic: this.isPublic,
      publishedAt: this.publishedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
