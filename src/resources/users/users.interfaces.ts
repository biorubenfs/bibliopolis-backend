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
