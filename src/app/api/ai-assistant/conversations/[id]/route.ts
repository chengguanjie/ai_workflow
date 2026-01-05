import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

interface AIMessageRecord {
  id: string
  role: string
  content: string
  createdAt: Date
  phase: string | null
  nodeActions: unknown
  testResult: unknown
  pendingFix: boolean
  fixStatus: string | null
  diagnosis: unknown
  suggestions: unknown
  interactiveQuestions: unknown
  nodeSelection: unknown
  layoutPreview: unknown
  requirementConfirmation: unknown
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 })
    }

    const { id } = await params

    const conversation = await prisma.aIConversation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "对话不存在" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: conversation.id,
        title: conversation.title,
        workflowId: conversation.workflowId,
        messages: conversation.messages.map((msg: AIMessageRecord) => ({
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
        createdAt: conversation.createdAt.getTime(),
        updatedAt: conversation.updatedAt.getTime(),
      },
    })
  } catch (error) {
    console.error("获取对话失败:", error)
    return NextResponse.json({ error: "获取对话失败" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { title } = body

    const conversation = await prisma.aIConversation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "对话不存在" }, { status: 404 })
    }

    const updated = await prisma.aIConversation.update({
      where: { id },
      data: { title },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
      },
    })
  } catch (error) {
    console.error("更新对话失败:", error)
    return NextResponse.json({ error: "更新对话失败" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 })
    }

    const { id } = await params

    const conversation = await prisma.aIConversation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "对话不存在" }, { status: 404 })
    }

    await prisma.aIConversation.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("删除对话失败:", error)
    return NextResponse.json({ error: "删除对话失败" }, { status: 500 })
  }
}
