import { z } from 'zod'
import { paginationQuerySchema } from '../../pagination.schema.js'

export const sharedLibraryBooksQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional()
})
