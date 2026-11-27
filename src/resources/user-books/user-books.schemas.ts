import { z } from 'zod'
import { paginationQuerySchema } from '../../pagination.schema.js'
import { UserBookRating, DownloadFormat, ReadingStatus } from './user-books.interfaces.js'

/** Today in UTC plus one day, as YYYY-MM-DD: a day that is already today somewhere ahead of UTC is not in the future. */
function latestAllowedDay (): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export const userBookUpdateSchema = z.object({
  // rating: z.union([
  //   z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  //   z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10),
  // ]).nullable(),
  rating: z.nativeEnum(UserBookRating).nullable(),
  notes: z.string().trim().max(150).nullable(),
  readingStatus: z.nativeEnum(ReadingStatus).nullable(),
  // A day, without time. YYYY-MM-DD strings sort as dates
  finishedAt: z.string().date().nullable()
}).superRefine((data, ctx) => {
  if (data.finishedAt == null) return
  if (data.readingStatus !== ReadingStatus.READ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['finishedAt'], message: 'only a read book can have a finish date' })
  }
  if (data.finishedAt > latestAllowedDay()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['finishedAt'], message: 'the finish date cannot be in the future' })
  }
}).transform((data) => ({
  ...data,
  // Stored at 00:00 UTC, so the day does not change with the time zone
  finishedAt: data.finishedAt == null ? null : new Date(`${data.finishedAt}T00:00:00.000Z`)
}))

export const userBooksQuerySchema = paginationQuerySchema.extend({
  userId: z.string().optional(),
  libraryId: z.union([z.string(), z.array(z.string())]).optional(),
  search: z.string().trim().max(100).optional()
})

export const userBooksDownloadQuerySchema = z.object({
  libraryId: z.string(),
  format: z.nativeEnum(DownloadFormat).default(DownloadFormat.PDF)
})
