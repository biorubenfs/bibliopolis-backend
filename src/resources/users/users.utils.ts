import crypto from 'crypto'

// Without the characters that are easy to mix up when the password is read or copied by hand: 0/O and 1/l/I
export const GENERATED_PASSWORD_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const GENERATED_PASSWORD_LENGTH = 12

export function generatePassword (): string {
  let password = ''
  for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
    password += GENERATED_PASSWORD_ALPHABET[crypto.randomInt(GENERATED_PASSWORD_ALPHABET.length)]
  }
  return password
}
