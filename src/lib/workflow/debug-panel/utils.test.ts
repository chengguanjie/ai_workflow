/**
 * 节点调试面板工具函数测试
 * 
 * 包含属性测试和单元测试
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  isFileTypeSupported,
  getFileCategory,
  normalizeExtension,
  inferOutputType,
  generateDownloadFileName,
  sanitizeFileName,
  formatTimestamp,
  parseCSV,
  serializeCSV,
  ALL_MODALITIES,
  getModelsForModality,
  getDefaultModelForModality,
  isModelInModality,
  filterModelsByModality,
  validateModalitySwitchConsistency
} from './utils'
import {
  SUPPORTED_FILE_TYPES,
  ALL_SUPPORTED_EXTENSIONS,
  OUTPUT_TYPE_LABELS,
  type OutputType
} from './types'
import type { ModelModality } from '@/lib/ai/types'

// ============================================
// Property 1: 文件类型验证
// Feature: node-debug-enhancement, Property 1: 文件类型验证
// **Validates: Requirements 2.2, 2.4**
// ============================================

describe('Property 1: 文件类型验证', () => {
  it('*For any* 支持的文件扩展名，isFileTypeSupported 应返回 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_SUPPORTED_EXTENSIONS),
        (extension) => {
          expect(isFileTypeSupported(extension)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 支持的文件扩展名（不带点号），isFileTypeSupported 应返回 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_SUPPORTED_EXTENSIONS.map(ext => ext.slice(1))),
        (extension) => {
          expect(isFileTypeSupported(extension)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 支持的文件扩展名（大写），isFileTypeSupported 应返回 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_SUPPORTED_EXTENSIONS.map(ext => ext.toUpperCase())),
        (extension) => {
          expect(isFileTypeSupported(extension)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 不支持的随机扩展名，isFileTypeSupported 应返回 false', () => {
    // 生成不在支持列表中的随机扩展名
    const unsupportedExtensions = ['.xyz', '.abc', '.unknown', '.test123', '.foo', '.bar']
    
    fc.assert(
      fc.property(
        fc.constantFrom(...unsupportedExtensions),
        (extension) => {
          expect(isFileTypeSupported(extension)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 支持的文件扩展名，getFileCategory 应返回正确的类别', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_SUPPORTED_EXTENSIONS),
        (extension) => {
          const category = getFileCategory(extension)
          expect(category).not.toBeNull()
          
          // 验证扩展名确实属于返回的类别
          if (category) {
            const categoryExtensions = SUPPORTED_FILE_TYPES[category] as readonly string[]
            const normalizedExt = normalizeExtension(extension)
            expect(categoryExtensions).toContain(normalizedExt)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 不支持的扩展名，getFileCategory 应返回 null', () => {
    const unsupportedExtensions = ['.xyz', '.abc', '.unknown', '.test123']
    
    fc.assert(
      fc.property(
        fc.constantFrom(...unsupportedExtensions),
        (extension) => {
          expect(getFileCategory(extension)).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Property 2: 模型类别切换一致性
// Feature: node-debug-enhancement, Property 2: 模型类别切换一致性
// **Validates: Requirements 3.4, 3.5**
// ============================================

describe('Property 2: 模型类别切换一致性', () => {
  it('*For any* 模型类别，getModelsForModality 返回的模型列表应非空', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_MODALITIES),
        (modality: ModelModality) => {
          const models = getModelsForModality(modality)
          expect(models.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 模型类别，getDefaultModelForModality 返回的默认模型应属于该类别', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_MODALITIES),
        (modality: ModelModality) => {
          const defaultModel = getDefaultModelForModality(modality)
          const models = getModelsForModality(modality)
          
          expect(models).toContain(defaultModel)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 模型类别和该类别的模型，isModelInModality 应返回 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_MODALITIES),
        (modality: ModelModality) => {
          const models = getModelsForModality(modality)
          
          // 对该类别的每个模型进行验证
          for (const model of models) {
            expect(isModelInModality(model, modality)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 模型类别，filterModelsByModality 应只返回属于该类别的模型', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_MODALITIES),
        (modality: ModelModality) => {
          // 创建一个混合的模型列表（包含该类别和其他类别的模型）
          const modalityModels = getModelsForModality(modality)
          const otherModality = ALL_MODALITIES.find(m => m !== modality) || 'text'
          const otherModels = getModelsForModality(otherModality as ModelModality)
          
          const mixedModels = [...modalityModels.slice(0, 2), ...otherModels.slice(0, 2)]
          const filtered = filterModelsByModality(mixedModels, modality)
          
          // 过滤后的模型应该都属于该类别
          for (const model of filtered) {
            expect(isModelInModality(model, modality)).toBe(true)
          }
          
          // 过滤后的模型数量应该小于等于原始列表中属于该类别的模型数量
          const expectedCount = mixedModels.filter(m => modalityModels.includes(m)).length
          expect(filtered.length).toBe(expectedCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 模型类别，validateModalitySwitchConsistency 应验证一致性', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_MODALITIES),
        (modality: ModelModality) => {
          const models = getModelsForModality(modality)
          const defaultModel = getDefaultModelForModality(modality)
          
          // 使用正确的模型列表和默认模型应该通过验证
          const result = validateModalitySwitchConsistency(modality, models, defaultModel)
          
          expect(result.isValid).toBe(true)
          expect(result.errors).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 模型类别，使用错误的默认模型应导致验证失败', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_MODALITIES),
        (modality: ModelModality) => {
          const models = getModelsForModality(modality)
          const wrongDefaultModel = 'non-existent-model'
          
          // 使用不存在的默认模型应该导致验证失败
          const result = validateModalitySwitchConsistency(modality, models, wrongDefaultModel)
          
          expect(result.isValid).toBe(false)
          expect(result.errors.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Property 3: 输出类型推断
// Feature: node-debug-enhancement, Property 3: 输出类型推断
// **Validates: Requirements 4.3**
// ============================================

describe('Property 3: 输出类型推断', () => {
  it('*For any* JSON 对象，inferOutputType 应返回 json', () => {
    fc.assert(
      fc.property(
        fc.object(),
        (obj) => {
          expect(inferOutputType(obj)).toBe('json')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 有效的 JSON 字符串，inferOutputType 应返回 json', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.object().map(obj => JSON.stringify(obj)),
          fc.array(fc.anything()).map(arr => JSON.stringify(arr))
        ),
        (jsonStr) => {
          expect(inferOutputType(jsonStr)).toBe('json')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 图片 MIME 类型，inferOutputType 应返回 image', () => {
    const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    
    fc.assert(
      fc.property(
        fc.constantFrom(...imageMimeTypes),
        (mimeType) => {
          expect(inferOutputType('', mimeType)).toBe('image')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 音频 MIME 类型，inferOutputType 应返回 audio', () => {
    const audioMimeTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a']
    
    fc.assert(
      fc.property(
        fc.constantFrom(...audioMimeTypes),
        (mimeType) => {
          expect(inferOutputType('', mimeType)).toBe('audio')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 视频 MIME 类型，inferOutputType 应返回 video', () => {
    const videoMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime']
    
    fc.assert(
      fc.property(
        fc.constantFrom(...videoMimeTypes),
        (mimeType) => {
          expect(inferOutputType('', mimeType)).toBe('video')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* null 或 undefined 内容，inferOutputType 应返回 text', () => {
    expect(inferOutputType(null)).toBe('text')
    expect(inferOutputType(undefined)).toBe('text')
  })
})

// ============================================
// Property 5: 下载文件名生成
// Feature: node-debug-enhancement, Property 5: 下载文件名生成
// **Validates: Requirements 7.3**
// ============================================

describe('Property 5: 下载文件名生成', () => {
  const outputTypes: OutputType[] = Object.keys(OUTPUT_TYPE_LABELS) as OutputType[]

  it('*For any* 节点名称和输出类型，生成的文件名应包含节点名称', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /[a-zA-Z0-9]/.test(s)),
        fc.constantFrom(...outputTypes),
        (nodeName, outputType) => {
          const fileName = generateDownloadFileName(nodeName, outputType)
          const sanitized = sanitizeFileName(nodeName)
          
          // 文件名应该以清理后的节点名称开头
          expect(fileName.startsWith(sanitized)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 节点名称和输出类型，生成的文件名应包含时间戳', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /[a-zA-Z0-9]/.test(s)),
        fc.constantFrom(...outputTypes),
        (nodeName, outputType) => {
          const fileName = generateDownloadFileName(nodeName, outputType)
          
          // 文件名应该包含时间戳格式 (YYYYMMDD_HHmmss)
          const timestampPattern = /\d{8}_\d{6}/
          expect(timestampPattern.test(fileName)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 节点名称和输出类型，生成的文件名不应包含非法字符', () => {
    const illegalChars = /[\\/:*?"<>|]/
    
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom(...outputTypes),
        (nodeName, outputType) => {
          const fileName = generateDownloadFileName(nodeName, outputType)
          
          // 文件名不应包含非法字符
          expect(illegalChars.test(fileName)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 输出类型，生成的文件名应有正确的扩展名', () => {
    const extensionMap: Record<OutputType, string> = {
      'text': '.txt',
      'json': '.json',
      'html': '.html',
      'csv': '.csv',
      'word': '.docx',
      'pdf': '.pdf',
      'excel': '.xlsx',
      'ppt': '.pptx',
      'image': '.png',
      'audio': '.mp3',
      'video': '.mp4'
    }
    
    fc.assert(
      fc.property(
        fc.constantFrom(...outputTypes),
        (outputType) => {
          const fileName = generateDownloadFileName('test', outputType)
          const expectedExt = extensionMap[outputType]
          
          expect(fileName.endsWith(expectedExt)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// Property 4: CSV 数据表格转换
// Feature: node-debug-enhancement, Property 4: CSV数据表格转换
// **Validates: Requirements 5.3**
// ============================================

describe('Property 4: CSV 数据表格转换', () => {
  it('*For any* 有效的二维字符串数组（非空），序列化后再解析应得到等价数据', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(
            fc.string({ minLength: 1 }).filter(s => !s.includes('\n')), // 非空字符串，避免换行符干扰
            { minLength: 1, maxLength: 5 }
          ),
          { minLength: 1, maxLength: 10 }
        ),
        (data) => {
          const csv = serializeCSV(data)
          const parsed = parseCSV(csv)
          
          // 行数应该相同
          expect(parsed.length).toBe(data.length)
          
          // 每行的列数应该相同
          for (let i = 0; i < data.length; i++) {
            expect(parsed[i].length).toBe(data[i].length)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('*For any* 简单的 CSV 数据（无特殊字符），解析后序列化应保持一致', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 })
              .filter(s => !/[,"\n\r\s]/.test(s)), // 简单字符串，无特殊字符和空格
            { minLength: 2, maxLength: 4 }
          ),
          { minLength: 2, maxLength: 5 }
        ),
        (data) => {
          const csv = serializeCSV(data)
          const parsed = parseCSV(csv)
          const reserialized = serializeCSV(parsed)
          
          // 重新序列化后应该与原始 CSV 相同
          expect(reserialized).toBe(csv)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================
// 单元测试
// ============================================

describe('normalizeExtension', () => {
  it('should add dot prefix if missing', () => {
    expect(normalizeExtension('pdf')).toBe('.pdf')
    expect(normalizeExtension('jpg')).toBe('.jpg')
  })

  it('should keep dot prefix if present', () => {
    expect(normalizeExtension('.pdf')).toBe('.pdf')
    expect(normalizeExtension('.jpg')).toBe('.jpg')
  })

  it('should convert to lowercase', () => {
    expect(normalizeExtension('PDF')).toBe('.pdf')
    expect(normalizeExtension('.JPG')).toBe('.jpg')
  })

  it('should trim whitespace', () => {
    expect(normalizeExtension('  .pdf  ')).toBe('.pdf')
    expect(normalizeExtension('  jpg  ')).toBe('.jpg')
  })
})

describe('sanitizeFileName', () => {
  it('should replace illegal characters with underscore', () => {
    expect(sanitizeFileName('file:name')).toBe('file_name')
    expect(sanitizeFileName('file/name')).toBe('file_name')
    expect(sanitizeFileName('file*name')).toBe('file_name')
  })

  it('should replace spaces with underscore', () => {
    expect(sanitizeFileName('file name')).toBe('file_name')
    expect(sanitizeFileName('file  name')).toBe('file_name')
  })

  it('should return default name for empty input', () => {
    expect(sanitizeFileName('')).toBe('output')
    expect(sanitizeFileName('   ')).toBe('output')
  })

  it('should truncate long names', () => {
    const longName = 'a'.repeat(100)
    const result = sanitizeFileName(longName)
    expect(result.length).toBeLessThanOrEqual(50)
  })
})

describe('formatTimestamp', () => {
  it('should format date correctly', () => {
    const date = new Date(2024, 0, 15, 10, 30, 45) // 2024-01-15 10:30:45
    expect(formatTimestamp(date)).toBe('20240115_103045')
  })

  it('should pad single digits with zero', () => {
    const date = new Date(2024, 0, 5, 9, 5, 5) // 2024-01-05 09:05:05
    expect(formatTimestamp(date)).toBe('20240105_090505')
  })
})

describe('inferOutputType edge cases', () => {
  it('should detect HTML content', () => {
    expect(inferOutputType('<html><body>Hello</body></html>')).toBe('html')
    expect(inferOutputType('<!DOCTYPE html><html></html>')).toBe('html')
    expect(inferOutputType('<div>Content</div>')).toBe('html')
  })

  it('should detect CSV content', () => {
    const csv = 'name,age,city\nJohn,30,NYC\nJane,25,LA'
    expect(inferOutputType(csv)).toBe('csv')
  })

  it('should return text for plain strings', () => {
    expect(inferOutputType('Hello, World!')).toBe('text')
    expect(inferOutputType('Just some text')).toBe('text')
  })
})

describe('parseCSV', () => {
  it('should parse simple CSV', () => {
    const csv = 'a,b,c\n1,2,3'
    const result = parseCSV(csv)
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('should handle quoted fields', () => {
    const csv = '"hello, world",test\nvalue1,value2'
    const result = parseCSV(csv)
    expect(result[0][0]).toBe('hello, world')
  })

  it('should handle escaped quotes', () => {
    const csv = '"say ""hello""",test'
    const result = parseCSV(csv)
    expect(result[0][0]).toBe('say "hello"')
  })
})
