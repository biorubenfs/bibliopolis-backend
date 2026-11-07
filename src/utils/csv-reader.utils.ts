import { parse } from 'csv-parse/sync'
import { ISBNUtils } from './isbn.utils.js'

const DELIMITERS = [',', ';', '\t']
const MAX_RAW_ISBN_LENGTH = 64

// Normalized header names, in order of priority
const ISBN_HEADERS = ['isbn13', 'ean13', 'isbn', 'ean', 'isbn10']

export class CsvReadError extends Error {}

export interface CsvColumn {
  index: number
  name: string
}

export interface CsvRow {
  /** Position in the file, as a spreadsheet shows it: the header is usually row 1 */
  row: number
  cells: readonly string[]
}

export interface ParsedCsv {
  columns: readonly CsvColumn[]
  rows: readonly CsvRow[]
}

export interface CsvColumnSelection {
  isbnColumns: readonly number[]
}

export type CsvRowClassification = 'valid' | 'invalid_isbn' | 'missing_isbn' | 'duplicate_in_file'

export interface ClassifiedCsvRow {
  row: number
  rawIsbn: string | null
  isbn13: string | null
  classification: CsvRowClassification
}

function decode (buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // Not UTF-8: Excel saves its "CSV" format as windows-1252
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export function detectDelimiter (text: string): string {
  const counts = new Map(DELIMITERS.map(delimiter => [delimiter, 0]))
  let quoted = false

  for (const char of text.replace(/^[\r\n]+/, '')) {
    if (char === '"') {
      quoted = !quoted
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break
    } else if (!quoted && counts.has(char)) {
      counts.set(char, (counts.get(char) ?? 0) + 1)
    }
  }

  return DELIMITERS.reduce((best, delimiter) => (counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0) ? delimiter : best)
}

/** The first non-empty line is always the header, and empty rows are left out without changing the numbering */
export function parseCsv (buffer: Buffer): ParsedCsv {
  const text = decode(buffer)

  // Binary files and UTF-16 text decode without errors, but they are not something we can read
  if (text.includes('\0')) {
    throw new CsvReadError('the file is not a readable csv')
  }

  let records: string[][]
  try {
    records = parse(text, {
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      // ="9788408292609" is how some exports protect a value from Excel
      relax_quotes: true,
      skip_empty_lines: false
    })
  } catch {
    throw new CsvReadError('the file is not a readable csv')
  }

  const [header, ...rows] = records
    .map((cells, index) => ({ row: index + 1, cells: cells.map(cell => cell.trim()) }))
    .filter(({ cells }) => cells.some(cell => cell !== ''))

  if (header == null || rows.length === 0) {
    throw new CsvReadError('the file has no rows')
  }

  return {
    columns: header.cells.map((name, index) => ({ index, name })),
    rows
  }
}

export function normalizeHeader (header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function findColumns (columns: readonly CsvColumn[], headers: readonly string[]): number[] {
  return headers.flatMap(header => columns
    .filter(column => normalizeHeader(column.name) === header)
    .map(column => column.index))
}

export function detectColumns (columns: readonly CsvColumn[]): CsvColumnSelection {
  return { isbnColumns: findColumns(columns, ISBN_HEADERS) }
}

/** Both forms of a book give the same ISBN-13, so it also works as the key to compare rows. Null if it is not valid */
export function normalizeIsbn (rawIsbn: string): string | null {
  const isbn = ISBNUtils.sanitizeIsbn(rawIsbn.trim().replace(/^="(.*)"$/, '$1')).replace(/x$/, 'X')

  if (ISBNUtils.isValidIsbn10(isbn)) {
    return ISBNUtils.isbn10ToIsbn13(isbn)
  }

  // isValidIsbn13 alone accepts any EAN-13
  return /^97[89]/.test(isbn) && ISBNUtils.isValidIsbn13(isbn) ? isbn : null
}

export function classifyRows (csv: ParsedCsv, selection: CsvColumnSelection): ClassifiedCsvRow[] {
  const seenIsbns = new Set<string>()

  return csv.rows.map(({ row, cells }) => {
    const rawIsbn = selection.isbnColumns
      .map(column => cells[column] ?? '')
      .find(value => value !== '') ?? null
    const isbn13 = rawIsbn != null ? normalizeIsbn(rawIsbn) : null

    let classification: CsvRowClassification = 'valid'
    if (rawIsbn == null) {
      classification = 'missing_isbn'
    } else if (isbn13 == null) {
      classification = 'invalid_isbn'
    } else if (seenIsbns.has(isbn13)) {
      classification = 'duplicate_in_file'
    }

    if (isbn13 != null) seenIsbns.add(isbn13)

    return {
      row,
      rawIsbn: rawIsbn?.slice(0, MAX_RAW_ISBN_LENGTH) ?? null,
      isbn13,
      classification
    }
  })
}
