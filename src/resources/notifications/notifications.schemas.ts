import { z } from 'zod'
import { paginationQuerySchema } from '../../pagination.schema.js'

export const notificationsQuerySchema = paginationQuerySchema.extend({
  unread: z.enum(['true', 'false']).transform(value => value === 'true').optional()
})

export const updateNotificationSchema = z.object({
  read: z.boolean()
}).strict()
