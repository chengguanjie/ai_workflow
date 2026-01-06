/**
 * 综合输出类型测试
 *
 * 测试所有工作流节点支持的输入输出类型：
 * - 文本格式：text, json, markdown, html, csv
 * - 媒体类型：image, audio, video
 * - 文档类型：word, pdf, excel, ppt
 */

import { describe, it, expect } from 'vitest'
import {
  jsonValidator,
  htmlValidator,
  markdownValidator,
  csvValidator,
  getValidator
} from '@/lib/workflow/validation/type-validators'
import { validateNodeOutput, isOutputValid } from '@/lib/workflow/validation/output-validator'
import { formatModalityOutput } from '@/lib/workflow/processors/modality-router'
import type { ProcessNodeConfig } from '@/types/workflow'
import type {
  TextOutput,
  ImageGenOutput,
  VideoGenOutput,
  TTSOutput,
  TranscriptionOutput,
  EmbeddingOutput
} from '@/lib/ai/types'
import {
  OutputType,
  OUTPUT_TYPE_LABELS,
  OUTPUT_TYPE_MIME_MAP,
  OUTPUT_TYPE_EXTENSION_MAP
} from '@/lib/workflow/debug-panel/types'

// ============================================
// 测试辅助函数
// ============================================

function createMockProcessNode(
  id: string,
  name: string,
  expectedOutputType?: OutputType
): ProcessNodeConfig {
  return {
    id,
    type: 'PROCESS',
    name,
    position: { x: 0, y: 0 },
    config: {
      userPrompt: '',
      systemPrompt: '',
      expectedOutputType,
    },
  }
}

// ============================================
// 一、文本格式类型测试
// ============================================

describe('文本格式输出类型', () => {
  describe('1. 纯文本 (text)', () => {
    it('应该接受任何非空文本', () => {
      const node = createMockProcessNode('node-1', 'TextNode', 'text')
      const validTexts = [
        'Hello, World!',
        '这是中文文本',
        'Mixed 中英文 content',
        '1234567890',
        'Special chars: !@#$%^&*()',
        '   有前后空格的文本   ',
        'Multiple\nLines\nText',
      ]

      for (const text of validTexts) {
        const result = validateNodeOutput({
          nodeConfig: node,
          output: { result: text },
          expectedOutputType: 'text',
        })
        expect(result.status).toBe('valid')
      }
    })

    it('应该拒绝空文本', () => {
      const node = createMockProcessNode('node-1', 'TextNode', 'text')
      const emptyTexts = ['', '   ', '\n\n', '\t\t']

      for (const text of emptyTexts) {
        const result = validateNodeOutput({
          nodeConfig: node,
          output: { result: text },
          expectedOutputType: 'text',
        })
        expect(result.status).toBe('empty')
      }
    })
  })

  describe('2. JSON 格式', () => {
    it('应该验证有效的 JSON 对象', () => {
      const validJsons = [
        '{}',
        '{"key": "value"}',
        '{"name": "测试", "count": 123, "active": true}',
        '{"nested": {"deep": {"value": 42}}}',
        '{"array": [1, 2, 3], "null": null}',
      ]

      for (const json of validJsons) {
        const result = jsonValidator.validate(json)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证有效的 JSON 数组', () => {
      const validArrays = [
        '[]',
        '[1, 2, 3]',
        '["a", "b", "c"]',
        '[{"id": 1}, {"id": 2}]',
        '[[1, 2], [3, 4]]',
      ]

      for (const arr of validArrays) {
        const result = jsonValidator.validate(arr)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证 JSON 原始值', () => {
      const primitives = [
        '"string"',
        '123',
        '-456.78',
        'true',
        'false',
        'null',
      ]

      for (const prim of primitives) {
        const result = jsonValidator.validate(prim)
        expect(result.valid).toBe(true)
      }
    })

    it('应该拒绝无效的 JSON', () => {
      const invalidJsons = [
        '{key: "value"}',           // 缺少键的引号
        "{'key': 'value'}",         // 单引号
        '{\"key\": undefined}',     // undefined
        '{"key": "value",}',        // 尾随逗号
        '[1, 2, 3,]',               // 数组尾随逗号
        '{"unclosed": "brace"',     // 未闭合
        '[1, 2, 3',                 // 数组未闭合
        'plain text',               // 纯文本
      ]

      for (const json of invalidJsons) {
        const result = jsonValidator.validate(json)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      }
    })
  })

  describe('3. Markdown 格式', () => {
    it('应该验证标题语法', () => {
      const headers = [
        '# 一级标题',
        '## 二级标题',
        '### 三级标题',
        '#### 四级标题',
        '##### 五级标题',
        '###### 六级标题',
      ]

      for (const header of headers) {
        const result = markdownValidator.validate(header)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证格式化语法', () => {
      const formatted = [
        '**粗体文本**',
        '*斜体文本*',
        '__粗体文本__',
        '_斜体文本_',
        '`行内代码`',
        '~~删除线~~',
      ]

      for (const text of formatted) {
        const result = markdownValidator.validate(text)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证链接和图片', () => {
      const links = [
        '[链接文本](https://example.com)',
        '![图片描述](image.png)',
        '[带标题的链接](https://example.com "标题")',
      ]

      for (const link of links) {
        const result = markdownValidator.validate(link)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证列表', () => {
      const lists = [
        '- 项目1\n- 项目2\n- 项目3',
        '* 项目1\n* 项目2',
        '+ 项目1\n+ 项目2',
        '1. 第一项\n2. 第二项\n3. 第三项',
      ]

      for (const list of lists) {
        const result = markdownValidator.validate(list)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证代码块', () => {
      const codeBlock = '```javascript\nconst x = 1;\nconsole.log(x);\n```'
      const result = markdownValidator.validate(codeBlock)
      expect(result.valid).toBe(true)
    })

    it('应该验证表格', () => {
      const table = '| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| A1 | B1 | C1 |\n| A2 | B2 | C2 |'
      const result = markdownValidator.validate(table)
      expect(result.valid).toBe(true)
    })

    it('应该接受纯文本（Markdown 的超集）', () => {
      const plainText = 'This is plain text without any markdown syntax.'
      const result = markdownValidator.validate(plainText)
      expect(result.valid).toBe(true)
    })
  })

  describe('4. HTML 格式', () => {
    it('应该验证基本 HTML 标签', () => {
      const validHtml = [
        '<div>内容</div>',
        '<p>段落</p>',
        '<span>行内元素</span>',
        '<a href="#">链接</a>',
        '<h1>标题</h1>',
      ]

      for (const html of validHtml) {
        const result = htmlValidator.validate(html)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证嵌套 HTML', () => {
      const nestedHtml = [
        '<div><p>嵌套段落</p></div>',
        '<ul><li>项目1</li><li>项目2</li></ul>',
        '<table><tr><td>单元格</td></tr></table>',
        '<div class="container"><header><h1>标题</h1></header></div>',
      ]

      for (const html of nestedHtml) {
        const result = htmlValidator.validate(html)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证自闭合标签', () => {
      const selfClosing = [
        '<br>',
        '<hr>',
        '<img src="image.png">',
        '<input type="text">',
        '<img src="test.jpg" />',
      ]

      for (const html of selfClosing) {
        const result = htmlValidator.validate(html)
        expect(result.valid).toBe(true)
      }
    })

    it('应该验证完整 HTML 文档', () => {
      const fullDoc = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>测试页面</title>
            <meta charset="utf-8">
          </head>
          <body>
            <header>
              <h1>欢迎</h1>
            </header>
            <main>
              <p>这是主要内容</p>
            </main>
            <footer>
              <p>页脚</p>
            </footer>
          </body>
        </html>
      `
      const result = htmlValidator.validate(fullDoc)
      expect(result.valid).toBe(true)
    })

    it('应该拒绝纯文本', () => {
      const plainText = 'This is plain text without any HTML tags at all'
      const result = htmlValidator.validate(plainText)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('HTML')
    })

    it('应该拒绝只有自定义标签', () => {
      const customTags = '<mycustomtag>Content</mycustomtag>'
      const result = htmlValidator.validate(customTags)
      expect(result.valid).toBe(false)
    })
  })

  describe('5. CSV 格式', () => {
    it('应该验证逗号分隔的 CSV', () => {
      const csv = 'name,age,city\nJohn,30,NYC\nJane,25,LA\nBob,35,Chicago'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })

    it('应该验证分号分隔的 CSV', () => {
      const csv = 'name;age;city\nJohn;30;NYC\nJane;25;LA'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })

    it('应该验证制表符分隔的 CSV', () => {
      const csv = 'name\tage\tcity\nJohn\t30\tNYC\nJane\t25\tLA'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })

    it('应该验证带引号字段的 CSV', () => {
      const csv = '"name","description"\n"John Doe","A person, who lives in NYC"\n"Jane","She said ""hello"""'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })

    it('应该验证单列 CSV', () => {
      const csv = 'name\nJohn\nJane\nBob'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })

    it('应该验证带空单元格的 CSV', () => {
      const csv = 'name,age,city\nJohn,,NYC\n,25,\nBob,35,Chicago'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })

    it('应该处理 Windows 换行符', () => {
      const csv = 'name,age\r\nJohn,30\r\nJane,25'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })

    it('应该验证中文 CSV', () => {
      const csv = '姓名,年龄,城市\n张三,30,北京\n李四,25,上海\n王五,35,广州'
      const result = csvValidator.validate(csv)
      expect(result.valid).toBe(true)
    })
  })
})

// ============================================
// 二、媒体类型测试
// ============================================

describe('媒体类型输出', () => {
  describe('6. 图片 (image)', () => {
    it('应该正确格式化图片生成输出', () => {
      const imageOutput: ImageGenOutput = {
        _type: 'image-gen',
        images: [
          { url: 'https://example.com/image1.png', revisedPrompt: 'A beautiful sunset' },
          { url: 'https://example.com/image2.png' },
        ],
        model: 'dall-e-3',
        prompt: 'A sunset over the ocean'
      }

      const formatted = formatModalityOutput(imageOutput)

      expect(formatted.images).toEqual(imageOutput.images)
      expect(formatted.结果).toBe('https://example.com/image1.png')
      expect(formatted.model).toBe('dall-e-3')
      expect(formatted.prompt).toBe('A sunset over the ocean')
    })

    it('应该处理 base64 图片', () => {
      const imageOutput: ImageGenOutput = {
        _type: 'image-gen',
        images: [
          { url: '', b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
        ],
        model: 'dall-e-2',
        prompt: 'A red pixel'
      }

      const formatted = formatModalityOutput(imageOutput)

      expect(formatted.images).toBeDefined()
      expect(Array.isArray(formatted.images)).toBe(true)
    })

    it('应该处理空图片数组', () => {
      const imageOutput: ImageGenOutput = {
        _type: 'image-gen',
        images: [],
        model: 'dall-e-3',
        prompt: 'test'
      }

      const formatted = formatModalityOutput(imageOutput)

      expect(formatted.images).toEqual([])
      expect(formatted.结果).toBe('')
    })
  })

  describe('7. 音频 (audio)', () => {
    it('应该正确格式化 TTS 输出', () => {
      const ttsOutput: TTSOutput = {
        _type: 'audio-tts',
        audio: {
          url: 'https://example.com/audio.mp3',
          format: 'mp3',
          duration: 30
        },
        model: 'tts-1',
        text: '你好，世界！'
      }

      const formatted = formatModalityOutput(ttsOutput)

      expect(formatted.audio).toEqual(ttsOutput.audio)
      expect(formatted.结果).toBe('https://example.com/audio.mp3')
      expect(formatted.model).toBe('tts-1')
      expect(formatted.text).toBe('你好，世界！')
    })

    it('应该正确格式化转录输出', () => {
      const transcriptionOutput: TranscriptionOutput = {
        _type: 'audio-transcription',
        text: '这是转录的文本内容',
        segments: [
          { start: 0, end: 2, text: '这是' },
          { start: 2, end: 5, text: '转录的文本内容' }
        ],
        language: 'zh',
        model: 'whisper-1'
      }

      const formatted = formatModalityOutput(transcriptionOutput)

      expect(formatted.结果).toBe('这是转录的文本内容')
      expect(formatted.segments).toEqual(transcriptionOutput.segments)
      expect(formatted.language).toBe('zh')
      expect(formatted.model).toBe('whisper-1')
    })
  })

  describe('8. 视频 (video)', () => {
    it('应该正确格式化视频生成输出', () => {
      const videoOutput: VideoGenOutput = {
        _type: 'video-gen',
        videos: [
          { url: 'https://example.com/video1.mp4', duration: 10, format: 'mp4' },
          { url: 'https://example.com/video2.mp4', duration: 15, format: 'mp4' },
        ],
        taskId: 'task-123',
        model: 'sora',
        prompt: 'A cat playing with a ball'
      }

      const formatted = formatModalityOutput(videoOutput)

      expect(formatted.videos).toEqual(videoOutput.videos)
      expect(formatted.结果).toBe('https://example.com/video1.mp4')
      expect(formatted.taskId).toBe('task-123')
      expect(formatted.model).toBe('sora')
      expect(formatted.prompt).toBe('A cat playing with a ball')
    })

    it('应该处理空视频数组', () => {
      const videoOutput: VideoGenOutput = {
        _type: 'video-gen',
        videos: [],
        taskId: 'task-456',
        model: 'sora',
        prompt: 'test'
      }

      const formatted = formatModalityOutput(videoOutput)

      expect(formatted.videos).toEqual([])
      expect(formatted.结果).toBe('')
    })
  })
})

// ============================================
// 三、文本输出格式化测试
// ============================================

describe('文本输出格式化', () => {
  it('应该正确格式化文本输出', () => {
    const textOutput: TextOutput = {
      _type: 'text',
      content: '这是AI生成的文本回复',
      model: 'gpt-4',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      }
    }

    const formatted = formatModalityOutput(textOutput)

    expect(formatted.结果).toBe('这是AI生成的文本回复')
    expect(formatted.model).toBe('gpt-4')
  })
})

// ============================================
// 四、向量嵌入输出测试
// ============================================

describe('向量嵌入输出', () => {
  it('应该正确格式化嵌入输出', () => {
    const embeddingOutput: EmbeddingOutput = {
      _type: 'embedding',
      embeddings: [[0.1, 0.2, 0.3, 0.4, 0.5]],
      model: 'text-embedding-ada-002',
      dimensions: 5
    }

    const formatted = formatModalityOutput(embeddingOutput)

    expect(formatted.embeddings).toEqual([[0.1, 0.2, 0.3, 0.4, 0.5]])
    expect(formatted.dimensions).toBe(5)
    expect(formatted.model).toBe('text-embedding-ada-002')
    expect(formatted.结果).toContain('向量嵌入完成')
  })
})

// ============================================
// 五、输出类型元数据测试
// ============================================

describe('输出类型元数据', () => {
  const allTypes: OutputType[] = [
    'text', 'markdown', 'json', 'html', 'csv',
    'word', 'pdf', 'excel', 'ppt',
    'image', 'audio', 'video'
  ]

  it('所有类型应该有显示标签', () => {
    for (const type of allTypes) {
      expect(OUTPUT_TYPE_LABELS[type]).toBeDefined()
      expect(typeof OUTPUT_TYPE_LABELS[type]).toBe('string')
      expect(OUTPUT_TYPE_LABELS[type].length).toBeGreaterThan(0)
    }
  })

  it('所有类型应该有 MIME 类型映射', () => {
    for (const type of allTypes) {
      expect(OUTPUT_TYPE_MIME_MAP[type]).toBeDefined()
      expect(Array.isArray(OUTPUT_TYPE_MIME_MAP[type])).toBe(true)
      expect(OUTPUT_TYPE_MIME_MAP[type].length).toBeGreaterThan(0)
    }
  })

  it('所有类型应该有文件扩展名映射', () => {
    for (const type of allTypes) {
      expect(OUTPUT_TYPE_EXTENSION_MAP[type]).toBeDefined()
      expect(OUTPUT_TYPE_EXTENSION_MAP[type].startsWith('.')).toBe(true)
    }
  })

  it('验证具体的标签值', () => {
    expect(OUTPUT_TYPE_LABELS.text).toBe('纯文本')
    expect(OUTPUT_TYPE_LABELS.json).toBe('JSON')
    expect(OUTPUT_TYPE_LABELS.image).toBe('图片')
    expect(OUTPUT_TYPE_LABELS.audio).toBe('音频')
    expect(OUTPUT_TYPE_LABELS.video).toBe('视频')
  })

  it('验证具体的扩展名', () => {
    expect(OUTPUT_TYPE_EXTENSION_MAP.text).toBe('.txt')
    expect(OUTPUT_TYPE_EXTENSION_MAP.json).toBe('.json')
    expect(OUTPUT_TYPE_EXTENSION_MAP.image).toBe('.png')
    expect(OUTPUT_TYPE_EXTENSION_MAP.audio).toBe('.mp3')
    expect(OUTPUT_TYPE_EXTENSION_MAP.video).toBe('.mp4')
    expect(OUTPUT_TYPE_EXTENSION_MAP.word).toBe('.docx')
    expect(OUTPUT_TYPE_EXTENSION_MAP.pdf).toBe('.pdf')
    expect(OUTPUT_TYPE_EXTENSION_MAP.excel).toBe('.xlsx')
  })
})

// ============================================
// 六、验证器注册表测试
// ============================================

describe('验证器注册表', () => {
  it('应该有文本格式的验证器', () => {
    expect(getValidator('json')).toBe(jsonValidator)
    expect(getValidator('html')).toBe(htmlValidator)
    expect(getValidator('markdown')).toBe(markdownValidator)
    expect(getValidator('csv')).toBe(csvValidator)
  })

  it('媒体和文档类型不需要内容验证器', () => {
    // 这些类型的输出是 URL 或二进制，不需要文本内容验证
    expect(getValidator('image')).toBeUndefined()
    expect(getValidator('audio')).toBeUndefined()
    expect(getValidator('video')).toBeUndefined()
    expect(getValidator('word')).toBeUndefined()
    expect(getValidator('pdf')).toBeUndefined()
    expect(getValidator('excel')).toBeUndefined()
    expect(getValidator('ppt')).toBeUndefined()
  })
})

// ============================================
// 七、输出验证综合测试
// ============================================

describe('输出验证综合测试', () => {
  it('isOutputValid 应该正确检测有效输出', () => {
    expect(isOutputValid({ result: 'content' })).toBe(true)
    expect(isOutputValid({ output: 'content' })).toBe(true)
    expect(isOutputValid({ text: 'content' })).toBe(true)
    expect(isOutputValid({ data: { nested: 'value' } })).toBe(true)
    expect(isOutputValid({ count: 0 })).toBe(true) // 0 是有效值
    expect(isOutputValid({ flag: false })).toBe(true) // false 是有效值
  })

  it('isOutputValid 应该正确检测空输出', () => {
    expect(isOutputValid({})).toBe(false)
    expect(isOutputValid({ result: '' })).toBe(false)
    expect(isOutputValid({ result: '   ' })).toBe(false)
    expect(isOutputValid({ result: null } as Record<string, unknown>)).toBe(false)
    expect(isOutputValid({ result: undefined } as Record<string, unknown>)).toBe(false)
  })

  it('应该正确验证带期望类型的输出', () => {
    // JSON 类型
    const jsonNode = createMockProcessNode('node-1', 'JsonNode', 'json')
    expect(validateNodeOutput({
      nodeConfig: jsonNode,
      output: { result: '{"valid": true}' },
      expectedOutputType: 'json',
    }).status).toBe('valid')
    expect(validateNodeOutput({
      nodeConfig: jsonNode,
      output: { result: 'not json' },
      expectedOutputType: 'json',
    }).status).toBe('invalid')

    // HTML 类型
    const htmlNode = createMockProcessNode('node-2', 'HtmlNode', 'html')
    expect(validateNodeOutput({
      nodeConfig: htmlNode,
      output: { result: '<div>Hello</div>' },
      expectedOutputType: 'html',
    }).status).toBe('valid')
    expect(validateNodeOutput({
      nodeConfig: htmlNode,
      output: { result: 'plain text' },
      expectedOutputType: 'html',
    }).status).toBe('invalid')

    // CSV 类型
    const csvNode = createMockProcessNode('node-3', 'CsvNode', 'csv')
    expect(validateNodeOutput({
      nodeConfig: csvNode,
      output: { result: 'a,b,c\n1,2,3' },
      expectedOutputType: 'csv',
    }).status).toBe('valid')
  })

  it('应该从不同字段名提取内容', () => {
    const node = createMockProcessNode('node-1', 'TestNode')

    // 测试不同的输出字段名
    const fieldNames = ['result', 'output', 'content', 'text', 'response', 'data']

    for (const field of fieldNames) {
      const output = { [field]: 'test content' }
      const result = validateNodeOutput({ nodeConfig: node, output })
      expect(result.status).toBe('valid')
    }
  })
})

// ============================================
// 八、边界情况测试
// ============================================

describe('边界情况', () => {
  it('应该处理非常长的文本', () => {
    const longText = 'a'.repeat(100000)
    const result = markdownValidator.validate(longText)
    expect(result.valid).toBe(true)
  })

  it('应该处理特殊 Unicode 字符', () => {
    const unicode = '🎉 Emoji 测试 中文 العربية עברית'
    const result = markdownValidator.validate(unicode)
    expect(result.valid).toBe(true)
  })

  it('应该处理包含特殊字符的 JSON', () => {
    const json = JSON.stringify({
      emoji: '🎉',
      chinese: '中文',
      escape: '\n\t\\',
      quote: '"quoted"'
    })
    const result = jsonValidator.validate(json)
    expect(result.valid).toBe(true)
  })

  it('应该处理大型 CSV', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => `row${i},col1,col2,col3`)
    const csv = 'header1,header2,header3,header4\n' + rows.join('\n')
    const result = csvValidator.validate(csv)
    expect(result.valid).toBe(true)
  })

  it('应该处理深度嵌套的 JSON', () => {
    let nested: Record<string, unknown> = { value: 'deep' }
    for (let i = 0; i < 50; i++) {
      nested = { level: i, child: nested }
    }
    const json = JSON.stringify(nested)
    const result = jsonValidator.validate(json)
    expect(result.valid).toBe(true)
  })
})
