import { z } from 'zod'
import { ImportItemOutcome, ImportItemResolution } from './imports.interfaces.js'

const columnIndexSchema = z.string().regex(/^\d+$/, 'must be a column index').transform(Number)
const booleanQueryParamSchema = z.enum(['true', 'false'])
const outcomeSchema = z.nativeEnum(ImportItemOutcome)

export const importRequestSchema = z.object({
  libraryId: z.string().min(1),
  // A repeated multipart field: one value arrives as a string
  isbnColumns: z.union([columnIndexSchema, z.array(columnIndexSchema)])
    .optional()
    .transform(value => value == null ? undefined : [...new Set([value].flat())])
})

export const createImportQuerySchema = z.object({
  dryRun: booleanQueryParamSchema.optional()
})

export const listImportsQuerySchema = z.object({
  libraryId: z.string().min(1)
})

export const listImportItemsQuerySchema = z.object({
  outcome: z.union([outcomeSchema, z.array(outcomeSchema)]).optional(),
  pending: booleanQueryParamSchema.optional()
})

export const updateImportItemSchema = z.object({
  resolution: z.nativeEnum(ImportItemResolution).nullable()
})
