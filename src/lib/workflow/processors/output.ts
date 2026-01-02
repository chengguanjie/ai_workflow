/**
 * 输出节点处理器：将内容生成并落为可下载文件（OutputFile）
 * 支持图文混排的 Word 文档生成
 */

import type { NodeConfig, OutputNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'
import { replaceVariables } from '../utils'
import { storageService, FORMAT_MIME_TYPES, FORMAT_EXTENSIONS } from '@/lib/storage'
import { ValidationError } from '@/lib/errors'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } from 'docx'
import ExcelJS from 'exceljs'

function inferFileName(base: string, format: string): string {
  const ext = (FORMAT_EXTENSIONS as any)[format] || ''
  const safeBase = base && base.trim() ? base.trim() : 'output'
  if (safeBase.toLowerCase().endsWith(String(ext))) return safeBase
  return `${safeBase}${ext || ''}`
}

function tryParseInternalFileKey(url: string): string | null {
  try {
    const parsed = new URL(url, 'http://localhost')
    const match = parsed.pathname.match(/^\/api\/files\/([^/]+)\/download$/)
    if (!match?.[1]) return null
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function tryParseDataUrl(url: string): { mimeType: string; base64: string } | null {
  const match = url.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i)
  if (!match?.[1] || !match?.[2]) return null
  return { mimeType: match[1].toLowerCase(), base64: match[2] }
}

async function fetchImageAsBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const dataUrl = tryParseDataUrl(url)
    if (dataUrl) {
      return {
        buffer: Buffer.from(dataUrl.base64, 'base64'),
        mimeType: dataUrl.mimeType,
      }
    }

    const fileKey = tryParseInternalFileKey(url)
    if (fileKey) {
      const dl = await storageService.getDownloadInfoByKey(fileKey)
      if (dl?.localPath) {
        const { readFile } = await import('fs/promises')
        return {
          buffer: await readFile(dl.localPath),
          mimeType: dl.file.mimeType,
        }
      }
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await fetch(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) return null
      const arrayBuffer = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || 'image/png'
      return {
        buffer: Buffer.from(arrayBuffer),
        mimeType: contentType,
      }
    }

    return null
  } catch (error) {
    console.warn('[Output] 获取图片失败:', url, error)
    return null
  }
}

interface ContentBlock {
  type: 'text' | 'heading' | 'image'
  content: string
  level?: number
  imageUrl?: string
  imageAlt?: string
}

function parseContentBlocks(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length,
      })
      continue
    }

    const imageMatch = trimmedLine.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    if (imageMatch) {
      blocks.push({
        type: 'image',
        content: imageMatch[1] || '',
        imageUrl: imageMatch[2],
        imageAlt: imageMatch[1],
      })
      continue
    }

    blocks.push({
      type: 'text',
      content: line,
    })
  }

  return blocks
}

async function buildDocxWithImages(text: string, context: ExecutionContext): Promise<Buffer> {
  const blocks = parseContentBlocks(text)
  const children: (Paragraph | any)[] = []

  for (const block of blocks) {
    if (block.type === 'heading') {
      const headingLevel = block.level === 1 ? HeadingLevel.HEADING_1 :
                          block.level === 2 ? HeadingLevel.HEADING_2 :
                          block.level === 3 ? HeadingLevel.HEADING_3 :
                          block.level === 4 ? HeadingLevel.HEADING_4 :
                          block.level === 5 ? HeadingLevel.HEADING_5 :
                          HeadingLevel.HEADING_6
      children.push(new Paragraph({
        text: block.content,
        heading: headingLevel,
      }))
    } else if (block.type === 'image' && block.imageUrl) {
      const imageData = await fetchImageAsBuffer(block.imageUrl)
      if (imageData) {
        try {
          children.push(new Paragraph({
            children: [
              new ImageRun({
                data: imageData.buffer,
                transformation: {
                  width: 400,
                  height: 300,
                },
                type: imageData.mimeType.includes('png') ? 'png' : 
                      imageData.mimeType.includes('gif') ? 'gif' : 'jpg',
              }),
            ],
            alignment: AlignmentType.CENTER,
          }))
          if (block.imageAlt) {
            children.push(new Paragraph({
              children: [
                new TextRun({
                  text: block.imageAlt,
                  italics: true,
                  size: 20,
                }),
              ],
              alignment: AlignmentType.CENTER,
            }))
          }
        } catch (error) {
          console.warn('[Output] 嵌入图片失败:', block.imageUrl, error)
          children.push(new Paragraph({
            text: `[图片: ${block.imageAlt || block.imageUrl}]`,
          }))
        }
      } else {
        children.push(new Paragraph({
          text: `[图片加载失败: ${block.imageAlt || block.imageUrl}]`,
        }))
      }
    } else {
      children.push(new Paragraph({
        text: block.content,
      }))
    }
  }

  const doc = new Document({
    sections: [{ children }],
  })

  return await Packer.toBuffer(doc)
}

async function buildPdfFromText(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const size = 12
  const margin = 50
  const width = page.getWidth() - margin * 2

  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const next = current ? `${current} ${w}` : w
    if (font.widthOfTextAtSize(next, size) > width) {
      if (current) lines.push(current)
      current = w
    } else {
      current = next
    }
  }
  if (current) lines.push(current)

  let y = page.getHeight() - margin
  for (const line of lines) {
    page.drawText(line, { x: margin, y, size, font })
    y -= size + 4
    if (y < margin) {
      y = page.getHeight() - margin
      pdf.addPage()
    }
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

async function buildDocxFromText(text: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: text.split('\n').map((line) => new Paragraph(line)),
      },
    ],
  })
  const bytes = await Packer.toBuffer(doc)
  return bytes
}

async function buildXlsxFromText(text: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Sheet1')

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === 'object') {
      const keys = Array.from(new Set(parsed.flatMap((r: any) => Object.keys(r || {}))))
      ws.addRow(keys)
      for (const row of parsed) {
        ws.addRow(keys.map((k) => (row && row[k] !== undefined ? String(row[k]) : '')))
      }
    } else {
      ws.getCell('A1').value = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)
    }
  } catch {
    ws.getCell('A1').value = text
  }

  const buf = await workbook.xlsx.writeBuffer()
  return Buffer.from(buf as ArrayBuffer)
}

export class OutputNodeProcessor implements NodeProcessor {
  nodeType = 'OUTPUT'

  async process(node: NodeConfig, context: ExecutionContext): Promise<NodeOutput> {
    const startedAt = new Date()
    const outputNode = node as OutputNodeConfig

    try {
      const cfg = outputNode.config || {}
      const format = (cfg.format || 'text') as any
      const rawPrompt = cfg.prompt || ''
      const resolvedPrompt = rawPrompt.includes('{{') ? replaceVariables(rawPrompt, context) : rawPrompt

      let fileBuffer: Buffer | null = null
      let mimeType = (FORMAT_MIME_TYPES as any)[format] || 'text/plain'

      if (format === 'pdf') {
        fileBuffer = await buildPdfFromText(resolvedPrompt)
        mimeType = 'application/pdf'
      } else if (format === 'word') {
        const hasImages = resolvedPrompt.includes('![') || resolvedPrompt.includes('](http')
        if (hasImages) {
          fileBuffer = await buildDocxWithImages(resolvedPrompt, context)
        } else {
          fileBuffer = await buildDocxFromText(resolvedPrompt)
        }
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      } else if (format === 'excel') {
        fileBuffer = await buildXlsxFromText(resolvedPrompt)
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      } else if (format === 'image' || format === 'audio' || format === 'video') {
        const url = resolvedPrompt.trim()
        if (!url) throw new ValidationError('输出节点缺少媒体 URL（prompt）')
        const dataUrl = tryParseDataUrl(url)
        if (dataUrl) {
          fileBuffer = Buffer.from(dataUrl.base64, 'base64')
          mimeType = dataUrl.mimeType
        } else {
          const fileKey = tryParseInternalFileKey(url)
          if (!fileKey) throw new ValidationError('仅支持 data:* 或本系统 /api/files/.../download 作为媒体输出来源')
          const dl = await storageService.getDownloadInfoByKey(fileKey)
          if (!dl?.localPath) throw new ValidationError('媒体输出仅支持本地存储文件')
          const { readFile } = await import('fs/promises')
          fileBuffer = await readFile(dl.localPath)
          mimeType = dl.file.mimeType
        }
      } else {
        fileBuffer = Buffer.from(resolvedPrompt, 'utf8')
      }

      const fileName = inferFileName(cfg.fileName || outputNode.name || 'output', format)

      const saved = await storageService.uploadAndSave({
        file: fileBuffer,
        fileName,
        mimeType,
        format,
        organizationId: context.organizationId,
        executionId: context.executionId,
        nodeId: node.id,
      })

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          file: {
            id: saved.id,
            fileKey: saved.fileKey,
            url: saved.url,
            size: saved.size,
            fileName,
            mimeType,
            format,
          },
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : '处理输出节点失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }
}

export const outputNodeProcessor = new OutputNodeProcessor()
