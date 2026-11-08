import ApiError from '../../error/api-error.js'
import { ApiRestErrorCode } from '../../error/types.js'

export class UserNotFoundError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.NotFoundError, 404, message)
  }
}

export class UserEmailAlreadyExists extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ConflictError, 409, message)
  }
}

export class InvalidCurrentPassword extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.InvalidPassword, 400, message)
  }
}

export class UserPasswordResetForbiddenError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.PermissionError, 403, message)
  }
}
