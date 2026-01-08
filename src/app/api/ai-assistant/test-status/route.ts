import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/api/api-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.organizationId) {
      return ApiResponse.error("未授权", 401);
    }

    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get("id");

    if (!executionId) {
      return ApiResponse.error("缺少执行ID", 400);
    }

    const execution = await prisma.execution.findFirst({
      where: { 
        id: executionId,
        organizationId: session.user.organizationId,
      },
      include: { 
        logs: { 
          orderBy: { startedAt: "asc" } 
        },
        workflow: {
          select: { config: true }
        }
      },
    });

    if (!execution) {
      return ApiResponse.error("执行记录不存在", 404);
    }

    const workflowConfig = execution.workflow?.config as { nodes?: Array<{ id: string; name?: string; type?: string }> } | null;
    const workflowNodes = workflowConfig?.nodes || [];
    const completedNodeIds = new Set(execution.logs.map(log => log.nodeId));

    const nodeResults = workflowNodes.map((node, index) => {
      const log = execution.logs.find(l => l.nodeId === node.id);
      
      if (log) {
        return {
          nodeId: log.nodeId,
          nodeName: log.nodeName,
          nodeType: log.nodeType,
          status: log.status === "COMPLETED" ? ("success" as const) : 
                  log.status === "FAILED" ? ("error" as const) : 
                  log.status === "RUNNING" ? ("running" as const) : ("pending" as const),
          error: log.error || undefined,
          output: log.output as Record<string, unknown> | undefined,
          duration: log.duration,
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
        };
      }

      const isRunning = execution.status === "RUNNING" && 
        index === completedNodeIds.size;
      
      return {
        nodeId: node.id,
        nodeName: node.name || `节点${index + 1}`,
        nodeType: node.type || "UNKNOWN",
        status: isRunning ? ("running" as const) : ("pending" as const),
      };
    });

    const completed = execution.status !== "RUNNING";
    const success = execution.status === "COMPLETED";

    return ApiResponse.success({
      executionId: execution.id,
      status: execution.status,
      completed,
      success,
      duration: execution.duration,
      totalTokens: execution.totalTokens,
      error: execution.error,
      output: execution.output as Record<string, unknown> | undefined,
      nodeResults,
      analysis: completed 
        ? (success 
            ? `工作流执行成功！共 ${nodeResults.length} 个节点全部完成。`
            : `执行失败。${nodeResults.filter(n => n.status === "error").map(n => `节点"${n.nodeName}"失败: ${n.error}`).join("; ")}`)
        : undefined,
    });
  } catch (error) {
    console.error("[Test Status] 查询失败:", error);

    // 判断是否为数据库连接错误，提供更友好的提示
    const errorMessage = error instanceof Error ? error.message : "查询执行状态失败";
    const isConnectionError =
      errorMessage.includes("Can't reach database") ||
      errorMessage.includes("Connection") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("timeout");

    if (isConnectionError) {
      return ApiResponse.error("数据库连接失败，请稍后重试", 503);
    }

    return ApiResponse.error(errorMessage, 500);
  }
}
