/**
 * 官方工作流模板种子数据
 */

import { prisma } from '@/lib/db'

/**
 * 官方模板配置
 */
const OFFICIAL_TEMPLATES = [
  {
    name: '文本摘要生成器',
    description: '自动生成长文本的简洁摘要，支持多种摘要风格',
    category: 'ai-processing',
    tags: ['摘要', '文本处理', 'AI'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-1',
          type: 'INPUT',
          name: '文本输入',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'field-1', name: '原文', value: '', height: 200 },
              { id: 'field-2', name: '摘要风格', value: '简洁专业' },
            ],
          },
        },
        {
          id: 'process-1',
          type: 'PROCESS',
          name: 'AI摘要',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个专业的文本摘要专家',
            userPrompt: '请为以下文本生成{{文本输入.摘要风格}}风格的摘要：\n\n{{文本输入.原文}}',
          },
        },
        {
          id: 'output-1',
          type: 'OUTPUT',
          name: '摘要输出',
          position: { x: 700, y: 200 },
          config: {
            format: 'text',
            prompt: '输出生成的摘要内容',
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'input-1', target: 'process-1' },
        { id: 'edge-2', source: 'process-1', target: 'output-1' },
      ],
    },
  },
  {
    name: 'Excel 数据分析',
    description: '上传 Excel 文件，AI 自动分析数据并生成洞察报告',
    category: 'data-analysis',
    tags: ['Excel', '数据分析', '报告'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'data-1',
          type: 'DATA',
          name: '数据导入',
          position: { x: 100, y: 200 },
          config: {
            files: [],
            prompt: '请上传需要分析的 Excel 文件',
          },
        },
        {
          id: 'process-1',
          type: 'PROCESS',
          name: 'AI分析',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个数据分析专家，擅长从数据中发现洞察',
            userPrompt: '请分析以下数据，提供关键发现和洞察：\n\n{{数据导入.content}}',
          },
        },
        {
          id: 'output-1',
          type: 'OUTPUT',
          name: '分析报告',
          position: { x: 700, y: 200 },
          config: {
            format: 'markdown',
            prompt: '生成数据分析报告',
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'data-1', target: 'process-1' },
        { id: 'edge-2', source: 'process-1', target: 'output-1' },
      ],
    },
  },
  {
    name: '批量图片描述',
    description: '批量处理图片，为每张图片生成 AI 描述',
    category: 'image-processing',
    tags: ['图片', '批量处理', '描述'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'image-1',
          type: 'IMAGE',
          name: '图片输入',
          position: { x: 100, y: 200 },
          config: {
            files: [],
            prompt: '请上传需要描述的图片',
          },
        },
        {
          id: 'loop-1',
          type: 'LOOP',
          name: '循环处理',
          position: { x: 350, y: 200 },
          config: {
            loopType: 'FOR',
            forConfig: {
              arrayVariable: '{{图片输入.files}}',
              itemName: 'image',
              indexName: 'index',
            },
            maxIterations: 100,
          },
        },
        {
          id: 'process-1',
          type: 'PROCESS',
          name: 'AI描述',
          position: { x: 600, y: 200 },
          config: {
            systemPrompt: '你是一个图像描述专家',
            userPrompt: '请为这张图片生成详细的描述：{{loop.image}}',
          },
        },
        {
          id: 'output-1',
          type: 'OUTPUT',
          name: '描述输出',
          position: { x: 900, y: 200 },
          config: {
            format: 'json',
            prompt: '输出所有图片的描述',
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'image-1', target: 'loop-1' },
        { id: 'edge-2', source: 'loop-1', target: 'process-1', sourceHandle: 'body' },
        { id: 'edge-3', source: 'loop-1', target: 'output-1', sourceHandle: 'done' },
      ],
    },
  },
  {
    name: '多语言翻译',
    description: '将文本翻译成多种语言，支持批量翻译',
    category: 'translation',
    tags: ['翻译', '多语言', 'AI'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-1',
          type: 'INPUT',
          name: '翻译输入',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'field-1', name: '原文', value: '', height: 150 },
              { id: 'field-2', name: '目标语言', value: '英语, 日语, 韩语' },
            ],
          },
        },
        {
          id: 'process-1',
          type: 'PROCESS',
          name: 'AI翻译',
          position: { x: 400, y: 200 },
          config: {
            systemPrompt: '你是一个专业的多语言翻译专家',
            userPrompt: '请将以下文本翻译成 {{翻译输入.目标语言}}：\n\n{{翻译输入.原文}}',
          },
        },
        {
          id: 'output-1',
          type: 'OUTPUT',
          name: '翻译结果',
          position: { x: 700, y: 200 },
          config: {
            format: 'json',
            prompt: '以 JSON 格式输出各语言的翻译结果',
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'input-1', target: 'process-1' },
        { id: 'edge-2', source: 'process-1', target: 'output-1' },
      ],
    },
  },
  {
    name: '内容审核分类',
    description: '使用 AI 对内容进行审核和分类，支持条件分支处理',
    category: 'automation',
    tags: ['审核', '分类', '条件'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-1',
          type: 'INPUT',
          name: '内容输入',
          position: { x: 100, y: 250 },
          config: {
            fields: [{ id: 'field-1', name: '待审核内容', value: '', height: 150 }],
          },
        },
        {
          id: 'process-1',
          type: 'PROCESS',
          name: 'AI审核',
          position: { x: 350, y: 250 },
          config: {
            systemPrompt: '你是一个内容审核专家，请判断内容是否合规',
            userPrompt: '请审核以下内容，返回 JSON 格式 {pass: boolean, category: string, reason: string}：\n\n{{内容输入.待审核内容}}',
          },
        },
        {
          id: 'condition-1',
          type: 'CONDITION',
          name: '审核结果判断',
          position: { x: 600, y: 250 },
          config: {
            conditions: [
              {
                variable: '{{AI审核.pass}}',
                operator: 'equals',
                value: 'true',
              },
            ],
            evaluationMode: 'all',
          },
        },
        {
          id: 'output-pass',
          type: 'OUTPUT',
          name: '审核通过',
          position: { x: 850, y: 150 },
          config: {
            format: 'json',
            prompt: '内容审核通过，输出分类信息',
          },
        },
        {
          id: 'output-fail',
          type: 'OUTPUT',
          name: '审核不通过',
          position: { x: 850, y: 350 },
          config: {
            format: 'json',
            prompt: '内容审核不通过，输出原因',
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'input-1', target: 'process-1' },
        { id: 'edge-2', source: 'process-1', target: 'condition-1' },
        { id: 'edge-3', source: 'condition-1', target: 'output-pass', sourceHandle: 'true' },
        { id: 'edge-4', source: 'condition-1', target: 'output-fail', sourceHandle: 'false' },
      ],
    },
  },
  {
    name: 'API 数据获取',
    description: '从外部 API 获取数据并进行处理',
    category: 'automation',
    tags: ['API', 'HTTP', '数据获取'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-1',
          type: 'INPUT',
          name: 'API配置',
          position: { x: 100, y: 200 },
          config: {
            fields: [
              { id: 'field-1', name: 'API地址', value: 'https://api.example.com/data' },
            ],
          },
        },
        {
          id: 'http-1',
          type: 'HTTP',
          name: 'HTTP请求',
          position: { x: 350, y: 200 },
          config: {
            method: 'GET',
            url: '{{API配置.API地址}}',
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
            retry: { maxRetries: 3, retryDelay: 1000 },
          },
        },
        {
          id: 'process-1',
          type: 'PROCESS',
          name: '数据处理',
          position: { x: 600, y: 200 },
          config: {
            systemPrompt: '你是一个数据处理专家',
            userPrompt: '请处理以下 API 返回的数据，提取关键信息：\n\n{{HTTP请求.body}}',
          },
        },
        {
          id: 'output-1',
          type: 'OUTPUT',
          name: '处理结果',
          position: { x: 850, y: 200 },
          config: {
            format: 'json',
            prompt: '输出处理后的数据',
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'input-1', target: 'http-1' },
        { id: 'edge-2', source: 'http-1', target: 'process-1' },
        { id: 'edge-3', source: 'process-1', target: 'output-1' },
      ],
    },
  },
  {
    name: '并行数据处理',
    description: '使用并行分支同时处理多个数据源，然后合并结果',
    category: 'automation',
    tags: ['并行', '合并', '高级'],
    config: {
      version: 1,
      nodes: [
        {
          id: 'input-1',
          type: 'INPUT',
          name: '数据输入',
          position: { x: 100, y: 250 },
          config: {
            fields: [
              { id: 'field-1', name: '数据A', value: '' },
              { id: 'field-2', name: '数据B', value: '' },
              { id: 'field-3', name: '数据C', value: '' },
            ],
          },
        },
        {
          id: 'process-a',
          type: 'PROCESS',
          name: '处理A',
          position: { x: 400, y: 100 },
          config: {
            systemPrompt: '处理数据 A',
            userPrompt: '分析数据 A：{{数据输入.数据A}}',
          },
        },
        {
          id: 'process-b',
          type: 'PROCESS',
          name: '处理B',
          position: { x: 400, y: 250 },
          config: {
            systemPrompt: '处理数据 B',
            userPrompt: '分析数据 B：{{数据输入.数据B}}',
          },
        },
        {
          id: 'process-c',
          type: 'PROCESS',
          name: '处理C',
          position: { x: 400, y: 400 },
          config: {
            systemPrompt: '处理数据 C',
            userPrompt: '分析数据 C：{{数据输入.数据C}}',
          },
        },
        {
          id: 'merge-1',
          type: 'MERGE',
          name: '合并结果',
          position: { x: 700, y: 250 },
          config: {
            mergeStrategy: 'all',
            errorStrategy: 'continue',
            outputMode: 'merge',
          },
        },
        {
          id: 'output-1',
          type: 'OUTPUT',
          name: '综合报告',
          position: { x: 950, y: 250 },
          config: {
            format: 'markdown',
            prompt: '生成综合分析报告',
          },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'input-1', target: 'process-a' },
        { id: 'edge-2', source: 'input-1', target: 'process-b' },
        { id: 'edge-3', source: 'input-1', target: 'process-c' },
        { id: 'edge-4', source: 'process-a', target: 'merge-1' },
        { id: 'edge-5', source: 'process-b', target: 'merge-1' },
        { id: 'edge-6', source: 'process-c', target: 'merge-1' },
        { id: 'edge-7', source: 'merge-1', target: 'output-1' },
      ],
      settings: {
        enableParallelExecution: true,
        parallelErrorStrategy: 'continue',
      },
    },
  },
]

/**
 * 导入官方模板
 */
export async function seedOfficialTemplates() {
  console.log('开始导入官方模板...')

  for (const template of OFFICIAL_TEMPLATES) {
    const existing = await prisma.workflowTemplate.findFirst({
      where: {
        name: template.name,
        isOfficial: true,
      },
    })

    if (existing) {
      console.log(`模板 "${template.name}" 已存在，跳过`)
      continue
    }

    await prisma.workflowTemplate.create({
      data: {
        ...template,
        visibility: 'PUBLIC',
        isOfficial: true,
        creatorName: 'AI Workflow 官方',
      },
    })

    console.log(`创建模板: ${template.name}`)
  }

  console.log('官方模板导入完成！')
}

// 如果直接运行此文件
if (require.main === module) {
  seedOfficialTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('导入失败:', error)
      process.exit(1)
    })
}
