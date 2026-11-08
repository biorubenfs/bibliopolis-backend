import { EntityType, Entity } from '../../entity.js'
import { DBTag, TagColor } from './tags.interfaces.js'

export class TagEntity extends Entity<EntityType.Tags> {
  readonly name: string
  readonly color: TagColor
  /** Owner of a personal tag, or null for a global tag created by an administrator. */
  readonly userId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date

  constructor (data: DBTag) {
    super(EntityType.Tags, data._id)
    this.name = data.name
    this.color = data.color
    this.userId = data.userId
    this.createdAt = data.createdAt
    this.updatedAt = data.updatedAt
  }

  attributes (): Object {
    return {
      name: this.name,
      color: this.color,
      userId: this.userId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
