import { z } from 'zod'
import { LibraryEntity } from './libraries.entity'
import { newLibrarySchema, updateLibrarySchema } from './libraries.schemas'

export type NewLibrary = z.infer<typeof newLibrarySchema>
export type UpdateLibrary = z.infer<typeof updateLibrarySchema>

export interface LibrariesListFilter {
  search?: string
  favorites?: boolean
  tagIds?: readonly string[]
}

export type DBLibrary = Omit<LibraryEntity, 'id' | 'type' | 'attributes' | 'toResult'> & { _id: string }

/** Figures of the libraries of a user, for the backoffice. Never their names. */
export interface LibrariesStats {
  count: number
  totalBooks: number
  /** Books in the largest library, or null without libraries. */
  largestBooks: number | null
}
