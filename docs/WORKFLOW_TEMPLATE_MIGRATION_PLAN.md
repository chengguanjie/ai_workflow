# 工作流模板节点类型迁移修复计划

## 1. 问题背景

由于项目架构简化，系统从多种节点类型简化为只保留两种核心节点类型：
- **INPUT** - 用户输入节点
- **PROCESS** - AI 处理节点

原有的以下节点类型已被废弃并删除相关处理器和配置组件：
- TRIGGER（触发器）
- CODE（代码）
- OUTPUT（输出）
- DATA（数据）
- CONDITION（条件分支）
- LOOP（循环）
- SWITCH（多路分支）
- MERGE（合并）
- HTTP（HTTP请求）
- IMAGE_GEN（图片生成）
- NOTIFICATION（通知）
- GROUP（分组）
- APPROVAL（审批）
- IMAGE/VIDEO/AUDIO（媒体处理）

## 2. 问题表现

包含已废弃节点类型的工作流在画布上显示时：
1. 节点无法正确渲染，只显示空白框
2. 连线断开或指向不存在的节点
3. 工作流无法正常执行

## 3. 影响范围分析

### 3.1 官方模板（official-templates.ts）
**状态**: 已完成迁移 ✅

文件 `src/lib/templates/official-templates.ts` 中的 61 个官方模板已全部更新为只使用 INPUT 和 PROCESS 节点。

### 3.2 数据库中的工作流
**状态**: 需要迁移 ❌

数据库中可能存在以下类型的旧工作流：
1. 用户基于旧版官方模板创建的工作流
2. 用户自行创建的包含旧节点类型的工作流
3. 组织级别的模板

### 3.3 代码中的残留引用
**状态**: 需要清理 ❌

以下文件仍包含对旧节点类型的引用：
- `src/lib/validations/workflow.ts` - Zod 验证 schema
- `src/app/api/ai/generate-manual/route.ts` - AI 手册生成
- `src/app/api/ai/generate-comment/route.ts` - AI 注释生成
- `src/app/api/ai/generate-field-content/route.ts` - AI 字段内容生成
- `src/lib/workflow/engine/types.ts` - NODE_TYPE_DB_MAP
- `src/lib/workflow/preview-simulator.ts` - 预览模拟器
- `src/components/workflow/version-comparison-viewer.tsx` - 版本对比

## 4. 迁移计划

### 阶段一：数据库工作流迁移（优先级：高）

#### 4.1 迁移策略

将旧节点类型按以下规则转换：

| 原节点类型 | 迁移策略 | 目标类型 | 说明 |
|-----------|---------|---------|------|
| TRIGGER | 删除节点 | - | 触发器逻辑由系统自动处理 |
| INPUT | 保留 | INPUT | 无需变更 |
| PROCESS | 保留 | PROCESS | 无需变更 |
| CODE | 转换 | PROCESS | 将代码逻辑转换为 AI 处理节点的提示词 |
| OUTPUT | 删除节点 | - | 输出由最后一个 PROCESS 节点自动处理 |
| DATA | 转换 | INPUT | 数据节点转换为输入字段 |
| CONDITION | 删除 | - | 条件逻辑合并到 AI 处理节点的提示词中 |
| SWITCH | 删除 | - | 多路分支逻辑合并到 AI 处理节点的提示词中 |
| LOOP | 删除 | - | 循环逻辑合并到 AI 处理节点的提示词中 |
| MERGE | 删除 | - | 合并逻辑由工作流引擎自动处理 |
| HTTP | 转换 | PROCESS | 将 HTTP 请求转换为启用工具调用的 AI 处理节点 |
| IMAGE_GEN | 转换 | PROCESS | 将图片生成转换为 AI 处理节点 |
| NOTIFICATION | 删除 | - | 通知功能暂不支持，可后续通过工具调用实现 |
| GROUP | 展开 | - | 将分组内的节点展开到主流程 |
| APPROVAL | 删除 | - | 审批功能暂不支持 |
| IMAGE/VIDEO/AUDIO | 转换 | INPUT | 媒体节点转换为带文件上传的输入字段 |

#### 4.2 迁移脚本实现

创建迁移脚本 `scripts/migrate-workflow-nodes.ts`：

```typescript
// 伪代码示意
async function migrateWorkflows() {
  // 1. 获取所有包含旧节点类型的工作流
  const workflows = await prisma.workflow.findMany({
    where: {
      config: {
        path: ['nodes'],
        array_contains: [/* 包含旧节点类型的条件 */]
      }
    }
  });
  
  // 2. 遍历并迁移每个工作流
  for (const workflow of workflows) {
    const migratedConfig = migrateWorkflowConfig(workflow.config);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { config: migratedConfig }
    });
  }
}

function migrateWorkflowConfig(config) {
  // 1. 过滤/转换节点
  const newNodes = config.nodes
    .filter(node => !['TRIGGER', 'OUTPUT', 'CONDITION', 'SWITCH', 'LOOP', 'MERGE', 'NOTIFICATION', 'GROUP', 'APPROVAL'].includes(node.type))
    .map(node => convertNode(node));
  
  // 2. 重新计算连线
  const validNodeIds = new Set(newNodes.map(n => n.id));
  const newEdges = config.edges.filter(edge => 
    validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
  );
  
  // 3. 修复断开的连线
  const fixedEdges = fixBrokenEdges(newNodes, newEdges);
  
  return { ...config, nodes: newNodes, edges: fixedEdges };
}
```

### 阶段二：代码清理（优先级：中）

#### 4.3 需要清理的文件

1. **src/lib/validations/workflow.ts**
   - 删除 triggerNodeSchema, codeNodeSchema, outputNodeSchema 等
   - 更新 discriminatedUnion 只包含 INPUT 和 PROCESS

2. **src/app/api/ai/generate-*.ts**
   - 简化 NODE_TYPE_NAMES 只保留 INPUT 和 PROCESS
   - 删除对旧节点类型的 switch case 处理

3. **src/lib/workflow/engine/types.ts**
   - 简化 NODE_TYPE_DB_MAP

4. **src/components/workflow/version-comparison-viewer.tsx**
   - 简化 NODE_TYPE_LABELS

5. **src/lib/workflow/preview-simulator.ts**
   - 删除旧节点类型的 switch case

### 阶段三：测试验证（优先级：高）

#### 4.4 验证清单

- [ ] 官方模板在数据库中正确加载
- [ ] 已迁移的用户工作流正常显示
- [ ] 已迁移的工作流可以正常执行
- [ ] 新创建的工作流只使用 INPUT 和 PROCESS
- [ ] 画布上不再出现空白节点框

## 5. 执行步骤

### 步骤 1：备份数据库
```bash
# 备份 PostgreSQL 数据库
pg_dump -h localhost -U postgres ai_workflow > backup_before_migration.sql
```

### 步骤 2：执行迁移脚本
```bash
npx tsx scripts/migrate-workflow-nodes.ts
```

### 步骤 3：清理代码
按照阶段二的清单清理代码文件

### 步骤 4：重新导入官方模板
```bash
npx tsx src/lib/templates/official-templates.ts
```

### 步骤 5：验证
运行应用并检查验证清单中的所有项目

## 6. 回滚方案

如果迁移出现问题：
```bash
# 从备份恢复数据库
psql -h localhost -U postgres ai_workflow < backup_before_migration.sql
```

## 7. 时间估算

| 阶段 | 预计时间 |
|-----|---------|
| 阶段一：数据库迁移 | 2-3 小时 |
| 阶段二：代码清理 | 1-2 小时 |
| 阶段三：测试验证 | 1 小时 |
| **总计** | **4-6 小时** |

## 8. 风险评估

| 风险 | 影响 | 缓解措施 |
|-----|-----|---------|
| 迁移导致工作流逻辑丢失 | 高 | 备份数据库，保留原始配置 |
| 连线修复不完整 | 中 | 提供手动修复工具 |
| 代码清理遗漏 | 低 | 增量清理，逐步验证 |

---

**文档版本**: 1.0
**创建日期**: 2025-12-25
**作者**: AI Workflow 团队
