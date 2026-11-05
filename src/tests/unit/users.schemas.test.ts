import { describe, it, expect } from 'vitest'
import { createUserSchema, updatePasswordSchema } from '../../resources/users/users.schemas.js'

const user = { name: 'user', email: 'user@email.com' }

describe('users schemas', () => {
  describe('createUserSchema password', () => {
    it.each([
      ['shorter than 6 characters', 'a'.repeat(5), false],
      ['exactly 6 characters', 'a'.repeat(6), true],
      ['exactly 20 characters', 'a'.repeat(20), true],
      ['longer than 20 characters', 'a'.repeat(21), false]
    ])('%s', (_, password, valid) => {
      expect(createUserSchema.safeParse({ ...user, password }).success).equals(valid)
    })
  })

  describe('updatePasswordSchema newPassword', () => {
    it.each([
      ['shorter than 6 characters', 'a'.repeat(5), false],
      ['exactly 6 characters', 'a'.repeat(6), true],
      ['exactly 20 characters', 'a'.repeat(20), true],
      ['longer than 20 characters', 'a'.repeat(21), false]
    ])('%s', (_, newPassword, valid) => {
      expect(updatePasswordSchema.safeParse({ currentPassword: 'current', newPassword }).success).equals(valid)
    })
  })

  it('updatePasswordSchema does not apply the minimum length to the current password', () => {
    const result = updatePasswordSchema.safeParse({ currentPassword: 'abc', newPassword: 'new-password' })

    expect(result.success).equals(true)
  })
})
