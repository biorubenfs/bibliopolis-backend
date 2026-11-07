import { describe, expect, it } from 'vitest'
import { SourcesUnavailableError } from '../../error/errors.js'
import logger from '../../logger.js'

function logLine (info: Record<string, unknown>): string {
  // Winston adds the level under this symbol before formatting, and colorize reads it
  const entry = { level: 'error', [Symbol.for('level')]: 'error', message: 'Something failed', ...info }
  const formatted = logger.format.transform(entry) as unknown as Record<symbol, string>
  return formatted[Symbol.for('message')]
}

describe('logger', () => {
  it('should keep the line as it was without an error', () => {
    const line = logLine({})

    expect(line).toMatch(/ - \[ .*ERROR.* \]: Something failed$/)
  })

  it('should add only the message of an ApiError, an expected failure that can repeat for many rows', () => {
    const line = logLine({ error: new SourcesUnavailableError('HTTP error 403: blocked') })

    expect(line).toMatch(/Something failed - HTTP error 403: blocked$/)
    expect(line).not.toContain('\n')
  })

  it('should add the stack of an unexpected error', () => {
    const line = logLine({ error: new RangeError('out of range') })

    expect(line).toContain('Something failed - RangeError: out of range')
    expect(line).toContain('logger.test.ts')
  })

  it('should add the cause, which is where a network failure explains itself', () => {
    const line = logLine({ error: new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND books.example') }) })

    expect(line).toContain('TypeError: fetch failed')
    expect(line).toContain('Caused by: Error: getaddrinfo ENOTFOUND books.example')
  })

  it('should add a value that is not an error', () => {
    expect(logLine({ error: 'a plain text' })).toMatch(/Something failed - a plain text$/)
  })
})
