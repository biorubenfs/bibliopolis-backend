import { GoogleBooksVolume } from './google-books/google-books.types.js'
import { OpenLibraryBook } from './open-library/open-library.types.js'

export enum BooksSource {
  OPEN_LIBRARY = 'open_library',
  GOOGLE_BOOKS = 'google_books'
}

export interface ApiSourcesConfig {
  name: BooksSource
  fetch: (isbn: string) => Promise<OpenLibraryBook | GoogleBooksVolume | null>
  // Resolves to the cover value of the book, or null if the source has no cover for it; any failure rejects
  fetchCover: (isbn: string) => Promise<string | null>
}
