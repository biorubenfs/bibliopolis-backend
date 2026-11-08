import { FindCursor, WithId } from 'mongodb'
import booksDao from '../resources/books/books.dao.js'
import userBooksDao from '../resources/user-books/user-books.dao.js'
import { getBookFromSourcesApis } from '../utils.js'
import { DBBook } from '../resources/books/books.interfaces.js'
import logger from '../logger.js'
import { BooksApiError } from '../error/errors.js'
import { runInTransaction } from '../transaction-helper.js'

export async function syncBooksFromSources (): Promise<void> {
  const booksWithMissingDataCursor = booksDao.collection.find({
    $or: [
      { authors: { $size: 0 } },
      { 'cover.value': { $eq: null } }
    ]
  })

  await updateBooksData(booksWithMissingDataCursor)
}

async function updateBooksData (booksCursor: FindCursor<WithId<DBBook>>): Promise<void> {
  let updated = 0
  let userBooksModified = 0
  let total = 0
  let skipped = 0
  let failed = 0

  try {
    for await (const book of booksCursor) {
      total++
      const isbn = book.isbn13 ?? book.isbn10

      if (isbn == null) {
        logger.warn(`[ UPDATE BOOKS TASK ] book skipped: no ISBN available, bookId: ${book._id}`)
        skipped++
        continue
      }

      try {
        const bookData = await getBookFromSourcesApis(isbn)

        // Only fill what the book is missing: existing data may be handwritten or come from a source that failed today
        const hasNewAuthors = book.authors.length === 0 && bookData.authors.length > 0
        const hasNewCover = book.cover.value == null && bookData.cover.value != null

        if (!hasNewAuthors && !hasNewCover) {
          logger.warn(`[ UPDATE BOOKS TASK ] book skipped: sources returned no useful data, bookId: ${book._id}, isbn: ${isbn}`)
          skipped++
          continue
        }

        const authors = hasNewAuthors ? bookData.authors : book.authors
        const cover = hasNewCover ? bookData.cover : book.cover

        // The same propagation as a correction from the backoffice: the book and its user books change together
        const { modifiedCount } = await runInTransaction(async (session) => {
          const updatedBook = await booksDao.update(book._id, { authors, cover }, session)
          if (updatedBook == null) throw new Error(`book ${book._id} not found`)
          // Wrapped in an object: runInTransaction treats a null or undefined result as an aborted transaction
          return { modifiedCount: await userBooksDao.syncBookData(book._id, { title: updatedBook.title, authors: updatedBook.authors, cover: updatedBook.cover }, session) }
        })
        userBooksModified += modifiedCount
        updated++

        logger.info(`[ UPDATE BOOKS TASK ] book updated, bookId: ${book._id}, isbn: ${isbn}, newAuthors: ${String(hasNewAuthors)}, newCover: ${String(hasNewCover)}`)
      } catch (err) {
        if (err instanceof BooksApiError) {
          logger.warn(`[ UPDATE BOOKS TASK ] book skipped: not found in any source, bookId: ${book._id}, isbn: ${isbn}`)
          skipped++
        } else {
          failed++
          logger.error(`[ UPDATE BOOKS TASK ] failed to process book, bookId: ${book._id}, isbn: ${isbn}`, err)
        }
      }
    }
  } finally {
    await booksCursor.close()
  }

  logger.info(`[ UPDATE BOOKS TASK ] books data update complete, total: ${total}, updated: ${updated}, skipped: ${skipped}, failed: ${failed}, userBooksModified: ${userBooksModified}`)
}
