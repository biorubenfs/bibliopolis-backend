import { EntityType, Entity } from '../../entity.js'
import { BookCover } from '../../types.js'
import { getCoverUrl } from '../../utils.js'
import { DBBook } from './books.interfaces.js'

export class BookEntity extends Entity<EntityType.Books> {
  readonly title: string
  readonly authors: readonly string[]
  readonly isbn13: string
  // Optional: only an ISBN-13 with prefix 978 has an ISBN-10. Those with prefix 979 were only ever issued as ISBN-13
  readonly isbn10: string | null
  readonly cover: BookCover
  readonly createdAt: Date
  readonly updatedAt: Date

  constructor (data: DBBook) {
    super(EntityType.Books, data._id)
    this.title = data.title
    this.authors = data.authors
    this.isbn13 = data.isbn13
    this.isbn10 = data.isbn10
    this.cover = data.cover
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
  }

  attributes (): Object {
    return {
      title: this.title,
      authors: this.authors,
      isbn13: this.isbn13,
      isbn10: this.isbn10,
      coverUrl: getCoverUrl(this.cover.source, this.cover.value),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
