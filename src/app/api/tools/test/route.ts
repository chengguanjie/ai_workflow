/**
 * 工具测试 API
 * 
 * 测试工具执行
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toolRegistry, initializeDefaultTools } from '@/lib/ai/function-calling'

// 确保默认工具已初始化
let initialized = false
function ensureInitialized() {
  if (!initialized) {
    initializeDefaultTools()
    initialized = true
  }
}

/**
 * POST /api/tools/test - 测试工具执行
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    ensureInitialized()

    const body = await request.json()
    const { toolName, args } = body

    if (!toolName) {
      return NextResponse.json(
        { error: '缺少必需参数: toolName' },
        { status: 400 }
      )
    }

    // 检查工具是否存在
    if (!toolRegistry.has(toolName)) {
      return NextResponse.json(
        { error: `工具 "${toolName}" 不存在` },
        { status: 404 }
      )
    }

    // 执行工具（测试模式）
    const result = await toolRegistry.execute(
      toolName,
      args || {},
      {
        organizationId: session.user.organizationId || '',
        userId: session.user.id,
        testMode: true,
      }
    )

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[API] 测试工具失败:', error)
    return NextResponse.json(
      { error: '测试工具失败' },
      { status: 500 }
    )
  }
}
