/**
 * 文档解析器
 * 支持 PDF、DOCX、TXT、MD 格式
 */

// 文档解析结果
export interface ParsedDocument {
  text: string
  metadata: {
    title?: string
    author?: string
    pageCount?: number
    wordCount?: number
    createdAt?: string
  }
}

/**
 * 解析文档内容
 */
export async function parseDocument(
  fileBuffer: Buffer,
  fileType: string,
  fileName: string
): Promise<ParsedDocument> {
  const parser = getParser(fileType)
  if (!parser) {
    throw new Error(`不支持的文件类型: ${fileType}`)
  }

  return parser(fileBuffer, fileName)
}

/**
 * 获取对应文件类型的解析器
 */
function getParser(
  fileType: string
): ((buffer: Buffer, fileName: string) => Promise<ParsedDocument>) | null {
  const parsers: Record<
    string,
    (buffer: Buffer, fileName: string) => Promise<ParsedDocument>
  > = {
    pdf: parsePDF,
    docx: parseDOCX,
    doc: parseDOCX, // 尝试用 docx 解析器
    txt: parseTXT,
    md: parseMarkdown,
    markdown: parseMarkdown,
  }

  return parsers[fileType.toLowerCase()] || null
}

/**
 * 解析 PDF 文件
 */
async function parsePDF(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  // 动态导入 pdf-parse（避免在客户端加载）
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{
      text: string
      numpages: number
      info?: {
        Title?: string
        Author?: string
        CreationDate?: string
      }
    }>
    const data = await pdfParse(buffer)

    return {
      text: data.text,
      metadata: {
        title: data.info?.Title || fileName,
        author: data.info?.Author,
        pageCount: data.numpages,
        wordCount: data.text.split(/\s+/).length,
        createdAt: data.info?.CreationDate,
      },
    }
  } catch (error) {
    console.error('PDF 解析失败:', error)
    throw new Error('PDF 文件解析失败，请确保文件格式正确')
  }
}

/**
 * 解析 DOCX 文件
 */
async function parseDOCX(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })

    return {
      text: result.value,
      metadata: {
        title: fileName,
        wordCount: result.value.split(/\s+/).length,
      },
    }
  } catch (error) {
    console.error('DOCX 解析失败:', error)
    throw new Error('DOCX 文件解析失败，请确保文件格式正确')
  }
}

/**
 * 解析纯文本文件
 */
async function parseTXT(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const text = buffer.toString('utf-8')

  return {
    text,
    metadata: {
      title: fileName,
      wordCount: text.split(/\s+/).length,
    },
  }
}

/**
 * 解析 Markdown 文件
 */
async function parseMarkdown(buffer: Buffer, fileName: string): Promise<ParsedDocument> {
  const text = buffer.toString('utf-8')

  // 提取标题（第一个 # 开头的行）
  const titleMatch = text.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1] : fileName

  // 移除 Markdown 语法，保留纯文本
  const plainText = text
    .replace(/^#+\s+/gm, '') // 移除标题标记
    .replace(/\*\*(.+?)\*\*/g, '$1') // 移除粗体
    .replace(/\*(.+?)\*/g, '$1') // 移除斜体
    .replace(/`(.+?)`/g, '$1') // 移除行内代码
    .replace(/```[\s\S]*?```/g, '') // 移除代码块
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // 移除链接，保留文本
    .replace(/!\[.*?\]\(.+?\)/g, '') // 移除图片
    .replace(/^[-*+]\s+/gm, '') // 移除列表标记
    .replace(/^\d+\.\s+/gm, '') // 移除数字列表
    .replace(/^>\s+/gm, '') // 移除引用
    .replace(/---+/g, '') // 移除分隔线

  return {
    text: plainText,
    metadata: {
      title,
      wordCount: plainText.split(/\s+/).length,
    },
  }
}

/**
 * 获取支持的文件类型列表
 */
export function getSupportedFileTypes(): string[] {
  return ['pdf', 'docx', 'doc', 'txt', 'md', 'markdown']
}

/**
 * 检查文件类型是否支持
 */
export function isFileTypeSupported(fileType: string): boolean {
  return getSupportedFileTypes().includes(fileType.toLowerCase())
}
