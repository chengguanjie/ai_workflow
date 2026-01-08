import type { ChatMessage, ChatRequest, ChatResponse, ContentPart } from './types'
import { estimateTokenCount } from './token-utils'

function toText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content
  return content
    .map((p) => (p.type === 'text' ? p.text : `[${p.type}]`))
    .join('')
}

function extractUserText(messages: ChatMessage[]): string {
  const parts: string[] = []
  for (const m of messages) {
    if (m.role !== 'user') continue
    parts.push(toText(m.content))
  }
  return parts.join('\n').trim()
}

function extractSystemText(messages: ChatMessage[]): string {
  const parts: string[] = []
  for (const m of messages) {
    if (m.role !== 'system') continue
    parts.push(toText(m.content))
  }
  return parts.join('\n').trim()
}

function shouldReturnJson(systemText: string): boolean {
  const t = systemText.toLowerCase()
  return (
    t.includes('只输出 json') ||
    t.includes('只输出json') ||
    t.includes('returnjson') ||
    t.includes('返回json') ||
    t.includes('strict json') ||
    t.includes('单个 json') ||
    t.includes('single json')
  )
}

function getRagSources(systemText: string): string[] {
  const matches = Array.from(systemText.matchAll(/\[来源:\s*([^\]]+)\]/g))
  const names = matches.map((m) => String(m[1] || '').trim()).filter(Boolean)
  return Array.from(new Set(names)).slice(0, 8)
}

function pickCuisine(userText: string): string {
  const t = userText
  if (/川|麻辣|火锅|郫县|花椒/.test(t)) return '川味'
  if (/粤|清淡|煲汤|广式/.test(t)) return '粤式'
  if (/日式|寿司|味噌|照烧/.test(t)) return '日式'
  if (/韩式|泡菜|辣酱/.test(t)) return '韩式'
  if (/泰式|冬阴功|椰浆|青柠/.test(t)) return '泰式'
  return '家常'
}

function parseServings(userText: string): number {
  const m = userText.match(/(\d+)\s*(人份|人|份)/)
  const n = m?.[1] ? parseInt(m[1], 10) : NaN
  if (Number.isFinite(n) && n > 0 && n <= 20) return n
  return 2
}

function hasAny(userText: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(userText))
}

function generateRecipeJson(userText: string, systemText: string): Record<string, unknown> {
  const servings = parseServings(userText)
  const cuisine = pickCuisine(userText)
  const highProtein = hasAny(userText, [/高蛋白|增肌|健身|蛋白质/])
  const lowSugar = hasAny(userText, [/低糖|控糖|无糖/])
  const lowFat = hasAny(userText, [/低脂|少油/])
  const vegan = hasAny(userText, [/纯素|素食|vegan/i])
  const glutenFree = hasAny(userText, [/无麸质|gluten[- ]?free/i])

  const sources = getRagSources(systemText)

  const baseProtein = vegan ? '北豆腐' : '鸡胸肉'
  const proteinGram = highProtein ? 220 : 180
  const oilGram = lowFat ? 6 : 12
  const sweetener = lowSugar ? '赤藓糖醇' : '蜂蜜'

  const recipeName =
    cuisine === '川味'
      ? `${cuisine}${vegan ? '豆腐' : '鸡胸'}拌碗`
      : cuisine === '日式'
        ? `${cuisine}${vegan ? '豆腐' : '鸡胸'}照烧碗`
        : `${cuisine}${vegan ? '豆腐' : '鸡胸'}能量碗`

  const ingredients: Array<Record<string, unknown>> = [
    { name: baseProtein, amount: proteinGram, unit: 'g', note: highProtein ? '优先高蛋白主料' : '主蛋白来源' },
    { name: '西兰花', amount: 180, unit: 'g', note: '高纤维配菜' },
    { name: '胡萝卜', amount: 80, unit: 'g', note: '提升口感与色泽' },
    { name: '蒜', amount: 6, unit: 'g', note: '增香' },
    { name: '生抽', amount: 18, unit: 'ml', note: '调味' },
    { name: '米醋/柠檬汁', amount: 10, unit: 'ml', note: '平衡风味' },
    { name: '食用油', amount: oilGram, unit: 'g', note: lowFat ? '少油方案' : '常规用量' },
  ]

  if (!glutenFree) ingredients.push({ name: '芝麻', amount: 6, unit: 'g', note: '可选点缀' })
  if (!lowSugar) ingredients.push({ name: sweetener, amount: 6, unit: 'g', note: '可选（按口味减量）' })

  const steps = [
    '主料切块/切片；用少量生抽、蒜末、黑胡椒腌制 10 分钟（纯素可跳过腌制）。',
    '蔬菜焯水或蒸 3–5 分钟，保持脆嫩。',
    '热锅少油：动物蛋白煎至熟透；纯素豆腐煎至表面金黄。',
    '调一个酱汁：生抽 + 醋/柠檬汁 + 蒜末；控糖可不加甜味剂或用赤藓糖醇。',
    '装盘：主料 + 蔬菜 + 酱汁；按口味撒芝麻。',
  ]

  const nutrition = {
    perServing: {
      caloriesKcal: vegan ? 420 : 480,
      proteinG: vegan ? 28 : (highProtein ? 48 : 40),
      carbsG: 32,
      fatG: lowFat ? 12 : 18,
    },
    note: '为估算值；以实测食材营养表为准。',
  }

  return {
    recipeName,
    servings,
    cuisine,
    constraints: {
      highProtein,
      lowSugar,
      lowFat,
      vegan,
      glutenFree,
    },
    ingredients,
    steps,
    nutritionEstimate: nutrition,
    rationale: {
      summary:
        '根据用户目标与约束，优先保证蛋白质与膳食纤维，同时用酸味与蒜香提升风味；油脂与甜味剂按控脂/控糖要求下调。',
      knowledgeSources: sources,
    },
    qualityChecklist: [
      '蛋白熟透、无血丝（或豆腐表面微焦）。',
      '蔬菜颜色鲜亮不过熟。',
      '盐度可控，酱汁先少后多。',
    ],
  }
}

export function mockChat(request: ChatRequest): ChatResponse {
  const systemText = extractSystemText(request.messages || [])
  const userText = extractUserText(request.messages || [])
  const json = shouldReturnJson(systemText)

  const content = json
    ? JSON.stringify(generateRecipeJson(userText, systemText))
    : `（Mock AI）\n\n用户需求：\n${userText}\n\n系统提示词：\n${systemText.slice(0, 400)}\n`

  const promptTokens = estimateTokenCount(systemText) + estimateTokenCount(userText)
  const completionTokens = estimateTokenCount(content)

  return {
    content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    finishReason: 'stop',
    model: request.model,
    segments: 1,
    wasAutoContinued: false,
  }
}

