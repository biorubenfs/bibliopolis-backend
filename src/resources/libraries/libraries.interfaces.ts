import { z } from 'zod'
import { LibraryEntity } from './libraries.entity'
import { newLibrarySchema, updateLibrarySchema } from './libraries.schemas'

export type NewLibrary = z.infer<typeof newLibrarySchema>
export type UpdateLibrary = z.infer<typeof updateLibrarySchema>

export interface LibrariesListFilter {
  search?: string
  favorites?: boolean
}

export type DBLibrary = Omit<LibraryEntity, 'id' | 'type' | 'attributes' | 'toResult'> & { _id: string }
