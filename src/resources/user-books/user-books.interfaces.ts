import { UserBookEntity } from './user-books.entity.js'
import z from 'zod'
import { userBookUpdateSchema } from './user-books.schemas.js'

// export type UserBookRating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export enum UserBookRating {
  ONE = 1,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
  NINE,
  TEN,
}

export enum DownloadFormat {
  PDF = 'pdf',
  CSV = 'csv',
}

export type DBUserBook = Omit<UserBookEntity, 'id' | 'type' | 'attributes' | 'toResult'> & { _id: string }

export interface NewUserBook {
  libraryId: string
  bookIsbn13: string
  bookIsbn10: string
  bookId: string
  bookTitle: string
  bookAuthors: readonly string[]
  bookCover: null | number
  rating: null
  notes: null
  userId: string
}

export type UpdateUserBook = z.infer<typeof userBookUpdateSchema>

/** Figures of the books of a user, for the backoffice. Never their titles. */
export interface UserBooksStats {
  total: number
  rated: number
  withoutLibrary: number
  /** Average of the rated books, or null if none is rated. */
  averageRating: number | null
  /** Books with each rating; ratings without books are left out. */
  ratingCounts: ReadonlyArray<{ rating: UserBookRating, count: number }>
}
