import { FindCursor, WithId } from 'mongodb'
import booksDao from '../resources/books/books.dao.js'
import userBooksDao from '../resources/user-books/user-books.dao.js'
import { getBookFromSourcesApis } from '../utils.js'
import { DBBook } from '../resources/books/books.interfaces.js'
import { BookCover } from '../types.js'
import logger from '../logger.js'
import { BooksApiError } from '../error/errors.js'

interface UpdatedBookData {
  bookId: string
  authors: readonly string[]
  cover: BookCover
}

export async function syncBooksFromSources (): Promise<void> {
  const booksWithMissingDataCursor = booksDao.collection.find({
    $or: [
      { authors: { $size: 0 } },
      { 'cover.value': { $eq: null } }
    ]
  })

  const updatedBooks = await updateBooksData(booksWithMissingDataCursor)
  await updateUserBooksData(updatedBooks)
}

async function updateBooksData (booksCursor: FindCursor<WithId<DBBook>>): Promise<UpdatedBookData[]> {
  const updatedBooks: UpdatedBookData[] = []
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

        await booksDao.collection.updateOne(
          { _id: book._id },
          {
            $set: {
              authors,
              cover,
              updatedAt: new Date()
            }
          }
        )

        logger.info(`[ UPDATE BOOKS TASK ] book updated, bookId: ${book._id}, isbn: ${isbn}, newAuthors: ${String(hasNewAuthors)}, newCover: ${String(hasNewCover)}`)

        updatedBooks.push({
          bookId: book._id,
          authors,
          cover
        })
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

  logger.info(`[ UPDATE BOOKS TASK ] books data update complete, total: ${total}, updated: ${updatedBooks.length}, skipped: ${skipped}, failed: ${failed}`)
  return updatedBooks
}

async function updateUserBooksData (updatedBooks: UpdatedBookData[]): Promise<void> {
  if (updatedBooks.length === 0) return

  const bulkOps = updatedBooks.map(({ bookId, authors, cover }) => ({
    updateMany: {
      filter: { bookId },
      update: {
        $set: {
          bookAuthors: authors,
          bookCover: cover
        }
      }
    }
  }))

  const result = await userBooksDao.collection.bulkWrite(bulkOps)

  logger.info(`[ UPDATE BOOKS TASK ] userBooks sync complete, modifiedCount: ${result.modifiedCount}`)
}
