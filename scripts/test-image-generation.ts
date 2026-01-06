/**
 * 测试图片生成 API - 三个模型
 * 
 * 模型列表:
 * 1. google/gemini-3-pro-image-preview (Gemini)
 * 2. bytedance/doubao-seedream-4.5 (豆包)
 * 3. ali/qwen-image (通义)
 * 
 * 运行方式: pnpm tsx scripts/test-image-generation.ts
 */

import { config } from 'dotenv'
config()

import { PrismaClient } from '@prisma/client'
import { safeDecryptApiKey } from '../src/lib/crypto'

const prisma = new PrismaClient()

const SHENSUAN_BASE_URL = process.env.SHENSUAN_BASE_URL || 'https://router.shengsuanyun.com/api/v1'

// API Key 将从数据库获取
let API_KEY = ''

const MODELS = [
  'google/gemini-3-pro-image-preview',
  'bytedance/doubao-seedream-4.5',
  'ali/qwen-image',
]

const TEST_PROMPT = 'A beautiful sunset over the ocean with golden clouds and calm waves, photorealistic style'

interface TaskResponse {
  code?: number
  id?: string
  task_id?: string
  data?: {
    request_id?: string
    task_id?: string
    status?: string
    data?: {
      images?: Array<string | { url?: string; image_url?: string }>
      image_urls?: string[]
    }
    images?: Array<string | { url?: string; image_url?: string }>
    image_urls?: string[]
  }
  status?: string
  images?: Array<string | { url?: string }>
  output?: {
    images?: Array<string | { url?: string }>
    image_urls?: string[]
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testImageGeneration(model: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`测试模型: ${model}`)
  console.log('='.repeat(60))

  const isTasksAPI = model.includes('gemini') || model.includes('doubao') || model.includes('seedream') || model.includes('qwen')

  try {
    if (isTasksAPI) {
      // 使用 Tasks API
      await testWithTasksAPI(model)
    } else {
      // 使用标准 /images/generations API
      await testWithStandardAPI(model)
    }
  } catch (error) {
    console.error(`❌ 测试失败:`, error instanceof Error ? error.message : error)
  }
}

async function testWithTasksAPI(model: string): Promise<void> {
  console.log('📤 使用 Tasks API 提交任务...')

  // 根据模型类型构建请求体
  const requestBody = buildTaskRequestBody(model)
  console.log('请求体:', JSON.stringify(requestBody, null, 2))

  const submitUrl = `${SHENSUAN_BASE_URL}/tasks/generations`
  console.log('请求 URL:', submitUrl)

  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text()
    throw new Error(`提交任务失败: ${submitResponse.status} - ${errorText}`)
  }

  const submitData: TaskResponse = await submitResponse.json()
  console.log('📥 任务提交响应:', JSON.stringify(submitData, null, 2).slice(0, 1000))

  // 获取任务 ID
  const taskId = submitData.id || submitData.task_id || submitData.data?.request_id || submitData.data?.task_id

  if (!taskId) {
    // 检查是否直接返回了结果
    const images = extractImages(submitData)
    if (images.length > 0) {
      console.log('✅ 图片生成成功 (同步返回)!')
      images.forEach((url, i) => console.log(`  图片 ${i + 1}: ${url}`))
      return
    }
    throw new Error('未返回任务 ID 或结果')
  }

  // 检查初始状态
  const initialStatus = (submitData.data?.status || submitData.status || '').toLowerCase()
  if (initialStatus === 'completed' || initialStatus === 'succeeded' || initialStatus === 'success') {
    const images = extractImages(submitData)
    console.log('✅ 图片生成成功!')
    images.forEach((url, i) => console.log(`  图片 ${i + 1}: ${url}`))
    return
  }

  console.log(`📋 任务 ID: ${taskId}, 初始状态: ${initialStatus || 'pending'}`)

  // 轮询等待任务完成
  await pollTaskStatus(taskId)
}

async function testWithStandardAPI(model: string): Promise<void> {
  console.log('📤 使用标准 /images/generations API...')

  const requestBody = {
    model,
    prompt: TEST_PROMPT,
    n: 1,
    size: '1024x1024',
    response_format: 'url',
  }

  console.log('请求体:', JSON.stringify(requestBody, null, 2))

  const response = await fetch(`${SHENSUAN_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API 错误: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  console.log('📥 响应:', JSON.stringify(data, null, 2).slice(0, 1000))

  const images = data.data?.map((img: { url?: string }) => img.url).filter(Boolean) || []
  if (images.length > 0) {
    console.log('✅ 图片生成成功!')
    images.forEach((url: string, i: number) => console.log(`  图片 ${i + 1}: ${url}`))
  } else {
    console.log('⚠️ 未返回图片 URL')
  }
}

function buildTaskRequestBody(model: string): Record<string, unknown> {
  const lower = model.toLowerCase()

  if (lower.includes('gemini')) {
    return {
      model,
      prompt: TEST_PROMPT,
      aspect_ratio: '1:1',
      size: '1K',
      response_modalities: ['IMAGE'],
    }
  }

  if (lower.includes('doubao') || lower.includes('seedream')) {
    // 豆包要求至少 3686400 像素，使用 2048x2048
    return {
      model,
      prompt: TEST_PROMPT,
      size: '2048x2048',
      watermark: false,
      sequential_image_generation: 'auto',
      sequential_image_generation_options: {
        max_count: 1,
      },
    }
  }

  if (lower.includes('qwen') || lower.includes('ali/')) {
    // 通义只支持特定尺寸: 1664*928, 1472*1140, 1328*1328, 1140*1472, 928*1664
    return {
      model,
      prompt: TEST_PROMPT,
      size: '1328*1328',
      n: 1,
      prompt_extend: true,
      watermark: false,
    }
  }

  // 默认格式
  return {
    model,
    prompt: TEST_PROMPT,
    size: '1024x1024',
    n: 1,
  }
}

async function pollTaskStatus(taskId: string): Promise<void> {
  const maxWaitTime = 5 * 60 * 1000 // 5 分钟
  const pollInterval = 3000 // 3 秒
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    console.log(`⏳ 查询任务状态... (已等待 ${Math.round((Date.now() - startTime) / 1000)}s)`)

    const statusResponse = await fetch(`${SHENSUAN_BASE_URL}/tasks/generations/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    })

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text()
      throw new Error(`查询状态失败: ${statusResponse.status} - ${errorText}`)
    }

    const statusData: TaskResponse = await statusResponse.json()
    const status = (statusData.data?.status || statusData.status || '').toLowerCase()
    const progress = (statusData as any).data?.progress || (statusData as any).progress || ''

    console.log(`  状态: ${status}, 进度: ${progress || 'N/A'}`)

    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const images = extractImages(statusData)
      console.log('✅ 图片生成成功!')
      if (images.length > 0) {
        images.forEach((url, i) => console.log(`  图片 ${i + 1}: ${url}`))
      } else {
        console.log('⚠️ 任务完成但未找到图片 URL')
        console.log('完整响应:', JSON.stringify(statusData, null, 2))
      }
      return
    }

    if (status === 'failed' || status === 'error') {
      const errorMsg = (statusData as any).data?.fail_reason || (statusData as any).error || (statusData as any).message || '未知错误'
      throw new Error(`图片生成失败: ${errorMsg}`)
    }

    await sleep(pollInterval)
  }

  throw new Error(`任务超时: 已等待 ${maxWaitTime / 1000} 秒`)
}

function extractImages(data: TaskResponse): string[] {
  const images: string[] = []

  // 检查多层嵌套结构
  if (data.data?.data?.images) {
    for (const img of data.data.data.images) {
      const url = typeof img === 'string' ? img : (img.url || img.image_url)
      if (url) images.push(url)
    }
  }

  if (images.length === 0 && data.data?.data?.image_urls) {
    images.push(...data.data.data.image_urls)
  }

  if (images.length === 0 && data.data?.images) {
    for (const img of data.data.images) {
      const url = typeof img === 'string' ? img : (img.url || img.image_url)
      if (url) images.push(url)
    }
  }

  if (images.length === 0 && data.data?.image_urls) {
    images.push(...data.data.image_urls)
  }

  if (images.length === 0 && data.images) {
    for (const img of data.images) {
      const url = typeof img === 'string' ? img : img.url
      if (url) images.push(url)
    }
  }

  if (images.length === 0 && data.output?.images) {
    for (const img of data.output.images) {
      const url = typeof img === 'string' ? img : img.url
      if (url) images.push(url)
    }
  }

  if (images.length === 0 && data.output?.image_urls) {
    images.push(...data.output.image_urls)
  }

  return images
}

async function main(): Promise<void> {
  console.log('🚀 开始测试图片生成 API')
  console.log(`Base URL: ${SHENSUAN_BASE_URL}`)

  // 从数据库获取 API Key
  try {
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: {
        provider: 'SHENSUAN',
        isActive: true,
      },
      orderBy: {
        isDefault: 'desc',
      },
    })

    if (apiKeyRecord) {
      API_KEY = safeDecryptApiKey(apiKeyRecord.keyEncrypted)
      console.log(`✅ 从数据库获取到 API Key (provider: ${apiKeyRecord.provider}, name: ${apiKeyRecord.name})`)
    } else {
      // 尝试获取任意可用的 API Key
      const anyApiKey = await prisma.apiKey.findFirst({
        where: {
          isActive: true,
        },
        orderBy: {
          isDefault: 'desc',
        },
      })

      if (anyApiKey) {
        API_KEY = safeDecryptApiKey(anyApiKey.keyEncrypted)
        console.log(`✅ 从数据库获取到 API Key (provider: ${anyApiKey.provider}, name: ${anyApiKey.name})`)
      }
    }
  } catch (error) {
    console.error('❌ 从数据库获取 API Key 失败:', error)
  }

  if (!API_KEY) {
    console.error('❌ 未找到可用的 API Key')
    console.log('请确保数据库中有配置 shensuan 或其他 AI 服务商的 API Key')
    await prisma.$disconnect()
    return
  }

  console.log(`API Key: ${API_KEY.slice(0, 8)}...`)
  console.log(`测试 Prompt: ${TEST_PROMPT}`)

  for (const model of MODELS) {
    await testImageGeneration(model)
    // 每个模型测试之间等待一下
    await sleep(2000)
  }

  console.log('\n' + '='.repeat(60))
  console.log('🏁 测试完成')
  console.log('='.repeat(60))

  await prisma.$disconnect()
}

main().catch(console.error)
