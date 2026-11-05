import { z } from 'zod'

// Applies to the passwords being set. The login and the current password are not checked against
// it, so that users whose password predates these limits can still authenticate.
const newPasswordSchema = z.string().min(6).max(20)

export const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: newPasswordSchema
})

export const updatePasswordSchema = z.object({
  currentPassword: z.string().max(20),
  newPassword: newPasswordSchema
})

export const updateUserSchema = createUserSchema.pick({ name: true })
