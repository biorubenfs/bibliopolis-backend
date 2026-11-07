import { z } from 'zod'
import { importRequestSchema } from './imports.schemas.js'

export enum ImportStatus {
  Queued = 'queued',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed'
}

export enum ImportItemOutcome {
  Queued = 'queued',
  Added = 'added',
  AlreadyInLibrary = 'already_in_library',
  DuplicateInFile = 'duplicate_in_file',
  NotFound = 'not_found',
  InvalidIsbn = 'invalid_isbn',
  MissingIsbn = 'missing_isbn',
  SourceError = 'source_error',
  InternalError = 'internal_error'
}

export enum ImportItemResolution {
  Dismissed = 'dismissed',
  Manual = 'manual'
}

export const ACTION_REQUIRED_OUTCOMES: readonly ImportItemOutcome[] = [
  ImportItemOutcome.NotFound,
  ImportItemOutcome.InvalidIsbn,
  ImportItemOutcome.MissingIsbn,
  ImportItemOutcome.SourceError,
  ImportItemOutcome.InternalError
]

export const RETRYABLE_OUTCOMES: readonly ImportItemOutcome[] = [
  ImportItemOutcome.SourceError,
  ImportItemOutcome.InternalError
]

export interface DBImport {
  _id: string
  userId: string
  libraryId: string
  fileName: string
  status: ImportStatus
  createdAt: Date
  updatedAt: Date
  finishedAt: Date | null
}

export interface DBImportItem {
  _id: string
  importId: string
  row: number
  rawIsbn: string | null
  isbn13: string | null
  outcome: ImportItemOutcome
  bookTitle: string | null
  resolution: ImportItemResolution | null
}

export type NewImportItem = Omit<DBImportItem, '_id' | 'importId' | 'bookTitle' | 'resolution'>

export interface ImportCounts {
  total: number
  processed: number
  queued: number
  added: number
  alreadyInLibrary: number
  duplicateInFile: number
  notFound: number
  invalidIsbn: number
  missingIsbn: number
  sourceError: number
  internalError: number
  pending: number
  retryable: number
}

export type ImportRequest = z.infer<typeof importRequestSchema>

export interface ImportItemsFilter {
  outcomes?: readonly ImportItemOutcome[]
  pending?: boolean
}
