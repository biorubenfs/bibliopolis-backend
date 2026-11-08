import { z } from 'zod'
import { TAG_COLORS, TAG_NAME_MAX_LENGTH, TAG_NAME_MIN_LENGTH } from './tags.constants.js'

export const tagNameSchema = z.string()
  .trim()
  // Inner runs of spaces count as one, so «Novela  negra» and «Novela negra» are the same tag
  .transform(value => value.replace(/\s+/g, ' '))
  .pipe(z.string().min(TAG_NAME_MIN_LENGTH).max(TAG_NAME_MAX_LENGTH))

export const newTagSchema = z.object({
  name: tagNameSchema,
  color: z.enum(TAG_COLORS)
})

export const updateTagSchema = newTagSchema.partial()
