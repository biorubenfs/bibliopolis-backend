import { z } from 'zod'
import { emailSchema } from '../users/users.schemas.js'

export const inviteMemberSchema = z.object({
  email: emailSchema
})
