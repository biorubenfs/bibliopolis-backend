import { z } from 'zod'
import { paginationQuerySchema } from '../../pagination.schema.js'
import { userBooksDownloadQuerySchema } from '../user-books/user-books.schemas.js'

export const sharedLibrariesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  // The ID of one of the owners
  owner: z.string().ulid().optional()
})

export const sharedLibraryBooksQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional()
})

export const sharedLibraryDownloadQuerySchema = userBooksDownloadQuerySchema.pick({ format: true })
