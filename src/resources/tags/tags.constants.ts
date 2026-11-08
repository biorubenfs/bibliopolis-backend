/** Keys of the closed colour palette. The frontend maps each key to its colours. */
export const TAG_COLORS = [
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'grey'
] as const

export const TAG_NAME_MIN_LENGTH = 2
export const TAG_NAME_MAX_LENGTH = 20
/** Personal tags per user; global tags do not count. */
export const MAX_TAGS_PER_USER = 10
export const MAX_TAGS_PER_LIBRARY = 5
