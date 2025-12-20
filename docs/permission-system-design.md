# 企业级权限管理系统设计方案

## 一、概述

本文档描述 AI Workflow 平台的企业级权限管理系统设计，包括部门层级、资源权限、模板库管理等核心功能。

### 1.1 设计目标

1. **部门层级化管理**：支持多级部门结构，上级可查看/管理下属所有资源
2. **统一权限模型**：工作流、知识库、模板采用统一的四级权限体系
3. **模板库分类**：区分公域模板库（平台推送）和内部模板库（员工创建）
4. **灵活的权限分配**：支持用户级、部门级、全企业级权限设置

### 1.2 核心概念

#### 四级权限体系

| 权限级别 | 英文标识 | 描述 |
|---------|---------|------|
| 创建者 | CREATOR | 资源的创建人，自动拥有管理者权限 |
| 管理者 | MANAGER | 可编辑内容 + 可设置权限 + 可删除 |
| 编辑者 | EDITOR | 可编辑内容、可隐藏 |
| 使用者 | VIEWER | 可查看、可执行（工作流），但不能编辑 |

#### 权限继承规则

1. **创建者自动成为管理者**
2. **上级部门可管理下级部门资源**
3. **企业管理员（OWNER/ADMIN）可管理所有资源**
4. **直属领导可管理下属创建的资源**

---

## 二、数据模型设计

### 2.1 部门扩展

```prisma
model Department {
  id          String   @id @default(cuid())
  name        String
  description String?  @db.Text
  sortOrder   Int      @default(0)
  level       Int      @default(0)  // 新增：部门层级（0=顶级，1=一级，以此类推）
  path        String   @default("") // 新增：部门路径（如 /root/dept1/dept2）

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  parentId String?
  parent   Department?  @relation("DepartmentHierarchy", fields: [parentId], references: [id])
  children Department[] @relation("DepartmentHierarchy")

  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // 部门负责人
  managerId String?  // 新增：部门负责人ID

  users               User[]
  workflowPermissions WorkflowPermission[]
  knowledgeBasePermissions KnowledgeBasePermission[] // 新增
  invitations         Invitation[]
}
```

### 2.2 统一权限模型

新增权限级别枚举：

```prisma
enum ResourcePermission {
  VIEWER   // 使用者：查看、执行
  EDITOR   // 编辑者：编辑内容、隐藏
  MANAGER  // 管理者：编辑 + 设置权限 + 删除
}
```

### 2.3 工作流权限扩展

```prisma
model WorkflowPermission {
  id String @id @default(cuid())

  // 权限级别（调整为三级，创建者通过 workflow.creatorId 判断）
  permission ResourcePermission

  // 权限目标类型和ID
  targetType PermissionTargetType
  targetId   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  createdById String

  @@unique([workflowId, targetType, targetId])
  @@index([workflowId])
  @@index([targetType, targetId])
  @@index([departmentId])
}
```

### 2.4 知识库权限

新增知识库权限表：

```prisma
model KnowledgeBasePermission {
  id String @id @default(cuid())

  permission ResourcePermission
  targetType PermissionTargetType
  targetId   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  knowledgeBaseId String
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)

  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  createdById String

  @@unique([knowledgeBaseId, targetType, targetId])
  @@index([knowledgeBaseId])
  @@index([targetType, targetId])
}
```

### 2.5 模板库重构

```prisma
model WorkflowTemplate {
  id            String   @id @default(cuid())
  name          String
  description   String?  @db.Text
  category      String
  tags          Json     @default("[]")
  thumbnail     String?

  config        Json

  // 模板类型
  templateType  TemplateType @default(INTERNAL)  // 新增：模板类型

  // 可见性控制
  visibility    TemplateVisibility @default(PRIVATE)
  organizationId String?

  // 创建者信息
  creatorId     String?
  creatorName   String?

  // 统计信息
  usageCount    Int      @default(0)

  // 是否为官方模板（公域模板库）
  isOfficial    Boolean  @default(false)

  // 是否隐藏（软隐藏，不删除）
  isHidden      Boolean  @default(false)  // 新增

  version       String   @default("1.0.0")

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // 关联评分
  ratings       TemplateRating[]  // 新增
  permissions   TemplatePermission[] // 新增

  @@index([category])
  @@index([visibility, organizationId])
  @@index([isOfficial])
  @@index([templateType])
}

// 新增：模板类型
enum TemplateType {
  PUBLIC    // 公域模板（平台推送）
  INTERNAL  // 内部模板（企业员工创建）
}

// 新增：模板评分
model TemplateRating {
  id          String   @id @default(cuid())
  score       Int      // 1-5 分
  comment     String?  @db.Text  // 评论内容

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  templateId  String
  template    WorkflowTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  userId      String   // 评分用户
  userName    String?  // 用户名（冗余存储）

  @@unique([templateId, userId])  // 每用户对每模板只能评分一次
  @@index([templateId])
  @@index([userId])
}

// 新增：模板权限
model TemplatePermission {
  id String @id @default(cuid())

  permission ResourcePermission
  targetType PermissionTargetType
  targetId   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  templateId String
  template   WorkflowTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  createdById String

  @@unique([templateId, targetType, targetId])
  @@index([templateId])
  @@index([targetType, targetId])
}
```

---

## 三、权限规则详解

### 3.1 部门层级权限

```
企业
├── 总经理办公室
│   └── 秘书处
├── 技术部
│   ├── 前端组
│   └── 后端组
└── 市场部
    ├── 策划组
    └── 推广组
```

**层级权限规则**：

1. **部门负责人**：可以查看/管理本部门及所有子部门的资源
2. **上级部门成员**：根据其角色权限，可能有权查看下级部门资源
3. **同级/下级**：只能看到被明确授权的资源

### 3.2 权限判断流程

```typescript
async function checkResourcePermission(
  userId: string,
  resourceType: 'WORKFLOW' | 'KNOWLEDGE_BASE' | 'TEMPLATE',
  resourceId: string,
  requiredPermission: ResourcePermission
): Promise<boolean> {
  const user = await getUser(userId)
  const resource = await getResource(resourceType, resourceId)

  // 1. 企业隔离检查
  if (resource.organizationId !== user.organizationId) return false

  // 2. 超级权限检查
  if (user.role === 'OWNER' || user.role === 'ADMIN') return true

  // 3. 创建者检查
  if (resource.creatorId === userId) return true

  // 4. 直属领导检查
  if (await isDirectSupervisor(userId, resource.creatorId)) {
    return true // 直属领导对下属资源有管理权限
  }

  // 5. 部门层级检查
  if (await isUpperDepartment(user.departmentId, resource.creatorDepartmentId)) {
    // 上级部门成员可以查看下级部门资源
    if (requiredPermission === 'VIEWER') return true
    // 部门负责人可以管理
    if (await isDepartmentManager(userId, user.departmentId)) return true
  }

  // 6. 权限表检查
  const permissions = await getResourcePermissions(resourceType, resourceId)
  return checkPermissions(permissions, user, requiredPermission)
}
```

### 3.3 权限优先级

```
权限优先级（从高到低）：
1. OWNER/ADMIN（企业管理员） → 全部权限
2. 创建者 → 管理者权限
3. 直属领导 → 管理者权限（对下属资源）
4. 上级部门负责人 → 管理者权限（对下级部门资源）
5. 显式权限设置 → 按设置的权限级别
6. 默认权限（无显式设置时）：
   - EDITOR 角色 → EDITOR 权限
   - MEMBER 角色 → VIEWER 权限
   - VIEWER 角色 → VIEWER 权限
```

---

## 四、模板库管理

### 4.1 公域模板库

**特点**：
- 由平台管理员创建和推送
- `isOfficial = true` 且 `templateType = PUBLIC`
- 所有企业用户可见（无需授权）
- 只能使用，不能编辑/删除
- 不允许评分（或平台统一管理评分）

**管理入口**：
- 平台管理后台 `/console/templates`

### 4.2 内部模板库

**特点**：
- 由企业员工创建
- `templateType = INTERNAL`
- 可见性控制：PRIVATE（仅自己）/ ORGANIZATION（企业内）
- 企业内成员可以评分和评论
- 上级领导可以编辑、查看、删除

**权限规则**：

| 用户角色 | 自己的模板 | 下属的模板 | 同事的模板 |
|---------|-----------|-----------|-----------|
| OWNER/ADMIN | 全部 | 全部 | 全部 |
| 部门负责人 | 全部 | 全部（本部门及子部门） | 仅使用 |
| 直属领导 | 全部 | 全部 | 仅使用 |
| EDITOR | 全部 | - | 编辑（如被授权） |
| MEMBER | 全部 | - | 仅使用 |
| VIEWER | 查看 | - | 仅查看 |

### 4.3 模板评分系统

**评分规则**：
1. 只有内部模板可以评分
2. 每个用户对同一模板只能评分一次
3. 可以修改自己的评分
4. 评分范围：1-5 分
5. 可以附带文字评论

**评分聚合**：
```typescript
interface TemplateRatingStats {
  averageScore: number    // 平均分
  totalRatings: number    // 评分总数
  distribution: {         // 分数分布
    1: number
    2: number
    3: number
    4: number
    5: number
  }
}
```

---

## 五、开发任务分解

### 阶段一：数据模型升级（优先级：高）

| 任务 | 描述 | 文件 |
|-----|------|-----|
| 1.1 | 扩展 Department 模型（level, path, managerId） | `prisma/schema.prisma` |
| 1.2 | 新增 ResourcePermission 枚举 | `prisma/schema.prisma` |
| 1.3 | 调整 WorkflowPermission 模型 | `prisma/schema.prisma` |
| 1.4 | 新增 KnowledgeBasePermission 模型 | `prisma/schema.prisma` |
| 1.5 | 扩展 WorkflowTemplate 模型 | `prisma/schema.prisma` |
| 1.6 | 新增 TemplateRating 模型 | `prisma/schema.prisma` |
| 1.7 | 新增 TemplatePermission 模型 | `prisma/schema.prisma` |
| 1.8 | 运行数据库迁移 | `npx prisma migrate` |

### 阶段二：核心权限服务（优先级：高）

| 任务 | 描述 | 文件 |
|-----|------|-----|
| 2.1 | 部门层级工具函数 | `src/lib/permissions/department.ts` |
| 2.2 | 统一权限检查服务 | `src/lib/permissions/resource.ts` |
| 2.3 | 重构工作流权限检查 | `src/lib/permissions/workflow.ts` |
| 2.4 | 新增知识库权限检查 | `src/lib/permissions/knowledge-base.ts` |
| 2.5 | 新增模板权限检查 | `src/lib/permissions/template.ts` |

### 阶段三：API 接口开发（优先级：高）

| 任务 | 描述 | 文件 |
|-----|------|-----|
| 3.1 | 部门管理 API 完善 | `src/app/api/settings/departments/` |
| 3.2 | 部门负责人设置 API | `src/app/api/settings/departments/[id]/manager/route.ts` |
| 3.3 | 工作流权限 API 升级 | `src/app/api/workflows/[id]/permissions/route.ts` |
| 3.4 | 知识库权限 API | `src/app/api/knowledge-bases/[id]/permissions/route.ts` |
| 3.5 | 模板列表 API（区分公域/内部） | `src/app/api/templates/route.ts` |
| 3.6 | 模板权限 API | `src/app/api/templates/[id]/permissions/route.ts` |
| 3.7 | 模板评分 API | `src/app/api/templates/[id]/ratings/route.ts` |

### 阶段四：前端界面开发（优先级：中）

| 任务 | 描述 | 文件 |
|-----|------|-----|
| 4.1 | 部门管理页面升级（负责人设置） | `src/app/(dashboard)/settings/departments/page.tsx` |
| 4.2 | 通用权限设置组件 | `src/components/permissions/permission-dialog.tsx` |
| 4.3 | 工作流权限对话框升级 | `src/components/workflow/workflow-permissions-dialog.tsx` |
| 4.4 | 知识库权限对话框 | `src/components/knowledge-base/kb-permissions-dialog.tsx` |
| 4.5 | 模板库页面重构（公域/内部分类） | `src/app/(dashboard)/templates/page.tsx` |
| 4.6 | 模板权限对话框 | `src/components/template/template-permissions-dialog.tsx` |
| 4.7 | 模板评分组件 | `src/components/template/template-rating.tsx` |

### 阶段五：平台管理后台（优先级：中）

| 任务 | 描述 | 文件 |
|-----|------|-----|
| 5.1 | 公域模板管理页面 | `src/app/(console)/console/templates/page.tsx` |
| 5.2 | 公域模板创建/编辑 | `src/app/(console)/console/templates/[id]/page.tsx` |
| 5.3 | 模板推送 API | `src/app/api/console/templates/route.ts` |

### 阶段六：数据迁移与测试（优先级：高）

| 任务 | 描述 | 文件 |
|-----|------|-----|
| 6.1 | 编写数据迁移脚本 | `scripts/migrate-permissions.ts` |
| 6.2 | 权限服务单元测试 | `src/lib/permissions/*.test.ts` |
| 6.3 | API 集成测试 | `src/app/api/**/*.test.ts` |

---

## 六、详细实现规范

### 6.1 部门层级工具函数

```typescript
// src/lib/permissions/department.ts

/**
 * 获取用户的所有上级部门 ID 列表
 */
export async function getAncestorDepartmentIds(departmentId: string): Promise<string[]>

/**
 * 获取用户的所有下级部门 ID 列表
 */
export async function getDescendantDepartmentIds(departmentId: string): Promise<string[]>

/**
 * 检查 A 部门是否是 B 部门的上级
 */
export async function isUpperDepartment(upperDeptId: string, lowerDeptId: string): Promise<boolean>

/**
 * 获取部门的所有成员（包括子部门）
 */
export async function getDepartmentMembers(departmentId: string, includeChildren?: boolean): Promise<string[]>

/**
 * 检查用户是否是部门负责人
 */
export async function isDepartmentManager(userId: string, departmentId: string): Promise<boolean>

/**
 * 检查用户是否是目标用户的直属领导
 */
export async function isDirectSupervisor(supervisorId: string, subordinateId: string): Promise<boolean>

/**
 * 更新部门路径（当部门层级变化时调用）
 */
export async function updateDepartmentPath(departmentId: string): Promise<void>
```

### 6.2 统一权限检查服务

```typescript
// src/lib/permissions/resource.ts

export type ResourceType = 'WORKFLOW' | 'KNOWLEDGE_BASE' | 'TEMPLATE'

export interface PermissionCheckResult {
  allowed: boolean
  permission: ResourcePermission | null
  reason?: string
}

/**
 * 检查用户对资源的权限
 */
export async function checkResourcePermission(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  requiredPermission: ResourcePermission
): Promise<PermissionCheckResult>

/**
 * 获取用户对资源的最高权限级别
 */
export async function getResourcePermissionLevel(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<ResourcePermission | null>

/**
 * 获取用户可访问的资源 ID 列表
 */
export async function getAccessibleResourceIds(
  userId: string,
  organizationId: string,
  resourceType: ResourceType,
  requiredPermission?: ResourcePermission
): Promise<string[] | 'all'>

/**
 * 获取资源的权限列表（用于权限管理 UI）
 */
export async function getResourcePermissions(
  resourceType: ResourceType,
  resourceId: string
): Promise<PermissionListItem[]>

/**
 * 设置资源权限
 */
export async function setResourcePermission(
  resourceType: ResourceType,
  resourceId: string,
  targetType: PermissionTargetType,
  targetId: string | null,
  permission: ResourcePermission,
  operatorId: string
): Promise<void>

/**
 * 删除资源权限
 */
export async function removeResourcePermission(
  resourceType: ResourceType,
  resourceId: string,
  targetType: PermissionTargetType,
  targetId: string | null,
  operatorId: string
): Promise<void>
```

### 6.3 模板评分服务

```typescript
// src/lib/services/template-rating.ts

export interface RatingStats {
  averageScore: number
  totalRatings: number
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
}

/**
 * 获取模板的评分统计
 */
export async function getTemplateRatingStats(templateId: string): Promise<RatingStats>

/**
 * 提交或更新评分
 */
export async function submitRating(
  templateId: string,
  userId: string,
  score: number,
  comment?: string
): Promise<void>

/**
 * 获取用户对模板的评分
 */
export async function getUserRating(
  templateId: string,
  userId: string
): Promise<{ score: number; comment?: string } | null>

/**
 * 获取模板的评分列表（分页）
 */
export async function getTemplateRatings(
  templateId: string,
  page: number,
  pageSize: number
): Promise<{ ratings: RatingItem[]; total: number }>
```

---

## 七、API 接口设计

### 7.1 部门负责人 API

```
PUT /api/settings/departments/:id/manager
Request: { managerId: string }
Response: { success: true }

DELETE /api/settings/departments/:id/manager
Response: { success: true }
```

### 7.2 通用权限 API

```
# 获取资源权限列表
GET /api/{resource-type}/{id}/permissions
Response: {
  data: [
    {
      id: string
      targetType: 'USER' | 'DEPARTMENT' | 'ALL'
      targetId: string | null
      targetName: string
      permission: 'VIEWER' | 'EDITOR' | 'MANAGER'
      createdAt: string
      createdBy: { id: string, name: string }
    }
  ]
}

# 添加/更新权限
POST /api/{resource-type}/{id}/permissions
Request: {
  targetType: 'USER' | 'DEPARTMENT' | 'ALL'
  targetId: string | null
  permission: 'VIEWER' | 'EDITOR' | 'MANAGER'
}
Response: { success: true }

# 删除权限
DELETE /api/{resource-type}/{id}/permissions
Request: {
  targetType: 'USER' | 'DEPARTMENT' | 'ALL'
  targetId: string | null
}
Response: { success: true }
```

### 7.3 模板评分 API

```
# 获取评分统计
GET /api/templates/:id/ratings/stats
Response: {
  averageScore: 4.2
  totalRatings: 156
  distribution: { 1: 5, 2: 10, 3: 20, 4: 50, 5: 71 }
}

# 获取评分列表
GET /api/templates/:id/ratings?page=1&pageSize=10
Response: {
  data: [
    {
      id: string
      score: number
      comment: string
      userId: string
      userName: string
      createdAt: string
    }
  ],
  pagination: { page: 1, pageSize: 10, total: 156 }
}

# 提交评分
POST /api/templates/:id/ratings
Request: { score: number, comment?: string }
Response: { success: true }

# 获取我的评分
GET /api/templates/:id/ratings/mine
Response: { score: 4, comment: "很好用" } | null
```

---

## 八、前端组件设计

### 8.1 通用权限对话框

```tsx
interface PermissionDialogProps {
  resourceType: 'workflow' | 'knowledge-base' | 'template'
  resourceId: string
  resourceName: string
  isOpen: boolean
  onClose: () => void
  currentUserPermission: ResourcePermission
}

// 功能：
// 1. 展示当前权限列表
// 2. 添加用户/部门/全企业权限
// 3. 修改权限级别
// 4. 删除权限
// 5. 权限说明提示
```

### 8.2 模板评分组件

```tsx
interface TemplateRatingProps {
  templateId: string
  readonly?: boolean
  showStats?: boolean
  onRatingSubmit?: (score: number, comment?: string) => void
}

// 功能：
// 1. 星级评分（1-5 星）
// 2. 评分统计展示
// 3. 评论输入
// 4. 评论列表（分页）
```

### 8.3 模板库页面布局

```tsx
// 页面结构：
// - 顶部切换标签：公域模板库 | 内部模板库
// - 筛选栏：分类、评分、搜索
// - 模板卡片网格：
//   - 缩略图
//   - 名称、描述
//   - 评分（内部模板）
//   - 使用次数
//   - 操作按钮（使用、编辑、管理权限、删除）
```

---

## 九、数据迁移策略

### 9.1 权限数据迁移

1. **备份现有数据**
2. **更新权限枚举**：
   - `VIEW` → `VIEWER`
   - `USE` → `VIEWER`（降级）
   - `EDIT` → `EDITOR`
3. **保留创建者信息**：通过 `creatorId` 自动获得管理者权限
4. **迁移脚本**：

```typescript
// scripts/migrate-permissions.ts
async function migratePermissions() {
  // 1. 更新工作流权限
  await prisma.$executeRaw`
    UPDATE workflow_permissions
    SET permission = CASE
      WHEN permission = 'VIEW' THEN 'VIEWER'
      WHEN permission = 'USE' THEN 'VIEWER'
      WHEN permission = 'EDIT' THEN 'EDITOR'
    END
  `

  // 2. 更新部门路径
  const departments = await prisma.department.findMany({
    orderBy: { parentId: 'asc' }
  })
  for (const dept of departments) {
    await updateDepartmentPath(dept.id)
  }
}
```

### 9.2 模板数据迁移

1. **标记官方模板**：`isOfficial = true` 的模板设置 `templateType = 'PUBLIC'`
2. **其他模板**：设置 `templateType = 'INTERNAL'`

---

## 十、注意事项

### 10.1 性能优化

1. **部门路径缓存**：使用 path 字段加速层级查询
2. **权限缓存**：对热点资源的权限进行 Redis 缓存
3. **批量查询优化**：列表页使用 `getAccessibleResourceIds` 预筛选

### 10.2 安全考虑

1. **权限越级检查**：确保用户不能给自己授权超过自身权限的级别
2. **审计日志**：所有权限变更记录到 AuditLog
3. **并发控制**：权限修改使用乐观锁

### 10.3 向后兼容

1. **API 版本控制**：新 API 路径添加版本前缀（如 `/api/v2/`）
2. **渐进式迁移**：旧权限 API 保留并标记废弃
3. **默认权限**：未迁移的资源使用默认权限规则

---

## 十一、验收标准

### 11.1 功能验收

- [ ] 部门负责人可以查看和管理本部门及子部门的所有资源
- [ ] 直属领导可以管理下属创建的资源
- [ ] 企业管理员可以管理所有资源
- [ ] 创建者自动拥有管理者权限
- [ ] 权限设置正确生效（VIEWER/EDITOR/MANAGER）
- [ ] 公域模板库正常显示和使用
- [ ] 内部模板库评分功能正常
- [ ] 权限管理 UI 操作流畅

### 11.2 性能验收

- [ ] 资源列表加载时间 < 500ms
- [ ] 权限检查时间 < 50ms
- [ ] 权限管理对话框响应时间 < 200ms

### 11.3 安全验收

- [ ] 无法越级授权
- [ ] 跨组织访问被正确阻止
- [ ] 权限变更有完整审计日志
