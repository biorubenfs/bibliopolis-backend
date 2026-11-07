import { Request } from 'express'
import { Page } from './types.js'
import config from './config.js'
import { BooksSource } from './resources/sources/sources.types.js'
import { BooksApiError, SourcesUnavailableError } from './error/errors.js'
import logger from './logger.js'
import googleBooksApi from './resources/sources/google-books/google-books.api.js'
import openLibraryApi from './resources/sources/open-library/open-library.api.js'
import { NewBook } from './resources/books/books.interfaces.js'
import { ISBNUtils } from './utils/isbn.utils.js'

export enum CoverSize {
  S = 'S',
  M = 'M',
  L = 'L'
}

export function isNotNull<T> (value: T | null): value is T {
  return value !== null
}

/* At this point we know that skip and limit query params are strings parseable to
number without errors because this function should be applied after query params middleware */
export function parseSkipLimitQP (req: Request): Page {
  const { skip, limit } = req.query
  if (typeof skip !== 'string' || typeof limit !== 'string') {
    throw new Error('should not happen')
  }
  return { skip: parseInt(skip), limit: parseInt(limit) }
}

interface CoverConfig {
  pattern: string
  defaultSize: string
  sizeValues: readonly string[]
}

const coverConfigs: Record<BooksSource, CoverConfig> = {
  [BooksSource.OPEN_LIBRARY]: {
    pattern: config.openLibrary.coverUrlPattern,
    defaultSize: CoverSize.M,
    sizeValues: [CoverSize.S, CoverSize.M, CoverSize.L]
  },
  [BooksSource.GOOGLE_BOOKS]: {
    pattern: config.googleBooks.coverUrlPattern,
    defaultSize: '1',
    sizeValues: ['0', '1', '2', '3', '4', '5']
  }
}

export function getCoverUrl (source: BooksSource | null, coverId: string | null, size?: any): string | null {
  if (coverId == null || source == null) return null
  const cfg = coverConfigs[source]

  if (!cfg.sizeValues.includes(size)) {
    size = cfg.defaultSize
  }

  return cfg.pattern
    .replace(':id', coverId.toString())
    .replace(':size', size ?? cfg.defaultSize)
}

export function ensureArray (value: string | string[] | undefined | null): string[] | null {
  if (value == null) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

export function transformImageToBase64 (imageDate: ArrayBuffer): string {
  const buffer = Buffer.from(imageDate)
  return buffer.toString('base64')
}

export function neverReached (param: never): never {
  throw new Error(`Unhandled case: ${String(param)}`)
}

// function notNullish<T> (value: T): value is NonNullable<T> {
//   return value != null // filter null and undefined
// }

export async function getBookFromSourcesApis (isbn: string): Promise<NewBook> {
  const [googleBooksResult, openLibraryResult] = await Promise.allSettled([
    googleBooksApi.fetchBookByIsbn(isbn),
    openLibraryApi.fetchBookByIsbn(isbn)
  ])

  if (googleBooksResult.status === 'rejected') {
    logger.error(`Error fetching book from Google Books API: ${isbn}`, { error: googleBooksResult.reason })
  }
  if (openLibraryResult.status === 'rejected') {
    logger.error(`Error fetching book from Open Library API: ${isbn}`, { error: openLibraryResult.reason })
  }

  const googleBooksVolume = googleBooksResult.status === 'fulfilled' ? googleBooksResult.value : null
  const openLibraryBook = openLibraryResult.status === 'fulfilled' ? openLibraryResult.value : null

  const cover = googleBooksVolume?.volumeInfo.imageLinks != null
    ? {
        source: BooksSource.GOOGLE_BOOKS,
        value: googleBooksVolume.id
      }
    : openLibraryBook?.covers != null && openLibraryBook.covers.length > 0 && openLibraryBook.covers[0] != null
      ? {
          source: BooksSource.OPEN_LIBRARY,
          value: openLibraryBook.covers[0].toString()
        }
      : {
          source: null,
          value: null
        }

  const openLibraryAuthors = openLibraryBook?.authors != null
    ? await Promise.allSettled(openLibraryBook.authors.map(async author =>
      await openLibraryApi.fetchAuthorById(author.key)
    )).then(results => results
      .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((name): name is string => name != null && name !== '')
    )
    : []

  const authors = googleBooksVolume?.volumeInfo.authors != null
    ? googleBooksVolume.volumeInfo.authors
    : openLibraryAuthors ?? []

  // The sources may answer with another edition or list several ISBNs, so only the requested one is
  // reliable. The rest of the data can still belong to another edition: see docs/api/external.md
  const { isbn10, isbn13 } = ISBNUtils.sanitizeIsbn(isbn).length === 10
    ? ISBNUtils.calculateIsbns(isbn, null)
    : ISBNUtils.calculateIsbns(null, isbn)

  const bookData: NewBook = {
    title: googleBooksVolume?.volumeInfo.title ?? openLibraryBook?.title ?? '',
    isbn13,
    isbn10,
    authors,
    cover
  }

  if (bookData.title == null || bookData.title === '') {
    // A source that failed might have the book, so we cannot claim that it does not exist
    if (googleBooksResult.status === 'rejected' || openLibraryResult.status === 'rejected') {
      throw new SourcesUnavailableError('Book sources are currently unavailable')
    }

    throw new BooksApiError('Book not found in any source')
  }

  return bookData
}
