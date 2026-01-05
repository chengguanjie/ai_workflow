import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { auth } from "@/lib/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 })
    }

    const { id: conversationId } = await params
    const body = await request.json()

    const conversation = await prisma.aIConversation.findFirst({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "对话不存在" }, { status: 404 })
    }

    const {
      role,
      content,
      phase,
      nodeActions,
      testResult,
      pendingFix,
      fixStatus,
      diagnosis,
      suggestions,
      interactiveQuestions,
      nodeSelection,
      layoutPreview,
      requirementConfirmation,
    } = body

    const message = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: role as "user" | "assistant" | "system",
        content,
        phase,
        nodeActions: nodeActions ?? undefined,
        testResult: testResult ?? undefined,
        pendingFix: pendingFix ?? false,
        fixStatus,
        diagnosis: diagnosis ?? undefined,
        suggestions: suggestions ?? undefined,
        interactiveQuestions: interactiveQuestions ?? undefined,
        nodeSelection: nodeSelection ?? undefined,
        layoutPreview: layoutPreview ?? undefined,
        requirementConfirmation: requirementConfirmation ?? undefined,
      },
    })

    const isFirstUserMessage = body.role === "user"
    if (isFirstUserMessage) {
      const messageCount = await prisma.aIMessage.count({
        where: { conversationId },
      })
      if (messageCount === 1) {
        const title = content.length > 20 ? content.slice(0, 20) + "..." : content
        await prisma.aIConversation.update({
          where: { id: conversationId },
          data: { title },
        })
      }
    }

    await prisma.aIConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.createdAt.getTime(),
        phase: message.phase,
        nodeActions: message.nodeActions,
        testResult: message.testResult,
        pendingFix: message.pendingFix,
        fixStatus: message.fixStatus,
        diagnosis: message.diagnosis,
        suggestions: message.suggestions,
        interactiveQuestions: message.interactiveQuestions,
        nodeSelection: message.nodeSelection,
        layoutPreview: message.layoutPreview,
        requirementConfirmation: message.requirementConfirmation,
      },
    })
  } catch (error) {
    console.error("添加消息失败:", error)
    return NextResponse.json({ error: "添加消息失败" }, { status: 500 })
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

    const { id: conversationId } = await params

    const conversation = await prisma.aIConversation.findFirst({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: "对话不存在" }, { status: 404 })
    }

    await prisma.aIMessage.deleteMany({
      where: { conversationId },
    })

    await prisma.aIConversation.update({
      where: { id: conversationId },
      data: { title: "新对话" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("清空消息失败:", error)
    return NextResponse.json({ error: "清空消息失败" }, { status: 500 })
  }
}
