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

export type UpdateUserBook = z.infer<typeof userBookUpdateSchema>
