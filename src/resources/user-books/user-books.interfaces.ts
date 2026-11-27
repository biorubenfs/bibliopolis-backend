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

export enum ReadingStatus {
  TO_READ = 'to_read',
  READING = 'reading',
  READ = 'read',
}

export enum DownloadFormat {
  PDF = 'pdf',
  CSV = 'csv',
}

export type DBUserBook = Omit<UserBookEntity, 'id' | 'type' | 'attributes' | 'toResult'> & { _id: string }

/** What the members of a shared library see of a book of its owner. Never the notes; the rating, only if it is shared. */
export type SharedUserBook = Pick<DBUserBook, 'bookId' | 'bookTitle' | 'bookAuthors' | 'bookCover' | 'bookIsbn13' | 'bookIsbn10'> & Partial<Pick<DBUserBook, 'rating'>>

/** The opinion of a user on a book. */
export type UserBookOpinion = Pick<DBUserBook, 'bookId' | 'rating' | 'notes'>

export type UpdateUserBook = z.infer<typeof userBookUpdateSchema>
