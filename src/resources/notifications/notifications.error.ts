import ApiError from '../../error/api-error.js'
import { ApiRestErrorCode } from '../../error/types.js'

export class NotificationNotFoundError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.NotFoundError, 404, message)
  }
}
