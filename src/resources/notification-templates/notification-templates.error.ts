import ApiError from '../../error/api-error.js'
import { ApiRestErrorCode } from '../../error/types.js'

export class NotificationTemplateNotFoundError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.NotFoundError, 404, message)
  }
}

export class InvalidTemplateVariableError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.InvalidTemplateVariable, 400, message)
  }
}
