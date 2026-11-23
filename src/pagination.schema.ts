import { z } from 'zod'

/** Query params of the paginated endpoints: extend it with the filters of each one. */
export const paginationQuerySchema = z.object({
  skip: z.string().default('0')
    .transform(val => parseInt(val))
    .refine(val => !isNaN(val) && val >= 0, 'skip must be a number >= 0'),
  limit: z.string().default('10')
    .transform(val => parseInt(val))
    .refine(val => !isNaN(val) && val > 0 && val <= 100, 'limit must be a number > 0 and <= 100')
})
