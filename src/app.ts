import logger from './logger.js'
import mongo from './mongo.js'
import librariesDao from './resources/libraries/libraries.dao.js'
import usersDao from './resources/users/users.dao.js'
import Server from './server.js'
import { startCronTasks } from './tasks/scheduler.js'

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
    await usersDao.init()
    await librariesDao.init()

    startCronTasks()

    logger.info('app started succesfully')
    logger.info('press CTRL+C to stop app')
  }

  async stop (): Promise<void> {
    logger.info('stopping app...')
    await this.server?.stop()
    await mongo.stop()
    logger.info('app stopped succesfully')
  }
}
