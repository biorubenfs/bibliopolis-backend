import { z } from 'zod'
import { BooksSource } from '../sources/sources.types.js'
import { ISBNUtils } from '../../utils/isbn.utils.js'

export const newBookSchema = z
  .object({
    title: z.string(),
    authors: z.array(z.string()),
    isbn13: z.string().trim().transform((val) => val.replace(/[-\s]/g, '')).nullable().optional().default(null),
    isbn10: z.string().trim().transform((val) => val.replace(/[-\s]/g, '')).nullable().optional().default(null),
    cover: z.object({
      source: z.nativeEnum(BooksSource).nullable(),
      value: z.string().nullable()
    }).default({ source: null, value: null })
  })
  .refine(
    (data) => data.isbn13 !== null || data.isbn10 !== null,
    {
      message: 'Either isbn13 or isbn10 must be provided',
      path: ['isbn13']
    }
  )
  .refine((data) => {
    if (data.isbn13 != null && !ISBNUtils.isValidIsbn13(data.isbn13)) {
      return false
    }
    return true
  }, {
    message: 'isbn13 must be a valid ISBN-13',
    path: ['isbn13']
  })
  .refine((data) => {
    if (data.isbn10 != null && !ISBNUtils.isValidIsbn10(data.isbn10)) {
      return false
    }
    return true
  }, {
    message: 'isbn10 must be a valid ISBN-10',
    path: ['isbn10']
  })
  .refine((data) => {
    if (data.isbn13 != null && data.isbn10 != null) {
      const calculatedIsbns = ISBNUtils.calculateIsbns(data.isbn10, data.isbn13)
      return calculatedIsbns.isbn13 === data.isbn13 && calculatedIsbns.isbn10 === data.isbn10
    }
    return true
  }, {
    message: 'isbn13 and isbn10 do not correspond to the same book',
    path: ['isbn13', 'isbn10']
  })

const isbnSchema = z.string()
  .transform(ISBNUtils.sanitizeIsbn)
  .refine((value) => ISBNUtils.isValidIsbn10(value) || ISBNUtils.isValidIsbn13(value), { message: 'Invalid ISBN-10 or ISBN-13' })

const titleSchema = z.string().trim().min(1)
const authorsSchema = z.array(z.string().trim().min(1))

// Strict: the cover always comes from the sources, so a body with a cover (or any other field) is rejected
export const createBookSchema = z.discriminatedUnion('mode', [
  // The data comes from the sources
  z.object({
    mode: z.literal('sources'),
    isbn: isbnSchema
  }).strict(),
  // Written by the admin; the book has no cover until a source has one
  z.object({
    mode: z.literal('manual'),
    isbn: isbnSchema,
    title: titleSchema,
    authors: authorsSchema.min(1)
  }).strict()
])

// Strict: the ISBNs cannot be changed
export const updateBookSchema = z.object({
  title: titleSchema.optional(),
  authors: authorsSchema.optional(),
  // The backend asks that source for the cover of the book; null removes the cover
  coverSource: z.nativeEnum(BooksSource).nullable().optional()
}).strict().refine(
  (data) => data.title !== undefined || data.authors !== undefined || data.coverSource !== undefined,
  { message: 'At least one of title, authors or coverSource must be provided' }
)

export const booksQuerySchema = z.object({
  search: z.string().trim().max(100).optional()
})
