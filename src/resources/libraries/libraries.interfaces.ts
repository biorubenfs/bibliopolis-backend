import { z } from 'zod'
import { LibraryEntity } from './libraries.entity'
import { newLibrarySchema, updateLibrarySchema } from './libraries.schemas'

export type NewLibrary = z.infer<typeof newLibrarySchema>
export type UpdateLibrary = z.infer<typeof updateLibrarySchema>

/** How a user who is not the owner sees a library: invited as a member, or only because it is public. */
export enum LibraryAccess {
  Member = 'member',
  Public = 'public'
}

export interface LibrariesListFilter {
  ids?: readonly string[]
  search?: string
  favorites?: boolean
  tagIds?: readonly string[]
}

/** The search of the public libraries, which also matches the name of their owners. */
export interface PublicLibrariesListFilter {
  search?: string
  /** The owners whose name matches the search: all their public libraries match it too. */
  matchingOwnerIds?: readonly string[]
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

/**
 * A library as a user who is not its owner sees it: a member, or anyone if it is public. Only the members get the date
 * it was shared with them, and the ratings when the owner shares them: `shareRatings` is always false for the rest.
 */
export type DBSharedLibrary = Pick<DBLibrary, '_id' | 'userId' | 'name' | 'description' | 'shareRatings' | 'isPublic'> & {
  access: LibraryAccess
  booksCount: number
  sharedAt: Date | null
}

/** A library in the list of public libraries. */
export type DBPublicLibrary = Pick<DBLibrary, '_id' | 'userId' | 'name' | 'description'> & {
  booksCount: number
  publishedAt: Date
}
