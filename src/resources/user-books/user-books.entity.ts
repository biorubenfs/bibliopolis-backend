import { EntityType, Entity } from '../../entity.js'
import { BookCover } from '../../types.js'
import { getCoverUrl } from '../../utils.js'
import { DBUserBook, UserBookRating } from './user-books.interfaces.js'

export class UserBookEntity extends Entity<EntityType.UserBooks> {
  readonly libraries: readonly string[]
  readonly bookId: string
  readonly bookTitle: string
  readonly bookAuthors: readonly string[]
  readonly bookCover: BookCover
  readonly bookIsbn13: string
  // Optional: only an ISBN-13 with prefix 978 has an ISBN-10. Those with prefix 979 were only ever issued as ISBN-13
  readonly bookIsbn10: string | null
  readonly rating: null | UserBookRating
  readonly notes: null | string
  readonly userId: string
  readonly createdAt: Date
  readonly updatedAt: Date

  constructor (data: DBUserBook) {
    super(EntityType.UserBooks, data._id)
    this.libraries = data.libraries
    this.bookId = data.bookId
    this.bookTitle = data.bookTitle
    this.bookAuthors = data.bookAuthors
    this.bookCover = data.bookCover
    this.bookIsbn13 = data.bookIsbn13
    this.bookIsbn10 = data.bookIsbn10
    this.rating = data.rating
    this.notes = data.notes
    this.userId = data.userId
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
  }

  attributes (): Object {
    return {
      libraries: this.libraries,
      bookId: this.bookId,
      bookTitle: this.bookTitle,
      bookAuthors: this.bookAuthors,
      bookCoverUrl: getCoverUrl(this.bookCover.source, this.bookCover.value),
      bookIsbn13: this.bookIsbn13,
      bookIsbn10: this.bookIsbn10,
      rating: this.rating,
      notes: this.notes,
      userId: this.userId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
