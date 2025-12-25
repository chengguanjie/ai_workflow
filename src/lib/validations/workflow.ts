/**
 * Zod validation schemas for workflow-related API endpoints
 *
 * These schemas provide runtime validation and TypeScript type inference
 * for workflow create, list, and execute operations.
 */
import { z } from "zod";

// ============================================
// Shared Schemas
// ============================================

const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const baseNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: nodePositionSchema,
  comment: z.string().optional(),
});

const nodeAIConfigSchema = z.object({
  aiConfigId: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
});

// ============================================
// Node Specific Schemas
// ============================================

// TRIGGER
const triggerNodeSchema = baseNodeSchema.extend({
  type: z.literal("TRIGGER"),
  config: z.object({
    triggerType: z.enum(["MANUAL", "WEBHOOK", "SCHEDULE"]).default("MANUAL"),
    enabled: z.boolean().optional(),
    cronExpression: z.string().optional(),
    timezone: z.string().optional(),
    inputTemplate: z.record(z.string(), z.unknown()).optional(),
    retryOnFail: z.boolean().optional(),
    maxRetries: z.number().optional(),
    triggerId: z.string().optional(),
  }),
});

// INPUT
// 有效的 fieldType 值
const validFieldTypes = [
  "text",
  "image",
  "pdf",
  "word",
  "excel",
  "audio",
  "video",
  "select",
  "multiselect",
] as const;

// fieldType 映射表：将无效值转换为有效值
const fieldTypeMapping: Record<string, (typeof validFieldTypes)[number]> = {
  textarea: "text", // textarea -> text
  file: "pdf", // file -> pdf (通用文件)
  document: "pdf", // document -> pdf
  text: "text",
  image: "image",
  pdf: "pdf",
  word: "word",
  excel: "excel",
  audio: "audio",
  video: "video",
  select: "select",
  multiselect: "multiselect",
};

const inputFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
  fieldType: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return "text"; // 默认值
      const mapped = fieldTypeMapping[val];
      return mapped || "text"; // 未知类型也转为 text
    }),
  required: z.boolean().optional(),
  description: z.string().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
  placeholder: z.string().optional(),
});

const inputNodeSchema = baseNodeSchema.extend({
  type: z.literal("INPUT"),
  config: z.object({
    fields: z.array(inputFieldSchema),
  }),
});

// PROCESS
const knowledgeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  content: z.string(),
});

const processNodeSchema = baseNodeSchema.extend({
  type: z.literal("PROCESS"),
  config: nodeAIConfigSchema.extend({
    knowledgeItems: z.array(knowledgeItemSchema).optional(),
    knowledgeBaseId: z.string().optional(),
    ragConfig: z
      .object({
        topK: z.number().optional(),
        threshold: z.number().optional(),
        maxContextTokens: z.number().optional(),
      })
      .optional(),
    systemPrompt: z.string().optional(),
    userPrompt: z.string().optional(),
    enableToolCalling: z.boolean().optional(),
    enabledTools: z.array(z.string()).optional(),
    toolChoice: z.enum(["auto", "none", "required"]).optional(),
    maxToolCallRounds: z.number().optional(),
  }),
});

// CODE
const codeNodeSchema = baseNodeSchema.extend({
  type: z.literal("CODE"),
  config: nodeAIConfigSchema.extend({
    prompt: z.string().optional(),
    language: z
      .enum(["javascript", "typescript", "python", "sql", "other"])
      .optional(),
    code: z.string().optional(),
    timeout: z.number().optional(),
    maxMemory: z.number().optional(),
    maxOutputSize: z.number().optional(),
  }),
});

// OUTPUT
const outputNodeSchema = baseNodeSchema.extend({
  type: z.literal("OUTPUT"),
  config: nodeAIConfigSchema.extend({
    prompt: z.string().optional(),
    format: z
      .enum([
        "text",
        "json",
        "markdown",
        "html",
        "word",
        "excel",
        "pdf",
        "image",
        "audio",
        "video",
      ])
      .optional(),
    templateName: z.string().optional(),
    fileName: z.string().optional(),
    downloadUrl: z.string().optional(),
  }),
});

// DATA, IMAGE, VIDEO, AUDIO (File Nodes)
const importedFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  size: z.number().optional(),
  type: z.string().optional(),
});

const fileNodeConfigSchema = z.object({
  files: z.array(importedFileSchema).optional(),
  prompt: z.string().optional(),
});

const dataNodeSchema = baseNodeSchema.extend({
  type: z.literal("DATA"),
  config: fileNodeConfigSchema.extend({
    parseOptions: z
      .object({
        headerRow: z.number().optional(),
        skipEmptyRows: z.boolean().optional(),
        dateFormat: z.string().optional(),
      })
      .optional(),
  }),
});

const imageNodeSchema = baseNodeSchema.extend({
  type: z.literal("IMAGE"),
  config: fileNodeConfigSchema.extend({
    processingOptions: z
      .object({
        maxWidth: z.number().optional(),
        maxHeight: z.number().optional(),
        outputFormat: z.enum(["jpeg", "png", "webp"]).optional(),
        quality: z.number().optional(),
      })
      .optional(),
  }),
});

const videoNodeSchema = baseNodeSchema.extend({
  type: z.literal("VIDEO"),
  config: fileNodeConfigSchema.extend({
    processingOptions: z
      .object({
        extractFrames: z.boolean().optional(),
        frameInterval: z.number().optional(),
        generateThumbnail: z.boolean().optional(),
      })
      .optional(),
  }),
});

const audioNodeSchema = baseNodeSchema.extend({
  type: z.literal("AUDIO"),
  config: fileNodeConfigSchema.extend({
    processingOptions: z
      .object({
        transcribe: z.boolean().optional(),
        language: z.string().optional(),
      })
      .optional(),
  }),
});

// CONDITION
const conditionSchema = z.object({
  variable: z.string(),
  operator: z.enum([
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "greaterOrEqual",
    "lessOrEqual",
    "contains",
    "notContains",
    "startsWith",
    "endsWith",
    "isEmpty",
    "isNotEmpty",
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  logic: z.enum(["AND", "OR"]).optional(),
});

const conditionNodeSchema = baseNodeSchema.extend({
  type: z.literal("CONDITION"),
  config: z.object({
    conditions: z.array(conditionSchema).default([]),
    evaluationMode: z.enum(["all", "any"]).default("all").optional(),
  }),
});

// LOOP
const loopNodeSchema = baseNodeSchema.extend({
  type: z.literal("LOOP"),
  config: z.object({
    loopType: z.enum(["FOR", "WHILE"]).default("FOR"),
    forConfig: z
      .object({
        arrayVariable: z.string(),
        itemName: z.string(),
        indexName: z.string().optional(),
      })
      .optional(),
    whileConfig: z
      .object({
        condition: conditionSchema,
        maxIterations: z.number(),
      })
      .optional(),
    maxIterations: z.number().optional(),
    continueOnError: z.boolean().optional(),
  }),
});

// SWITCH
const switchCaseSchema = z
  .object({
    id: z.string().optional(),
    label: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    isDefault: z.boolean().optional(),
  })
  .transform((val) => ({
    ...val,
    id: val.id ?? Math.random().toString(36).slice(2, 8),
  }));

const switchNodeSchema = baseNodeSchema.extend({
  type: z.literal("SWITCH"),
  config: z.object({
    switchVariable: z.string().default(""),
    cases: z.array(switchCaseSchema).default([]),
    matchType: z.enum(["exact", "contains", "regex", "range"]).optional(),
    caseSensitive: z.boolean().optional(),
    includeDefault: z.boolean().optional(),
  }),
});

// MERGE
const mergeNodeSchema = baseNodeSchema.extend({
  type: z.literal("MERGE"),
  config: z.object({
    mergeStrategy: z.enum(["all", "any", "race"]).default("all"),
    errorStrategy: z.enum(["fail_fast", "continue", "collect"]).optional(),
    timeout: z.number().optional(),
    outputMode: z.enum(["merge", "array", "first"]).optional(),
  }),
});

// HTTP
const httpNodeSchema = baseNodeSchema.extend({
  type: z.literal("HTTP"),
  config: z.object({
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
    url: z.string().default(""),
    headers: z.record(z.string(), z.string()).optional(),
    queryParams: z.record(z.string(), z.string()).optional(),
    body: z
      .object({
        type: z.enum(["json", "form", "text", "file", "none"]),
        content: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .optional(),
      })
      .optional(),
    timeout: z.number().optional(),
    retry: z
      .object({
        maxRetries: z.number(),
        retryDelay: z.number(),
        retryOnStatus: z.array(z.number()).optional(),
      })
      .optional(),
  }),
});

// IMAGE_GEN
const imageGenNodeSchema = baseNodeSchema.extend({
  type: z.literal("IMAGE_GEN"),
  config: nodeAIConfigSchema.extend({
    prompt: z.string().optional(),
    negativePrompt: z.string().optional(),
    provider: z
      .enum(["OPENAI", "STABILITYAI", "ALIYUN_TONGYI", "SHENSUAN"])
      .optional(),
    imageModel: z.string().optional(),
    size: z
      .enum(["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"])
      .optional(),
    quality: z.enum(["standard", "hd"]).optional(),
    n: z.number().optional(),
    style: z.string().optional(),
  }),
});

// NOTIFICATION
const notificationNodeSchema = baseNodeSchema.extend({
  type: z.literal("NOTIFICATION"),
  config: z.object({
    platform: z.enum(["feishu", "dingtalk", "wecom"]).default("feishu"),
    webhookUrl: z.string().default(""),
    messageType: z.enum(["text", "markdown", "card"]).default("text"),
    content: z.string().default(""),
    title: z.string().optional(),
    atMobiles: z.array(z.string()).optional(),
    atAll: z.boolean().optional(),
  }),
});

// GROUP
const groupNodeSchema = baseNodeSchema.extend({
  type: z.literal("GROUP"),
  config: z.object({
    childNodeIds: z.array(z.string()).default([]),
    label: z.string().optional(),
    collapsed: z.boolean().optional(),
    childRelativePositions: z.record(z.string(), nodePositionSchema).optional(),
  }),
});

// APPROVAL
const approverConfigSchema = z.object({
  type: z.enum(["USER", "ROLE", "DEPARTMENT"]),
  targetId: z.string(),
  displayName: z.string().optional(),
});

const approvalCustomFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "SELECT", "CHECKBOX", "DATE"]),
  required: z.boolean().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  placeholder: z.string().optional(),
});

const approvalNodeSchema = baseNodeSchema.extend({
  type: z.literal("APPROVAL"),
  config: z.object({
    title: z.string(),
    description: z.string().optional(),
    approvers: z.array(approverConfigSchema),
    timeout: z.number(),
    timeoutAction: z.enum(["APPROVE", "REJECT", "ESCALATE"]),
    notificationChannels: z.array(z.enum(["EMAIL", "IN_APP", "WEBHOOK"])),
    requiredApprovals: z.number(),
    allowComments: z.boolean(),
    customFields: z.array(approvalCustomFieldSchema),
  }),
});

// Union of all node types
const nodeSchema = z.discriminatedUnion("type", [
  triggerNodeSchema,
  inputNodeSchema,
  processNodeSchema,
  codeNodeSchema,
  outputNodeSchema,
  dataNodeSchema,
  imageNodeSchema,
  videoNodeSchema,
  audioNodeSchema,
  conditionNodeSchema,
  loopNodeSchema,
  switchNodeSchema,
  httpNodeSchema,
  mergeNodeSchema,
  imageGenNodeSchema,
  notificationNodeSchema,
  groupNodeSchema,
  approvalNodeSchema,
]);

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

// ============================================
// API Schemas
// ============================================

/**
 * Schema for creating a new workflow
 * Validates name, optional description, and workflow configuration
 */
export const workflowCreateSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(100, "名称不能超过100字符"),
  description: z.string().max(500).optional(),
  config: z
    .object({
      nodes: z.array(nodeSchema),
      edges: z.array(edgeSchema),
      globalVariables: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
      manual: z.string().optional(),
      version: z.number().optional(),
    })
    .passthrough(),
});

/**
 * Schema for listing workflows with pagination and filtering
 * Uses z.coerce for query parameter parsing
 */
export const workflowListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  creatorId: z.string().optional(),
  departmentId: z.string().optional(),
});

/**
 * Schema for updating an existing workflow
 * All fields are optional since partial updates are allowed
 */
export const workflowUpdateSchema = z.object({
  name: z
    .string()
    .min(1, "名称不能为空")
    .max(100, "名称不能超过100字符")
    .optional(),
  description: z.string().max(500).optional(),
  config: z
    .object({
      nodes: z.array(nodeSchema),
      edges: z.array(edgeSchema),
      globalVariables: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
      manual: z.string().optional(),
      version: z.number().optional(),
    })
    .passthrough()
    .optional(),
  isActive: z.boolean().optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
  expectedVersion: z.number().optional(),
  forceOverwrite: z.boolean().optional(),
});

/**
 * Schema for executing a workflow
 * Validates optional input data, timeout configuration, async mode, and execution mode
 */
export const workflowExecuteSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  timeout: z.number().int().min(1).max(3600).optional(),
  async: z.boolean().optional(),
  mode: z.enum(["production", "draft"]).optional(),
});

// Inferred TypeScript types from Zod schemas
export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;
export type WorkflowUpdateInput = z.infer<typeof workflowUpdateSchema>;
export type WorkflowListInput = z.infer<typeof workflowListSchema>;
export type WorkflowExecuteInput = z.infer<typeof workflowExecuteSchema>;
