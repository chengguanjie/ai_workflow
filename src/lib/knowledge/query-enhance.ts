/**
 * 查询增强服务
 * 实现 Query Rewrite、Query Expansion 等功能
 * 对标 Dify / MaxKB 的查询优化能力
 */

import type { AIProvider } from '@prisma/client'

export interface QueryEnhanceOptions {
  query: string
  provider?: AIProvider
  apiKey?: string
  baseUrl?: string
  // 增强类型
  enableRewrite?: boolean      // 查询重写
  enableExpansion?: boolean    // 查询扩展
  enableHypothetical?: boolean // 假设文档嵌入 (HyDE)
}

export interface EnhancedQuery {
  original: string
  rewritten?: string
  expanded?: string[]
  hypotheticalAnswer?: string
}

/**
 * 增强查询
 * 通过 LLM 对原始查询进行优化
 */
export async function enhanceQuery(
  options: QueryEnhanceOptions
): Promise<EnhancedQuery> {
  const {
    query,
    enableRewrite = true,
    enableExpansion = true,
    enableHypothetical = false,
  } = options

  const result: EnhancedQuery = {
    original: query,
  }

  // 并行执行各种增强
  const tasks: Promise<void>[] = []

  if (enableRewrite) {
    tasks.push(
      rewriteQuery(query, options).then(rewritten => {
        result.rewritten = rewritten
      }).catch(err => {
        console.warn('[QueryEnhance] 查询重写失败:', err.message)
      })
    )
  }

  if (enableExpansion) {
    tasks.push(
      expandQuery(query, options).then(expanded => {
        result.expanded = expanded
      }).catch(err => {
        console.warn('[QueryEnhance] 查询扩展失败:', err.message)
      })
    )
  }

  if (enableHypothetical) {
    tasks.push(
      generateHypotheticalAnswer(query, options).then(answer => {
        result.hypotheticalAnswer = answer
      }).catch(err => {
        console.warn('[QueryEnhance] HyDE 生成失败:', err.message)
      })
    )
  }

  await Promise.allSettled(tasks)

  return result
}

/**
 * 查询重写
 * 将用户的模糊查询转换为更清晰、更具体的查询
 */
async function rewriteQuery(
  query: string,
  options: QueryEnhanceOptions
): Promise<string> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.SHENSUAN_API_KEY
  const baseUrl = options.baseUrl || process.env.SHENSUAN_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    // 降级：返回原始查询
    return query
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `你是一个查询优化专家。你的任务是将用户的搜索查询重写为更清晰、更具体的形式，以便在知识库中获得更好的搜索结果。

规则：
1. 保持原意，但使查询更加明确
2. 消除歧义，添加必要的上下文
3. 使用专业术语（如适用）
4. 保持简洁，不要过度扩展
5. 只输出重写后的查询，不要解释

示例：
用户: "怎么用"
重写: "如何使用这个产品或服务"

用户: "报错了"
重写: "程序运行时出现错误的解决方法"`,
        },
        {
          role: 'user',
          content: `请重写以下查询：${query}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    throw new Error(`查询重写请求失败: ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content?.trim() || query
}

/**
 * 查询扩展
 * 生成相关的同义词和变体查询
 */
async function expandQuery(
  query: string,
  options: QueryEnhanceOptions
): Promise<string[]> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.SHENSUAN_API_KEY
  const baseUrl = options.baseUrl || process.env.SHENSUAN_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    // 降级：使用简单的同义词扩展
    return simpleExpand(query)
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `你是一个查询扩展专家。你的任务是为用户的搜索查询生成3-5个相关的变体查询，以提高搜索召回率。

规则：
1. 生成同义词变体
2. 生成不同表述方式
3. 生成相关概念
4. 每个变体独占一行
5. 只输出变体查询，不要编号或解释

示例输入: "如何提高代码质量"
示例输出:
代码质量改进方法
提升代码可维护性
代码重构最佳实践
代码审查技巧`,
        },
        {
          role: 'user',
          content: `请为以下查询生成变体：${query}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.5,
    }),
  })

  if (!response.ok) {
    throw new Error(`查询扩展请求失败: ${response.statusText}`)
  }

  const data = await response.json()
  const content = data.choices[0]?.message?.content?.trim() || ''

  return content
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0 && line !== query)
}

/**
 * 简单的查询扩展（降级方案）
 */
function simpleExpand(query: string): string[] {
  const expansions: string[] = []

  // 中英文同义词映射
  const synonyms: Record<string, string[]> = {
    '如何': ['怎么', '怎样', '方法'],
    '怎么': ['如何', '怎样', '方法'],
    '什么': ['哪些', '是什么', '定义'],
    '为什么': ['原因', '为何', '理由'],
    '使用': ['用法', '应用', '操作'],
    '问题': ['错误', '异常', 'bug'],
    '配置': ['设置', '设定', '参数'],
    'how': ['how to', 'method', 'way'],
    'what': ['which', 'definition', 'meaning'],
    'error': ['bug', 'issue', 'problem'],
  }

  const queryLower = query.toLowerCase()

  for (const [word, syns] of Object.entries(synonyms)) {
    if (queryLower.includes(word)) {
      for (const syn of syns) {
        const expanded = query.replace(new RegExp(word, 'gi'), syn)
        if (expanded !== query) {
          expansions.push(expanded)
        }
      }
    }
  }

  return Array.from(new Set(expansions)).slice(0, 3)
}

/**
 * 假设文档嵌入 (HyDE - Hypothetical Document Embeddings)
 * 生成一个假设的答案，用于提高检索精度
 */
async function generateHypotheticalAnswer(
  query: string,
  options: QueryEnhanceOptions
): Promise<string> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || process.env.SHENSUAN_API_KEY
  const baseUrl = options.baseUrl || process.env.SHENSUAN_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    return ''
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `你是一个知识库文档生成专家。给定一个问题，你需要写一段假设性的文档内容，这段内容应该能够回答这个问题。

规则：
1. 写一段150-300字的专业回答
2. 使用客观、信息丰富的语气
3. 包含可能出现在真实文档中的关键词
4. 不要使用"我认为"、"可能"等不确定性表达
5. 直接输出内容，不要任何前缀`,
        },
        {
          role: 'user',
          content: `问题：${query}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
    }),
  })

  if (!response.ok) {
    throw new Error(`HyDE 生成失败: ${response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content?.trim() || ''
}

/**
 * 获取用于检索的最终查询
 * 合并原始查询和增强结果
 */
export function getSearchQueries(enhanced: EnhancedQuery): string[] {
  const queries: string[] = [enhanced.original]

  // 添加重写后的查询
  if (enhanced.rewritten && enhanced.rewritten !== enhanced.original) {
    queries.push(enhanced.rewritten)
  }

  // 添加扩展查询
  if (enhanced.expanded?.length) {
    queries.push(...enhanced.expanded)
  }

  // 添加假设答案（用于 HyDE）
  if (enhanced.hypotheticalAnswer) {
    queries.push(enhanced.hypotheticalAnswer)
  }

  // 去重
  return Array.from(new Set(queries))
}

const QueryEnhanceModule = {
  enhanceQuery,
  getSearchQueries,
}

export default QueryEnhanceModule
