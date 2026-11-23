import { z } from 'zod'
import { ISBNUtils } from '../../utils/isbn.utils.js'

export const externalQuerySchema = z.object({
  isbn: z.string()
    .transform(ISBNUtils.sanitizeIsbn)
    .refine(
      (isbn) => ISBNUtils.isValidIsbn10(isbn) || ISBNUtils.isValidIsbn13(isbn),
      { message: 'Invalid ISBN-10 or ISBN-13' }
    )
})
