import { describe, it, expect } from 'vitest'
import { createUserSchema, newPasswordSchema, updatePasswordSchema } from '../../resources/users/users.schemas.js'
import { loginSchema } from '../../resources/auth/auth.schemas.js'
import { GENERATED_PASSWORD_ALPHABET, GENERATED_PASSWORD_LENGTH, generatePassword } from '../../resources/users/users.utils.js'

describe('users schemas', () => {
  describe('createUserSchema', () => {
    it('should store the email trimmed and in lower case', () => {
      const result = createUserSchema.parse({ name: ' user ', email: '  User@Email.COM ' })

      expect(result).toEqual({ name: 'user', email: 'user@email.com' })
    })

    it('should reject a password: the backend generates it', () => {
      expect(createUserSchema.safeParse({ name: 'user', email: 'user@email.com', password: 'password' }).success).equals(false)
    })
  })

  it('loginSchema should pass the email to lower case', () => {
    expect(loginSchema.parse({ email: ' User@Email.com', password: 'x' }).email).equals('user@email.com')
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

describe('generatePassword', () => {
  const passwords = Array.from({ length: 200 }, generatePassword)

  it('should generate passwords that a user could set', () => {
    for (const password of passwords) {
      expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH)
      expect(newPasswordSchema.safeParse(password).success).equals(true)
    }
  })

  it('should not use ambiguous characters', () => {
    expect(GENERATED_PASSWORD_ALPHABET).not.toMatch(/[0O1lI]/)
    expect(passwords.join('')).not.toMatch(/[0O1lI]/)
  })

  it('should not repeat passwords', () => {
    expect(new Set(passwords).size).equals(passwords.length)
  })
})
