import { describe, expect, it } from 'vitest'
import { InvalidConfigError, loadConfig } from '../../config.js'

const validEnv = {
  ENVIRONMENT: 'production',
  MONGO_URI: 'mongodb://mongo:27017/bibliopolis',
  DEFAULT_ADMIN_NAME: 'admin',
  DEFAULT_ADMIN_EMAIL: 'admin@example.com',
  DEFAULT_ADMIN_PASSWORD: 'secret',
  JWT_ACCESS_TOKEN_SECRET: 'a-secret',
  CORS_ORIGIN: 'https://bibliopolis.es'
}

function issuesOf (env: NodeJS.ProcessEnv): string[] {
  try {
    loadConfig(env)
  } catch (error) {
    if (error instanceof InvalidConfigError) {
      return error.issues.map(issue => issue.variable)
    }
    throw error
  }
  return []
}

describe('loadConfig', () => {
  it('should build the config from a complete environment', () => {
    const config = loadConfig({ ...validEnv, PORT: '3001', DEBUG_STACK_TRACE: 'true' })

    expect(config.environment).equals('production')
    expect(config.port).equals(3001)
    expect(config.mongo.uri).equals(validEnv.MONGO_URI)
    expect(config.defaultAdmin).toEqual({ name: 'admin', email: 'admin@example.com', password: 'secret' })
    expect(config.jwt).toEqual({ secret: 'a-secret', expirationTime: '7d' })
    expect(config.hashRounds).equals(10)
    expect(config.openLibrary.domain.href).equals('https://openlibrary.org/')
    expect(config.googleBooks.apiKey).equals('')
    expect(config.debug.stackTrace).equals(true)
  })

  it('should apply the defaults when optional variables are missing', () => {
    const config = loadConfig({ ...validEnv, ENVIRONMENT: undefined, CORS_ORIGIN: undefined })

    expect(config.environment).equals('local')
    expect(config.port).equals(3000)
    expect(config.cors.origin).equals('http://localhost:4200')
    expect(config.debug.stackTrace).equals(false)
  })

  it('should report every missing required variable at once', () => {
    const issues = issuesOf({ ENVIRONMENT: 'production' })

    expect(issues).toEqual(expect.arrayContaining([
      'MONGO_URI', 'DEFAULT_ADMIN_NAME', 'DEFAULT_ADMIN_EMAIL', 'DEFAULT_ADMIN_PASSWORD', 'JWT_ACCESS_TOKEN_SECRET', 'CORS_ORIGIN'
    ]))
  })

  it('should treat empty values as missing', () => {
    expect(issuesOf({ ...validEnv, JWT_ACCESS_TOKEN_SECRET: '   ' })).toEqual(['JWT_ACCESS_TOKEN_SECRET'])
  })

  it('should not require MONGO_URI in the test environment', () => {
    const config = loadConfig({ ...validEnv, ENVIRONMENT: 'test', MONGO_URI: undefined, CORS_ORIGIN: undefined })

    expect(config.mongo.uri).equals('')
  })

  it.each([
    ['an unknown ENVIRONMENT', { ENVIRONMENT: 'staging' }, 'ENVIRONMENT'],
    ['a non numeric PORT', { PORT: 'abc' }, 'PORT'],
    ['a PORT out of range', { PORT: '70000' }, 'PORT'],
    ['an invalid admin email', { DEFAULT_ADMIN_EMAIL: 'not-an-email' }, 'DEFAULT_ADMIN_EMAIL'],
    ['an invalid URL', { OPEN_LIBRARY_DOMAIN: 'openlibrary.org' }, 'OPEN_LIBRARY_DOMAIN'],
    ['HASH_ROUNDS below the minimum', { HASH_ROUNDS: '2' }, 'HASH_ROUNDS'],
    ['an invalid DEBUG_STACK_TRACE', { DEBUG_STACK_TRACE: 'yes' }, 'DEBUG_STACK_TRACE']
  ])('should reject %s', (_name, overrides, variable) => {
    expect(issuesOf({ ...validEnv, ...overrides })).toEqual([variable])
  })

  it.each([
    ['http', 'http://bibliopolis.es'],
    ['localhost', 'http://localhost:4200'],
    ['a wildcard', '*']
  ])('should reject a CORS_ORIGIN with %s in production', (_name, origin) => {
    expect(issuesOf({ ...validEnv, CORS_ORIGIN: origin })).toEqual(['CORS_ORIGIN'])
  })

  it('should accept a non https CORS_ORIGIN outside production', () => {
    expect(issuesOf({ ...validEnv, ENVIRONMENT: 'dev', CORS_ORIGIN: 'http://localhost:4200' })).toEqual([])
  })

  it('should list the problems in the error message', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'abc', MONGO_URI: undefined }))
      .toThrowError(/- PORT: .*\n.*- MONGO_URI: Required/)
  })
})
