import { z } from 'zod'
import { TagEntity } from './tags.entity.js'
import { newTagSchema, updateTagSchema } from './tags.schemas.js'
import { TAG_COLORS } from './tags.constants.js'

export type TagColor = typeof TAG_COLORS[number]
export type NewTag = z.infer<typeof newTagSchema>
export type UpdateTag = z.infer<typeof updateTagSchema>

export type DBTag = Omit<TagEntity, 'id' | 'type' | 'attributes' | 'toResult'> & {
  _id: string
  /** Name used to compare tags: case-insensitive. Not exposed in the API. */
  normalizedName: string
}
