/**
 * 节点操作工具函数
 * 提供节点增删改查的辅助函数
 */

import type { NodeConfig } from "@/types/workflow";
import type { NodeAction } from "@/stores/ai-assistant-store";

// 节点类型默认配置
export const NODE_DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  TRIGGER: {
    triggerType: "MANUAL",
    enabled: true,
  },
  INPUT: {
    fields: [],
  },
  PROCESS: {
    systemPrompt: "",
    userPrompt: "",
    temperature: 0.7,
    maxTokens: 2048,
  },
  CODE: {
    prompt: "",
    language: "javascript",
    code: "",
  },
  OUTPUT: {
    prompt: "",
    format: "text",
    templateName: "",
  },
  CONDITION: {
    conditions: [],
    evaluationMode: "all",
  },
  LOOP: {
    loopType: "FOR",
    maxIterations: 100,
  },
  HTTP: {
    method: "GET",
    url: "",
    headers: {},
    timeout: 30000,
  },
  MERGE: {
    mergeStrategy: "all",
    errorStrategy: "fail_fast",
  },
  NOTIFICATION: {
    platform: "feishu",
    webhookUrl: "",
    messageType: "text",
    content: "",
  },
  IMAGE_GEN: {
    prompt: "",
    size: "1024x1024",
    quality: "standard",
    n: 1,
  },
  SWITCH: {
    switchVariable: "",
    cases: [],
    matchType: "exact",
  },
};

// 获取节点类型的默认配置
export function getDefaultConfig(type: string): Record<string, unknown> {
  const normalizedType = type.toUpperCase();
  return NODE_DEFAULT_CONFIGS[normalizedType] || {};
}

// 生成唯一节点ID
export function generateNodeId(type: string): string {
  return `${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
}

// 验证节点操作
export function validateNodeAction(action: NodeAction): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  switch (action.action) {
    case "add":
      if (!action.nodeType) {
        errors.push("添加操作缺少节点类型 (nodeType)");
      }
      if (!action.nodeName) {
        errors.push("添加操作缺少节点名称 (nodeName)");
      }
      break;

    case "update":
      if (!action.nodeId) {
        errors.push("更新操作缺少节点ID (nodeId)");
      }
      if (!action.config || Object.keys(action.config).length === 0) {
        errors.push("更新操作缺少配置内容 (config)");
      }
      break;

    case "delete":
      if (!action.nodeId) {
        errors.push("删除操作缺少节点ID (nodeId)");
      }
      break;

    case "connect":
      if (!action.source) {
        errors.push("连接操作缺少源节点 (source)");
      }
      if (!action.target) {
        errors.push("连接操作缺少目标节点 (target)");
      }
      break;

    default:
      errors.push(`不支持的操作类型: ${action.action}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// 批量验证节点操作
export function validateNodeActions(actions: NodeAction[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查是否有重复的删除操作
  const deleteIds = actions
    .filter((a) => a.action === "delete" && a.nodeId)
    .map((a) => a.nodeId);
  const uniqueDeleteIds = new Set(deleteIds);
  if (deleteIds.length > uniqueDeleteIds.size) {
    warnings.push("存在重复的删除操作");
  }

  // 检查是否同时添加和删除同一节点
  const addNodeNames = new Set(
    actions
      .filter((a) => a.action === "add")
      .map((a) => a.nodeName)
  );

  // 验证每个操作
  actions.forEach((action, index) => {
    const result = validateNodeAction(action);
    if (!result.valid) {
      result.errors.forEach((err) => {
        errors.push(`操作 ${index + 1}: ${err}`);
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// 合并节点配置
export function mergeNodeConfig(
  currentConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...currentConfig };

  Object.entries(newConfig).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      // 如果新值是 null/undefined，保留原值
      return;
    }

    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof currentConfig[key] === "object" &&
      !Array.isArray(currentConfig[key])
    ) {
      // 深度合并对象
      merged[key] = mergeNodeConfig(
        currentConfig[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      // 直接替换
      merged[key] = value;
    }
  });

  return merged;
}

// 计算新节点的位置
export function calculateNodePosition(
  existingNodes: Array<{ position: { x: number; y: number } }>,
  preferredPosition?: { x: number; y: number }
): { x: number; y: number } {
  if (preferredPosition) {
    return preferredPosition;
  }

  if (existingNodes.length === 0) {
    return { x: 100, y: 200 };
  }

  // 找到最右边的节点
  const rightmostNode = existingNodes.reduce((rightmost, node) => {
    return node.position.x > rightmost.position.x ? node : rightmost;
  });

  // 新节点放在最右边节点的右边
  return {
    x: rightmostNode.position.x + 300,
    y: rightmostNode.position.y,
  };
}

// 工具配置验证
export function validateToolConfig(
  tool: {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    config?: Record<string, unknown>;
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!tool.id) {
    errors.push("工具缺少ID");
  }
  if (!tool.name) {
    errors.push("工具缺少名称");
  }
  if (!tool.type) {
    errors.push("工具缺少类型");
  }

  if (tool.type === "HTTP" || tool.type === "http") {
    const config = tool.config as { url?: string; method?: string } | undefined;
    if (!config?.url) {
      errors.push(`HTTP工具 "${tool.name}" 缺少URL配置`);
    }
    if (!config?.method) {
      errors.push(`HTTP工具 "${tool.name}" 缺少请求方法`);
    }
  }

  if (tool.type === "CODE" || tool.type === "code") {
    const config = tool.config as { code?: string; language?: string } | undefined;
    if (!config?.code) {
      errors.push(`代码工具 "${tool.name}" 缺少代码内容`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// 生成操作摘要
export function generateActionSummary(actions: NodeAction[]): string {
  const summary: string[] = [];

  const addCount = actions.filter((a) => a.action === "add").length;
  const updateCount = actions.filter((a) => a.action === "update").length;
  const deleteCount = actions.filter((a) => a.action === "delete").length;
  const connectCount = actions.filter((a) => a.action === "connect").length;

  if (addCount > 0) {
    summary.push(`添加 ${addCount} 个节点`);
  }
  if (updateCount > 0) {
    summary.push(`更新 ${updateCount} 个节点`);
  }
  if (deleteCount > 0) {
    summary.push(`删除 ${deleteCount} 个节点`);
  }
  if (connectCount > 0) {
    summary.push(`创建 ${connectCount} 个连接`);
  }

  return summary.join("，") || "无操作";
}
