import 'dotenv/config'

function parseString (value?: string, dflt = ''): string {
  return value ?? dflt
}

function parseNumber (value?: string, dflt = 0): number {
  return value != null ? parseInt(value) : dflt
}

function parseUrl (value?: string, dflt = ''): URL {
  return new URL(value ?? dflt)
}

function parseBoolean (value?: string, dflt = false): boolean {
  return value != null ? value.toLowerCase() === 'true' : dflt
}

export default {
  environment: parseString(process.env.ENVIRONMENT, 'local'),
  port: parseNumber(process.env.PORT, 3000),
  cors: {
    origin: parseString(process.env.CORS_ORIGIN, 'http://localhost:4200')
  },
  mongo: {
    uri: parseString(process.env.MONGO_URI)
  },
  defaultAdmin: {
    name: parseString(process.env.DEFAULT_ADMIN_NAME),
    email: parseString(process.env.DEFAULT_ADMIN_EMAIL),
    password: parseString(process.env.DEFAULT_ADMIN_PASSWORD)
  },
  jwt: {
    secret: parseString(process.env.JWT_ACCESS_TOKEN_SECRET),
    expirationTime: parseString(process.env.JWT_EXPIRATION, '7d')
  },
  hashRounds: parseNumber(process.env.HASH_ROUNDS, 10),
  openLibrary: {
    domain: parseUrl(process.env.OPEN_LIBRARY_DOMAIN, 'https://openlibrary.org'),
    coverUrlPattern: parseString(process.env.OPEN_LIBRARY_COVER_URL_PATTERN)
  },
  googleBooks: {
    domain: parseUrl(process.env.GOOGLE_BOOKS_DOMAIN, 'https://www.googleapis.com'),
    coverUrlPattern: parseString(process.env.GOOGLE_BOOKS_COVER_URL_PATTERN),
    apiKey: parseString(process.env.GOOGLE_BOOKS_API_KEY)
  },
  roboHashApi: {
    baseUrl: parseUrl(process.env.ROBO_HASH_API_BASE_URL, 'https://robohash.org/')
  },
  debug: {
    stackTrace: parseBoolean(process.env.DEBUG_STACK_TRACE, false)
  }
}
