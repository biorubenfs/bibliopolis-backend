import { UserBookRating } from '../user-books/user-books.interfaces.js'

/** A shared library that contains a book. */
export interface SharedBookLibrary {
  id: string
  name: string
}

/** One of the users who share a book, with the libraries they share it in. */
export interface SharedBookPerson {
  ownerName: string
  /** Whether they show their ratings in some of these libraries: tells a missing rating from a hidden one */
  sharesRatings: boolean
  /** null if they do not show it, or have not rated the book */
  rating: UserBookRating | null
  libraries: readonly SharedBookLibrary[]
}
