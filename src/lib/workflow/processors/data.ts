/**
 * 数据节点处理器
 * 处理 Excel/CSV 数据导入和解析
 */

import type { NodeConfig, DataNodeConfig } from '@/types/workflow'
import type { NodeProcessor, NodeOutput, ExecutionContext } from '../types'

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

      if (files.length === 0) {
        return {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          status: 'success',
          data: {
            files: [],
            records: [],
            summary: '未导入任何数据文件',
          },
          startedAt,
          completedAt: new Date(),
          duration: Date.now() - startedAt.getTime(),
        }
      }

      // 解析所有文件
      const allRecords: Record<string, unknown>[] = []
      const fileInfos: Array<{
        name: string
        type: string
        recordCount: number
        columns?: string[]
      }> = []

      for (const file of files) {
        const parsed = await this.parseFile(file)
        allRecords.push(...parsed.records)
        fileInfos.push({
          name: file.name,
          type: file.type || 'unknown',
          recordCount: parsed.records.length,
          columns: parsed.columns,
        })
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

  /**
   * 解析文件
   */
  private async parseFile(file: {
    name: string
    url: string
    type?: string
  }): Promise<{
    records: Record<string, unknown>[]
    columns?: string[]
  }> {
    const fileName = file.name.toLowerCase()

    // 根据文件类型选择解析方式
    if (fileName.endsWith('.csv')) {
      return this.parseCSV(file.url)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return this.parseExcel(file.url)
    } else if (fileName.endsWith('.json')) {
      return this.parseJSON(file.url)
    }

    throw new Error(`不支持的文件格式: ${file.name}`)
  }

  /**
   * 解析 CSV 文件
   */
  private async parseCSV(url: string): Promise<{
    records: Record<string, unknown>[]
    columns: string[]
  }> {
    try {
      const response = await fetch(url)
      const text = await response.text()

      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length === 0) {
        return { records: [], columns: [] }
      }

      // 解析表头
      const columns = this.parseCSVLine(lines[0])
      const records: Record<string, unknown>[] = []

      // 解析数据行
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i])
        const record: Record<string, unknown> = {}

        columns.forEach((col, idx) => {
          record[col] = values[idx] || ''
        })

        records.push(record)
      }

      return { records, columns }
    } catch (error) {
      console.error('CSV parse error:', error)
      return { records: [], columns: [] }
    }
  }

  /**
   * 解析 CSV 行（处理引号）
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    result.push(current.trim())
    return result
  }

  /**
   * 解析 Excel 文件
   */
  private async parseExcel(url: string): Promise<{
    records: Record<string, unknown>[]
    columns: string[]
  }> {
    try {
      // 动态导入 xlsx 库
      const XLSX = await import('xlsx')

      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })

      // 读取第一个工作表
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      // 转换为 JSON
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

      if (data.length === 0) {
        return { records: [], columns: [] }
      }

      // 第一行作为列名
      const columns = (data[0] as string[]).map(col => String(col || '').trim())
      const records: Record<string, unknown>[] = []

      for (let i = 1; i < data.length; i++) {
        const row = data[i] as unknown[]
        const record: Record<string, unknown> = {}

        columns.forEach((col, idx) => {
          record[col] = row[idx] ?? ''
        })

        records.push(record)
      }

      return { records, columns }
    } catch (error) {
      console.warn('Excel parse requires xlsx library:', error)
      return { records: [], columns: [] }
    }
  }

  /**
   * 解析 JSON 文件
   */
  private async parseJSON(url: string): Promise<{
    records: Record<string, unknown>[]
    columns?: string[]
  }> {
    const response = await fetch(url)
    const data = await response.json()

    if (Array.isArray(data)) {
      const columns = data.length > 0 ? Object.keys(data[0]) : []
      return { records: data, columns }
    }

    return { records: [data] }
  }
}

export const dataNodeProcessor = new DataNodeProcessor()
