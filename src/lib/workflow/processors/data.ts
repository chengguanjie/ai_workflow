/**
 * 数据节点处理器
 * 处理 Excel/CSV/JSON 数据导入和解析
 */

import type { NodeConfig, DataNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'

interface FileInfo {
  name: string
  type: string
  recordCount: number
  columns?: string[]
  errors?: string[]
}

interface ParseOptions {
  headerRow?: number
  skipEmptyRows?: boolean
  delimiter?: string
  encoding?: string
  dateFormat?: string
  trimValues?: boolean
}

type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'null' | 'mixed'

interface ParseResult {
  records: Record<string, unknown>[]
  columns: string[]
  schema?: Record<string, FieldType>
  errors?: string[]
}

export class DataNodeProcessor implements NodeProcessor {
  nodeType = 'DATA'

  async process(
    node: NodeConfig,
    context: ExecutionContext
  ): Promise<NodeOutput> {
    const startedAt = new Date()
    const dataNode = node as DataNodeConfig

    try {
      const files = dataNode.config?.files || []
      const parseOptions: ParseOptions = dataNode.config?.parseOptions || {}

      if (files.length === 0) {
        return {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'success',
          data: {
            files: [],
            records: [],
            totalRecords: 0,
            summary: '未导入任何数据文件',
          },
          startedAt,
          completedAt: new Date(),
          duration: Date.now() - startedAt.getTime(),
        }
      }

      const allRecords: Record<string, unknown>[] = []
      const fileInfos: FileInfo[] = []
      const allErrors: string[] = []
      let globalSchema: Record<string, FieldType> = {}

      for (const file of files) {
        const parsed = await this.parseFile(file, parseOptions)
        allRecords.push(...parsed.records)
        
        if (parsed.schema) {
          globalSchema = { ...globalSchema, ...parsed.schema }
        }

        fileInfos.push({
          name: file.name,
          type: file.type || this.detectFileType(file.name),
          recordCount: parsed.records.length,
          columns: parsed.columns,
          errors: parsed.errors,
        })

        if (parsed.errors && parsed.errors.length > 0) {
          allErrors.push(...parsed.errors.map(e => `[${file.name}] ${e}`))
        }
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        status: 'success',
        data: {
          files: fileInfos,
          records: allRecords,
          totalRecords: allRecords.length,
          schema: Object.keys(globalSchema).length > 0 ? globalSchema : undefined,
          errors: allErrors.length > 0 ? allErrors : undefined,
          summary: `共导入 ${files.length} 个文件，${allRecords.length} 条记录`,
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
        error: error instanceof Error ? error.message : '数据解析失败',
        startedAt,
        completedAt: new Date(),
        duration: Date.now() - startedAt.getTime(),
      }
    }
  }

  private detectFileType(fileName: string): string {
    const lower = fileName.toLowerCase()
    if (lower.endsWith('.csv')) return 'csv'
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel'
    if (lower.endsWith('.json')) return 'json'
    if (lower.endsWith('.tsv')) return 'tsv'
    return 'unknown'
  }

  private async parseFile(
    file: { name: string; url: string; type?: string },
    options: ParseOptions
  ): Promise<ParseResult> {
    const fileType = file.type || this.detectFileType(file.name)

    switch (fileType) {
      case 'csv':
        return this.parseCSV(file.url, options)
      case 'tsv':
        return this.parseCSV(file.url, { ...options, delimiter: '\t' })
      case 'excel':
        return this.parseExcel(file.url, options)
      case 'json':
        return this.parseJSON(file.url)
      default:
        if (file.name.toLowerCase().endsWith('.csv')) {
          return this.parseCSV(file.url, options)
        }
        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
          return this.parseExcel(file.url, options)
        }
        if (file.name.toLowerCase().endsWith('.json')) {
          return this.parseJSON(file.url)
        }
        throw new Error(`不支持的文件格式: ${file.name}`)
    }
  }

  private async parseCSV(url: string, options: ParseOptions): Promise<ParseResult> {
    const errors: string[] = []
    
    try {
      const response = await fetch(url)
      const text = await response.text()
      const delimiter = options.delimiter || ','
      const skipEmptyRows = options.skipEmptyRows !== false
      const trimValues = options.trimValues !== false
      const headerRow = options.headerRow ?? 0

      const lines = text.split(/\r?\n/)
      
      if (lines.length <= headerRow) {
        return { records: [], columns: [], errors: ['文件为空或表头行设置错误'] }
      }

      const headerLine = lines[headerRow]
      const columns = this.parseCSVLine(headerLine, delimiter).map(col => 
        trimValues ? col.trim() : col
      )

      if (columns.length === 0 || columns.every(c => !c)) {
        return { records: [], columns: [], errors: ['无法解析表头'] }
      }

      const records: Record<string, unknown>[] = []
      const typeCounters: Record<string, Record<FieldType, number>> = {}

      columns.forEach(col => {
        typeCounters[col] = { string: 0, number: 0, boolean: 0, date: 0, null: 0, mixed: 0 }
      })

      for (let i = headerRow + 1; i < lines.length; i++) {
        const line = lines[i]
        
        if (skipEmptyRows && !line.trim()) {
          continue
        }

        const values = this.parseCSVLine(line, delimiter)
        const record: Record<string, unknown> = {}

        columns.forEach((col, idx) => {
          let value: unknown = values[idx] ?? ''
          
          if (trimValues && typeof value === 'string') {
            value = value.trim()
          }

          const converted = this.convertValue(value as string)
          record[col] = converted.value
          
          if (typeCounters[col]) {
            typeCounters[col][converted.type]++
          }
        })

        records.push(record)
      }

      const schema: Record<string, FieldType> = {}
      for (const col of columns) {
        schema[col] = this.inferType(typeCounters[col])
      }

      return { records, columns, schema, errors: errors.length > 0 ? errors : undefined }
    } catch (error) {
      console.error('CSV parse error:', error)
      return { 
        records: [], 
        columns: [], 
        errors: [`CSV解析失败: ${error instanceof Error ? error.message : '未知错误'}`] 
      }
    }
  }

  private parseCSVLine(line: string, delimiter: string = ','): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    let i = 0

    while (i < line.length) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            current += '"'
            i += 2
            continue
          } else {
            inQuotes = false
            i++
            continue
          }
        }
        current += char
        i++
      } else {
        if (char === '"') {
          inQuotes = true
          i++
        } else if (char === delimiter) {
          result.push(current)
          current = ''
          i++
        } else {
          current += char
          i++
        }
      }
    }

    result.push(current)
    return result
  }

  private convertValue(value: string): { value: unknown; type: FieldType } {
    if (value === '' || value === null || value === undefined) {
      return { value: null, type: 'null' }
    }

    const trimmed = value.trim()

    if (trimmed === '') {
      return { value: null, type: 'null' }
    }

    const lowerTrimmed = trimmed.toLowerCase()
    if (lowerTrimmed === 'true' || lowerTrimmed === 'false') {
      return { value: lowerTrimmed === 'true', type: 'boolean' }
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const num = parseFloat(trimmed)
      if (!isNaN(num) && isFinite(num)) {
        return { value: num, type: 'number' }
      }
    }

    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(trimmed)) {
      const date = new Date(trimmed)
      if (!isNaN(date.getTime())) {
        return { value: trimmed, type: 'date' }
      }
    }

    return { value: trimmed, type: 'string' }
  }

  private inferType(counts: Record<FieldType, number>): FieldType {
    const total = Object.values(counts).reduce((a, b) => a + b, 0) - counts.null
    if (total === 0) return 'null'

    const nonNullCounts: Partial<Record<FieldType, number>> = { ...counts }
    nonNullCounts.null = undefined

    const entries = Object.entries(nonNullCounts).filter(([, v]) => v !== undefined) as [FieldType, number][]
    entries.sort((a, b) => b[1] - a[1])

    if (entries.length === 0) return 'null'

    const [topType, topCount] = entries[0]
    if (topCount / total >= 0.8) {
      return topType
    }

    return 'mixed'
  }

  private async parseExcel(url: string, options: ParseOptions): Promise<ParseResult> {
    try {
      const XLSX = await import('xlsx')

      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })

      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

      if (data.length === 0) {
        return { records: [], columns: [] }
      }

      const headerRow = options.headerRow ?? 0
      if (data.length <= headerRow) {
        return { records: [], columns: [], errors: ['表头行设置错误'] }
      }

      const columns = (data[headerRow] as string[]).map(col => String(col || '').trim())
      const records: Record<string, unknown>[] = []

      for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i] as unknown[]
        
        if (options.skipEmptyRows !== false && (!row || row.every(cell => cell === null || cell === undefined || cell === ''))) {
          continue
        }

        const record: Record<string, unknown> = {}

        columns.forEach((col, idx) => {
          record[col] = row[idx] ?? null
        })

        records.push(record)
      }

      return { records, columns }
    } catch (error) {
      console.warn('Excel parse error:', error)
      return { 
        records: [], 
        columns: [],
        errors: [`Excel解析失败: ${error instanceof Error ? error.message : '需要xlsx库'}`]
      }
    }
  }

  private async parseJSON(url: string): Promise<ParseResult> {
    try {
      const response = await fetch(url)
      const data = await response.json()

      if (Array.isArray(data)) {
        if (data.length === 0) {
          return { records: [], columns: [] }
        }
        const columns = data.length > 0 ? Object.keys(data[0]) : []
        return { records: data, columns }
      }

      if (typeof data === 'object' && data !== null) {
        return { records: [data], columns: Object.keys(data) }
      }

      return { records: [], columns: [], errors: ['JSON格式无效'] }
    } catch (error) {
      return { 
        records: [], 
        columns: [],
        errors: [`JSON解析失败: ${error instanceof Error ? error.message : '格式错误'}`]
      }
    }
  }
}

export const dataNodeProcessor = new DataNodeProcessor()
