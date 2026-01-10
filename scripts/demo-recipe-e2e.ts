/**
 * Demo：AI 配方生成工作流（含知识库全链路验证）
 *
 * 运行：
 *   pnpm demo:recipe
 *
 * 输出：
 *   tmp/demo-recipe/report.json
 */

process.env.AI_MOCK ??= 'true'
process.env.KNOWLEDGE_EMBEDDING_MOCK ??= 'true'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hash } from 'bcryptjs'
import { prisma, checkDatabaseHealth } from '@/lib/db'
import { encryptApiKey } from '@/lib/crypto'
import { processDocument } from '@/lib/knowledge'
import { WorkflowEngine } from '@/lib/workflow/engine'
import type { WorkflowConfig } from '@/types/workflow'

const OUT_DIR = join(process.cwd(), 'tmp', 'demo-recipe')

const DEMO = {
  orgName: 'Demo - AI Recipe Workflow',
  userEmail: 'demo.recipe@local',
  userName: 'Demo Recipe Runner',
  knowledgeBaseName: 'Demo Recipe KB',
  workflowName: 'AI 配方生成（Demo）',
  mockApiKeyName: 'Demo Mock OpenAI',
  embeddingModel: 'mock-embedding-256',
  chatModel: 'mock-recipe-v1',
} as const

function nowIso() {
  return new Date().toISOString()
}

async function ensureOrgAndUser(): Promise<{ organizationId: string; userId: string }> {
  const org =
    (await prisma.organization.findFirst({ where: { name: DEMO.orgName } })) ||
    (await prisma.organization.create({
      data: {
        name: DEMO.orgName,
        securitySettings: {},
        description: `Auto-created by demo script at ${nowIso()}`,
      },
    }))

  const user =
    (await prisma.user.findUnique({ where: { email: DEMO.userEmail } })) ||
    (await prisma.user.create({
      data: {
        email: DEMO.userEmail,
        name: DEMO.userName,
        passwordHash: await hash('DemoPassword123', 10),
        role: 'OWNER',
        organizationId: org.id,
      },
    }))

  return { organizationId: org.id, userId: user.id }
}

async function ensureDefaultMockApiKey(organizationId: string): Promise<void> {
  // If the org already has a default, keep it (avoid disrupting real usage).
  const existingDefault = await prisma.apiKey.findFirst({
    where: { organizationId, isDefault: true, isActive: true },
  })
  if (existingDefault) return

  const encrypted = encryptApiKey('mock')
  await prisma.apiKey.create({
    data: {
      name: DEMO.mockApiKeyName,
      provider: 'OPENAI',
      keyEncrypted: encrypted,
      keyMasked: 'mock-***',
      isActive: true,
      isDefault: true,
      baseUrl: 'mock',
      defaultModel: DEMO.chatModel,
      models: {},
      defaultModels: {},
      organizationId,
    },
  })
}

async function ensureKnowledgeBase(organizationId: string, userId: string): Promise<string> {
  const kb =
    (await prisma.knowledgeBase.findFirst({
      where: { organizationId, name: DEMO.knowledgeBaseName },
    })) ||
    (await prisma.knowledgeBase.create({
      data: {
        name: DEMO.knowledgeBaseName,
        description: 'Demo KB for recipe generation (simulated docs).',
        embeddingProvider: 'OPENAI',
        embeddingModel: DEMO.embeddingModel,
        chunkSize: 800,
        chunkOverlap: 80,
        vectorStoreType: 'MEMORY',
        vectorStoreConfig: {},
        organizationId,
        creatorId: userId,
      },
    }))

  return kb.id
}

async function upsertAndProcessDocs(kbId: string, userId: string): Promise<{ docIds: string[]; chunkCount: number }> {
  const kbDir = join(process.cwd(), 'docs', 'demo', 'recipe-kb')
  const files = [
    '01-配方设计原则.md',
    '02-过敏原与替代方案.md',
    '03-基础工艺与口感控制.md',
    '04-输出格式规范.md',
  ]

  const docIds: string[] = []
  for (const fileName of files) {
    const filePath = join(kbDir, fileName)
    const fileBuffer = await readFile(filePath)

    const existing = await prisma.knowledgeDocument.findFirst({
      where: { knowledgeBaseId: kbId, fileName },
      select: { id: true, status: true },
    })

    const documentId =
      existing?.id ||
      (
        await prisma.knowledgeDocument.create({
          data: {
            fileName,
            fileType: 'md',
            fileSize: fileBuffer.length,
            status: 'PENDING',
            errorMessage: null,
            chunkCount: 0,
            metadata: {},
            knowledgeBaseId: kbId,
            uploadedById: userId,
          },
        })
      ).id

    // Always re-process to make the demo deterministic (keep doc row stable; rebuild chunks).
    await prisma.documentChunk.deleteMany({ where: { documentId } })
    await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: 'PENDING', errorMessage: null, chunkCount: 0 },
    })

    const result = await processDocument({
      documentId,
      knowledgeBaseId: kbId,
      fileName,
      fileType: 'md',
      fileBuffer,
      chunkSize: 800,
      chunkOverlap: 80,
      embeddingProvider: 'OPENAI',
      embeddingModel: DEMO.embeddingModel,
    })

    if (!result.success) {
      throw new Error(`知识库文档处理失败: ${fileName}: ${result.error || 'unknown error'}`)
    }

    docIds.push(documentId)
  }

  const chunkCount = await prisma.documentChunk.count({
    where: { document: { knowledgeBaseId: kbId, status: 'COMPLETED' } },
  })

  return { docIds, chunkCount }
}

function buildWorkflowConfig(kbId: string): WorkflowConfig {
  return {
    version: 1,
    settings: {
      timeout: 120,
      maxRetries: 0,
      logLevel: 'debug',
    },
    nodes: [
      {
        id: 'input_1',
        type: 'INPUT',
        name: '用户需求',
        position: { x: 0, y: 0 },
        config: {
          fields: [
            { id: 'f1', name: '需求描述', value: '', fieldType: 'text', required: true, height: 120, placeholder: '例如：低糖高蛋白、2人份、川味、20分钟…' },
            { id: 'f2', name: '份量', value: '2', fieldType: 'text', required: false, placeholder: '例如：2人份' },
            { id: 'f3', name: '偏好/忌口', value: '低糖;高蛋白', fieldType: 'text', required: false, placeholder: '例如：低糖;无麸质;纯素' },
            { id: 'f4', name: '过敏原', value: '', fieldType: 'text', required: false, placeholder: '例如：花生;乳制品' },
            { id: 'f5', name: '烹饪时长(分钟)', value: '20', fieldType: 'text', required: false, placeholder: '例如：20' },
          ],
        },
      },
      {
        id: 'process_gen',
        type: 'PROCESS',
        name: '配方生成',
        position: { x: 360, y: 0 },
        config: {
          model: DEMO.chatModel,
          temperature: 0.2,
          expectedOutputType: 'json',
          knowledgeBaseId: kbId,
          ragConfig: { topK: 5, threshold: 0, maxContextTokens: 1200 },
          systemPrompt:
            '你是世界级食品配方工程师与营养策略专家。你的任务是根据用户需求生成【可执行的食品配方】。\n' +
            '要求：\n' +
            '- 必须遵守用户的忌口/过敏原/时间限制。\n' +
            '- 必须给出克/毫升级配比，步骤要可执行。\n' +
            '- 必须输出【单个 JSON 对象】，只输出 JSON，不要 Markdown/解释文字。\n' +
            '- JSON 字段参考：recipeName, servings, cuisine, constraints, ingredients, steps, nutritionEstimate, rationale, qualityChecklist。\n' +
            '- rationale.knowledgeSources 必须列出你真正用到的知识库来源文档名。\n',
          userPrompt:
            '用户需求描述：{{用户需求.需求描述}}\n' +
            '份量：{{用户需求.份量}}\n' +
            '偏好/忌口：{{用户需求.偏好/忌口}}\n' +
            '过敏原：{{用户需求.过敏原}}\n' +
            '烹饪时长(分钟)：{{用户需求.烹饪时长(分钟)}}\n',
        },
      },
      {
        id: 'process_format',
        type: 'PROCESS',
        name: '呈现优化',
        position: { x: 720, y: 0 },
        config: {
          model: DEMO.chatModel,
          temperature: 0.2,
          systemPrompt:
            '你是世界级产品体验设计师与食品编辑。将输入 JSON 配方渲染为清晰的 Markdown：\n' +
            '- 标题、摘要、食材表格、步骤列表、购物清单、营养估算。\n' +
            '- 末尾输出“来源”列表（来自 JSON.rationale.knowledgeSources）。\n' +
            '- 输出 Markdown（可以包含表格）。\n',
          userPrompt: '{{配方生成.result}}',
        },
      },
      {
        id: 'output_1',
        type: 'OUTPUT',
        name: '输出',
        position: { x: 1080, y: 0 },
        config: {
          format: 'markdown',
          fileName: 'demo-recipe.md',
          prompt: '{{呈现优化.result}}',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'input_1', target: 'process_gen' },
      { id: 'e2', source: 'process_gen', target: 'process_format' },
      { id: 'e3', source: 'process_format', target: 'output_1' },
    ],
    manual:
      '这是一个用于验证“知识库 RAG 全链路”的 Demo 工作流：\n' +
      '1) 用户输入需求\n' +
      '2) 配方生成节点从知识库检索并输出 JSON\n' +
      '3) 呈现优化节点将 JSON 渲染为 Markdown\n' +
      '4) 输出节点生成可下载文件\n',
  }
}

async function ensureWorkflow(organizationId: string, userId: string, config: WorkflowConfig): Promise<string> {
  const existing = await prisma.workflow.findFirst({
    where: { organizationId, name: DEMO.workflowName, deletedAt: null },
    select: { id: true },
  })

  if (existing) {
    await prisma.workflow.update({
      where: { id: existing.id },
      data: {
        config: JSON.parse(JSON.stringify(config)),
        draftConfig: JSON.parse(JSON.stringify(config)),
        publishStatus: 'DRAFT',
        updatedAt: new Date(),
      },
    })
    return existing.id
  }

  const wf = await prisma.workflow.create({
    data: {
      name: DEMO.workflowName,
      description: 'Demo workflow: recipe generation with KB RAG + trace report.',
      tags: [],
      config: JSON.parse(JSON.stringify(config)),
      draftConfig: JSON.parse(JSON.stringify(config)),
      organizationId,
      creatorId: userId,
      publishStatus: 'DRAFT',
    },
  })
  return wf.id
}

function extractRagDiagnosticsFromExecutionLogs(logs: Array<{ nodeName: string; input: any }>): {
  ragDetected: boolean
  ragSources: string[]
} {
  const processLog = logs.find((l) => l.nodeName === '配方生成')
  const systemPrompt: string = processLog?.input?.runtime?.systemPrompt || ''
  const ragDetected = systemPrompt.includes('## 知识库检索结果') && /\[来源:\s*[^\]]+\]/.test(systemPrompt)
  const ragSources = Array.from(systemPrompt.matchAll(/\[来源:\s*([^\]]+)\]/g))
    .map((m) => String(m[1] || '').trim())
    .filter(Boolean)
  return { ragDetected, ragSources: Array.from(new Set(ragSources)).slice(0, 20) }
}

function extractRecipeKnowledgeSources(executionLogs: any[]): {
  recipeJsonValid: boolean
  knowledgeSources: string[]
} {
  const gen = executionLogs.find((l) => l.nodeName === '配方生成')
  const resultText: string =
    gen?.output?.result || gen?.output?.['结果'] || gen?.output?.['结果']?.result || ''
  if (!resultText || typeof resultText !== 'string') return { recipeJsonValid: false, knowledgeSources: [] }

  try {
    const parsed = JSON.parse(resultText)
    const sources = parsed?.rationale?.knowledgeSources
    if (!Array.isArray(sources)) return { recipeJsonValid: true, knowledgeSources: [] }
    return {
      recipeJsonValid: true,
      knowledgeSources: sources.map(String).filter(Boolean).slice(0, 20),
    }
  } catch {
    return { recipeJsonValid: false, knowledgeSources: [] }
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // Make the demo deterministic and self-contained (no Redis / no external vector store).
  process.env.REDIS_URL = ''
  process.env.REDIS_HOST = ''
  process.env.REDIS_PORT = ''
  process.env.NEXT_PUBLIC_SUPABASE_URL = ''
  process.env.SUPABASE_SERVICE_ROLE_KEY = ''
  process.env.PGVECTOR_DATABASE_URL = ''

  const dbHealth = await checkDatabaseHealth()
  if (dbHealth.status !== 'healthy') {
    throw new Error(`数据库不可用: ${dbHealth.error || 'unknown'} (latency=${dbHealth.latency}ms)`)
  }

  const { organizationId, userId } = await ensureOrgAndUser()
  await ensureDefaultMockApiKey(organizationId)

  const knowledgeBaseId = await ensureKnowledgeBase(organizationId, userId)
  const { docIds, chunkCount } = await upsertAndProcessDocs(knowledgeBaseId, userId)

  const workflowConfig = buildWorkflowConfig(knowledgeBaseId)
  const workflowId = await ensureWorkflow(organizationId, userId, workflowConfig)

  const engine = new WorkflowEngine(workflowId, organizationId, userId, workflowConfig)

  const executionResult = await engine.execute({
    '需求描述': '我想要一个低糖高蛋白的家常快手餐，2人份，偏川味，20分钟内完成。不要花生和乳制品。',
    '份量': '2人份',
    '偏好/忌口': '低糖;高蛋白',
    '过敏原': '花生;乳制品',
    '烹饪时长(分钟)': '20',
  })

  const executionId = executionResult.executionId

  const executionLogs = await prisma.executionLog.findMany({
    where: { executionId },
    orderBy: { createdAt: 'asc' },
    select: {
      nodeId: true,
      nodeName: true,
      nodeType: true,
      status: true,
      input: true,
      output: true,
      error: true,
      duration: true,
      promptTokens: true,
      completionTokens: true,
      aiModel: true,
    },
  })

  const outputs = await prisma.outputFile.findMany({
    where: { executionId, organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true, format: true, url: true, size: true, nodeId: true },
  })

  const ragDiag = extractRagDiagnosticsFromExecutionLogs(executionLogs as any)
  const recipeSources = extractRecipeKnowledgeSources(executionLogs as any)

  const report = {
    generatedAt: nowIso(),
    env: {
      AI_MOCK: process.env.AI_MOCK,
      KNOWLEDGE_EMBEDDING_MOCK: process.env.KNOWLEDGE_EMBEDDING_MOCK,
    },
    ids: {
      organizationId,
      userId,
      knowledgeBaseId,
      workflowId,
      executionId,
      docIds,
    },
    diagnostics: {
      kbChunkCount: chunkCount,
      ragDetected: ragDiag.ragDetected,
      ragSources: ragDiag.ragSources,
      recipeJsonValid: recipeSources.recipeJsonValid,
      recipeKnowledgeSources: recipeSources.knowledgeSources,
      executionStatus: executionResult.status,
      totalTokens: executionResult.totalTokens,
      outputFiles: outputs,
      nodeSummary: executionLogs.map((l) => ({
        nodeName: l.nodeName,
        nodeType: l.nodeType,
        status: l.status,
        duration: l.duration,
        aiModel: l.aiModel,
        tokens: {
          prompt: l.promptTokens,
          completion: l.completionTokens,
        },
        error: l.error || null,
      })),
    },
    executionResult,
    executionLogs,
  }

  await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf-8')

  console.log(`✅ Demo completed.`)
  console.log(`- workflowId: ${workflowId}`)
  console.log(`- knowledgeBaseId: ${knowledgeBaseId}`)
  console.log(`- executionId: ${executionId}`)
  console.log(`- report: ${join('tmp', 'demo-recipe', 'report.json')}`)
  if (!ragDiag.ragDetected) {
    console.warn('⚠️ 未检测到 RAG 注入（请查看 report.json -> executionLogs -> 配方生成 -> input.runtime.systemPrompt）')
  }
}

main()
  .catch((err) => {
    console.error('❌ Demo failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })
