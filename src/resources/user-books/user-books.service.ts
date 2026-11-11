import { CollectionResultObject, SingleResultObject, StreamResultObject } from '../../results.js'
import { Page } from '../../types.js'
import { LibraryPermissionsError } from '../libraries/libraries.error.js'
import librariesService from '../libraries/libraries.service.js'
import librariesDao from '../libraries/libraries.dao.js'

import { DownloadFormat, UpdateUserBook } from './user-books.interfaces.js'
import userBooksDao from './user-books.dao.js'
import { UserBookEntity } from './user-books.entity.js'
import { UserBookPermissionsError, UserBookNotFoundError } from './user-books.error.js'
import { createLibraryBooksPDFStream } from '../../utils/pdf-creator.utils.js'
import { createLibraryBooksCSVStream } from '../../utils/csv-creator.utils.js'

class UserBooksService {
  async list (page: Page, userId: string, filter: { userId?: string, librariesIds?: readonly string[], search?: string }): Promise<CollectionResultObject<UserBookEntity>> {
    if (filter.userId != null && filter.userId !== userId) {
      throw new UserBookPermissionsError('user can only list this own books')
    }

    if (filter.librariesIds != null) {
      // A single count checks the ownership of the requested libraries, instead of loading every library of the user
      const requestedIds = [...new Set(filter.librariesIds)]
      const ownedCount = await librariesDao.countByIds(requestedIds, userId)
      if (ownedCount !== requestedIds.length) {
        throw new LibraryPermissionsError('user can only list books from own libraries')
      }
    }

    // Without libraries, every book of the user that is still in some library
    const mongoFilter = { ...filter, userId, inAnyLibrary: filter.librariesIds == null }

    const [userBooks, total] = await Promise.all([
      userBooksDao.list(mongoFilter, page.skip, page.limit),
      userBooksDao.count(mongoFilter)
    ])

    const mockPaginationObject = { ...page, total }
    return new CollectionResultObject(userBooks, mockPaginationObject)
  }

  async get (id: string, userId: string): Promise<SingleResultObject<UserBookEntity>> {
    const userBook = await userBooksDao.findById(id)

    if (userBook == null || userBook.userId !== userId) {
      throw new UserBookNotFoundError('user book not found')
    }

    return new SingleResultObject(userBook)
  }

  async update (id: string, userId: string, data: UpdateUserBook): Promise<SingleResultObject<UserBookEntity>> {
    const updUserBookEntity = await userBooksDao.update(id, userId, data)
    if (updUserBookEntity == null) {
      throw new UserBookNotFoundError('user book not found')
    }
    return new SingleResultObject(updUserBookEntity)
  }

  async download (libraryId: string, userId: string, format: DownloadFormat = DownloadFormat.PDF): Promise<StreamResultObject> {
    const library = await librariesService.get(libraryId, userId)

    const booksCursor = await userBooksDao.listCursor({ userId, librariesIds: [libraryId] })

    const safeName = library.entity.name.replace(/[^a-z0-9_-]/gi, '_')

    if (format === DownloadFormat.CSV) {
      const stream = await createLibraryBooksCSVStream(booksCursor)
      return new StreamResultObject(stream, 'text/csv; charset=utf-8', `${safeName}.csv`)
    }

    const total = await userBooksDao.count({ userId, librariesIds: [libraryId] })
    const stream = await createLibraryBooksPDFStream(library.entity, booksCursor, total)
    return new StreamResultObject(stream, 'application/pdf', `${safeName}.pdf`)
  }
}

export default new UserBooksService()
