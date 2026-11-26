import { AggregationCursor, WithId } from 'mongodb'
import { DBUserBook } from '../resources/user-books/user-books.interfaces.js'
import { PassThrough, Readable } from 'stream'
import { UserBookEntity } from '../resources/user-books/user-books.entity.js'
import PDFDocument from 'pdfkit'

/** The data of the library on the first page, the same for its owner and for its members */
export interface PDFLibraryHeader {
  name: string
  description: string | null
}

export async function createLibraryBooksPDFStream (
  library: PDFLibraryHeader,
  booksCursor: AggregationCursor<WithId<DBUserBook>>,
  totalBooks: number,
  chunkSize = 100
): Promise<Readable> {
  const doc = new PDFDocument({ margins: { top: 25, bottom: 25, left: 25, right: 25 }, bufferPages: true })
  const passThrough = new PassThrough()
  doc.pipe(passThrough)

  let booksChunk: UserBookEntity[] = []

  setTitleAndDescription(doc, library, totalBooks)
  addHorizontalRule(doc, 0, 1)

  let isFirstChunk = true

  for await (const dbUserBook of booksCursor) {
    booksChunk.push(new UserBookEntity(dbUserBook))
    if (booksChunk.length === chunkSize) {
      addTable(doc, booksChunk, isFirstChunk)
      isFirstChunk = false
      booksChunk = []
    }
  }
  // Process remaining books that didn't fill a complete chunk
  if (booksChunk.length > 0) {
    addTable(doc, booksChunk, isFirstChunk)
  }

  addPagination(doc)
  doc.end()
  return passThrough
}

function addHorizontalRule (doc: PDFKit.PDFDocument, spaceFromEdge = 0, linesAboveAndBelow = 0.5): void {
  doc.moveDown(linesAboveAndBelow)

  doc
    .moveTo(0 + spaceFromEdge, doc.y)
    .lineTo(doc.page.width - spaceFromEdge, doc.y)
    .stroke()

  doc.moveDown(linesAboveAndBelow)
}

function setTitleAndDescription (doc: PDFKit.PDFDocument, library: PDFLibraryHeader, totalBooks: number): void {
  doc.fontSize(20)
    .text(library.name, { align: 'center' })
    .fontSize(10)

  doc.fontSize(12)
    .text(library.description ?? '', { align: 'center' })

  doc.text(`Libros totales: ${totalBooks}`, { align: 'center' })

  doc.fontSize(10)

  doc.moveDown(1)
}

function addTable (doc: PDFKit.PDFDocument, books: readonly UserBookEntity[], headers = true): void {
  const columnStylesMap = new Map<number, { header: string, width: number, padding: number }>([
    [0, { header: 'Título', width: 180, padding: 5 }],
    [1, { header: 'Autor/es', width: 180, padding: 5 }],
    [2, { header: 'Isbn-13', width: 100, padding: 5 }],
    [3, { header: 'Isbn-10', width: 80, padding: 5 }]
  ])

  const data = headers
    ? [
        Array.from(columnStylesMap.values()).map(col => col.header),
        ...books.map(book => [
          book.bookTitle,
          book.bookAuthors.join(', '),
          book.bookIsbn13,
          book.bookIsbn10 ?? '-'
        ])
      ]
    : books.map(book => [
      book.bookTitle,
      book.bookAuthors.join(', '),
      book.bookIsbn13,
      book.bookIsbn10 ?? '-'
    ])

  doc.table({
    rowStyles: (i) => {
      return headers && i < 1
        ? { border: [0, 0, 2, 0], borderColor: 'black' }
        : { border: [0, 0, 1, 0], borderColor: '#aaa' }
    },
    columnStyles: (i) => {
      return columnStylesMap.get(i) ?? { width: 100, padding: 5 }
    },
    data
  })
}

function addPagination (doc: PDFKit.PDFDocument): void {
  // Global Edits to All Pages (Header/Footer, etc)
  const pages = doc.bufferedPageRange()
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i)

    // Footer: Add page number
    const oldBottomMargin = doc.page.margins.bottom
    doc.page.margins.bottom = 0 // Dumb: Have to remove bottom margin in order to write into it
    doc
      .text(
          `${i + 1}/${pages.count}`,
          0,
          doc.page.height - (oldBottomMargin / 2), // Centered vertically in bottom margin
          { align: 'center' }
      )
    doc.page.margins.bottom = oldBottomMargin // ReProtect bottom margin
  }
}

export async function createLibraryBooksPDF (library: PDFLibraryHeader, books: readonly UserBookEntity[]): Promise<Readable> {
  const doc = new PDFDocument({ margins: { top: 25, bottom: 25, left: 25, right: 25 }, bufferPages: true })

  setTitleAndDescription(doc, library, books.length)

  addHorizontalRule(doc, 0, 1)

  addTable(doc, books)

  addPagination(doc)

  doc.end()

  const passThrough = new PassThrough()

  doc.pipe(passThrough)

  return passThrough
}
