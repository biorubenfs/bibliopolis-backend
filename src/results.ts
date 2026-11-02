import { Readable } from 'stream'
import { Entity, EntityType, ResultMiscObject } from './entity.js'
import { PaginationObject } from './types.js'

export class SingleResultObject<T extends Entity<EntityType>> {
  readonly entity: T

  constructor (entity: T) {
    this.entity = entity
  }
}

export class CollectionResultObject<T extends Entity<EntityType>> {
  readonly entities: readonly T[]
  readonly paginationInfo: PaginationObject

  constructor (entities: readonly T[], paginationInfo: PaginationObject) {
    this.paginationInfo = paginationInfo
    this.entities = entities
  }
}

export class MiscResultObject {
  readonly attributes: object
  readonly name: string

  constructor (name: string = 'misc', attributes: object) {
    this.name = name
    this.attributes = attributes
  }

  toResult (): ResultMiscObject {
    return {
      type: this.name,
      attributes: this.attributes
    }
  }
}

export class RedirectResultObject {
  readonly url: URL

  constructor (url: string) {
    this.url = new URL(url)
  }
}

export class TokenResultObject {
  readonly accessToken: string

  constructor (accessToken: string) {
    this.accessToken = accessToken
  }

  toResult (): { type: string, attributes: { accessToken: string } } {
    return {
      type: 'auth',
      attributes: {
        accessToken: this.accessToken
      }
    }
  }
}

export class StreamResultObject {
  readonly stream: Readable
  readonly contentType: string
  readonly filename: string

  constructor (stream: Readable, contentType: string, filename: string) {
    this.stream = stream
    this.contentType = contentType
    this.filename = filename
  }
}
