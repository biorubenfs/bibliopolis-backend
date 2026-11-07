import { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { MAX_IMPORT_FILE_SIZE_BYTES } from '../resources/imports/imports.constants.js'
import { ImportFileTooLargeError, InvalidImportFileError } from '../resources/imports/imports.error.js'

const upload = multer({
  storage: multer.memoryStorage(),
  // Browsers send the file name in UTF-8 without declaring it
  defParamCharset: 'utf8',
  limits: {
    fileSize: MAX_IMPORT_FILE_SIZE_BYTES,
    files: 1,
    fields: 50,
    fieldSize: 16 * 1024
  }
}).single('file')

export function uploadCsv (req: Request, res: Response, next: NextFunction): void {
  void upload(req, res, (error: unknown) => {
    if (error == null) {
      next()
    } else if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new ImportFileTooLargeError(`the file exceeds the limit of ${MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)} MB`))
    } else {
      next(new InvalidImportFileError(error instanceof Error ? error.message : 'invalid multipart request'))
    }
  })
}
