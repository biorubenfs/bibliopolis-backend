import ApiError from '../../error/api-error.js'
import { ApiRestErrorCode } from '../../error/types.js'

export class TagNotFoundError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.NotFoundError, 404, message)
  }
}

export class TagPermissionsError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.PermissionError, 403, message)
  }
}

export class TagNameConflictError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ConflictError, 409, message)
  }
}

export class TagLimitReachedError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.TagLimitReached, 409, message)
  }
}
