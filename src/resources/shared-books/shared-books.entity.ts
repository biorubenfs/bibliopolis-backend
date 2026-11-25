import { EntityType, Entity } from '../../entity.js'
import { BookCover } from '../../types.js'
import { getCoverUrl } from '../../utils.js'
import { SharedUserBook, UserBookOpinion, UserBookRating } from '../user-books/user-books.interfaces.js'
import { SharedBookLibrary, SharedBookPerson } from './shared-books.interfaces.js'

type BookData = Omit<SharedUserBook, 'rating'>

/** A book of the libraries shared with a user, identified by the book of the catalog. */
abstract class BaseSharedBookEntity extends Entity<EntityType.SharedBooks> {
  readonly bookTitle: string
  readonly bookAuthors: readonly string[]
  readonly bookCover: BookCover
  readonly bookIsbn13: string
  readonly bookIsbn10: string | null
  /** The opinion of the user, or null if the book is not in any of their own libraries */
  readonly own: { rating: UserBookRating | null, notes: string | null } | null

  constructor (book: BookData, opinion: UserBookOpinion | null) {
    super(EntityType.SharedBooks, book.bookId)
    this.bookTitle = book.bookTitle
    this.bookAuthors = book.bookAuthors
    this.bookCover = book.bookCover
    this.bookIsbn13 = book.bookIsbn13
    this.bookIsbn10 = book.bookIsbn10
    this.own = opinion == null ? null : { rating: opinion.rating, notes: opinion.notes }
  }

  attributes (): Object {
    return {
      bookTitle: this.bookTitle,
      bookAuthors: this.bookAuthors,
      bookCoverUrl: getCoverUrl(this.bookCover.source, this.bookCover.value),
      bookIsbn13: this.bookIsbn13,
      bookIsbn10: this.bookIsbn10,
      own: this.own
    }
  }
}

/** In a list: where the book is, without the ratings of the owners. */
export class SharedBookEntity extends BaseSharedBookEntity {
  readonly libraries: ReadonlyArray<SharedBookLibrary & { ownerName: string }>

  constructor (book: BookData, opinion: UserBookOpinion | null, libraries: ReadonlyArray<SharedBookLibrary & { ownerName: string }>) {
    super(book, opinion)
    this.libraries = libraries
  }

  attributes (): Object {
    return { ...super.attributes(), libraries: this.libraries }
  }
}

/** On its own: who shares the book, with the ratings they show. */
export class SharedBookDetailEntity extends BaseSharedBookEntity {
  readonly people: readonly SharedBookPerson[]

  constructor (book: BookData, opinion: UserBookOpinion | null, people: readonly SharedBookPerson[]) {
    super(book, opinion)
    this.people = people
  }

  attributes (): Object {
    return { ...super.attributes(), people: this.people }
  }
}
