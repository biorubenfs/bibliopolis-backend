import { Router } from 'express'
import handler from '../../handler.js'
import { queryParamsValidator } from '../../middlewares/query-params-validator.middleware.js'
import { CoverSize, getBookFromSourcesApis, getCoverUrl } from '../../utils.js'
import { HttpStatusCode } from '../../types.js'
import { MiscResultObject } from '../../results.js'
import booksService from '../books/books.service.js'
import { externalQuerySchema } from './external.schemas.js'

const externalRouter = Router()

externalRouter.get('/', queryParamsValidator(externalQuerySchema), handler(async (req) => {
  const { isbn } = req.query

  // TODO: Do this in a service
  let result: MiscResultObject

  // First check if the book exists in the local collection, if it does return it, otherwise fetch it from the open library API
  const bookInCollection = await booksService.fetchByIsbn(isbn)

  if (bookInCollection != null) {
    result = new MiscResultObject('book-result', {
      title: bookInCollection?.title ?? null,
      isbn13: bookInCollection?.isbn13 ?? null,
      isbn10: bookInCollection?.isbn10 ?? null,
      authors: bookInCollection?.authors ?? null,
      coverUrl: bookInCollection?.cover != null ? getCoverUrl(bookInCollection.cover.source, bookInCollection.cover.value, CoverSize.L) : null
    })
  } else {
    const bookData = await getBookFromSourcesApis(isbn)

    result = new MiscResultObject('book-result', {
      ...bookData,
      coverUrl: getCoverUrl(bookData.cover?.source, bookData.cover?.value, CoverSize.L)
    })
  }

  return { status: HttpStatusCode.OK, data: result }
})
)

export default externalRouter
