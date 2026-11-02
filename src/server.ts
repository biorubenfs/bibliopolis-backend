import express from 'express'
import * as http from 'http'
import usersRouter from './resources/users/users.router.js'
import errorHandler from './error/error-handler.js'
import authRouter from './resources/auth/auth.router.js'
import booksRouter from './resources/books/books.router.js'
import librariesRouter from './resources/libraries/libraries.router.js'
import { checkJwt } from './middlewares/jwt.middleware.js'
import logger from './logger.js'
import config from './config.js'
import cors from 'cors'
import userBooksRouter from './resources/user-books/user-books.router.js'
import { requestLogger } from './middlewares/request-logger.js'
import externalRouter from './resources/external/external.router.js'

import { readFile } from 'fs/promises'
const pkg = JSON.parse(await readFile('./package.json', 'utf-8'))
const { version } = pkg
export default class Server {
  private readonly express: express.Express
  private readonly port: number
  private httpServer?: http.Server

  constructor (port: number) {
    this.port = port

    this.express = express()

    // nginx runs in front of the container: trust private-network proxies so req.ip is the real client IP
    this.express.set('trust proxy', 'loopback, linklocal, uniquelocal')

    this.express.use(express.json())
    this.express.use(cors({
      origin: config.cors.origin,
      credentials: true
    }))

    this.express.get('/', (req, res) => {
      res.json({
        success: true,
        time: new Date().toISOString(),
        version
      })
    })

    if (config.environment !== 'test') {
      this.express.use(requestLogger)
    }

    // Public route: /auth (no JWT required)
    this.express.use('/auth', authRouter)

    // JWT validation for all other routes
    this.express.use((req, res, next) => {
      if (req.path.startsWith('/auth')) {
        return next()
      }
      return checkJwt(req, res, next)
    })

    // Protected routers
    this.express.use('/users', usersRouter)
    this.express.use('/books', booksRouter)
    this.express.use('/libraries', librariesRouter)
    this.express.use('/user-books', userBooksRouter)
    this.express.use('/external', externalRouter)

    // error handling
    this.express.use(errorHandler)
  }

  getHttpServer (): express.Express {
    return this.express
  }

  listen (): void {
    this.httpServer = this.express.listen(this.port, () => {
      if (config.environment !== 'test') {
        logger.info(`server listening on port ${this.port}`)
      }
    })
  }

  async stop (): Promise<void> {
    return await new Promise((resolve, reject) => {
      if (this.httpServer != null) {
        this.httpServer.close((err) => {
          if (err != null) {
            logger.info('error stopping server', err)
            reject(err)
          } else {
            if (config.environment !== 'test') {
              logger.info('server stopped successfully')
            }
            resolve()
          }
        })
      } else {
        resolve()
      }
    })
  }
}
