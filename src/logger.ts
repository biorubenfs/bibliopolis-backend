import { createLogger, format, transports } from 'winston'
import config from './config.js'
import ApiError from './error/api-error.js'

/** An ApiError is an expected failure, and it may repeat for many rows: its message is enough */
function describeError (error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (!(error instanceof Error)) return String(error)

  const cause = error.cause != null ? `\nCaused by: ${describeError(error.cause)}` : ''
  return `${error.stack ?? error.message}${cause}`
}

const logger = createLogger({
  level: config.environment === 'test' ? 'silent' : 'info',
  transports: [
    new transports.Console()
  ],
  format: format.combine(
    format.timestamp(),
    format((info) => {
      info.level = info.level.toUpperCase()
      return info
    })(),
    format.colorize({ colors: { info: 'green', warn: 'yellow', error: 'red' } }),
    format.printf(({ level, message, timestamp, error }) => {
      const detail = error != null ? ` - ${describeError(error)}` : ''
      return `${String(timestamp)} - [ ${level} ]: ${String(message)}${detail}`
    })
  )
})

export default logger
