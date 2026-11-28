import { describe, expect, it } from 'vitest'
import { hasStrayBraces, renderTemplate, templateVariables } from '../../resources/notifications/notifications.types.js'

describe('templateVariables', () => {
  it('should return the variables in order, repeated if they are', () => {
    expect(templateVariables('{{a}} y {{b}} y {{a}}')).toEqual(['a', 'b', 'a'])
  })

  it('should keep what is between the braces as it is', () => {
    expect(templateVariables('{{ userName }} {{}}')).toEqual([' userName ', ''])
  })

  it('should return nothing for a text without variables', () => {
    expect(templateVariables('Bienvenido')).toEqual([])
  })
})

describe('hasStrayBraces', () => {
  it.each([
    ['{{userName', true],
    ['userName}}', true],
    ['{{a{{b}}', true],
    ['{{a}}}}', true],
    ['{{a}} {b} }', false],
    ['Hola', false]
  ])('%s -> %s', (template, expected) => {
    expect(hasStrayBraces(template)).toBe(expected)
  })
})

describe('renderTemplate', () => {
  it('should replace every variable with its value', () => {
    expect(renderTemplate('{{ownerName}} comparte «{{libraryName}}», {{ownerName}}', { ownerName: 'Ana', libraryName: 'Negra' }))
      .toBe('Ana comparte «Negra», Ana')
  })

  it('should leave a variable without a value as it is', () => {
    expect(renderTemplate('Hola, {{userName}}', {})).toBe('Hola, {{userName}}')
  })

  it('should not interpret the values', () => {
    expect(renderTemplate('{{userName}}', { userName: '{{libraryName}} $& <b>' })).toBe('{{libraryName}} $& <b>')
  })
})
