/**
 * 种子脚本：导入官方工作流模板
 *
 * 使用方法:
 * npx ts-node scripts/seed-templates.ts
 *
 * 或通过 npm script:
 * npm run seed:templates
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 官方模板数据
const officialTemplates = [
  {
    name: '文本摘要生成器',
    description: '自动为长文本生成简洁的摘要，支持自定义摘要长度和风格。适用于文章、报告、邮件等内容的快速概览。',
    category: 'AI处理',
    tags: ['摘要', '文本处理', 'AI', '内容提炼'],
    thumbnail: '/templates/text-summary.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: '输入节点',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'text', name: '原文内容', value: '', height: 200 },
              { id: 'length', name: '摘要长度', value: '200字以内', height: 40 },
            ],
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: 'AI摘要',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个专业的文本摘要助手，擅长提取文章的核心观点和关键信息。',
            userPrompt: '请为以下文本生成一个{{输入节点.摘要长度}}的摘要，要求：\n1. 保留核心观点\n2. 语言简洁流畅\n3. 结构清晰\n\n原文：\n{{输入节点.原文内容}}',
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '输出结果',
          position: { x: 700, y: 200 },
          config: {
            format: 'markdown',
            prompt: '将摘要结果格式化输出',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'process_1' },
        { id: 'e2', source: 'process_1', target: 'output_1' },
      ],
    },
  },
  {
    name: 'Excel 数据分析助手',
    description: '导入 Excel/CSV 数据，AI 自动分析数据特征、趋势和异常，生成可视化报告和洞察建议。',
    category: '数据分析',
    tags: ['Excel', '数据分析', '报表', '洞察'],
    thumbnail: '/templates/excel-analysis.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'data_1',
          type: 'DATA',
          name: '导入数据',
          position: { x: 100, y: 200 },
          config: {
            files: [],
            prompt: '请上传需要分析的 Excel 或 CSV 文件',
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: 'AI分析',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个资深数据分析师，擅长从数据中发现规律、趋势和异常。',
            userPrompt: '请分析以下数据，并提供：\n1. 数据概览（行数、列数、数据类型）\n2. 关键指标统计\n3. 趋势分析\n4. 异常值识别\n5. 业务洞察和建议\n\n数据：\n{{导入数据.content}}',
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '分析报告',
          position: { x: 700, y: 200 },
          config: {
            format: 'markdown',
            prompt: '生成结构化的数据分析报告',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'data_1', target: 'process_1' },
        { id: 'e2', source: 'process_1', target: 'output_1' },
      ],
    },
  },
  {
    name: '智能问答机器人',
    description: '基于知识库的智能问答系统，支持 RAG 检索增强生成，提供准确、相关的答案。',
    category: 'AI处理',
    tags: ['问答', 'RAG', '知识库', '客服'],
    thumbnail: '/templates/qa-bot.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: '用户问题',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'question', name: '问题', value: '', height: 80 },
            ],
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: 'RAG问答',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个专业的智能助手。请根据提供的知识库内容回答用户问题。如果知识库中没有相关信息，请如实告知用户。',
            userPrompt: '请回答以下问题：\n{{用户问题.问题}}',
            ragConfig: {
              topK: 5,
              threshold: 0.7,
            },
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '回答',
          position: { x: 700, y: 200 },
          config: {
            format: 'text',
            prompt: '输出答案',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'process_1' },
        { id: 'e2', source: 'process_1', target: 'output_1' },
      ],
    },
  },
  {
    name: '多语言翻译器',
    description: '支持多种语言的双向翻译，可批量翻译文本内容，保持原文格式和语义准确性。',
    category: 'AI处理',
    tags: ['翻译', '多语言', '国际化', '本地化'],
    thumbnail: '/templates/translator.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: '翻译设置',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'text', name: '原文', value: '', height: 150 },
              { id: 'sourceLang', name: '原语言', value: '中文', height: 40 },
              { id: 'targetLang', name: '目标语言', value: '英文', height: 40 },
            ],
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: 'AI翻译',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个专业的多语言翻译专家，精通各种语言之间的翻译，能够准确传达原文的含义、语气和风格。',
            userPrompt: '请将以下{{翻译设置.原语言}}文本翻译成{{翻译设置.目标语言}}：\n\n{{翻译设置.原文}}\n\n要求：\n1. 保持原文的格式和结构\n2. 确保翻译准确、自然流畅\n3. 保留专业术语的准确性',
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '翻译结果',
          position: { x: 700, y: 200 },
          config: {
            format: 'text',
            prompt: '输出翻译结果',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'process_1' },
        { id: 'e2', source: 'process_1', target: 'output_1' },
      ],
    },
  },
  {
    name: '图像描述生成器',
    description: '上传图片，AI 自动生成详细的图像描述，支持多种描述风格和用途（Alt文本、社交媒体、产品描述等）。',
    category: 'AI处理',
    tags: ['图像', '描述', '视觉', 'Alt文本'],
    thumbnail: '/templates/image-description.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'image_1',
          type: 'IMAGE',
          name: '上传图片',
          position: { x: 100, y: 200 },
          config: {
            files: [],
            prompt: '请上传需要描述的图片',
          },
        },
        {
          id: 'input_1',
          type: 'INPUT',
          name: '描述设置',
          position: { x: 100, y: 350 },
          config: {
            fields: [
              { id: 'style', name: '描述风格', value: '详细描述', height: 40 },
            ],
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: 'AI描述',
          position: { x: 400, y: 250 },
          config: {
            systemPrompt: '你是一个视觉内容描述专家，能够准确、生动地描述图像内容。',
            userPrompt: '请以"{{描述设置.描述风格}}"的方式描述这张图片。\n\n图片信息：{{上传图片.description}}\n\n要求：\n1. 描述图片的主要内容\n2. 注意细节和构图\n3. 适当描述颜色、光线和氛围',
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '描述结果',
          position: { x: 700, y: 250 },
          config: {
            format: 'markdown',
            prompt: '输出图像描述',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'image_1', target: 'process_1' },
        { id: 'e2', source: 'input_1', target: 'process_1' },
        { id: 'e3', source: 'process_1', target: 'output_1' },
      ],
    },
  },
  {
    name: 'AI 图像生成',
    description: '根据文本描述生成高质量图像，支持 DALL-E 和 Stable Diffusion，可自定义尺寸、风格和数量。',
    category: '创意生成',
    tags: ['图像生成', 'DALL-E', 'AI绘画', '创意'],
    thumbnail: '/templates/image-gen.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: '图像描述',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'prompt', name: '图像描述', value: '', height: 120 },
              { id: 'style', name: '风格', value: '写实风格', height: 40 },
            ],
          },
        },
        {
          id: 'imagegen_1',
          type: 'IMAGE_GEN',
          name: 'AI生成图像',
          position: { x: 400, y: 200 },
          config: {
            prompt: '{{图像描述.图像描述}}，{{图像描述.风格}}',
            size: '1024x1024',
            quality: 'standard',
            n: 1,
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '生成结果',
          position: { x: 700, y: 200 },
          config: {
            format: 'image',
            prompt: '输出生成的图像',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'imagegen_1' },
        { id: 'e2', source: 'imagegen_1', target: 'output_1' },
      ],
    },
  },
  {
    name: '邮件智能分类',
    description: '自动分析邮件内容，识别邮件类型（紧急、重要、普通、垃圾等），并生成处理建议。',
    category: 'AI处理',
    tags: ['邮件', '分类', '自动化', '效率'],
    thumbnail: '/templates/email-classifier.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: '邮件内容',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'subject', name: '邮件主题', value: '', height: 40 },
              { id: 'body', name: '邮件正文', value: '', height: 150 },
              { id: 'sender', name: '发件人', value: '', height: 40 },
            ],
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: 'AI分类',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个邮件分类助手，能够准确判断邮件的重要性和类型。',
            userPrompt: '请分析以下邮件并进行分类：\n\n发件人：{{邮件内容.发件人}}\n主题：{{邮件内容.邮件主题}}\n正文：{{邮件内容.邮件正文}}\n\n请提供：\n1. 邮件分类（紧急/重要/普通/垃圾/订阅）\n2. 优先级（高/中/低）\n3. 处理建议\n4. 回复建议（如需要）',
          },
        },
        {
          id: 'condition_1',
          type: 'CONDITION',
          name: '优先级判断',
          position: { x: 700, y: 200 },
          config: {
            conditions: [
              { variable: '{{AI分类.result}}', operator: 'contains', value: '紧急', logic: 'OR' },
              { variable: '{{AI分类.result}}', operator: 'contains', value: '高' },
            ],
          },
        },
        {
          id: 'output_high',
          type: 'OUTPUT',
          name: '高优先级',
          position: { x: 1000, y: 100 },
          config: {
            format: 'markdown',
            prompt: '标记为高优先级邮件',
          },
        },
        {
          id: 'output_normal',
          type: 'OUTPUT',
          name: '普通邮件',
          position: { x: 1000, y: 300 },
          config: {
            format: 'markdown',
            prompt: '标记为普通邮件',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'process_1' },
        { id: 'e2', source: 'process_1', target: 'condition_1' },
        { id: 'e3', source: 'condition_1', target: 'output_high', sourceHandle: 'true' },
        { id: 'e4', source: 'condition_1', target: 'output_normal', sourceHandle: 'false' },
      ],
    },
  },
  {
    name: 'API 数据获取与处理',
    description: '从外部 API 获取数据，进行处理转换后输出。支持 REST API 调用、数据清洗和格式转换。',
    category: '数据处理',
    tags: ['API', 'HTTP', '数据获取', '集成'],
    thumbnail: '/templates/api-fetch.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: 'API配置',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'url', name: 'API地址', value: 'https://api.example.com/data', height: 40 },
              { id: 'params', name: '请求参数', value: '', height: 80 },
            ],
          },
        },
        {
          id: 'http_1',
          type: 'HTTP',
          name: '请求API',
          position: { x: 400, y: 200 },
          config: {
            method: 'GET',
            url: '{{API配置.API地址}}',
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 30000,
            retry: {
              maxRetries: 3,
              retryDelay: 1000,
            },
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: '数据处理',
          position: { x: 700, y: 200 },
          config: {
            systemPrompt: '你是一个数据处理专家，擅长清洗、转换和分析数据。',
            userPrompt: '请处理以下 API 返回的数据：\n\n{{请求API.body}}\n\n请：\n1. 提取关键信息\n2. 转换为易读格式\n3. 总结数据特征',
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '处理结果',
          position: { x: 1000, y: 200 },
          config: {
            format: 'json',
            prompt: '输出处理后的数据',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'http_1' },
        { id: 'e2', source: 'http_1', target: 'process_1' },
        { id: 'e3', source: 'process_1', target: 'output_1' },
      ],
    },
  },
  {
    name: '批量内容生成器',
    description: '批量生成内容，如产品描述、社交媒体帖子、SEO 文章等。支持循环处理多个输入项目。',
    category: '内容创作',
    tags: ['批量', '内容生成', '循环', '自动化'],
    thumbnail: '/templates/batch-content.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: '批量输入',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'items', name: '项目列表(每行一个)', value: '', height: 150 },
              { id: 'template', name: '内容模板', value: '请为"{item}"生成一段50字以内的产品描述', height: 80 },
            ],
          },
        },
        {
          id: 'code_1',
          type: 'CODE',
          name: '解析列表',
          position: { x: 400, y: 200 },
          config: {
            language: 'javascript',
            code: `// 将输入文本按行分割为数组
const items = input.items.split('\\n').filter(item => item.trim());
return { items, count: items.length };`,
          },
        },
        {
          id: 'loop_1',
          type: 'LOOP',
          name: '循环处理',
          position: { x: 700, y: 200 },
          config: {
            loopType: 'FOR',
            forConfig: {
              arrayVariable: '{{解析列表.items}}',
              itemName: 'item',
              indexName: 'index',
            },
            maxIterations: 100,
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: 'AI生成',
          position: { x: 700, y: 350 },
          config: {
            systemPrompt: '你是一个专业的内容创作者，擅长撰写各类营销文案。',
            userPrompt: '{{批量输入.内容模板}}'.replace('{item}', '{{loop.item}}'),
          },
        },
        {
          id: 'merge_1',
          type: 'MERGE',
          name: '合并结果',
          position: { x: 1000, y: 200 },
          config: {
            mergeStrategy: 'all',
            outputMode: 'array',
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '批量结果',
          position: { x: 1300, y: 200 },
          config: {
            format: 'json',
            prompt: '输出所有生成的内容',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'code_1' },
        { id: 'e2', source: 'code_1', target: 'loop_1' },
        { id: 'e3', source: 'loop_1', target: 'process_1', sourceHandle: 'loop-body' },
        { id: 'e4', source: 'process_1', target: 'loop_1', targetHandle: 'loop-end' },
        { id: 'e5', source: 'loop_1', target: 'merge_1', sourceHandle: 'loop-complete' },
        { id: 'e6', source: 'merge_1', target: 'output_1' },
      ],
    },
  },
  {
    name: '工作流通知提醒',
    description: '在工作流执行完成后，自动发送通知到飞书、钉钉或企业微信群，支持自定义消息格式。',
    category: '自动化',
    tags: ['通知', '飞书', '钉钉', '企业微信'],
    thumbnail: '/templates/notification.png',
    config: {
      version: 1,
      nodes: [
        {
          id: 'input_1',
          type: 'INPUT',
          name: '任务信息',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'taskName', name: '任务名称', value: '', height: 40 },
              { id: 'taskResult', name: '任务结果', value: '', height: 100 },
            ],
          },
        },
        {
          id: 'process_1',
          type: 'PROCESS',
          name: '生成通知',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个通知消息生成助手，擅长将任务结果转换为简洁明了的通知消息。',
            userPrompt: '请为以下任务生成一条简洁的通知消息：\n\n任务名称：{{任务信息.任务名称}}\n任务结果：{{任务信息.任务结果}}\n\n要求：\n1. 消息简洁明了\n2. 突出关键信息\n3. 使用 Markdown 格式',
          },
        },
        {
          id: 'notification_1',
          type: 'NOTIFICATION',
          name: '发送通知',
          position: { x: 700, y: 200 },
          config: {
            platform: 'feishu',
            webhookUrl: '',
            messageType: 'markdown',
            title: '任务完成通知',
            content: '## {{任务信息.任务名称}}\n\n{{生成通知.result}}',
          },
        },
        {
          id: 'output_1',
          type: 'OUTPUT',
          name: '通知结果',
          position: { x: 1000, y: 200 },
          config: {
            format: 'json',
            prompt: '输出通知发送结果',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input_1', target: 'process_1' },
        { id: 'e2', source: 'process_1', target: 'notification_1' },
        { id: 'e3', source: 'notification_1', target: 'output_1' },
      ],
    },
  },
]

async function main() {
  console.log('开始导入官方工作流模板...\n')

  let created = 0
  let skipped = 0

  for (const template of officialTemplates) {
    // 检查是否已存在同名官方模板
    const existing = await prisma.workflowTemplate.findFirst({
      where: {
        name: template.name,
        isOfficial: true,
      },
    })

    if (existing) {
      console.log(`[跳过] ${template.name} - 已存在`)
      skipped++
      continue
    }

    // 创建模板
    await prisma.workflowTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        category: template.category,
        tags: template.tags,
        thumbnail: template.thumbnail,
        config: template.config,
        visibility: 'PUBLIC',
        isOfficial: true,
        version: '1.0.0',
        creatorName: 'AI Workflow 官方',
      },
    })

    console.log(`[创建] ${template.name}`)
    created++
  }

  console.log('\n========================================')
  console.log('官方模板导入完成!')
  console.log('========================================')
  console.log(`创建: ${created} 个`)
  console.log(`跳过: ${skipped} 个`)
  console.log(`总计: ${officialTemplates.length} 个`)
  console.log('========================================')
}

main()
  .catch((e) => {
    console.error('导入失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
