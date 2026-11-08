import { Request, Response, NextFunction, RequestHandler } from 'express'
import { CollectionResultObject, SingleResultObject, MiscResultObject, RedirectResultObject, TokenResultObject, StreamResultObject } from './results.js'
import { Entity, EntityType } from './entity.js'
import { HttpStatusCode } from './types.js'

type StatusCustomController = HttpStatusCode
type DataCustomController =
  SingleResultObject<Entity<EntityType>> |
  CollectionResultObject<Entity<EntityType>> |
  MiscResultObject |
  RedirectResultObject |
  TokenResultObject |
  StreamResultObject |
  null

type CustomController<TBody> = (req: Request<any, any, TBody>) => Promise<{ status: StatusCustomController, data: DataCustomController }>

function handler<TBody> (controller: CustomController<TBody>): RequestHandler<any, any, TBody> {
  return async function (req: Request, res: Response, next: NextFunction) {
    try {
      const { status, data } = await controller(req)

      switch (true) {
        case data instanceof CollectionResultObject:
          res.status(status)
            .json({
              results: data.entities.map(entity => entity.toResult()),
              paginationInfo: data.paginationInfo
            })
          return

        case data instanceof SingleResultObject:
          res.status(status)
            .json(data.meta == null
              ? { results: data.entity.toResult() }
              : { results: data.entity.toResult(), meta: data.meta })
          return

        case data instanceof MiscResultObject:
          res.status(status)
            .json({ results: data.toResult() })
          return

        case data instanceof TokenResultObject:
          res.status(status)
            .json({ results: data.toResult() })
          return

        case data instanceof RedirectResultObject:
          res.redirect(status, data.url.href)
          return

        case data instanceof StreamResultObject:
          res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`)
          res.setHeader('Content-Type', data.contentType)
          res.status(status)
          data.stream.pipe(res)
          return

        case data == null:
          res.sendStatus(status)
          return

        default:
          /* maybe we should throw and error or log something, although all cases are covered */
          res.sendStatus(200)
      }
    } catch (error) {
      next(error)
    }
  }
}

export default handler
