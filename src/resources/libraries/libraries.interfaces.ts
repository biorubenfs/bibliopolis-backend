import { z } from 'zod'
import { LibraryEntity } from './libraries.entity'
import { newLibrarySchema, updateLibrarySchema } from './libraries.schemas'

export type NewLibrary = z.infer<typeof newLibrarySchema>
export type UpdateLibrary = z.infer<typeof updateLibrarySchema>

export interface LibrariesListFilter {
  ids?: readonly string[]
  search?: string
  favorites?: boolean
  tagIds?: readonly string[]
}

export interface SharedLibrariesListFilter {
  ownerId?: string
  search?: string
  /** The owners whose name matches the search: all their libraries match it too. */
  matchingOwnerIds?: readonly string[]
}

/** A user who can see a library of another one. The owner is not a member. */
export interface LibraryMember {
  userId: string
  createdAt: Date
}

export type DBLibrary = Omit<LibraryEntity, 'id' | 'type' | 'attributes' | 'toResult'> & { _id: string }

/** A library as one of its members sees it, along with the date it was shared with them. */
export type DBSharedLibrary = Pick<DBLibrary, '_id' | 'userId' | 'name' | 'description' | 'shareRatings'> & {
  booksCount: number
  sharedAt: Date
}
