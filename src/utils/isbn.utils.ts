/* eslint-disable @typescript-eslint/no-extraneous-class */
import { IsbnPair } from './interfaces.utils'

export class ISBNUtils {
  static isbn13ToIsbn10 (isbn13: string): string {
    const clean = this.sanitizeIsbn(isbn13)

    if (!/^\d{13}$/.test(clean)) {
      throw new Error('ISBN-13 invalid')
    }

    if (!clean.startsWith('978')) {
      throw new Error(
        'This ISBN-13 cannot be converted to ISBN-10 (does not start with 978)'
      )
    }

    // Extract the 9 central digits
    const core = clean.slice(3, 12)

    // Calculate ISBN-10 check digit
    let sum = 0
    for (let i = 0; i < 9; i++) {
      sum += parseInt(core[i], 10) * (10 - i)
    }

    const check = 11 - (sum % 11)
    let checkDigit

    if (check === 10) checkDigit = 'X'
    else if (check === 11) checkDigit = '0'
    else checkDigit = String(check)

    return core + checkDigit
  }

  static isbn10ToIsbn13 (isbn10: string): string {
    // Clean hyphens and spaces
    const clean = this.sanitizeIsbn(isbn10)

    if (!/^\d{9}[\dX]$/.test(clean)) {
      throw new Error('ISBN-10 invalid')
    }

    // Remove ISBN-10 check digit and add 978
    const core = '978' + clean.slice(0, 9)

    // Calculate ISBN-13 check digit
    let sum = 0
    for (let i = 0; i < core.length; i++) {
      sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3)
    }

    const checkDigit = (10 - (sum % 10)) % 10

    return `${core}${checkDigit}`
  }

  // Calculates missing ISBNs and validates compatibility if both are provided
  static calculateIsbns (isbn10?: string | null, isbn13?: string | null): IsbnPair {
    if (isbn10 == null && isbn13 == null) {
      throw new Error('Either isbn10 or isbn13 must be provided')
    }

    // Case 1: Only ISBN-13 provided
    if (isbn10 == null && isbn13 != null) {
      const sanitizedIsbn13 = this.sanitizeIsbn(isbn13)
      try {
        const calculatedIsbn10 = this.isbn13ToIsbn10(sanitizedIsbn13)
        return { isbn10: calculatedIsbn10, isbn13: sanitizedIsbn13 }
      } catch (error) {
        // ISBN-13 not convertible (prefix 979), return null for isbn10
        return { isbn10: null, isbn13: sanitizedIsbn13 }
      }
    }

    // Case 2: Only ISBN-10 provided
    if (isbn10 != null && isbn13 == null) {
      const sanitizedIsbn10 = this.sanitizeIsbn(isbn10)
      const calculatedIsbn13 = this.isbn10ToIsbn13(sanitizedIsbn10)
      return { isbn10: sanitizedIsbn10, isbn13: calculatedIsbn13 }
    }

    // Case 3: Both provided, validate compatibility
    if (isbn10 != null && isbn13 != null) {
      if (!this.areCompatibleIsbns(isbn10, isbn13)) {
        throw new Error('isbn10 and isbn13 are not compatible')
      }
      return { isbn10: this.sanitizeIsbn(isbn10), isbn13: this.sanitizeIsbn(isbn13) }
    }

    throw new Error('Could not resolve ISBNs')
  }

  /** Whether both belong to the same book. Never throws, so it is safe inside a zod refine */
  static areCompatibleIsbns (isbn10: string, isbn13: string): boolean {
    try {
      // Also throws for an ISBN-13 with prefix 979, which has no ISBN-10
      return this.isbn13ToIsbn10(isbn13) === this.sanitizeIsbn(isbn10)
    } catch {
      return false
    }
  }

  static isValidIsbn10 (isbn: string): boolean {
    const clean = this.sanitizeIsbn(isbn)
    if (!/^\d{9}[\dX]$/.test(clean)) return false
    let sum = 0
    for (let i = 0; i < 9; i++) {
      sum += parseInt(clean[i], 10) * (10 - i)
    }
    const check = clean[9]
    sum += check === 'X' ? 10 : parseInt(check, 10)
    return sum % 11 === 0
  }

  static isValidIsbn13 (isbn: string): boolean {
    const clean = this.sanitizeIsbn(isbn)
    if (!/^\d{13}$/.test(clean)) return false
    let sum = 0
    for (let i = 0; i < 12; i++) {
      sum += parseInt(clean[i], 10) * (i % 2 === 0 ? 1 : 3)
    }
    const checkDigit = (10 - (sum % 10)) % 10
    return checkDigit === parseInt(clean[12], 10)
  }

  static sanitizeIsbn (isbn: string): string {
    return isbn.trim().replace(/[-\s]/g, '')
  }
}
