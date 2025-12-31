import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 诊断问题接口
interface DiagnosisIssue {
  nodeId: string;
  nodeName: string;
  severity: "error" | "warning" | "info";
  category:
    | "connection"
    | "config"
    | "variable"
    | "tool"
    | "knowledge"
    | "performance";
  issue: string;
  suggestion: string;
  autoFixable: boolean;
  fixAction?: {
    action: "update" | "delete" | "connect";
    nodeId?: string;
    config?: Record<string, unknown>;
    source?: string;
    target?: string;
  };
}

// 诊断结果接口
interface DiagnosisResult {
  issues: DiagnosisIssue[];
  summary: string;
  score: number;
}

// 节点配置接口
interface NodeConfig {
  name?: string;
  prompt?: string;
  systemPrompt?: string;
  model?: string;
  aiConfigId?: string;
  tools?: Array<{
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    config?: Record<string, unknown>;
  }>;
  knowledgeBaseId?: string;
  outputFormat?: string;
  conditions?: Array<{
    id: string;
    field: string;
    operator: string;
    value: string;
  }>;
}

// 边接口
interface EdgeData {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

// 节点接口
interface NodeData {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeConfig;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { workflowId, nodes, edges } = await request.json();

    if (!workflowId) {
      return NextResponse.json(
        { error: "工作流ID不能为空" },
        { status: 400 }
      );
    }

    // 验证工作流权限
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: session.user.organizationId,
      },
    });

    if (!workflow) {
      return NextResponse.json(
        { error: "工作流不存在或无权限" },
        { status: 404 }
      );
    }

    // 执行诊断
    const result = diagnoseWorkflow(nodes, edges);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("诊断失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "诊断失败" },
      { status: 500 }
    );
  }
}

// 诊断工作流
function diagnoseWorkflow(
  nodes: NodeData[],
  edges: EdgeData[]
): DiagnosisResult {
  const issues: DiagnosisIssue[] = [];

  if (!nodes || nodes.length === 0) {
    return {
      issues: [
        {
          nodeId: "",
          nodeName: "",
          severity: "error",
          category: "config",
          issue: "工作流为空",
          suggestion: "请添加至少一个节点来构建工作流",
          autoFixable: false,
        },
      ],
      summary: "工作流为空，无法进行诊断",
      score: 0,
    };
  }

  // 构建节点映射
  const nodeMap = new Map<string, NodeData>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  // 构建连接关系
  const incomingEdges = new Map<string, EdgeData[]>();
  const outgoingEdges = new Map<string, EdgeData[]>();

  edges?.forEach((edge) => {
    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, []);
    }
    incomingEdges.get(edge.target)!.push(edge);

    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, []);
    }
    outgoingEdges.get(edge.source)!.push(edge);
  });

  // 1. 检查连接完整性
  checkConnectionIntegrity(nodes, incomingEdges, outgoingEdges, issues);

  // 2. 检查配置完整性
  checkConfigIntegrity(nodes, issues);

  // 3. 检查变量引用
  checkVariableReferences(nodes, nodeMap, issues);

  // 4. 检查工具配置
  checkToolConfigs(nodes, issues);

  // 5. 检查知识库配置
  checkKnowledgeBaseConfigs(nodes, issues);

  // 6. 检查性能隐患
  checkPerformanceIssues(nodes, edges, issues);

  // 计算分数
  const score = calculateScore(issues, nodes.length);

  // 生成总结
  const summary = generateSummary(issues, score);

  return { issues, summary, score };
}

// 检查连接完整性
function checkConnectionIntegrity(
  nodes: NodeData[],
  incomingEdges: Map<string, EdgeData[]>,
  outgoingEdges: Map<string, EdgeData[]>,
  issues: DiagnosisIssue[]
) {
  // 找到起始节点（trigger类型）
  const triggerNodes = nodes.filter((n) => n.type === "trigger");

  if (triggerNodes.length === 0) {
    issues.push({
      nodeId: "",
      nodeName: "",
      severity: "error",
      category: "connection",
      issue: "缺少触发器节点",
      suggestion: "请添加一个触发器节点作为工作流的起点",
      autoFixable: false,
    });
  }

  if (triggerNodes.length > 1) {
    issues.push({
      nodeId: "",
      nodeName: "",
      severity: "warning",
      category: "connection",
      issue: "存在多个触发器节点",
      suggestion: "通常工作流只需要一个触发器节点，请检查是否需要删除多余的触发器",
      autoFixable: false,
    });
  }

  // 检查孤立节点
  nodes.forEach((node) => {
    if (node.type === "trigger") return; // 触发器节点不需要入边

    const hasIncoming = incomingEdges.has(node.id);
    const hasOutgoing = outgoingEdges.has(node.id);

    if (!hasIncoming && !hasOutgoing) {
      issues.push({
        nodeId: node.id,
        nodeName: node.data?.name || node.id,
        severity: "error",
        category: "connection",
        issue: "孤立节点，没有任何连接",
        suggestion: "请将此节点连接到工作流中，或删除此节点",
        autoFixable: false,
      });
    } else if (!hasIncoming) {
      issues.push({
        nodeId: node.id,
        nodeName: node.data?.name || node.id,
        severity: "warning",
        category: "connection",
        issue: "节点没有输入连接",
        suggestion: "此节点无法接收上游数据，请检查连接是否正确",
        autoFixable: false,
      });
    }
  });

  // 检查末端节点
  const endNodes = nodes.filter((n) => !outgoingEdges.has(n.id));
  const outputNodes = endNodes.filter((n) => n.type === "output");

  if (endNodes.length > 0 && outputNodes.length === 0) {
    issues.push({
      nodeId: "",
      nodeName: "",
      severity: "info",
      category: "connection",
      issue: "工作流没有输出节点",
      suggestion: "建议添加输出节点来返回工作流结果",
      autoFixable: false,
    });
  }
}

// 检查配置完整性
function checkConfigIntegrity(nodes: NodeData[], issues: DiagnosisIssue[]) {
  nodes.forEach((node) => {
    const config = node.data;
    const nodeName = config?.name || node.id;

    // 检查节点名称
    if (!config?.name || config.name.trim() === "") {
      issues.push({
        nodeId: node.id,
        nodeName: node.id,
        severity: "warning",
        category: "config",
        issue: "节点名称为空",
        suggestion: "请为节点设置一个有意义的名称",
        autoFixable: false,
      });
    }

    // 处理节点特定检查
    if (node.type === "process") {
      // 检查提示词
      if (!config?.prompt || config.prompt.trim().length < 10) {
        issues.push({
          nodeId: node.id,
          nodeName,
          severity: "warning",
          category: "config",
          issue: "提示词过短或为空",
          suggestion: "请设置详细的提示词以获得更好的AI输出效果",
          autoFixable: false,
        });
      }

      // 检查AI配置
      if (!config?.aiConfigId && !config?.model) {
        issues.push({
          nodeId: node.id,
          nodeName,
          severity: "error",
          category: "config",
          issue: "未配置AI模型",
          suggestion: "请选择一个AI模型配置",
          autoFixable: false,
        });
      }
    }

    if (node.type === "condition") {
      // 检查条件配置
      if (!config?.conditions || config.conditions.length === 0) {
        issues.push({
          nodeId: node.id,
          nodeName,
          severity: "error",
          category: "config",
          issue: "条件节点没有配置条件规则",
          suggestion: "请添加至少一个条件规则",
          autoFixable: false,
        });
      }
    }

    if (node.type === "trigger") {
      // 触发器检查
      if (!config?.name) {
        issues.push({
          nodeId: node.id,
          nodeName,
          severity: "warning",
          category: "config",
          issue: "触发器没有设置名称",
          suggestion: "请为触发器设置一个描述性名称",
          autoFixable: false,
        });
      }
    }
  });
}

// 检查变量引用
function checkVariableReferences(
  nodes: NodeData[],
  nodeMap: Map<string, NodeData>,
  issues: DiagnosisIssue[]
) {
  const nodeNames = new Set<string>();
  nodes.forEach((n) => {
    if (n.data?.name) {
      nodeNames.add(n.data.name);
    }
  });

  nodes.forEach((node) => {
    const config = node.data;
    const nodeName = config?.name || node.id;

    // 检查prompt中的变量引用
    const textsToCheck = [config?.prompt, config?.systemPrompt].filter(
      Boolean
    );

    textsToCheck.forEach((text) => {
      if (!text) return;

      // 匹配 {{xxx.yyy}} 格式的变量引用
      const varPattern = /\{\{([^}]+)\}\}/g;
      let match;

      while ((match = varPattern.exec(text)) !== null) {
        const varRef = match[1].trim();
        const parts = varRef.split(".");

        if (parts.length >= 1) {
          const refNodeName = parts[0];

          // 检查是否是有效的节点名称引用
          if (
            refNodeName !== "input" &&
            refNodeName !== "trigger" &&
            !nodeNames.has(refNodeName)
          ) {
            issues.push({
              nodeId: node.id,
              nodeName,
              severity: "error",
              category: "variable",
              issue: `变量引用 {{${varRef}}} 指向不存在的节点 "${refNodeName}"`,
              suggestion: `请检查节点名称是否正确，可用的节点名称有: ${Array.from(nodeNames).join(", ")}`,
              autoFixable: false,
            });
          }
        }
      }
    });
  });
}

// 检查工具配置
function checkToolConfigs(nodes: NodeData[], issues: DiagnosisIssue[]) {
  nodes.forEach((node) => {
    const config = node.data;
    const nodeName = config?.name || node.id;

    if (node.type === "process" && config?.tools && config.tools.length > 0) {
      config.tools.forEach((tool) => {
        if (!tool.enabled) return;

        // HTTP工具检查
        if (tool.type === "http" || tool.type === "HTTP") {
          const toolConfig = tool.config as {
            url?: string;
            method?: string;
          } | undefined;

          if (!toolConfig?.url) {
            issues.push({
              nodeId: node.id,
              nodeName,
              severity: "error",
              category: "tool",
              issue: `HTTP工具 "${tool.name}" 没有配置URL`,
              suggestion: "请为HTTP工具配置有效的URL地址",
              autoFixable: false,
            });
          } else if (
            !toolConfig.url.startsWith("http://") &&
            !toolConfig.url.startsWith("https://")
          ) {
            issues.push({
              nodeId: node.id,
              nodeName,
              severity: "warning",
              category: "tool",
              issue: `HTTP工具 "${tool.name}" 的URL格式可能不正确`,
              suggestion: "URL应该以 http:// 或 https:// 开头",
              autoFixable: false,
            });
          }

          if (!toolConfig?.method) {
            issues.push({
              nodeId: node.id,
              nodeName,
              severity: "warning",
              category: "tool",
              issue: `HTTP工具 "${tool.name}" 没有配置请求方法`,
              suggestion: "请配置HTTP请求方法（GET、POST等）",
              autoFixable: true,
              fixAction: {
                action: "update",
                nodeId: node.id,
                config: {
                  tools: config.tools?.map((t) =>
                    t.id === tool.id
                      ? { ...t, config: { ...t.config, method: "GET" } }
                      : t
                  ) || [],
                },
              },
            });
          }
        }
      });
    }
  });
}

// 检查知识库配置
function checkKnowledgeBaseConfigs(
  nodes: NodeData[],
  issues: DiagnosisIssue[]
) {
  nodes.forEach((node) => {
    const config = node.data;
    const nodeName = config?.name || node.id;

    // 检查是否启用了知识库但未配置ID
    if (node.type === "process") {
      // 如果prompt中提到了知识库相关内容但未配置
      const prompt = config?.prompt || "";
      const knowledgeKeywords = ["知识库", "文档", "检索", "RAG", "knowledge"];

      const mentionsKnowledge = knowledgeKeywords.some((kw) =>
        prompt.toLowerCase().includes(kw.toLowerCase())
      );

      if (mentionsKnowledge && !config?.knowledgeBaseId) {
        issues.push({
          nodeId: node.id,
          nodeName,
          severity: "info",
          category: "knowledge",
          issue: "提示词中提到了知识库相关内容，但未配置知识库",
          suggestion: "如果需要使用知识库检索功能，请在节点配置中选择知识库",
          autoFixable: false,
        });
      }
    }
  });
}

// 检查性能隐患
function checkPerformanceIssues(
  nodes: NodeData[],
  edges: EdgeData[],
  issues: DiagnosisIssue[]
) {
  // 检查是否存在循环
  const adjacencyList = new Map<string, string[]>();
  edges?.forEach((edge) => {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, []);
    }
    adjacencyList.get(edge.source)!.push(edge.target);
  });

  // 使用DFS检测循环
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (recStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (hasCycle(neighbor)) return true;
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (hasCycle(node.id)) {
      issues.push({
        nodeId: "",
        nodeName: "",
        severity: "error",
        category: "performance",
        issue: "工作流中存在循环",
        suggestion: "工作流不支持循环执行，请检查并移除循环连接",
        autoFixable: false,
      });
      break;
    }
  }

  // 检查节点数量
  if (nodes.length > 20) {
    issues.push({
      nodeId: "",
      nodeName: "",
      severity: "warning",
      category: "performance",
      issue: `工作流包含 ${nodes.length} 个节点，可能影响执行效率`,
      suggestion: "考虑将复杂工作流拆分为多个子工作流",
      autoFixable: false,
    });
  }

  // 检查AI节点数量
  const aiNodes = nodes.filter((n) => n.type === "process");
  if (aiNodes.length > 10) {
    issues.push({
      nodeId: "",
      nodeName: "",
      severity: "warning",
      category: "performance",
      issue: `工作流包含 ${aiNodes.length} 个AI处理节点，可能导致较长的执行时间和较高的API费用`,
      suggestion: "考虑合并部分AI处理节点或优化工作流结构",
      autoFixable: false,
    });
  }
}

// 计算分数
function calculateScore(issues: DiagnosisIssue[], nodeCount: number): number {
  if (nodeCount === 0) return 0;

  let score = 100;

  issues.forEach((issue) => {
    switch (issue.severity) {
      case "error":
        score -= 15;
        break;
      case "warning":
        score -= 5;
        break;
      case "info":
        score -= 1;
        break;
    }
  });

  return Math.max(0, Math.min(100, score));
}

// 生成总结
function generateSummary(issues: DiagnosisIssue[], score: number): string {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  if (issues.length === 0) {
    return "工作流配置良好，未发现问题。";
  }

  const parts: string[] = [];

  if (errorCount > 0) {
    parts.push(`${errorCount} 个错误`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} 个警告`);
  }
  if (infoCount > 0) {
    parts.push(`${infoCount} 个建议`);
  }

  let summary = `诊断发现 ${parts.join("、")}。`;

  if (score >= 90) {
    summary += " 工作流整体状况良好。";
  } else if (score >= 70) {
    summary += " 建议修复警告项以提升工作流质量。";
  } else if (score >= 50) {
    summary += " 请优先处理错误项。";
  } else {
    summary += " 工作流存在较多问题，请仔细检查。";
  }

  return summary;
}
