/**
 * 输出节点处理器
 * 支持多种输出格式，并生成对应的文件
 */

import type { NodeConfig, OutputNodeConfig, OutputFormat } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext, AIConfigCache } from '../types'
import { replaceVariables, replaceFileNameVariables } from '../utils'
import { aiService } from '@/lib/ai'
import { prisma } from '@/lib/db'
import { decryptApiKey } from '@/lib/crypto'
import { storageService, FORMAT_MIME_TYPES, FORMAT_EXTENSIONS } from '@/lib/storage'

export class OutputNodeProcessor implements NodeProcessor {
  nodeType = 'OUTPUT'

  // 存储生成的文件信息
  generatedFiles: Array<{
    id: string
    fileName: string
    format: string
    url: string
    size: number
  }> = []

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const outputNode = node as OutputNodeConfig
    this.generatedFiles = []

    try {
      const format = outputNode.config?.format || 'text'

      // 获取 AI 配置
      const aiConfig = await this.getAIConfig(
        outputNode.config?.aiConfigId,
        context
      )

      // 处理提示词中的变量引用
      const prompt = replaceVariables(
        outputNode.config?.prompt || '',
        context
      )

      // 收集所有前置节点的输出作为上下文
      const allOutputs: Record<string, unknown> = {}
      for (const [, output] of context.nodeOutputs) {
        if (output.status === 'success') {
          allOutputs[output.nodeName] = output.data
        }
      }

      let content: string
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

      // 根据格式生成内容
      if (aiConfig && prompt.trim()) {
        // 使用 AI 生成内容
        const result = await this.generateWithAI(
          prompt,
          format,
          allOutputs,
          outputNode,
          aiConfig
        )
        content = result.content
        tokenUsage = result.tokenUsage
      } else {
        // 直接使用前置节点输出
        content = this.formatOutput(allOutputs, format)
      }

      // 对于文件类输出，生成并保存文件
      const fileFormats: OutputFormat[] = ['word', 'excel', 'pdf', 'image', 'audio', 'video', 'html']

      if (fileFormats.includes(format)) {
        const fileResult = await this.generateFile(
          content,
          format,
          outputNode,
          context
        )

        this.generatedFiles.push({
          id: fileResult.id,
          fileName: fileResult.fileName,
          format,
          url: fileResult.url,
          size: fileResult.size,
        })
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          content,
          format,
          files: this.generatedFiles,
        },
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
        tokenUsage,
      }
    } catch (error) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'error',
        data: {},
        error: error instanceof Error ? error.message : '输出处理失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  /**
   * 使用 AI 生成内容
   */
  private async generateWithAI(
    prompt: string,
    format: OutputFormat,
    allOutputs: Record<string, unknown>,
    outputNode: OutputNodeConfig,
    aiConfig: AIConfigCache
  ): Promise<{
    content: string
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
  }> {
    // 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(format)

    // 构建用户提示词
    const userPrompt = `
以下是工作流中各节点的输出数据：

${JSON.stringify(allOutputs, null, 2)}

用户的输出要求：
${prompt}

请根据以上数据和要求生成输出内容。
`.trim()

    // 调用 AI
    const model = outputNode.config?.model || aiConfig.defaultModel
    const response = await aiService.chat(
      aiConfig.provider,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: outputNode.config?.temperature ?? 0.7,
        maxTokens: outputNode.config?.maxTokens ?? 4096,
      },
      aiConfig.apiKey,
      aiConfig.baseUrl
    )

    return {
      content: response.content,
      tokenUsage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
    }
  }

  /**
   * 根据输出格式构建系统提示词
   */
  private buildSystemPrompt(format: OutputFormat): string {
    const formatInstructions: Record<OutputFormat, string> = {
      text: '请生成纯文本内容，不要使用任何格式标记。',
      json: '请生成有效的 JSON 格式内容。确保输出是合法的 JSON，可以被解析。',
      markdown: '请生成 Markdown 格式的内容，可以使用标题、列表、代码块等 Markdown 语法。',
      html: '请生成 HTML 格式的内容，包含适当的 HTML 标签和结构。',
      word: '请生成适合 Word 文档的内容，使用清晰的段落和标题结构。',
      excel: '请生成适合 Excel 表格的内容，使用表格结构。如果需要多列，请使用 | 分隔。',
      pdf: '请生成适合 PDF 文档的内容，注意排版和结构。',
      image: '请生成图片的详细描述，这个描述将被用于图像生成。描述应该详细、具体、有画面感。',
      audio: '请生成需要转换为语音的文本内容。文本应该自然流畅，适合朗读。',
      video: '请生成视频脚本或描述，包括场景、画面、旁白等内容。',
    }

    return `你是一个专业的内容生成助手。${formatInstructions[format]}`
  }

  /**
   * 格式化输出（不使用 AI）
   */
  private formatOutput(
    data: Record<string, unknown>,
    format: OutputFormat
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2)
      case 'text':
        return this.objectToText(data)
      case 'markdown':
        return this.objectToMarkdown(data)
      default:
        return JSON.stringify(data, null, 2)
    }
  }

  /**
   * 将对象转换为纯文本
   */
  private objectToText(obj: Record<string, unknown>, indent = ''): string {
    let result = ''
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        result += `${indent}${key}:\n`
        result += this.objectToText(value as Record<string, unknown>, indent + '  ')
      } else {
        result += `${indent}${key}: ${value}\n`
      }
    }
    return result
  }

  /**
   * 将对象转换为 Markdown
   */
  private objectToMarkdown(obj: Record<string, unknown>, level = 1): string {
    let result = ''
    const heading = '#'.repeat(Math.min(level, 6))

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result += `${heading} ${key}\n\n`
        result += this.objectToMarkdown(value as Record<string, unknown>, level + 1)
      } else if (Array.isArray(value)) {
        result += `${heading} ${key}\n\n`
        for (const item of value) {
          result += `- ${JSON.stringify(item)}\n`
        }
        result += '\n'
      } else {
        result += `**${key}**: ${value}\n\n`
      }
    }
    return result
  }

  /**
   * 生成并保存文件
   */
  private async generateFile(
    content: string,
    format: OutputFormat,
    outputNode: OutputNodeConfig,
    context: ExecutionContext
  ): Promise<{
    id: string
    fileName: string
    url: string
    size: number
  }> {
    // 生成文件名
    const baseFileName = outputNode.config?.fileName || `output_${Date.now()}`
    const fileName = replaceFileNameVariables(baseFileName, context) + FORMAT_EXTENSIONS[format]

    // 根据格式生成文件内容
    const fileBuffer = await this.generateFileContent(content, format)

    // 上传文件
    const result = await storageService.uploadAndSave({
      file: fileBuffer,
      fileName,
      mimeType: FORMAT_MIME_TYPES[format],
      format,
      organizationId: context.organizationId,
      executionId: context.executionId,
      nodeId: outputNode.id,
      metadata: {
        generatedBy: 'workflow',
        workflowId: context.workflowId,
      },
    })

    return {
      id: result.id,
      fileName,
      url: result.url,
      size: result.size,
    }
  }

  /**
   * 根据格式生成文件内容
   */
  private async generateFileContent(
    content: string,
    format: OutputFormat
  ): Promise<Buffer> {
    switch (format) {
      case 'text':
      case 'json':
      case 'markdown':
        return Buffer.from(content, 'utf-8')

      case 'html':
        return Buffer.from(this.wrapHtml(content), 'utf-8')

      case 'word':
        return await this.generateWordDocument(content)

      case 'excel':
        return await this.generateExcelDocument(content)

      case 'pdf':
        return await this.generatePdfDocument(content)

      case 'image':
      case 'audio':
      case 'video':
        // 这些格式需要调用外部 AI 服务生成
        // 暂时返回占位内容
        return Buffer.from(`[${format.toUpperCase()} GENERATION PLACEHOLDER]\n${content}`, 'utf-8')

      default:
        return Buffer.from(content, 'utf-8')
    }
  }

  /**
   * 包装 HTML 内容
   */
  private wrapHtml(content: string): string {
    // 如果内容已经是完整的 HTML，直接返回
    if (content.trim().toLowerCase().startsWith('<!doctype') ||
        content.trim().toLowerCase().startsWith('<html')) {
      return content
    }

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>工作流输出</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 3px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
${content}
</body>
</html>`
  }

  /**
   * 生成 Word 文档
   * 注意：实际生产中需要使用 docx 库
   */
  private async generateWordDocument(content: string): Promise<Buffer> {
    try {
      // 尝试动态导入 docx 库
      const docx = await import('docx')
      const { Document, Packer, Paragraph, TextRun } = docx

      // 将内容分割成段落
      const paragraphs = content.split('\n').map((line) =>
        new Paragraph({
          children: [new TextRun(line)],
        })
      )

      const doc = new Document({
        sections: [{ children: paragraphs }],
      })

      return await Packer.toBuffer(doc)
    } catch {
      // docx 库未安装，返回纯文本
      console.warn('docx library not installed, returning plain text')
      return Buffer.from(content, 'utf-8')
    }
  }

  /**
   * 生成 Excel 文档
   * 注意：实际生产中需要使用 exceljs 库
   */
  private async generateExcelDocument(content: string): Promise<Buffer> {
    try {
      // 尝试动态导入 exceljs 库
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Sheet1')

      // 解析内容为表格数据
      const rows = content.split('\n').map((line) =>
        line.split('|').map((cell) => cell.trim())
      )

      // 添加行
      for (const row of rows) {
        worksheet.addRow(row)
      }

      return Buffer.from(await workbook.xlsx.writeBuffer())
    } catch {
      // exceljs 库未安装，返回 CSV 格式
      console.warn('exceljs library not installed, returning CSV')
      return Buffer.from(content, 'utf-8')
    }
  }

  /**
   * 生成 PDF 文档
   * 注意：实际生产中需要使用 pdf-lib 或 puppeteer
   */
  private async generatePdfDocument(content: string): Promise<Buffer> {
    try {
      // 尝试动态导入 pdf-lib
      const { PDFDocument, StandardFonts } = await import('pdf-lib')

      const pdfDoc = await PDFDocument.create()
      const page = pdfDoc.addPage()
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

      const { height } = page.getSize()
      const fontSize = 12
      const lineHeight = fontSize * 1.5

      // 简单的文本布局
      const lines = content.split('\n')
      let y = height - 50

      for (const line of lines) {
        if (y < 50) {
          // 需要新页面
          const newPage = pdfDoc.addPage()
          y = newPage.getSize().height - 50
        }
        page.drawText(line.slice(0, 80), {
          x: 50,
          y,
          size: fontSize,
          font,
        })
        y -= lineHeight
      }

      return Buffer.from(await pdfDoc.save())
    } catch {
      // pdf-lib 库未安装，返回纯文本
      console.warn('pdf-lib library not installed, returning plain text')
      return Buffer.from(content, 'utf-8')
    }
  }

  /**
   * 获取 AI 配置（带缓存）
   */
  private async getAIConfig(
    configId: string | undefined,
    context: ExecutionContext
  ): Promise<AIConfigCache | null> {
    if (configId && context.aiConfigs.has(configId)) {
      return context.aiConfigs.get(configId)!
    }

    const where = configId
      ? { id: configId, organizationId: context.organizationId, isActive: true }
      : { organizationId: context.organizationId, isDefault: true, isActive: true }

    const apiKey = await prisma.apiKey.findFirst({ where })

    if (!apiKey) {
      return null
    }

    const config: AIConfigCache = {
      id: apiKey.id,
      provider: apiKey.provider,
      baseUrl: apiKey.baseUrl,
      apiKey: decryptApiKey(apiKey.keyEncrypted),
      defaultModel: apiKey.defaultModel,
    }

    context.aiConfigs.set(apiKey.id, config)
    return config
  }

  /**
   * 获取生成的文件列表
   */
  getGeneratedFiles() {
    return this.generatedFiles
  }
}

export const outputNodeProcessor = new OutputNodeProcessor()
