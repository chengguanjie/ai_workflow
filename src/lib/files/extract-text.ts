import mammoth from 'mammoth'
import ExcelJS from 'exceljs'

export type ExtractedText = {
  kind: 'text'
  content: string
  detectedType: string
}

const DEFAULT_MAX_CHARS = 80_000

async function parsePDF(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const res = await parser.getText()
  return res.text || ''
}

function clampText(text: string, maxChars: number): string {
  const normalized = text.replace(/\r\n/g, '\n')
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars)}\n\n[TRUNCATED]`
}

function htmlToText(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  )
}

function extFromFileName(fileName?: string): string {
  if (!fileName) return ''
  const base = fileName.split('/').pop() || fileName
  const dot = base.lastIndexOf('.')
  if (dot === -1) return ''
  return base.slice(dot + 1).toLowerCase()
}

function guessType(mimeType?: string, fileName?: string): string {
  const mime = (mimeType || '').toLowerCase()
  const ext = extFromFileName(fileName)
  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (mime.includes('word') || ext === 'docx' || ext === 'doc') return 'word'
  if (mime.includes('spreadsheet') || mime.includes('excel') || ext === 'xlsx') return 'excel'
  if (mime === 'text/csv' || ext === 'csv') return 'csv'
  if (mime.includes('json') || ext === 'json') return 'json'
  if (mime.includes('html') || ext === 'html' || ext === 'htm') return 'html'
  if (mime.startsWith('text/') || ['txt', 'md', 'log'].includes(ext)) return 'text'
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'sql', 'java', 'go', 'rs', 'c', 'cpp', 'sh'].includes(ext)) return 'code'
  return 'text'
}

export async function extractTextFromFile(params: {
  buffer: Buffer
  mimeType?: string
  fileName?: string
  maxChars?: number
}): Promise<ExtractedText> {
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS
  const type = guessType(params.mimeType, params.fileName)

  if (type === 'pdf') {
    const text = await parsePDF(params.buffer)
    return {
      kind: 'text',
      detectedType: 'pdf',
      content: clampText(text, maxChars),
    }
  }

  if (type === 'word') {
    // mammoth only supports docx reliably; for .doc we fallback to raw text.
    const ext = extFromFileName(params.fileName)
    if (ext === 'docx' || (params.mimeType || '').includes('officedocument.wordprocessingml')) {
      const res = await mammoth.extractRawText({ buffer: params.buffer })
      return {
        kind: 'text',
        detectedType: 'docx',
        content: clampText(res.value || '', maxChars),
      }
    }
    return {
      kind: 'text',
      detectedType: 'doc',
      content: clampText(params.buffer.toString('utf8'), maxChars),
    }
  }

  if (type === 'excel') {
    const workbook = new ExcelJS.Workbook()
    const loadArg = params.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    await workbook.xlsx.load(loadArg)
    const ws = workbook.worksheets[0]
    const lines: string[] = []
    if (ws) {
      ws.eachRow({ includeEmpty: false }, (row) => {
        const values = Array.isArray(row.values) ? row.values : []
        const cells = values
          .slice(1)
          .map((v) => (v === null || v === undefined ? '' : String(v)))
        if (cells.length) lines.push(cells.join(','))
      })
    }
    return { kind: 'text', detectedType: 'xlsx', content: clampText(lines.join('\n'), maxChars) }
  }

  if (type === 'csv') {
    return { kind: 'text', detectedType: 'csv', content: clampText(params.buffer.toString('utf8'), maxChars) }
  }

  if (type === 'json') {
    try {
      const parsed = JSON.parse(params.buffer.toString('utf8'))
      return { kind: 'text', detectedType: 'json', content: clampText(JSON.stringify(parsed, null, 2), maxChars) }
    } catch {
      return { kind: 'text', detectedType: 'json', content: clampText(params.buffer.toString('utf8'), maxChars) }
    }
  }

  if (type === 'html') {
    const text = htmlToText(params.buffer.toString('utf8'))
    return { kind: 'text', detectedType: 'html', content: clampText(text, maxChars) }
  }

  // text / code
  return {
    kind: 'text',
    detectedType: type,
    content: clampText(params.buffer.toString('utf8'), maxChars),
  }
}
