import { z } from 'zod'
import { UserBookRating, DownloadFormat } from './user-books.interfaces.js'

export const userBookUpdateSchema = z.object({
  // rating: z.union([
  //   z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  //   z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10),
  // ]).nullable(),
  rating: z.nativeEnum(UserBookRating).nullable(),
  notes: z.string().trim().max(150).nullable()
})

export const userBooksQuerySchema = z.object({
  userId: z.string().optional(),
  libraryId: z.union([z.string(), z.array(z.string())]).optional(),
  search: z.string().trim().max(100).optional()
})

export const userBooksDownloadQuerySchema = z.object({
  libraryId: z.string(),
  format: z.nativeEnum(DownloadFormat).default(DownloadFormat.PDF)
})
