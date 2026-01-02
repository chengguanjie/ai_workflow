import { describe, expect, it } from 'vitest'
import { extractTextFromFile } from './extract-text'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { Document, Packer, Paragraph } from 'docx'
import ExcelJS from 'exceljs'

async function makePdfBuffer(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText(text, { x: 50, y: 700, size: 14, font })
  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

async function makeDocxBuffer(text: string): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [new Paragraph(text)] }] })
  return Packer.toBuffer(doc)
}

async function makeXlsxBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  ws.columns = [
    { header: 'name', key: 'name' },
    { header: 'age', key: 'age' },
  ]
  ws.addRow({ name: 'alice', age: 30 })
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

describe('extractTextFromFile', () => {
  it('should extract from pdf', async () => {
    const buffer = await makePdfBuffer('hello pdf')
    const res = await extractTextFromFile({ buffer, mimeType: 'application/pdf', fileName: 'a.pdf' })
    expect(res.content.toLowerCase()).toContain('hello')
  })

  it('should extract from docx', async () => {
    const buffer = await makeDocxBuffer('hello docx')
    const res = await extractTextFromFile({
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'a.docx',
    })
    expect(res.content.toLowerCase()).toContain('hello')
  })

  it('should extract from xlsx', async () => {
    const buffer = await makeXlsxBuffer()
    const res = await extractTextFromFile({
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: 'a.xlsx',
    })
    expect(res.content).toContain('name')
    expect(res.content.toLowerCase()).toContain('alice')
  })

  it('should extract from csv', async () => {
    const buffer = Buffer.from('a,b\n1,2\n', 'utf8')
    const res = await extractTextFromFile({ buffer, mimeType: 'text/csv', fileName: 'a.csv' })
    expect(res.content).toContain('1,2')
  })

  it('should extract from json', async () => {
    const buffer = Buffer.from(JSON.stringify({ a: 1 }), 'utf8')
    const res = await extractTextFromFile({ buffer, mimeType: 'application/json', fileName: 'a.json' })
    expect(res.content).toContain('"a"')
  })

  it('should extract text from html', async () => {
    const buffer = Buffer.from('<html><body><h1>Title</h1><p>Para</p></body></html>', 'utf8')
    const res = await extractTextFromFile({ buffer, mimeType: 'text/html', fileName: 'a.html' })
    expect(res.content).toContain('Title')
    expect(res.content).toContain('Para')
  })
})

