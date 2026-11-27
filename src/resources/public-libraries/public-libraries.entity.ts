import { EntityType, Entity } from '../../entity.js'
import { DBPublicLibrary } from '../libraries/libraries.interfaces.js'

/** A public library in the list that any user sees: without the favorite mark, the tags or the id of its owner. */
export class PublicLibraryEntity extends Entity<EntityType.PublicLibraries> {
  readonly name: string
  readonly description: string | null
  readonly ownerName: string
  readonly booksCount: number
  readonly publishedAt: Date

  constructor (data: DBPublicLibrary, ownerName: string) {
    super(EntityType.PublicLibraries, data._id)
    this.name = data.name
    this.description = data.description
    this.ownerName = ownerName
    this.booksCount = data.booksCount
    this.publishedAt = data.publishedAt
  }

  attributes (): Object {
    return {
      name: this.name,
      description: this.description,
      ownerName: this.ownerName,
      booksCount: this.booksCount,
      publishedAt: this.publishedAt
    }
  }
}
