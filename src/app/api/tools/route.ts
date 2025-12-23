/**
 * 工具管理 API
 * 
 * 管理 AI Function Calling 工具
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  toolRegistry,
  initializeDefaultTools,
  NotificationToolExecutor,
  HttpToolExecutor,
} from '@/lib/ai/function-calling'

// 确保默认工具已初始化
let initialized = false
function ensureInitialized() {
  if (!initialized) {
    initializeDefaultTools()
    initialized = true
  }
}

/**
 * GET /api/tools - 获取所有已注册的工具
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    ensureInitialized()

    const tools = toolRegistry.getAllDefinitions()

    return NextResponse.json({
      success: true,
      data: {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          category: tool.category,
          parameters: tool.parameters,
        })),
        total: tools.length,
      },
    })
  } catch (error) {
    console.error('[API] 获取工具列表失败:', error)
    return NextResponse.json(
      { error: '获取工具列表失败' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/tools - 注册新工具
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    ensureInitialized()

    const body = await request.json()
    const { type, name, description, config } = body

    if (!type || !name) {
      return NextResponse.json(
        { error: '缺少必需参数: type, name' },
        { status: 400 }
      )
    }

    // 检查工具是否已存在
    if (toolRegistry.has(name)) {
      return NextResponse.json(
        { error: `工具 "${name}" 已存在` },
        { status: 409 }
      )
    }

    // 根据类型创建工具
    let executor: NotificationToolExecutor | HttpToolExecutor

    switch (type) {
      case 'notification':
        executor = new NotificationToolExecutor({
          webhookUrl: config?.webhookUrl,
          platform: config?.platform,
        })
        executor.name = name
        if (description) {
          executor.description = description
        }
        break

      case 'http':
        executor = new HttpToolExecutor({
          baseUrl: config?.baseUrl,
          defaultHeaders: config?.headers,
          allowedMethods: config?.allowedMethods,
        })
        executor.name = name
        if (description) {
          executor.description = description
        }
        break

      default:
        return NextResponse.json(
          { error: `不支持的工具类型: ${type}` },
          { status: 400 }
        )
    }

    toolRegistry.register(executor)

    return NextResponse.json({
      success: true,
      data: {
        name: executor.name,
        description: executor.description,
        category: executor.category,
      },
    })
  } catch (error) {
    console.error('[API] 注册工具失败:', error)
    return NextResponse.json(
      { error: '注册工具失败' },
      { status: 500 }
    )
  }
}
