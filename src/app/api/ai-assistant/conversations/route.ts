import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get("workflowId")

    if (!workflowId) {
      return NextResponse.json({ error: "缺少 workflowId 参数" }, { status: 400 })
    }

    const conversations = await prisma.aIConversation.findMany({
      where: {
        workflowId,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    const formattedConversations = conversations.map((conv: { id: string; title: string; workflowId: string; messages: Array<{ id: string; role: string; content: string; createdAt: Date; phase: string | null; nodeActions: unknown; testResult: unknown; pendingFix: boolean; fixStatus: string | null; diagnosis: unknown; suggestions: unknown; interactiveQuestions: unknown; nodeSelection: unknown; layoutPreview: unknown; requirementConfirmation: unknown }>; createdAt: Date; updatedAt: Date }) => ({
      id: conv.id,
      title: conv.title,
      workflowId: conv.workflowId,
      messages: conv.messages.map((msg: { id: string; role: string; content: string; createdAt: Date; phase: string | null; nodeActions: unknown; testResult: unknown; pendingFix: boolean; fixStatus: string | null; diagnosis: unknown; suggestions: unknown; interactiveQuestions: unknown; nodeSelection: unknown; layoutPreview: unknown; requirementConfirmation: unknown }) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt.getTime(),
        phase: msg.phase,
        nodeActions: msg.nodeActions,
        testResult: msg.testResult,
        pendingFix: msg.pendingFix,
        fixStatus: msg.fixStatus,
        diagnosis: msg.diagnosis,
        suggestions: msg.suggestions,
        interactiveQuestions: msg.interactiveQuestions,
        nodeSelection: msg.nodeSelection,
        layoutPreview: msg.layoutPreview,
        requirementConfirmation: msg.requirementConfirmation,
      })),
      createdAt: conv.createdAt.getTime(),
      updatedAt: conv.updatedAt.getTime(),
    }))

    return NextResponse.json({ success: true, data: formattedConversations })
  } catch (error) {
    console.error("获取对话列表失败:", error)
    return NextResponse.json(
      { error: "获取对话列表失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 })
    }

    const body = await request.json()
    const { workflowId, title } = body

    if (!workflowId) {
      return NextResponse.json({ error: "缺少 workflowId" }, { status: 400 })
    }

    const conversation = await prisma.aIConversation.create({
      data: {
        workflowId,
        userId: session.user.id,
        title: title || "新对话",
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        workflowId: conversation.workflowId,
        messages: [],
        createdAt: conversation.createdAt.getTime(),
        updatedAt: conversation.updatedAt.getTime(),
      },
    })
  } catch (error) {
    console.error("创建对话失败:", error)
    return NextResponse.json({ error: "创建对话失败" }, { status: 500 })
  }
}
