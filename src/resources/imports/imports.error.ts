import ApiError from '../../error/api-error.js'
import { ApiRestErrorCode } from '../../error/types.js'

export class ImportNotFoundError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.NotFoundError, 404, message)
  }
}

export class ImportPermissionsError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.PermissionError, 403, message)
  }
}

export class InvalidImportFileError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.InvalidImportFile, 400, message)
  }
}

export class ImportTooManyRowsError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ImportTooManyRows, 400, message)
  }
}

export class ImportWithoutIsbnColumnError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ImportWithoutIsbnColumn, 400, message)
  }
}

export class ImportWithoutValidIsbnError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ImportWithoutValidIsbn, 400, message)
  }
}

export class ImportFileTooLargeError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ImportFileTooLarge, 413, message)
  }
}

export class ImportAlreadyActiveError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ImportAlreadyActive, 409, message)
  }
}

export class ImportNothingToRetryError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ConflictError, 409, message)
  }
}

export class ImportItemNotResolvableError extends ApiError {
  constructor (message: string) {
    super(ApiRestErrorCode.ConflictError, 409, message)
  }
}
