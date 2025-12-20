import { NextRequest, NextResponse } from 'next/server'
import { codeNodeProcessor } from '@/lib/workflow/processors/code'
import type { ExecutionContext } from '@/lib/workflow/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, language = 'javascript', inputs = {} } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { success: false, error: '代码不能为空' },
        { status: 400 }
      )
    }

    // 创建模拟节点配置
    const mockNode = {
      id: 'preview',
      name: '代码预览',
      type: 'CODE' as const,
      position: { x: 0, y: 0 },
      config: {
        code,
        language,
      },
    }

    // 创建模拟执行上下文
    const mockContext: ExecutionContext = {
      workflowId: 'preview',
      executionId: 'preview',
      organizationId: 'preview',
      userId: 'preview',
      nodeOutputs: new Map(),
      globalVariables: inputs,
      aiConfigs: new Map(),
    }

    // 使用代码处理器执行
    const result = await codeNodeProcessor.process(mockNode, mockContext)

    if (result.status === 'success') {
      const data = result.data as {
        output?: unknown
        formattedOutput?: string
        logs?: string[]
        executionTime?: number
      }
      return NextResponse.json({
        success: true,
        output: data.formattedOutput || String(data.output || ''),
        executionTime: data.executionTime || result.duration,
        logs: data.logs || [],
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || '执行失败',
        executionTime: result.duration,
      })
    }
  } catch (error) {
    console.error('Code execution error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '执行失败',
      },
      { status: 500 }
    )
  }
}
