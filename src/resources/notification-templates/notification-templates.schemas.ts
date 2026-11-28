import { z } from 'zod'
import { TEMPLATE_TITLE_MAX_LENGTH } from '../notifications/notifications.types.js'

// The variables are checked in the service, because they depend on the type in the path
export const updateNotificationTemplateSchema = z.object({
  title: z.string().trim().min(1).max(TEMPLATE_TITLE_MAX_LENGTH)
}).strict()
