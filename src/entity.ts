export enum EntityType {
  Admins = 'admins',
  Users = 'users',
  Books = 'books',
  Libraries = 'libraries',
  UserBooks = 'user-books'
}

export interface ResultEntityObject {
  type: EntityType
  id: string
  attributes: Object
}

export interface ResultMiscObject {
  type: string
  attributes: object
}

export abstract class Entity<T extends EntityType> {
  readonly type: T
  readonly id: string
  abstract attributes (): Object

  constructor (type: T, id: string) {
    this.type = type
    this.id = id
  }

  toResult (): ResultEntityObject {
    return {
      type: this.type,
      id: this.id,
      attributes: this.attributes()
    }
  }
}
