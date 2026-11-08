import { CollectionResultObject, SingleResultObject, StreamResultObject } from '../../results.js'
import { Page } from '../../types.js'
import { LibraryPermissionsError } from '../libraries/libraries.error.js'
import librariesService from '../libraries/libraries.service.js'

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

    // TODO: optimize this, we should not fetch all libraries just to check if the user has permissions on the requested ones, we can do a single query to check if the requested libraryIds are valid for the user
    const libraries = await librariesService.list(userId, { skip: 0, limit: Number.MAX_SAFE_INTEGER })
    const userLibIds = libraries.entities.map(lib => lib.id)
    if (filter.librariesIds != null) {
      const hasInvalidLibId = filter.librariesIds.some(libId => !userLibIds.includes(libId))
      if (hasInvalidLibId) {
        throw new LibraryPermissionsError('user can only list books from own libraries')
      }
    } else {
      filter.librariesIds = userLibIds
    }

    filter.userId = userId

    const [userBooks, total] = await Promise.all([
      await userBooksDao.list(filter, page.skip, page.limit),
      await userBooksDao.count(filter)
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
