import { Router } from 'express'
import handler from '../../handler.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { HttpStatusCode } from '../../types.js'
import { publicLibrariesQuerySchema } from './public-libraries.schemas.js'
import publicLibrariesService from './public-libraries.service.js'

const publicLibrariesRouter = Router()

publicLibrariesRouter.get('/', queryParamsValidator(publicLibrariesQuerySchema), handler(async (req) => {
  const { skip, limit, search } = req.query
  const result = await publicLibrariesService.list(req.userId ?? '', { skip, limit }, search)
  return { status: HttpStatusCode.OK, data: result }
}))

export default publicLibrariesRouter
