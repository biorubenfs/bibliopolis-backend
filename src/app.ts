import logger from './logger.js'
import mongo from './mongo.js'
import librariesDao from './resources/libraries/libraries.dao.js'
import usersDao from './resources/users/users.dao.js'
import Server from './server.js'
import { startCronTasks } from './tasks/scheduler.js'
import booksDao from './resources/books/books.dao.js'
import userBooksDao from './resources/user-books/user-books.dao.js'
import importsDao from './resources/imports/imports.dao.js'
import importItemsDao from './resources/imports/import-items.dao.js'
import importsWorker from './resources/imports/imports.worker.js'

export default class App {
  server?: Server
  port: number

  constructor (port: number) {
    this.port = port
  }

  async start (): Promise<void> {
    logger.info('starting app...')
    await mongo.start()

    this.server = new Server(this.port)
    this.server.listen()

    await mongo.db().createCollection('requests', { capped: true, size: 100_000 })

    // Call init for all DAOs
    await usersDao.init()
    await booksDao.init()
    await userBooksDao.init()
    await librariesDao.init()
    await importsDao.init()
    await importItemsDao.init()

    startCronTasks()
    await importsWorker.start()

    logger.info('app started succesfully')
    logger.info('press CTRL+C to stop app')
  }

  async stop (): Promise<void> {
    logger.info('stopping app...')
    await this.server?.stop()
    await importsWorker.stop()
    await mongo.stop()
    logger.info('app stopped succesfully')
  }
}
