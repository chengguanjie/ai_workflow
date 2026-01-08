import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/api/api-response";

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[AI Test][${requestId}] 收到测试请求`);

  try {
    const session = await auth();
    if (!session?.user?.organizationId) {
      return ApiResponse.error("未授权", 401);
    }

    const { workflowId, testInput } = await request.json();

    if (!workflowId) {
      return ApiResponse.error("缺少工作流ID", 400);
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow || workflow.organizationId !== session.user.organizationId) {
      return ApiResponse.error("工作流不存在", 404);
    }

    const config = workflow.config as { nodes?: Array<{ id: string; name?: string; type?: string }> } | null;
    const workflowNodes = config?.nodes || [];
    
    const pendingNodes = workflowNodes.map((node, index) => ({
      nodeId: node.id,
      nodeName: node.name || `节点${index + 1}`,
      nodeType: node.type || "UNKNOWN",
      status: index === 0 ? "running" as const : "pending" as const,
    }));

    const { executeWorkflow } = await import("@/lib/workflow/engine");

    const execution = await prisma.execution.create({
      data: {
        workflowId,
        organizationId: session.user.organizationId,
        userId: session.user.id,
        status: "RUNNING",
        input: testInput as object,
      },
    });

    console.log(`[AI Test][${requestId}] 测试已启动, executionId: ${execution.id}`);

    executeWorkflow(
      workflowId,
      session.user.organizationId,
      session.user.id,
      testInput
    ).then(async (result) => {
      console.log(`[AI Test][${requestId}] 测试完成, status: ${result.status}`);
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: result.status,
          output: result.output as object | undefined,
          error: result.error,
          duration: result.duration,
          totalTokens: result.totalTokens,
        },
      });
    }).catch(async (error) => {
      console.error(`[AI Test][${requestId}] 测试失败:`, error);
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "执行失败",
        },
      });
    });

    return ApiResponse.success({
      executionId: execution.id,
      pendingNodes,
      testInput,
    });
  } catch (error) {
    console.error(`[AI Test][${requestId}] 请求失败:`, error);
    return ApiResponse.error(
      error instanceof Error ? error.message : "测试启动失败",
      500
    );
  }
}
