import dotenv from 'dotenv'
import { z } from 'zod'

// Tests read their own file so that a local .env never leaks into them
dotenv.config({ path: process.env.ENVIRONMENT === 'test' ? '.env.test' : '.env' })

export const ENVIRONMENTS = ['local', 'dev', 'production', 'test'] as const
export type Environment = typeof ENVIRONMENTS[number]

export interface ConfigIssue {
  variable: string
  message: string
}

export class InvalidConfigError extends Error {
  readonly issues: ConfigIssue[]

  constructor (issues: ConfigIssue[]) {
    const lines = issues.map(issue => `  - ${issue.variable}: ${issue.message}`)
    super(['Invalid configuration. Check the .env file or the environment variables:', ...lines].join('\n'))
    this.name = 'InvalidConfigError'
    this.issues = issues
  }
}

const envSchema = z.object({
  ENVIRONMENT: z.enum(ENVIRONMENTS).default('local'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  MONGO_URI: z.string().optional(),
  DEFAULT_ADMIN_NAME: z.string(),
  DEFAULT_ADMIN_EMAIL: z.string().email(),
  DEFAULT_ADMIN_PASSWORD: z.string(),
  JWT_ACCESS_TOKEN_SECRET: z.string(),
  JWT_EXPIRATION: z.string().default('7d'),
  HASH_ROUNDS: z.coerce.number().int().min(4).max(31).default(10),
  OPEN_LIBRARY_DOMAIN: z.string().url().default('https://openlibrary.org'),
  OPEN_LIBRARY_COVER_URL_PATTERN: z.string().default('https://covers.openlibrary.org/b/id/:id-:size.jpg'),
  GOOGLE_BOOKS_DOMAIN: z.string().url().default('https://www.googleapis.com'),
  GOOGLE_BOOKS_COVER_URL_PATTERN: z.string().default('http://books.google.com/books/content?id=:id&printsec=frontcover&img=1&zoom=:size'),
  GOOGLE_BOOKS_API_KEY: z.string().default(''),
  ROBO_HASH_API_BASE_URL: z.string().url().default('https://robohash.org/'),
  DEBUG_STACK_TRACE: z.enum(['true', 'false']).default('false')
})

type Env = z.infer<typeof envSchema>

// Rules that depend on the environment. Checked apart from the schema so that they are
// reported together with the other issues (zod skips refinements when the object itself fails)
function environmentIssues (values: Record<string, string>): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const environment = values.ENVIRONMENT ?? 'local'

  // Tests start an in-memory Mongo, the rest need a real one
  if (environment !== 'test' && values.MONGO_URI == null) {
    issues.push({ variable: 'MONGO_URI', message: 'Required' })
  }

  // The browser only talks to the API from the deployed frontend, which is served over TLS
  if (environment === 'production' && !(values.CORS_ORIGIN ?? '').startsWith('https://')) {
    issues.push({ variable: 'CORS_ORIGIN', message: 'Must be an https:// origin in production' })
  }

  return issues
}

export interface Config {
  environment: Environment
  port: number
  cors: { origin: string }
  mongo: { uri: string }
  defaultAdmin: { name: string, email: string, password: string }
  jwt: { secret: string, expirationTime: string }
  hashRounds: number
  openLibrary: { domain: URL, coverUrlPattern: string }
  googleBooks: { domain: URL, coverUrlPattern: string, apiKey: string }
  roboHashApi: { baseUrl: URL }
  debug: { stackTrace: boolean }
}

// Variables set but empty (`FOO=`) count as missing, so defaults apply and required ones are reported
function dropEmpty (env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value != null && value.trim() !== '') {
      result[key] = value.trim()
    }
  }
  return result
}

function buildConfig (env: Env): Config {
  return {
    environment: env.ENVIRONMENT,
    port: env.PORT,
    cors: {
      origin: env.CORS_ORIGIN
    },
    mongo: {
      uri: env.MONGO_URI ?? ''
    },
    defaultAdmin: {
      name: env.DEFAULT_ADMIN_NAME,
      email: env.DEFAULT_ADMIN_EMAIL,
      password: env.DEFAULT_ADMIN_PASSWORD
    },
    jwt: {
      secret: env.JWT_ACCESS_TOKEN_SECRET,
      expirationTime: env.JWT_EXPIRATION
    },
    hashRounds: env.HASH_ROUNDS,
    openLibrary: {
      domain: new URL(env.OPEN_LIBRARY_DOMAIN),
      coverUrlPattern: env.OPEN_LIBRARY_COVER_URL_PATTERN
    },
    googleBooks: {
      domain: new URL(env.GOOGLE_BOOKS_DOMAIN),
      coverUrlPattern: env.GOOGLE_BOOKS_COVER_URL_PATTERN,
      apiKey: env.GOOGLE_BOOKS_API_KEY
    },
    roboHashApi: {
      baseUrl: new URL(env.ROBO_HASH_API_BASE_URL)
    },
    debug: {
      stackTrace: env.DEBUG_STACK_TRACE === 'true'
    }
  }
}

// Throws InvalidConfigError listing every problem at once
export function loadConfig (env: NodeJS.ProcessEnv): Config {
  const values = dropEmpty(env)
  const parsed = envSchema.safeParse(values)
  const issues = [
    ...(parsed.success ? [] : parsed.error.issues.map(issue => ({ variable: issue.path.join('.'), message: issue.message }))),
    ...environmentIssues(values)
  ]
  if (!parsed.success || issues.length > 0) {
    throw new InvalidConfigError(issues)
  }
  return buildConfig(parsed.data)
}

function loadOrExit (): Config {
  try {
    return loadConfig(process.env)
  } catch (error) {
    // The logger depends on this module, so plain console is the only output available here
    console.error(error instanceof InvalidConfigError ? error.message : error)
    process.exit(1)
  }
}

export default loadOrExit()
