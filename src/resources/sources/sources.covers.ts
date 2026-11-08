import { SourcesUnavailableError } from '../../error/errors.js'
import logger from '../../logger.js'
import { BookCover } from '../../types.js'
import { apiSources } from './sources.config.js'
import { BooksSource } from './sources.types.js'

export interface BookIsbns {
  isbn13: string
  isbn10: string | null
}

export type SourceCover = BookCover & { source: BooksSource, value: string }

/**
 * Asks one source for the cover of a book: first by ISBN-13 and, if it has none, by ISBN-10.
 * Resolves to null when the source has no cover; rejects when the source fails.
 */
export async function fetchCoverFromSource (source: BooksSource, isbns: BookIsbns): Promise<SourceCover | null> {
  const config = apiSources.find(apiSource => apiSource.name === source)
  if (config == null) return null

  for (const isbn of [isbns.isbn13, isbns.isbn10]) {
    if (isbn == null) continue
    const value = await config.fetchCover(isbn)
    if (value != null) return { source, value }
  }

  return null
}

/**
 * Asks every source for the cover of a book, in priority order, and returns those that have one.
 * A failing source is skipped; if all of them fail, there is no way to tell that there are no covers.
 */
export async function fetchCoversFromSources (isbns: BookIsbns): Promise<SourceCover[]> {
  const results = await Promise.allSettled(apiSources.map(async apiSource => await fetchCoverFromSource(apiSource.name, isbns)))

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(`Error fetching cover from ${apiSources[index].name}: ${isbns.isbn13}`, { error: result.reason })
    }
  })

  if (results.every(result => result.status === 'rejected')) {
    throw new SourcesUnavailableError('Book sources are currently unavailable')
  }

  return results
    .map(result => result.status === 'fulfilled' ? result.value : null)
    .filter((cover): cover is SourceCover => cover != null)
}
