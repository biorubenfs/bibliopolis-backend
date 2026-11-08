import z from 'zod'

export const loginSchema = z.object({
  // Emails are stored in lower case
  email: z.string().trim().toLowerCase().email(),
  password: z.string()
})
