/**
 * PUE 30天数据版报告（页面排名 + 问题工作流榜单 + 问题分类看板）
 *
 * 运行：
 *   DATABASE_URL=... pnpm -s pue:30d
 */

import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/db'

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function formatPct(x: number | null | undefined) {
  if (x === null || x === undefined) return '-'
  return `${(x * 100).toFixed(1)}%`
}

function safeDiv(a: number, b: number) {
  return b === 0 ? 0 : a / b
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.floor(p * (sorted.length - 1))
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

function mdEscape(s: string) {
  return s.replaceAll('|', '\\|')
}

type ErrorClass = {
  key: string
  label: string
  keywords: RegExp[]
}

const ERROR_CLASSES: ErrorClass[] = [
  {
    key: 'MODEL_MISCONFIG',
    label: '模型/能力选择错误（例如视频模型用于文本）',
    keywords: [/媒体生成模型/, /不支持文本/, /model.*not support/i, /capability/i],
  },
  {
    key: 'PROVIDER_NOT_CONFIGURED',
    label: '未配置 AI 服务商/模型配置缺失',
    keywords: [/未配置 AI 服务商/, /模型配置错误/, /No provider/i],
  },
  {
    key: 'API_KEY_DECRYPT_FAIL',
    label: 'API Key 解密/加密密钥问题（ENCRYPTION_KEY）',
    keywords: [/无法解密 API Key/, /ENCRYPTION_KEY/, /decrypt/i],
  },
  {
    key: 'API_AUTH_401',
    label: '第三方鉴权失败（401/无效 token）',
    keywords: [/\b401\b/, /Invalid token/i, /Incorrect API key/i, /unauthoriz/i],
  },
  {
    key: 'VARIABLE_INPUT_VALIDATION',
    label: '变量引用/输入校验失败（节点不存在、字段缺失等）',
    keywords: [/输入验证失败/, /变量引用/, /无法解析/, /字段/, /schema/i],
  },
  {
    key: 'STORAGE_OSS',
    label: '文件/存储配置问题（OSS/S3/本地）',
    keywords: [/OSS/, /ali-oss/, /S3/i, /storage/i, /download/i],
  },
  {
    key: 'SERVER_RESTART_INTERRUPT',
    label: '系统重启/中断导致执行失败',
    keywords: [/服务器重启/, /被中断/, /restart/i],
  },
  {
    key: 'OTHER',
    label: '其他/未分类',
    keywords: [],
  },
]

function classifyError(msg: string) {
  for (const c of ERROR_CLASSES) {
    if (c.key === 'OTHER') continue
    if (c.keywords.some((re) => re.test(msg))) return c.key
  }
  return 'OTHER'
}

async function main() {
  const start = daysAgo(30)
  const end = new Date()

  // ========== 组织级概览 ==========
  const [execTotal, execSuccess, execFailed, execTestTotal] = await Promise.all([
    prisma.execution.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.execution.count({ where: { createdAt: { gte: start, lte: end }, status: 'COMPLETED' } }),
    prisma.execution.count({ where: { createdAt: { gte: start, lte: end }, status: 'FAILED' } }),
    prisma.execution.count({ where: { createdAt: { gte: start, lte: end }, executionType: 'TEST' } }),
  ])

  const execDurations = await prisma.execution.findMany({
    where: { createdAt: { gte: start, lte: end }, duration: { not: null } },
    select: { duration: true },
  })

  const execP95 = percentile(
    execDurations.map((r) => r.duration!).filter((x) => typeof x === 'number'),
    0.95,
  )

  const execSuccessRate = safeDiv(execSuccess, execTotal)

  const activeWorkflowCount = await prisma.execution
    .findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { workflowId: true },
      distinct: ['workflowId'],
    })
    .then((rows) => rows.length)

  const [triggerLogsTotal, triggerLogsSuccess, triggerLogsFailed] = await Promise.all([
    prisma.triggerLog.count({ where: { triggeredAt: { gte: start, lte: end } } }),
    prisma.triggerLog.count({ where: { triggeredAt: { gte: start, lte: end }, status: 'SUCCESS' } }),
    prisma.triggerLog.count({ where: { triggeredAt: { gte: start, lte: end }, status: 'FAILED' } }),
  ])

  const [kbDocTotal, kbDocCompleted, kbDocFailed, kbDocProcessing] = await Promise.all([
    prisma.knowledgeDocument.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.knowledgeDocument.count({ where: { createdAt: { gte: start, lte: end }, status: 'COMPLETED' } }),
    prisma.knowledgeDocument.count({ where: { createdAt: { gte: start, lte: end }, status: 'FAILED' } }),
    prisma.knowledgeDocument.count({ where: { createdAt: { gte: start, lte: end }, status: 'PROCESSING' } }),
  ])

  const [approvalTotal, approvalPending, approvalTimeout] = await Promise.all([
    prisma.approvalRequest.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.approvalRequest.count({ where: { createdAt: { gte: start, lte: end }, status: 'PENDING' } }),
    prisma.approvalRequest.count({ where: { createdAt: { gte: start, lte: end }, status: 'TIMEOUT' } }),
  ])

  const templateRatingNew = await prisma.templateRating.count({ where: { createdAt: { gte: start, lte: end } } })

  const apiTokenNew = await prisma.apiToken.count({ where: { createdAt: { gte: start, lte: end } } })
  const apiTokenActive = await prisma.apiToken.count({ where: { lastUsedAt: { gte: start, lte: end }, isActive: true } })

  // ========== 编辑/使用代理指标（无 pageview 时增强页面排名可信度） ==========
  const [workflowNew30d, workflowVersionNew30d, workflowsEdited30d] = await Promise.all([
    prisma.workflow.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.workflowVersion.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.workflowVersion
      .findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { workflowId: true },
        distinct: ['workflowId'],
      })
      .then((rows) => rows.length),
  ])

  // ========== 节点级慢/失败分类（用于平台级优化方向） ==========
  const nodeLogAgg = await prisma.executionLog.groupBy({
    by: ['nodeType', 'status'],
    where: { createdAt: { gte: start, lte: end } },
    _count: { _all: true },
  })

  const nodeTypeTotal = new Map<string, number>()
  const nodeTypeFailed = new Map<string, number>()

  for (const r of nodeLogAgg) {
    const t = r.nodeType
    const cnt = r._count._all
    nodeTypeTotal.set(t, (nodeTypeTotal.get(t) || 0) + cnt)
    if (r.status === 'FAILED') {
      nodeTypeFailed.set(t, (nodeTypeFailed.get(t) || 0) + cnt)
    }
  }

  const nodeFailTop = Array.from(nodeTypeFailed.entries())
    .map(([nodeType, failed]) => ({
      nodeType,
      failed,
      total: nodeTypeTotal.get(nodeType) || failed,
      failRate: safeDiv(failed, nodeTypeTotal.get(nodeType) || failed),
    }))
    .sort((a, b) => b.failed - a.failed)
    .slice(0, 10)

  // 慢节点：按 nodeType 聚合 duration 的 p95（可能较重；先按全量拉取再计算）
  const nodeDurRows = await prisma.executionLog.findMany({
    where: { createdAt: { gte: start, lte: end }, duration: { not: null } },
    select: { nodeType: true, duration: true },
  })

  const durationsByType = new Map<string, number[]>()
  for (const r of nodeDurRows) {
    const t = r.nodeType
    if (!durationsByType.has(t)) durationsByType.set(t, [])
    durationsByType.get(t)!.push(r.duration!)
  }

  const nodeSlowTop = Array.from(durationsByType.entries())
    .map(([nodeType, ds]) => ({ nodeType, p95: percentile(ds, 0.95), count: ds.length }))
    .sort((a, b) => (b.p95 || 0) - (a.p95 || 0))
    .slice(0, 10)

  // ========== 页面排名（增强：加入编辑器相关代理指标） ==========
  const pageRanking = [
    {
      route: '/(dashboard)/executions',
      page: '执行列表',
      module: 'Execution',
      rankKey: execTotal,
      usageProxy: `execTotal=${execTotal}`,
      healthProxy: `successRate=${formatPct(execSuccessRate)}, p95(ms)=${execP95 ?? '-'}`,
    },
    {
      route: '/(editor)/workflows/[id]',
      page: '工作流编辑器（代理）',
      module: 'Editor',
      rankKey: workflowVersionNew30d + execTestTotal,
      usageProxy: `versionNew=${workflowVersionNew30d}, testExec=${execTestTotal}, editedWorkflows=${workflowsEdited30d}`,
      healthProxy: `整体成功率=${formatPct(execSuccessRate)}`,
    },
    {
      route: '/(dashboard)/workflows',
      page: '工作流列表',
      module: 'Workflow',
      rankKey: activeWorkflowCount + workflowNew30d,
      usageProxy: `activeWorkflowCount=${activeWorkflowCount}, newWorkflows=${workflowNew30d}`,
      healthProxy: `execSuccessRate=${formatPct(execSuccessRate)}`,
    },
    {
      route: '/(dashboard)/knowledge-bases',
      page: '知识库',
      module: 'KnowledgeBase',
      rankKey: kbDocTotal,
      usageProxy: `kbDocTotal=${kbDocTotal}`,
      healthProxy: `kbDocSuccessRate=${formatPct(safeDiv(kbDocCompleted, kbDocTotal))}, processing=${kbDocProcessing}`,
    },
    {
      route: '/(dashboard)/settings/api',
      page: 'API Token',
      module: 'IAM',
      rankKey: apiTokenNew + apiTokenActive,
      usageProxy: `new=${apiTokenNew}, active=${apiTokenActive}`,
      healthProxy: '-',
    },
    {
      route: '/(dashboard)/triggers',
      page: '触发器',
      module: 'Trigger',
      rankKey: triggerLogsTotal,
      usageProxy: `triggerLogsTotal=${triggerLogsTotal}`,
      healthProxy: `triggerSuccessRate=${formatPct(safeDiv(triggerLogsSuccess, triggerLogsTotal))}`,
    },
    {
      route: '/(dashboard)/approvals',
      page: '审批',
      module: 'Approval',
      rankKey: approvalTotal,
      usageProxy: `approvalTotal=${approvalTotal}`,
      healthProxy: `pending=${approvalPending}, timeout=${approvalTimeout}`,
    },
    {
      route: '/(dashboard)/templates',
      page: '模板库',
      module: 'Template',
      rankKey: templateRatingNew,
      usageProxy: `newRatings=${templateRatingNew}`,
      healthProxy: '-',
    },
  ]
    .sort((a, b) => b.rankKey - a.rankKey)
    .map((x, idx) => ({ rank: idx + 1, ...x }))

  // ========== 问题工作流榜单（30天） ==========
  const minExecutions = 3

  const workflowAgg = await prisma.execution.groupBy({
    by: ['workflowId'],
    where: { createdAt: { gte: start, lte: end } },
    _count: { _all: true },
  })

  const workflowIds = workflowAgg.filter((x) => x._count._all >= minExecutions).map((x) => x.workflowId)

  const workflows = await prisma.workflow.findMany({
    where: { id: { in: workflowIds } },
    select: { id: true, name: true, publishStatus: true, publishedAt: true },
  })
  const workflowNameMap = new Map(workflows.map((w) => [w.id, w]))

  const executions = await prisma.execution.findMany({
    where: { workflowId: { in: workflowIds }, createdAt: { gte: start, lte: end } },
    select: { workflowId: true, status: true, duration: true, error: true },
  })

  const byWf = new Map<
    string,
    {
      total: number
      success: number
      failed: number
      durations: number[]
      errorCounts: Map<string, number>
      errorClassCounts: Map<string, number>
    }
  >()

  const errorClassTotals = new Map<string, number>()

  for (const e of executions) {
    const key = e.workflowId
    if (!byWf.has(key)) {
      byWf.set(key, {
        total: 0,
        success: 0,
        failed: 0,
        durations: [],
        errorCounts: new Map(),
        errorClassCounts: new Map(),
      })
    }
    const v = byWf.get(key)!
    v.total++
    if (e.status === 'COMPLETED') v.success++
    if (e.status === 'FAILED') {
      v.failed++
      const err = (e.error || 'UNKNOWN_ERROR').slice(0, 200)
      v.errorCounts.set(err, (v.errorCounts.get(err) || 0) + 1)

      const cls = classifyError(err)
      v.errorClassCounts.set(cls, (v.errorClassCounts.get(cls) || 0) + 1)
      errorClassTotals.set(cls, (errorClassTotals.get(cls) || 0) + 1)
    }
    if (typeof e.duration === 'number') v.durations.push(e.duration)
  }

  const problemRows = Array.from(byWf.entries())
    .map(([workflowId, s]) => {
      const wf = workflowNameMap.get(workflowId)
      const successRate = safeDiv(s.success, s.total)
      const failRate = safeDiv(s.failed, s.total)
      const p95 = percentile(s.durations, 0.95)

      const topErrors = Array.from(s.errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([msg, cnt]) => `${cnt}× ${msg}`)

      const topClasses = Array.from(s.errorClassCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, cnt]) => {
          const label = ERROR_CLASSES.find((c) => c.key === k)?.label || k
          return `${cnt}× ${label}`
        })

      const p95Min = p95 ? p95 / 1000 / 60 : 0
      const problemScore = failRate * 100 + Math.min(p95Min, 60) + Math.min(s.failed, 50) * 0.5

      return {
        workflowId,
        name: wf?.name || workflowId,
        publishStatus: wf?.publishStatus || '-',
        total: s.total,
        successRate,
        failRate,
        p95Ms: p95 ?? null,
        topErrors,
        topClasses,
        problemScore,
      }
    })
    .sort((a, b) => b.problemScore - a.problemScore)
    .slice(0, 15)
    .map((x, idx) => ({ rank: idx + 1, ...x }))

  const totalFailedExecutions = Array.from(byWf.values()).reduce((sum, v) => sum + v.failed, 0)
  const errorClassBoard = ERROR_CLASSES.map((c) => {
    const count = errorClassTotals.get(c.key) || 0
    return {
      key: c.key,
      label: c.label,
      count,
      pct: totalFailedExecutions ? count / totalFailedExecutions : 0,
    }
  })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)

  // ========== 输出 Markdown ==========
  const mdLines: string[] = []
  mdLines.push('# AI Workflow｜PUE 30天数据版报告（页面排名 + 问题工作流榜单 + 问题分类看板）')
  mdLines.push('')
  mdLines.push(`数据范围：${start.toISOString()} ~ ${end.toISOString()}`)
  mdLines.push('')

  mdLines.push('## 1) 组织级概览')
  mdLines.push('')
  mdLines.push(`- 执行总量：${execTotal}`)
  mdLines.push(`- 执行成功率：${formatPct(execSuccessRate)}（成功 ${execSuccess} / 失败 ${execFailed}）`)
  mdLines.push(`- 执行 P95 耗时（ms）：${execP95 ?? '-'}`)
  mdLines.push(`- 活跃工作流数（30天有执行）：${activeWorkflowCount}`)
  mdLines.push(`- 30天测试执行量（executionType=TEST）：${execTestTotal}`)
  mdLines.push(`- 30天新建工作流数：${workflowNew30d}`)
  mdLines.push(`- 30天新增版本数：${workflowVersionNew30d}（涉及工作流数 ${workflowsEdited30d}）`)
  mdLines.push(`- 触发器触发量：${triggerLogsTotal}，成功率 ${formatPct(safeDiv(triggerLogsSuccess, triggerLogsTotal))}`)
  mdLines.push(`- 知识库文档处理量：${kbDocTotal}，成功率 ${formatPct(safeDiv(kbDocCompleted, kbDocTotal))}，处理中 ${kbDocProcessing}`)
  mdLines.push(`- 审批请求量：${approvalTotal}，待处理 ${approvalPending}，超时 ${approvalTimeout}`)
  mdLines.push(`- 30天模板新增评分：${templateRatingNew}`)
  mdLines.push(`- 30天新增 API Token：${apiTokenNew}，活跃 Token：${apiTokenActive}`)
  mdLines.push('')

  mdLines.push('## 2) 页面排名（增强：加入编辑器相关使用代理）')
  mdLines.push('')
  mdLines.push('> 注：当前缺少 pageview 埋点，因此页面访问量无法直接统计。本排名以业务事实（执行/版本/测试执行/触发/知识库处理/审批等）作为“页面使用强度”代理。')
  mdLines.push('')
  mdLines.push('| 排名 | 路由 | 页面 | 模块 | 使用强度（Proxy） | 健康度（Proxy） |')
  mdLines.push('|---:|---|---|---|---|---|')
  for (const r of pageRanking) {
    mdLines.push(
      `| ${r.rank} | ${r.route} | ${r.page} | ${r.module} | ${mdEscape(r.usageProxy)} | ${mdEscape(r.healthProxy)} |`,
    )
  }
  mdLines.push('')

  mdLines.push('## 3) 问题分类看板（基于失败执行 error 文本规则分类）')
  mdLines.push('')
  mdLines.push(`失败执行总数（纳入分析）：${totalFailedExecutions}`)
  mdLines.push('')
  mdLines.push('| 问题类型 | 失败数 | 占比 |')
  mdLines.push('|---|---:|---:|')
  for (const c of errorClassBoard) {
    mdLines.push(`| ${mdEscape(c.label)} | ${c.count} | ${formatPct(c.pct)} |`)
  }
  mdLines.push('')

  mdLines.push('### 3.1 节点类型失败 Top 10（ExecutionLog）')
  mdLines.push('')
  mdLines.push('| nodeType | 失败数 | 总数 | 失败率 |')
  mdLines.push('|---|---:|---:|---:|')
  for (const n of nodeFailTop) {
    mdLines.push(`| ${n.nodeType} | ${n.failed} | ${n.total} | ${formatPct(n.failRate)} |`)
  }
  mdLines.push('')

  mdLines.push('### 3.2 节点类型慢 Top 10（ExecutionLog duration P95）')
  mdLines.push('')
  mdLines.push('| nodeType | P95耗时(ms) | 样本数 |')
  mdLines.push('|---|---:|---:|')
  for (const n of nodeSlowTop) {
    mdLines.push(`| ${n.nodeType} | ${n.p95 ?? '-'} | ${n.count} |`)
  }
  mdLines.push('')

  mdLines.push('## 4) 问题工作流榜单（Top 15｜近30天）')
  mdLines.push('')
  mdLines.push('筛选条件：近30天执行次数 ≥ 3')
  mdLines.push('')
  mdLines.push('| 排名 | workflowId | 名称 | 发布状态 | 30天执行次数 | 成功率 | 失败率 | P95耗时(ms) | Top问题类型（最多3条） | Top失败原因（最多3条） |')
  mdLines.push('|---:|---|---|---|---:|---:|---:|---:|---|---|')

  for (const w of problemRows) {
    mdLines.push(
      `| ${w.rank} | ${w.workflowId} | ${mdEscape(w.name)} | ${w.publishStatus} | ${w.total} | ${formatPct(w.successRate)} | ${formatPct(w.failRate)} | ${w.p95Ms ?? '-'} | ${mdEscape(w.topClasses.join('<br/>'))} | ${mdEscape(w.topErrors.join('<br/>'))} |`,
    )
  }

  mdLines.push('')
  mdLines.push('## 5) 建议动作（面向平台级改进，按问题类型）')
  mdLines.push('')
  mdLines.push('- **API Key 解密/密钥问题**：将 ENCRYPTION_KEY 纳入运维变更流程；检测到解密失败时给出“重新配置密钥/迁移密钥”的明确指引，并提供批量检查工具。')
  mdLines.push('- **401/Invalid token**：在模型/服务商配置页增加“即时连通性测试”；执行失败时提示具体 provider/model/key 前缀与 scope（注意脱敏）。')
  mdLines.push('- **模型能力选择错误**：在节点配置时引入“能力约束校验”（文本节点禁止选择视频/图像生成模型），并在发布前做静态检查。')
  mdLines.push('- **变量引用/输入校验失败**：在编辑器提供“变量引用校验器”（检查节点是否存在、字段是否可达）；发布时阻断。')
  mdLines.push('- **存储/OSS 未配置**：输出节点在保存/执行前做依赖检查；在组织设置中提供存储连接测试与告警。')
  mdLines.push('- **系统重启中断**：完善执行的 checkpoint/resume（你们 schema 已有 canResume/checkpoint），并在重启后自动恢复队列/标记可重试。')

  const outPath = path.join(process.cwd(), 'docs', 'PUE_30D_DATA_REPORT.md')
  fs.writeFileSync(outPath, mdLines.join('\n'), 'utf8')
  // eslint-disable-next-line no-console
  console.log(`[PUE] Report written: ${outPath}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  try {
    await prisma.$disconnect()
  } catch {
    // ignore
  }
  process.exit(1)
})
