import ApiError from '../../error/api-error.js'
import { ApiRestErrorCode } from '../../error/types.js'

export class BookAlreadyExistsError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ConflictError, 409, message)
  }
}

export class BookNotFoundError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.NotFoundError, 404, message)
  }
}

export class CoverNotAvailableError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.CoverNotAvailable, 422, message)
  }
}
