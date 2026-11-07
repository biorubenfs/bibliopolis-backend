import { EntityType, Entity } from '../../entity.js'
import { DBLibrary } from './libraries.interfaces.js'

export class LibraryEntity extends Entity<EntityType.Libraries> {
  readonly name: string
  readonly description: string
  readonly userId: string
  readonly books: string[]
  readonly isFavorite: boolean
  readonly createdAt: Date
  readonly updatedAt: Date

  constructor (data: DBLibrary) {
    super(EntityType.Libraries, data._id)
    this.name = data.name
    this.description = data.description
    this.userId = data.userId
    this.books = data.books
    this.isFavorite = data.isFavorite
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
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
