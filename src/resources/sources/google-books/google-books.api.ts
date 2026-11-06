import config from '../../../config.js'
import { SourcesUnavailableError } from '../../../error/errors.js'
import logger from '../../../logger.js'
import { SOURCE_REQUEST_TIMEOUT_MS } from '../sources.constants.js'
import { GoogleBooksVolume } from './google-books.types.js'

class GoogleBooksApi {
  private readonly domain: URL
  private readonly apiKey: string

  constructor (domain: URL, apiKey: string) {
    this.domain = domain
    this.apiKey = apiKey
  }

  // Resolves to null only when the source answers that it does not have the book; any failure rejects
  async fetchBookByIsbn (isbn: string): Promise<GoogleBooksVolume | null> {
    const url = new URL('/books/v1/volumes', this.domain)
    url.searchParams.set('q', `isbn:${isbn}`)
    url.searchParams.set('key', this.apiKey)

    const response = await fetch(url, { signal: AbortSignal.timeout(SOURCE_REQUEST_TIMEOUT_MS) })

    if (response.status === 404) {
      logger.warn(`Book not found in Google Books API: ${isbn}`)
      return null
    }

    if (!response.ok) {
      throw new SourcesUnavailableError(`HTTP error ${response.status}: ${response.statusText}`)
    }

    const responseData = await response.json()

    if (responseData.items == null || responseData.items.length === 0) {
      logger.warn(`Book not found in Google Books API: ${isbn}`)
      return null
    }

    return responseData.items.at(0) ?? null
  }
}

export default new GoogleBooksApi(config.googleBooks.domain, config.googleBooks.apiKey)
