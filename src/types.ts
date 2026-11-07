import { BooksSource } from './resources/sources/sources.types'

export interface Page {
  limit: number
  skip: number
}

export interface PaginationObject extends Page {
  total: number
}

export enum HttpStatusCode {
  Created = 201,
  OK = 200,
  Accepted = 202,
  NoContent = 204,
  Redirect = 302,
  NotFound = 404
}

export interface BookCover {
  source: BooksSource | null
  value: string | null
}
