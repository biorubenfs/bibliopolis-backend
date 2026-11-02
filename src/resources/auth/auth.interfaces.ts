import { z } from 'zod'
import { loginSchema } from './auth.schemas.js'

export type Login = z.infer<typeof loginSchema>
