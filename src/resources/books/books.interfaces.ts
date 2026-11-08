import { z } from 'zod'
import { BookEntity } from './books.entity.js'
import { createBookSchema, newBookSchema, updateBookSchema } from './books.schema.js'
import { BookCover } from '../../types.js'

export type NewBook = z.infer<typeof newBookSchema>
export type CreateBook = z.infer<typeof createBookSchema>
export type UpdateBook = z.infer<typeof updateBookSchema>
// The fields of a book that are copied to the user books and can be corrected
export type BookSyncData = Pick<BookEntity, 'title' | 'authors' | 'cover'>
export interface NewBookDao {
  title: string
  authors: readonly string[]
  isbn13: string
  isbn10: string | null
  cover: BookCover
}

export type DBBook = Omit<BookEntity, 'id' | 'type' | 'attributes' | 'toResult'> & { _id: string }
