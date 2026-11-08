import { z } from 'zod'
import { BooksSource } from '../sources/sources.types.js'
import { ISBNUtils } from '../../utils/isbn.utils.js'
import { MAX_TAGS_PER_LIBRARY } from '../tags/tags.constants.js'

const tagIdsSchema = z.array(z.string().ulid())
  .max(MAX_TAGS_PER_LIBRARY)
  .refine(ids => new Set(ids).size === ids.length, { message: 'tagIds must not contain duplicates' })

export const newLibrarySchema = z.object({
  name: z.string().trim().min(3).max(50),
  description: z.string().trim().max(100),
  // Optional and without a default: a default would also apply to PATCH bodies derived with
  // partial(), and editing only the name would remove the tags
  tagIds: tagIdsSchema.optional()
})

// isFavorite is only changed through PATCH: a new library is never a favorite
export const updateLibrarySchema = newLibrarySchema.partial().extend({
  isFavorite: z.boolean().optional()
})

export const librariesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  // Only "true" is accepted: "false" would be ambiguous (non-favorites or no filter)
  favorites: z.literal('true').transform(() => true).optional(),
  // Comma-separated tag IDs; the libraries must have all of them
  tags: z.string()
    .transform(value => value.split(',').map(id => id.trim()).filter(id => id !== ''))
    .pipe(z.array(z.string().ulid()).max(MAX_TAGS_PER_LIBRARY))
    .optional()
})

export const addBookToLibrarySchema = z.object({
  title: z.string().trim(),
  isbn13: z.string().trim().transform((val) => val.replace(/[-\s]/g, '')).nullable(),
  isbn10: z.string().trim().transform((val) => val.replace(/[-\s]/g, '')).nullable(),
  authors: z.array(z.string()).default([]),
  cover: z.object({
    source: z.nativeEnum(BooksSource).nullable(),
    value: z.string().nullable()
  }).default({ source: null, value: null })
}).refine(
  (data) => data.isbn13 != null || data.isbn10 != null,
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

export const bookIsbnSchema = z.object({ isbn: z.string() })
