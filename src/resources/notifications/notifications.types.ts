import { NotificationPreferences } from '../users/users.interfaces.js'

export enum NotificationType {
  Welcome = 'welcome',
  LibraryShared = 'library-shared'
}

/** Every variable a template can use. Which ones each type offers is in NOTIFICATION_TYPES. */
export enum TemplateVariable {
  /** The name of the user who receives the notification */
  UserName = 'userName',
  /** The name of the owner of the shared library */
  OwnerName = 'ownerName',
  LibraryName = 'libraryName'
}

export interface NotificationTypeDefinition {
  variables: readonly TemplateVariable[]
  defaultTitle: string
  /** The preference that turns the type off, or null if the user cannot turn it off. */
  preference: keyof NotificationPreferences | null
}

export const NOTIFICATION_TYPES: Readonly<Record<NotificationType, NotificationTypeDefinition>> = {
  [NotificationType.Welcome]: {
    variables: [TemplateVariable.UserName],
    defaultTitle: 'Te damos la bienvenida a Bibliopolis, {{userName}}',
    preference: null
  },
  [NotificationType.LibraryShared]: {
    variables: [TemplateVariable.UserName, TemplateVariable.OwnerName, TemplateVariable.LibraryName],
    defaultTitle: '{{ownerName}} ha compartido «{{libraryName}}» contigo',
    preference: 'libraryShared'
  }
}

export const TEMPLATE_TITLE_MAX_LENGTH = 150

const VARIABLE_PATTERN = /\{\{([^{}]*)\}\}/g

/** The names between double braces, in order and repeated if they are. */
export function templateVariables (template: string): string[] {
  return [...template.matchAll(VARIABLE_PATTERN)].map(match => match[1])
}

/** Whether there are braces left once the variables are taken out, e.g. «{{userName» or «{{a{{b}}». */
export function hasStrayBraces (template: string): boolean {
  const rest = template.replace(VARIABLE_PATTERN, '')
  return rest.includes('{{') || rest.includes('}}')
}

/** Replaces each variable with its value. A variable without a value is left as it is. */
export function renderTemplate (template: string, values: Partial<Record<string, string>>): string {
  return template.replace(VARIABLE_PATTERN, (match: string, name: string) => values[name] ?? match)
}
