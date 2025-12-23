/**
 * 测试 token 工具
 */

import {
  estimateTokenCount,
  validateContextSize,
  smartTruncate,
  MODEL_CONTEXT_LIMITS
} from './src/lib/ai/token-utils'

async function runTests() {
  console.log('=== Testing Token Utilities ===\n')

  // 测试1：Token 估算
  console.log('1. Testing token estimation:')
  const testText = 'This is a test sentence with approximately 10 words in it.'
  const estimatedTokens = estimateTokenCount(testText)
  console.log(`Text: "${testText}"`)
  console.log(`Estimated tokens: ${estimatedTokens}`)
  console.log(`Characters: ${testText.length}`)
  console.log(`Ratio: ${testText.length / estimatedTokens} chars per token\n`)

  // 测试2：模型上下文限制
  console.log('2. Testing model context limits:')
  const models = ['claude-3-haiku', 'claude-3-sonnet', 'gpt-4-turbo', 'gpt-3.5-turbo']
  models.forEach(model => {
    console.log(`${model}: ${MODEL_CONTEXT_LIMITS[model] || 'Not defined'} tokens`)
  })
  console.log()

  // 测试3：验证上下文大小
  console.log('3. Testing context validation:')
  const largeText = 'x'.repeat(150000) // ~50k tokens
  const validation = validateContextSize(largeText, 'claude-3-sonnet', 20000)
  console.log(`Large text validation:`)
  console.log(`- Estimated tokens: ${validation.estimatedTokens}`)
  console.log(`- Model limit: ${validation.limit}`)
  console.log(`- Available tokens: ${validation.available}`)
  console.log(`- Valid: ${validation.valid}\n`)

  // 测试4：智能截断
  console.log('4. Testing smart truncation:')
  const longText = `
This is the beginning of the document...
${'Some normal content here '.repeat(5000)}
ERROR: Critical error occurred here
${'More content after error '.repeat(1000)}
This is the end of the document.
`
  const truncated = smartTruncate(longText, 1000, {
    preserveStart: 200,
    preserveEnd: 100,
    priorityMarkers: ['ERROR', 'Critical']
  })
  console.log(`Original length: ${longText.length} chars`)
  console.log(`Truncated length: ${truncated.length} chars`)
  console.log(`Contains ERROR: ${truncated.includes('ERROR')}`)
  console.log(`Contains "Critical error": ${truncated.includes('Critical error')}\n`)

  // 测试5：模拟诊断分析器场景
  console.log('5. Simulating diagnostic analyzer scenario:')
  const bigInput = 'x'.repeat(600000) // ~200k tokens
  const modelLimit = MODEL_CONTEXT_LIMITS['claude-3-sonnet']
  const estimatedInputTokens = estimateTokenCount(bigInput)
  console.log(`Big input tokens: ${estimatedInputTokens}`)
  console.log(`Model limit: ${modelLimit}`)
  console.log(`Would exceed limit: ${estimatedInputTokens > modelLimit - 20000}`)

  // 应用智能截断
  const safeInput = smartTruncate(bigInput, modelLimit - 30000) // 留出空间给响应
  const safeTokens = estimateTokenCount(safeInput)
  console.log(`After truncation: ${safeTokens} tokens`)
  console.log(`Safe for API: ${safeTokens < modelLimit - 20000}`)

  console.log('\n=== All tests completed successfully ===')
}

runTests().catch(console.error)