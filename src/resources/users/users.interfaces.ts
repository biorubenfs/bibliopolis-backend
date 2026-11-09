// import { z } from 'zod'
// import { updateUserSchema } from './users.schemas.js'
import { UserEntity } from './users.entity.js'

export type CreateUser = Pick<UserEntity, 'name' | 'email' | 'password' | 'avatar'>
export type UpdateUser = Pick<UserEntity, 'name' | 'avatar'>
export type DBUser = Omit<UserEntity, 'id' | 'type' | 'attributes' | 'toResult'> & { _id: string }
export enum Role {
  Regular = 'regular',
  Admin = 'admin'
}

export interface UsersListFilter {
  search?: string
}

// export type UpdateUser = z.infer<typeof updateUserSchema>

/** Statistics of a regular user for the backoffice: only figures, never names or titles. */
export interface UserStats {
  libraries: {
    count: number
    /** Not rounded. A book in two libraries counts in both. 0 without libraries. */
    averageBooks: number
    /** Books in the largest library, or null without libraries. */
    largestBooks: number | null
  }
  books: {
    total: number
    rated: number
    unrated: number
    withoutLibrary: number
  }
  ratings: {
    /** Not rounded; null if no book is rated. */
    average: number | null
    /** Always the ten keys, from "1" to "10". */
    distribution: Record<string, number>
  }
}
