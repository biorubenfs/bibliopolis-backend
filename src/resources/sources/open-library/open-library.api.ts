import config from '../../../config.js'
import { SourcesUnavailableError } from '../../../error/errors.js'
import logger from '../../../logger.js'
import { SOURCE_REQUEST_TIMEOUT_MS } from '../sources.constants.js'
import { OpenLibraryAuthor, OpenLibraryBook, OpenLibraryWork } from './open-library.types.js'

class OpenLibraryApi {
  private readonly domain: URL

  constructor (domain: URL) {
    this.domain = domain
  }

  private async fetchJson<T> (url: URL): Promise<T | null> {
    const response = await fetch(url, { signal: AbortSignal.timeout(SOURCE_REQUEST_TIMEOUT_MS) })

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new SourcesUnavailableError(`HTTP error ${response.status}: ${response.statusText}`)
    }

    return await response.json() as T
  }

  // Resolves to null only when the source answers that it does not have the book; any failure rejects
  async fetchBookByIsbn (isbn: string): Promise<OpenLibraryBook | null> {
    const url = new URL(`/isbn/${isbn}.json`, this.domain)
    const book = await this.fetchJson<OpenLibraryBook>(url)
    if (book == null) logger.warn(`Book not found in Open Library API: ${isbn}`)
    return book
  }

  // The cover value is the first cover id; null when the source has no book or no cover for it
  async fetchCoverByIsbn (isbn: string): Promise<string | null> {
    const book = await this.fetchBookByIsbn(isbn)
    const coverId = book?.covers?.at(0)
    return coverId != null ? coverId.toString() : null
  }

  async fetchWorkById (workKey: string): Promise<OpenLibraryWork | null> {
    try {
      const url = new URL(`${workKey}.json`, this.domain)
      const work = await this.fetchJson<OpenLibraryWork>(url)
      if (work == null) logger.warn(`Work not found in Open Library API: ${workKey}`)
      return work
    } catch (error) {
      logger.error(`Error fetching work from Open Library API: ${workKey}`, { error })
      return null
    }
  }

  async fetchAuthorById (identifierKey: string): Promise<string | null> {
    try {
      const url = new URL(`${identifierKey}.json`, this.domain)
      const author = await this.fetchJson<OpenLibraryAuthor>(url)
      if (author == null) {
        logger.warn(`Author not found in Open Library API: ${identifierKey}`)
        return null
      }
      return author.personal_name ?? author.name
    } catch (error) {
      logger.error(`Error fetching author from Open Library API: ${identifierKey}`, { error })
      return null
    }
  }
}

export default new OpenLibraryApi(config.openLibrary.domain)
