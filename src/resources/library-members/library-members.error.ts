import ApiError from '../../error/api-error.js'
import { ApiRestErrorCode } from '../../error/types.js'

export class LibraryMemberNotFoundError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.NotFoundError, 404, message)
  }
}

export class OwnerCannotBeMemberError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ValidationError, 400, message)
  }
}

export class AlreadyLibraryMemberError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ConflictError, 409, message)
  }
}

export class LibraryMembersLimitReachedError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.LibraryMembersLimitReached, 409, message)
  }
}
