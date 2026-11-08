import googleBooksApi from './google-books/google-books.api.js'
import openLibraryApi from './open-library/open-library.api.js'
import { ApiSourcesConfig, BooksSource } from './sources.types.js'

// Define API sources in priority order (first to last)
export const apiSources: readonly ApiSourcesConfig[] = [
  {
    name: BooksSource.GOOGLE_BOOKS,
    fetch: googleBooksApi.fetchBookByIsbn.bind(googleBooksApi),
    fetchCover: googleBooksApi.fetchCoverByIsbn.bind(googleBooksApi)
  },
  {
    name: BooksSource.OPEN_LIBRARY,
    fetch: openLibraryApi.fetchBookByIsbn.bind(openLibraryApi),
    fetchCover: openLibraryApi.fetchCoverByIsbn.bind(openLibraryApi)
  }
  // Add more sources here in order of priority
]
