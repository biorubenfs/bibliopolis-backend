import { EntityType, Entity } from '../../entity.js'
import { BookCover } from '../../types.js'
import { getCoverUrl } from '../../utils.js'
import { SharedUserBook, UserBookOpinion, UserBookRating } from '../user-books/user-books.interfaces.js'

/** A book of a shared library as a member sees it, identified by the book of the catalog. */
export class SharedLibraryBookEntity extends Entity<EntityType.SharedLibraryBooks> {
  readonly bookTitle: string
  readonly bookAuthors: readonly string[]
  readonly bookCover: BookCover
  readonly bookIsbn13: string
  readonly bookIsbn10: string | null
  /** null if the owner does not share the ratings, or has not rated the book */
  readonly ownerRating: UserBookRating | null
  /** The opinion of the member, or null if the book is not in any of their own libraries */
  readonly own: { rating: UserBookRating | null, notes: string | null } | null

  constructor (book: SharedUserBook, opinion: UserBookOpinion | null) {
    super(EntityType.SharedLibraryBooks, book.bookId)
    this.bookTitle = book.bookTitle
    this.bookAuthors = book.bookAuthors
    this.bookCover = book.bookCover
    this.bookIsbn13 = book.bookIsbn13
    this.bookIsbn10 = book.bookIsbn10
    this.ownerRating = book.rating ?? null
    this.own = opinion == null ? null : { rating: opinion.rating, notes: opinion.notes }
  }

  attributes (): Object {
    return {
      bookTitle: this.bookTitle,
      bookAuthors: this.bookAuthors,
      bookCoverUrl: getCoverUrl(this.bookCover.source, this.bookCover.value),
      bookIsbn13: this.bookIsbn13,
      bookIsbn10: this.bookIsbn10,
      ownerRating: this.ownerRating,
      own: this.own
    }
  }
}
