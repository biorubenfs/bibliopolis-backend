import { describe, expect, it } from 'vitest'
import { ISBNUtils } from '../../utils/isbn.utils.js'

describe('isbn tests', () => {
  describe('isbn13 validation', () => {
    it('should return true with valid isbn13', () => {
      const validIsbn13 = '9781718500402'
      const result = ISBNUtils.isValidIsbn13(validIsbn13)
      expect(result).toBe(true)
    })
    it('should return true with valid isbn13 with dashes', () => {
      const validIsbn13 = '978-1-71850-040-2'
      const result = ISBNUtils.isValidIsbn13(validIsbn13)
      expect(result).toBe(true)
    })
    it('should return false with invalid control digit isbn13', () => {
      const validIsbn13 = '9781718500403'
      const result = ISBNUtils.isValidIsbn13(validIsbn13)
      expect(result).toBe(false)
    })
    it('should return false with invalid core digit isbn13', () => {
      const validIsbn13 = '9781718500412'
      const result = ISBNUtils.isValidIsbn13(validIsbn13)
      expect(result).toBe(false)
    })
    it('should return false with invalid prefix digit isbn13', () => {
      const validIsbn13 = '945-1-71850-040-2'
      const result = ISBNUtils.isValidIsbn13(validIsbn13)
      expect(result).toBe(false)
    })
    it('should return false with invalid characters isbn13', () => {
      const validIsbn13 = '978171%500402'
      const result = ISBNUtils.isValidIsbn13(validIsbn13)
      expect(result).toBe(false)
    })
    it('should return false with invalid length isbn13', () => {
      const validIsbn13 = '978171850040'
      const result = ISBNUtils.isValidIsbn13(validIsbn13)
      expect(result).toBe(false)
    })
    it.each([
      ['979-8', '9798866451746'],
      ['979-10', '9791034902309']
    ])('should return true with a valid isbn13 with prefix %s', (_prefix, isbn13) => {
      expect(ISBNUtils.isValidIsbn13(isbn13)).toBe(true)
    })
    it.each([
      ['an EAN-13 that is not a book', '4006381333931'],
      ['an ISMN (sheet music), which uses 979-0', '9790260000438']
    ])('should return false with %s, even with a right check digit', (_name, ean13) => {
      expect(ISBNUtils.isValidIsbn13(ean13)).toBe(false)
    })
  })

  describe('isbn10 validation', () => {
    it('should return true with valid isbn10', () => {
      const validIsbn10 = '8483835045'
      const result = ISBNUtils.isValidIsbn10(validIsbn10)
      expect(result).toBe(true)
    })
    it('should return true with valid isbn10 with dashes', () => {
      const validIsbn10 = '84-8383-504-5'
      const result = ISBNUtils.isValidIsbn10(validIsbn10)
      expect(result).toBe(true)
    })
    it('should return false with invalid control digit isbn10', () => {
      const validIsbn10 = '8483835044'
      const result = ISBNUtils.isValidIsbn10(validIsbn10)
      expect(result).toBe(false)
    })
    it('should return false with invalid core digit isbn10', () => {
      const validIsbn10 = '8483836045'
      const result = ISBNUtils.isValidIsbn10(validIsbn10)
      expect(result).toBe(false)
    })
    it('should return false with invalid prefix digit isbn10', () => {
      const validIsbn10 = '1483835045'
      const result = ISBNUtils.isValidIsbn10(validIsbn10)
      expect(result).toBe(false)
    })
    it('should return false with invalid characters isbn10', () => {
      const validIsbn10 = '8483835%45'
      const result = ISBNUtils.isValidIsbn10(validIsbn10)
      expect(result).toBe(false)
    })
    it('should return false with invalid length isbn10', () => {
      const validIsbn10 = '848383504'
      const result = ISBNUtils.isValidIsbn10(validIsbn10)
      expect(result).toBe(false)
    })
  })

  describe('isbn calculation', () => {
    it('should calculate valid isbn10 from isbn13', () => {
      const isbn13 = '9788415509790'
      const expectedIsbn10 = '8415509790'
      const result = ISBNUtils.calculateIsbns(undefined, isbn13)
      expect(result.isbn10).toBe(expectedIsbn10)
    })
    it('should calculate valid isbn10 from isbn13', () => {
      const isbn13 = '9788415509790'
      const expectedIsbn10 = '8415509790'
      const result = ISBNUtils.isbn13ToIsbn10(isbn13)
      expect(result).toBe(expectedIsbn10)
    })
    it('should calculate valid isbn13 from isbn10', () => {
      const isbn10 = '8415509790'
      const expectedIsbn13 = '9788415509790'
      const result = ISBNUtils.calculateIsbns(isbn10, undefined)
      expect(result.isbn13).toBe(expectedIsbn13)
    })
    it('should calculate valid isbn13 from isbn10', () => {
      const isbn10 = '8415509790'
      const expectedIsbn13 = '9788415509790'
      const result = ISBNUtils.isbn10ToIsbn13(isbn10)
      expect(result).toBe(expectedIsbn13)
    })
    it('should return the same isbns if both provided and valid', () => {
      const isbn10 = '8415509790'
      const isbn13 = '9788415509790'
      const result = ISBNUtils.calculateIsbns(isbn10, isbn13)
      expect(result.isbn10).toBe(isbn10)
      expect(result.isbn13).toBe(isbn13)
    })
    it('should return a null isbn10 for an isbn13 with prefix 979', () => {
      expect(ISBNUtils.calculateIsbns(null, '9791034902309')).toEqual({ isbn10: null, isbn13: '9791034902309' })
    })
    it('should throw with an invalid isbn13 instead of returning a null isbn10', () => {
      expect(() => ISBNUtils.calculateIsbns(null, '9788415509791')).toThrow('ISBN-13 invalid')
    })
    it('should throw with an isbn10 with a wrong check digit', () => {
      expect(() => ISBNUtils.calculateIsbns('8415509791', null)).toThrow('ISBN-10 invalid')
    })
    it('should not convert an isbn10 with a wrong check digit, which would give the isbn13 of another book', () => {
      expect(() => ISBNUtils.isbn10ToIsbn13('8415509780')).toThrow('ISBN-10 invalid')
    })
    it('should not convert an isbn13 with a wrong check digit', () => {
      expect(() => ISBNUtils.isbn13ToIsbn10('9788415509791')).toThrow('ISBN-13 invalid')
    })
    it('should not convert an isbn13 with prefix 979, which has no isbn10', () => {
      expect(() => ISBNUtils.isbn13ToIsbn10('9791034902309')).toThrow('does not start with 978')
    })
    it('should say that the isbns are not compatible if both provided and they belong to different books', () => {
      expect(() => ISBNUtils.calculateIsbns('0380708957', '9788415509790')).toThrow('isbn10 and isbn13 are not compatible')
    })
    it('should say that the isbns are not compatible if the isbn13 has prefix 979', () => {
      expect(() => ISBNUtils.calculateIsbns('8415509790', '9791034902309')).toThrow('isbn10 and isbn13 are not compatible')
    })
  })

  describe('isbn compatibility', () => {
    it('should accept an isbn10 and the isbn13 of the same book', () => {
      expect(ISBNUtils.areCompatibleIsbns('8415509790', '9788415509790')).toBe(true)
    })
    it('should ignore hyphens and spaces', () => {
      expect(ISBNUtils.areCompatibleIsbns('84-155-0979-0', '978 84 155 0979 0')).toBe(true)
    })
    it('should reject isbns of different books', () => {
      expect(ISBNUtils.areCompatibleIsbns('0380708957', '9788415509790')).toBe(false)
    })
    it('should reject an isbn13 with prefix 979, which has no isbn10', () => {
      expect(ISBNUtils.areCompatibleIsbns('8415509790', '9791034902309')).toBe(false)
    })
    it('should reject malformed isbns without throwing', () => {
      expect(ISBNUtils.areCompatibleIsbns('123', '9788415509790')).toBe(false)
      expect(ISBNUtils.areCompatibleIsbns('8415509790', 'abc')).toBe(false)
    })
  })
})
