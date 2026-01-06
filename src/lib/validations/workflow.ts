/**
 * Zod validation schemas for workflow-related API endpoints
 *
 * These schemas provide runtime validation and TypeScript type inference
 * for workflow create, list, and execute operations.
 * 
 * Supported node types: INPUT, PROCESS, LOGIC
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
  modality: z
    .enum([
      "text",
      "code",
      "image-gen",
      "video-gen",
      "audio-transcription",
      "audio-tts",
      "embedding",
      "ocr",
    ])
    .optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
});

// ============================================
// Node Specific Schemas (INPUT, PROCESS, LOGIC only)
// ============================================

// INPUT Node
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

const fieldTypeMapping: Record<string, (typeof validFieldTypes)[number]> = {
  textarea: "text",
  file: "pdf",
  document: "pdf",
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
      if (!val) return "text";
      const mapped = fieldTypeMapping[val];
      return mapped || "text";
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
  config: z
    .object({
      fields: z.array(inputFieldSchema).optional().default([]),
    })
    .catchall(z.unknown()),
});

// PROCESS Node
const knowledgeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  content: z.string(),
});

const uiToolConfigSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});

const processNodeSchema = baseNodeSchema.extend({
  type: z.literal("PROCESS"),
  config: nodeAIConfigSchema
    .extend({
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
      tools: z.array(uiToolConfigSchema).optional(),
      toolChoice: z.enum(["auto", "none", "required"]).optional(),
      maxToolCallRounds: z.number().optional(),
      expectedOutputType: z
        .enum([
          "text",
          "json",
          "html",
          "csv",
          "word",
          "pdf",
          "excel",
          "ppt",
          "image",
          "audio",
          "video",
        ])
        .optional(),
      imageSize: z.string().optional(),
      imageCount: z.number().optional(),
      imageQuality: z.enum(["standard", "hd"]).optional(),
      imageStyle: z.enum(["vivid", "natural"]).optional(),
      negativePrompt: z.string().optional(),
      videoDuration: z.number().optional(),
      videoAspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
      videoResolution: z.enum(["720p", "1080p", "4k"]).optional(),
      referenceImage: z.string().optional(),
      ttsVoice: z.string().optional(),
      ttsSpeed: z.number().optional(),
      ttsFormat: z.enum(["mp3", "wav", "opus"]).optional(),
      transcriptionLanguage: z.string().optional(),
      transcriptionFormat: z.enum(["json", "text", "srt", "vtt"]).optional(),
      embeddingDimensions: z.number().optional(),
    })
    .catchall(z.unknown()),
});

// LOGIC Node
const logicBranchSchema = z.object({
  id: z.string(),
  label: z.string(),
  targetNodeId: z.string().optional(),
});

const logicConditionSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  expression: z.string(),
  targetNodeId: z.string().optional(),
});

const logicNodeSchema = baseNodeSchema.extend({
  type: z.literal("LOGIC"),
  config: z
    .object({
      mode: z.enum(["condition", "split", "merge", "switch"]).optional(),
      conditions: z.array(logicConditionSchema).optional(),
      fallbackTargetNodeId: z.string().optional(),
      branches: z.array(logicBranchSchema).optional(),
      mergeFromNodeIds: z.array(z.string()).optional(),
      mergeStrategy: z.enum(["all", "first", "custom"]).optional(),
      switchInput: z.string().optional(),
    })
    .catchall(z.unknown()),
});

// ============================================
// Flexible Node Schema (accepts any node type for backward compatibility)
// ============================================

const flexibleNodeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    position: nodePositionSchema,
    config: z.record(z.string(), z.unknown()).optional().default({}),
    comment: z.string().optional(),
  })
  .catchall(z.unknown());

// Use flexible schema for API validation
const nodeSchema = flexibleNodeSchema;

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
    .catchall(z.unknown()),
});

/**
 * Schema for listing workflows with pagination and filtering
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
    .catchall(z.unknown())
    .optional(),
  isActive: z.boolean().optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
  expectedVersion: z.number().optional(),
  forceOverwrite: z.boolean().optional(),
});

/**
 * Schema for executing a workflow
 */
export const workflowExecuteSchema = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  timeout: z.number().int().min(1).max(3600).optional(),
  async: z.boolean().optional(),
  mode: z.enum(["production", "draft"]).optional(),
});

// Inferred TypeScript types
export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;
export type WorkflowUpdateInput = z.infer<typeof workflowUpdateSchema>;
export type WorkflowListInput = z.infer<typeof workflowListSchema>;
export type WorkflowExecuteInput = z.infer<typeof workflowExecuteSchema>;

// Export node schemas for testing
export {
  inputNodeSchema,
  processNodeSchema,
  logicNodeSchema,
  flexibleNodeSchema,
  nodeSchema,
  edgeSchema,
};
