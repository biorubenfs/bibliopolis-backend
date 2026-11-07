import { describe, expect, it } from 'vitest'
import { classifyRows, CsvReadError, detectColumns, detectDelimiter, normalizeHeader, normalizeIsbn, parseCsv } from '../../utils/csv-reader.utils.js'

const ISBN13 = '9780306406157'
const ISBN10 = '0306406152'

function read (text: string): ReturnType<typeof classifyRows> {
  const csv = parseCsv(Buffer.from(text))
  return classifyRows(csv, detectColumns(csv.columns))
}

describe('parseCsv', () => {
  it.each([
    ['comma', ','],
    ['semicolon, as Excel in Spanish does', ';'],
    ['tab', '\t']
  ])('should read a file separated by %s', (_name, delimiter) => {
    const rows = read(`Título${delimiter}ISBN\nUn libro${delimiter}${ISBN13}\n`)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ row: 2, isbn13: ISBN13, classification: 'valid' })
  })

  it('should ignore the delimiters inside quoted headers', () => {
    expect(detectDelimiter('"a;b;c;d",isbn,title\n')).toBe(',')
    expect(detectDelimiter('"a,b,c,d";isbn;title\n')).toBe(';')
  })

  it('should keep a line break inside a quoted field in its row', () => {
    const rows = read(`title,isbn\n"Primera\nsegunda",${ISBN13}\nOtro,${ISBN10}\n`)

    expect(rows.map(({ row, rawIsbn }) => ({ row, rawIsbn }))).toEqual([
      { row: 2, rawIsbn: ISBN13 },
      { row: 3, rawIsbn: ISBN10 }
    ])
  })

  it('should remove the BOM from the first header', () => {
    const rows = read(`\uFEFFisbn,title\n${ISBN13},Libro\n`)

    expect(rows[0].isbn13).toBe(ISBN13)
  })

  it('should decode a windows-1252 file', () => {
    const csv = parseCsv(Buffer.from(`T\xEDtulo;ISBN\nEl ni\xF1o;${ISBN13}\n`, 'latin1'))

    expect(csv.columns[0].name).toBe('Título')
    expect(csv.rows[0].cells[0]).toBe('El niño')
  })

  it('should leave out empty rows without changing the numbering', () => {
    const rows = read(`isbn,title\n${ISBN13},Uno\n\n,\n${ISBN10},Dos\n`)

    expect(rows.map(row => row.row)).toEqual([2, 5])
  })

  it('should accept rows with fewer columns than the header', () => {
    const rows = read('title,author,isbn\nSolo el título\n')

    expect(rows[0].classification).toBe('missing_isbn')
  })

  it.each([
    ['an empty file', ''],
    ['only a header', 'isbn,title\n'],
    ['only empty lines', '\n\n\n']
  ])('should reject %s', (_name, text) => {
    expect(() => parseCsv(Buffer.from(text))).toThrow(CsvReadError)
  })

  it('should reject a quote that is never closed', () => {
    expect(() => parseCsv(Buffer.from(`isbn,title\n${ISBN13},"sin cerrar\n`))).toThrow(CsvReadError)
  })

  it('should reject binary content', () => {
    expect(() => parseCsv(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a, 0x00, 0x0a]))).toThrow(CsvReadError)
  })
})

describe('detectColumns', () => {
  it.each(['ISBN-13', 'ISBN 13', 'Isbn-13', 'isbn_13', 'isbn13'])('should recognize %s as isbn13', (header) => {
    expect(normalizeHeader(header)).toBe('isbn13')
  })

  it('should order the isbn columns by priority, not by position', () => {
    const columns = ['Isbn-10', 'ISBN', 'EAN', 'isbn13', 'Precio'].map((name, index) => ({ index, name }))

    expect(detectColumns(columns).isbnColumns).toEqual([3, 1, 2, 0])
  })

  it('should detect the headers of the export of the application', () => {
    const columns = ['Título', 'Autor/es', 'Isbn-13', 'Isbn-10'].map((name, index) => ({ index, name }))

    expect(detectColumns(columns)).toEqual({ isbnColumns: [2, 3] })
  })

  it('should return no columns when there are none it recognizes', () => {
    const columns = [{ index: 0, name: 'Nombre' }]

    expect(detectColumns(columns)).toEqual({ isbnColumns: [] })
  })
})

describe('normalizeIsbn', () => {
  it.each([
    [ISBN13, ISBN13],
    ['978-0-306-40615-7', ISBN13],
    [' 978 0306406157 ', ISBN13],
    [ISBN10, ISBN13],
    [`="${ISBN13}"`, ISBN13],
    ['043942089x', '9780439420891'],
    ['043942089X', '9780439420891'],
    ['9791300000012', '9791300000012']
  ])('should convert %s to %s', (raw, expected) => {
    expect(normalizeIsbn(raw)).toBe(expected)
  })

  it.each([
    ['scientific notation from Excel', '9.78841E+12'],
    ['an ISBN-10 that lost its leading zero', '306406152'],
    ['a wrong check digit', '9780306406158'],
    ['an EAN-13 that is not a book', '4006381333931'],
    ['text', 'no tiene']
  ])('should reject %s', (_name, raw) => {
    expect(normalizeIsbn(raw)).toBeNull()
  })
})

describe('classifyRows', () => {
  it('should use the first non-empty value of the isbn columns', () => {
    const rows = read(`isbn13,isbn10\n,${ISBN10}\n`)

    expect(rows[0]).toMatchObject({ rawIsbn: ISBN10, isbn13: ISBN13, classification: 'valid' })
  })

  it('should treat the ISBN-10 and ISBN-13 of a book as duplicates', () => {
    const rows = read(`isbn\n${ISBN13}\n${ISBN10}\n`)

    expect(rows.map(row => row.classification)).toEqual(['valid', 'duplicate_in_file'])
  })

  it('should read a value protected for Excel, both unquoted and quoted', () => {
    const rows = read(`isbn,title\n="${ISBN13}",Uno\n"=""${ISBN10}""",Dos\n`)

    expect(rows.map(row => row.isbn13)).toEqual([ISBN13, ISBN13])
  })

  it('should report the invalid and the missing ones, keeping nothing from the other columns', () => {
    const rows = read('isbn,título,autor\n123,Malo,Ana\n,Sin ISBN,Luis\n')

    expect(rows).toEqual([
      { row: 2, rawIsbn: '123', isbn13: null, classification: 'invalid_isbn' },
      { row: 3, rawIsbn: null, isbn13: null, classification: 'missing_isbn' }
    ])
  })

  it('should classify every row as missing when there are no isbn columns', () => {
    const rows = read(`nombre\n${ISBN13}\n`)

    expect(rows[0].classification).toBe('missing_isbn')
  })
})
