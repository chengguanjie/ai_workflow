/**
 * 中文分词模块
 * 使用 jieba-wasm 进行中文分词
 * 支持多种分词模式、自定义词典和同义词扩展
 */

// jieba-wasm 类型声明
interface JiebaModule {
  cut: (text: string, hmm?: boolean) => string[]
  cutAll: (text: string) => string[]
  cutForSearch: (text: string, hmm?: boolean) => string[]
  tokenize: (text: string, mode?: 'default' | 'search', hmm?: boolean) => Array<{ word: string; start: number; end: number }>
  addWord: (word: string, freq?: number, tag?: string) => void
  loadDict: (dict: Uint8Array) => void
}

let jiebaModule: JiebaModule | null = null
let initPromise: Promise<void> | null = null

const synonymsMap = new Map<string, string[]>([
  ['人工智能', ['AI', '机器学习', '深度学习']],
  ['AI', ['人工智能', '机器学习']],
  ['机器学习', ['ML', '人工智能', '深度学习']],
  ['数据库', ['DB', '存储', '数据存储']],
  ['服务器', ['server', '主机', '云服务器']],
  ['用户', ['用户端', '客户', '使用者']],
  ['接口', ['API', '端点', '服务接口']],
  ['API', ['接口', '服务端点']],
  ['配置', ['设置', '设定', '配置项']],
  ['部署', ['发布', '上线', '部署上线']],
  ['知识库', ['知识仓库', 'knowledge base', 'KB']],
  ['工作流', ['流程', 'workflow', '自动化流程']],
  ['向量', ['vector', '嵌入', 'embedding']],
  ['搜索', ['查询', '检索', '查找']],
  ['文档', ['文件', '资料', 'document']],
])

/**
 * 初始化 jieba 分词器
 */
async function initJieba(): Promise<void> {
  if (jiebaModule) return
  if (initPromise) {
    await initPromise
    return
  }

  initPromise = (async () => {
    try {
      // 动态导入 jieba-wasm
      const jieba = await import('jieba-wasm')
      jiebaModule = jieba as unknown as JiebaModule
      console.log('[Segmenter] jieba-wasm 初始化完成')
    } catch (error) {
      console.warn('[Segmenter] jieba-wasm 初始化失败，将使用降级分词:', error)
    }
  })()

  await initPromise
}

/**
 * 停用词列表
 */
const STOP_WORDS = new Set([
  // 中文停用词
  '的', '了', '和', '是', '就', '都', '而', '及', '与', '或',
  '这', '那', '有', '在', '被', '为', '上', '下', '中', '之',
  '我', '你', '他', '她', '它', '们', '自己', '什么', '怎么', '如何',
  '可以', '可能', '能够', '应该', '必须', '需要', '一个', '一些',
  '这个', '那个', '这些', '那些', '这里', '那里', '这样', '那样',
  '不', '没', '没有', '不是', '还', '也', '又', '但', '但是',
  '然而', '因为', '所以', '如果', '虽然', '尽管', '或者', '并且',
  '以及', '等等', '比如', '例如', '即', '则', '才', '已经', '曾经',
  '正在', '将要', '会', '要', '想', '能', '得', '着', '过', '地',
  // 英文停用词
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can',
  'just', 'don', 'now', 'i', 'me', 'my', 'you', 'your', 'he',
  'him', 'his', 'she', 'her', 'it', 'its', 'we', 'our', 'they',
  'them', 'their', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'am', 'if', 'because', 'about', 'while',
])

/**
 * 分词选项
 */
export interface SegmentOptions {
  mode?: 'default' | 'search' | 'all'  // 分词模式
  removeStopWords?: boolean  // 是否去除停用词
  toLowerCase?: boolean  // 是否转小写
  minLength?: number  // 最小词长度
}

/**
 * 分词结果
 */
export interface SegmentResult {
  words: string[]
  tokens: Array<{ word: string; start: number; end: number }>
}

/**
 * 分词
 */
export async function segment(
  text: string,
  options: SegmentOptions = {}
): Promise<string[]> {
  const {
    mode = 'search',
    removeStopWords = true,
    toLowerCase = true,
    minLength = 1,
  } = options

  // 预处理
  let processedText = text.trim()
  if (toLowerCase) {
    processedText = processedText.toLowerCase()
  }

  // 尝试使用 jieba
  await initJieba()

  let words: string[]

  if (jiebaModule) {
    // 使用 jieba 分词
    switch (mode) {
      case 'all':
        words = jiebaModule.cutAll(processedText)
        break
      case 'search':
        words = jiebaModule.cutForSearch(processedText, true)
        break
      default:
        words = jiebaModule.cut(processedText, true)
    }
  } else {
    // 降级：使用简单的正则分词
    words = fallbackSegment(processedText)
  }

  // 过滤
  return words.filter(word => {
    // 过滤空白
    if (!word || !word.trim()) return false

    // 过滤过短的词
    if (word.length < minLength) return false

    // 过滤纯数字和纯符号
    if (/^[\d\s\p{P}]+$/u.test(word)) return false

    // 过滤停用词
    if (removeStopWords && STOP_WORDS.has(word.toLowerCase())) return false

    return true
  })
}

/**
 * 带位置信息的分词
 */
export async function segmentWithPosition(
  text: string,
  options: SegmentOptions = {}
): Promise<SegmentResult> {
  const {
    mode = 'search',
    removeStopWords = true,
    toLowerCase = true,
    minLength = 1,
  } = options

  let processedText = text.trim()
  if (toLowerCase) {
    processedText = processedText.toLowerCase()
  }

  await initJieba()

  let tokens: Array<{ word: string; start: number; end: number }> = []

  if (jiebaModule) {
    const tokenizeMode = mode === 'all' ? 'default' : mode
    tokens = jiebaModule.tokenize(processedText, tokenizeMode, true)
  } else {
    // 降级：简单分词
    const words = fallbackSegment(processedText)
    let offset = 0
    for (const word of words) {
      const start = processedText.indexOf(word, offset)
      if (start !== -1) {
        tokens.push({ word, start, end: start + word.length })
        offset = start + word.length
      }
    }
  }

  // 过滤
  const filteredTokens = tokens.filter(token => {
    if (!token.word || !token.word.trim()) return false
    if (token.word.length < minLength) return false
    if (/^[\d\s\p{P}]+$/u.test(token.word)) return false
    if (removeStopWords && STOP_WORDS.has(token.word.toLowerCase())) return false
    return true
  })

  return {
    words: filteredTokens.map(t => t.word),
    tokens: filteredTokens,
  }
}

/**
 * 降级分词（当 jieba 不可用时）
 * 使用正则表达式进行简单的中英文分词
 */
function fallbackSegment(text: string): string[] {
  const words: string[] = []

  // 匹配中文词（连续的中文字符）
  const chinesePattern = /[\u4e00-\u9fa5]+/g
  // 匹配英文词
  const englishPattern = /[a-zA-Z]+/g
  // 匹配数字
  const numberPattern = /\d+/g

  let match

  // 提取中文
  while ((match = chinesePattern.exec(text)) !== null) {
    // 对于长中文文本，按2-3字切分
    const chineseText = match[0]
    if (chineseText.length <= 4) {
      words.push(chineseText)
    } else {
      // 滑动窗口分词
      for (let i = 0; i < chineseText.length; i++) {
        // 二字词
        if (i + 2 <= chineseText.length) {
          words.push(chineseText.slice(i, i + 2))
        }
        // 三字词
        if (i + 3 <= chineseText.length) {
          words.push(chineseText.slice(i, i + 3))
        }
      }
    }
  }

  // 提取英文
  while ((match = englishPattern.exec(text)) !== null) {
    words.push(match[0].toLowerCase())
  }

  // 提取数字（可选）
  while ((match = numberPattern.exec(text)) !== null) {
    if (match[0].length >= 2) {
      words.push(match[0])
    }
  }

  return words
}

/**
 * 添加自定义词
 */
export async function addWord(word: string, freq?: number, tag?: string): Promise<void> {
  await initJieba()
  if (jiebaModule) {
    jiebaModule.addWord(word, freq, tag)
  }
}

/**
 * 批量分词
 */
export async function segmentBatch(
  texts: string[],
  options: SegmentOptions = {}
): Promise<string[][]> {
  await initJieba()
  return Promise.all(texts.map(text => segment(text, options)))
}

/**
 * 提取关键词（简单 TF 方法）
 */
export async function extractKeywords(
  text: string,
  topK: number = 10
): Promise<Array<{ word: string; score: number }>> {
  const words = await segment(text, { mode: 'search', removeStopWords: true })

  const wordFreq = new Map<string, number>()
  for (const word of words) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
  }

  const sorted = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([word, freq]) => ({
      word,
      score: freq / words.length,
    }))

  return sorted
}

export function getSynonyms(word: string): string[] {
  const lowerWord = word.toLowerCase()
  return synonymsMap.get(word) || synonymsMap.get(lowerWord) || []
}

export async function expandWithSynonyms(words: string[]): Promise<string[]> {
  const expanded = new Set<string>(words)

  for (const word of words) {
    const synonyms = getSynonyms(word)
    for (const syn of synonyms) {
      expanded.add(syn.toLowerCase())
    }
  }

  return Array.from(expanded)
}

export async function segmentWithSynonyms(
  text: string,
  options: SegmentOptions = {}
): Promise<string[]> {
  const words = await segment(text, options)
  return expandWithSynonyms(words)
}

export function addSynonym(word: string, synonyms: string[]): void {
  const existing = synonymsMap.get(word) || []
  synonymsMap.set(word, [...new Set([...existing, ...synonyms])])
}

export function addSynonyms(synonymGroups: Array<{ word: string; synonyms: string[] }>): void {
  for (const { word, synonyms } of synonymGroups) {
    addSynonym(word, synonyms)
  }
}

const DOMAIN_TERMS = [
  '知识库', '向量搜索', '语义搜索', '混合检索',
  '工作流', '自动化', '节点', '触发器',
  'API', 'Embedding', 'LLM', 'RAG',
  '分块', '分词', '索引', '重排序',
]

export async function loadDomainTerms(): Promise<void> {
  await initJieba()
  if (jiebaModule) {
    for (const term of DOMAIN_TERMS) {
      jiebaModule.addWord(term, 1000)
    }
    console.log('[Segmenter] 已加载领域专业词汇')
  }
}

export async function normalizeQuery(query: string): Promise<string> {
  let normalized = query.trim()
  normalized = normalized.replace(/[？?！!。.，,、;；:：""''【】\[\]（）()]/g, ' ')
  normalized = normalized.replace(/\s+/g, ' ').trim()
  return normalized
}

export async function analyzeQueryIntent(query: string): Promise<{
  keywords: string[]
  expandedKeywords: string[]
  queryType: 'question' | 'keyword' | 'phrase'
}> {
  const normalized = await normalizeQuery(query)
  const keywords = await segment(normalized, { mode: 'search', removeStopWords: true })
  const expandedKeywords = await expandWithSynonyms(keywords)

  let queryType: 'question' | 'keyword' | 'phrase' = 'keyword'
  if (/^(什么|怎么|如何|为什么|哪里|谁|何时|是否|能否|可以|是不是)/i.test(normalized) ||
      /\?$/.test(query) ||
      /^(what|how|why|where|when|who|which|can|is|are|do|does)/i.test(normalized)) {
    queryType = 'question'
  } else if (keywords.length >= 3) {
    queryType = 'phrase'
  }

  return { keywords, expandedKeywords, queryType }
}

export default segment
