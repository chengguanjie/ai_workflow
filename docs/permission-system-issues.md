# 项目权限管理系统问题分析报告

> 分析日期: 2025-12-24

---

## 一、极高风险安全问题 (P0 - 立即修复)

| 问题 | 位置 | 风险 |
|------|------|------|
| **代码执行无认证** | `/api/code/execute/route.ts` | 任何人可执行任意代码，可导致系统被入侵 |
| **调试接口无保护** | `/api/debug/seed/route.ts` | 任何人可重置数据库，数据丢失风险 |

---

## 二、权限系统缺陷

### 1. 模板权限 API 缺失
- **现状**: 数据库 Schema 中定义了 `TemplatePermission` 模型，但没有对应的 API 路由
- **缺失文件**: `src/app/api/templates/[id]/permissions/route.ts`
- **影响**: 无法在 UI 中管理模板权限

### 2. 权限缓存不一致
- **工作流权限**: 使用 Redis 缓存 ✓
- **知识库权限**: 无缓存 ✗
- **影响**: 大规模企业下知识库权限查询性能差

### 3. API Token 作用域未验证
- **现状**: `scopes` 字段存储但未在 API 调用时验证
- **影响**: Token 可以访问超出其范围的资源

### 4. 权限 API 返回格式不统一
```
工作流: { permissions: [...] }
知识库: { data: [...], currentUserPermission, canManage }
```

### 5. N+1 查询问题
- **位置**: `src/lib/permissions/resource.ts` - `getResourcePermissions()`
- **问题**: 在循环中查询用户和部门信息

---

## 三、企业账号管理问题

### 1. 企业删除级联处理不完整
- 删除企业时成员处理策略不明确
- 缺少审计日志记录

### 2. 安全设置类型定义缺失
- **位置**: `Organization.securitySettings` 使用 `Json` 类型
- **问题**: 没有 TypeScript 类型定义，容易出错

### 3. 企业状态变更无审计
- `ACTIVE -> SUSPENDED -> DISABLED` 状态流转无记录

---

## 四、员工/成员管理问题

### 1. 批量操作缺失
- 无批量删除成员
- 无批量修改角色/部门
- 无批量导入成员 (CSV)

### 2. 邀请功能不完善
- 邀请链接分享无记录
- 邀请失败无重试限制

### 3. 成员可见性控制不足
- **位置**: `GET /api/settings/departments`
- **问题**: 普通成员可看到所有部门信息，应该只能看自己所在部门

---

## 五、部门管理问题

### 1. 部门层级深度无限制
- 可无限嵌套导致性能问题
- 建议添加最大深度限制 (10级)

### 2. 部门删除处理不完整
- 删除部门时成员处理策略不明确
- 权限清理逻辑不完整

---

## 六、平台管理问题

### 1. 跨组织验证缺失
- **位置**: `/api/v1/tasks/[taskId]`
- **问题**: Token 验证后未检查任务是否属于该组织

### 2. 工具注册权限不足
- **位置**: `/api/tools`
- **问题**: 任何认证用户可注册工具，应限制为 OWNER/ADMIN

---

## 七、审计日志不完整

### 已记录的事件
- member.role_changed
- member.department_changed
- organization.info_updated
- invitation.accepted

### 缺失的事件
- permission.added/updated/removed
- department.created/updated/deleted
- api_token.created/revoked
- organization.status_changed

---

## 八、修复优先级建议

| 优先级 | 问题 | 修复方案 |
|--------|------|----------|
| **P0** | 代码执行无认证 | 添加 `auth()` + 角色检查 |
| **P0** | 调试接口无保护 | 环境检查 + 认证 |
| **P1** | 模板权限 API 缺失 | 创建路由，参照知识库权限 |
| **P1** | N+1 查询 | 使用 `findMany` 批量查询 |
| **P1** | 知识库权限缓存 | 添加 Redis 缓存 |
| **P2** | 部门 API 权限检查 | 添加部门可见性检查 |
| **P2** | API Token 作用域验证 | 创建验证中间件 |
| **P3** | 审计日志完善 | 添加缺失事件 |

---

## 九、整体评估

**实现完整度**: 约 75%

### 优势
- 核心 RBAC 模型完整
- 资源级权限支持用户/部门/全企业三种粒度
- 企业隔离和部门层级设计合理
- API 认证框架基本完善

### 劣势
- 存在高危安全漏洞
- 部分 API 权限检查不一致
- 缓存策略不统一
- 审计日志不完整

---

## 十、数据库权限模型概览

### 角色体系

#### 企业级别角色 (Role)
```
OWNER      - 企业所有者（唯一、无法删除/转移）
ADMIN      - 企业管理员（可管理所有资源和成员）
EDITOR     - 编辑者（可编辑企业资源）
MEMBER     - 成员（可查看和使用资源）
VIEWER     - 查看者（只读权限）
```

#### 资源级别权限 (ResourcePermission)
```
VIEWER     - 查看和使用（工作流执行、知识库查询）
EDITOR     - 编辑内容（修改配置、添加内容）
MANAGER    - 管理权限和资源删除
```

#### 工作流权限 (PermissionLevel)
```
VIEW       - 查看工作流配置
USE        - 执行工作流
EDIT       - 编辑工作流
```

### 权限目标类型 (PermissionTargetType)
```
USER       - 指定用户
DEPARTMENT - 指定部门
ALL        - 所有人
```

### 核心数据模型关系
```
Organization (1)
    ├── User (N) - 组织的所有成员
    ├── Department (N) - 组织的所有部门
    │   ├── Department (自身递归) - 子部门
    │   └── User (N) - 部门成员
    ├── Invitation (N) - 邀请记录
    ├── Workflow (N) - 工作流
    │   └── WorkflowPermission (N) - 工作流权限
    ├── KnowledgeBase (N) - 知识库
    │   └── KnowledgeBasePermission (N) - 知识库权限
    ├── WorkflowTemplate (N) - 模板
    │   └── TemplatePermission (N) - 模板权限
    └── ApiKey / ApiToken - API 密钥和令牌
```

---

## 十一、API 权限检查现状

### 认证覆盖率统计
- **总 API 数量**: 约 100 个 route.ts
- **有认证**: 84 个 (84%)
- **无认证**: 16 个 (16%)

### 权限检查方式分布
- 仅检查 session: 52%
- 检查 session + organizationId: 35%
- 检查 session + role: 10%
- 完整检查（含资源所有权）: 3%

### 无认证 API 分类

#### 需要修复
- `/api/code/execute` - 需要认证
- `/api/debug/seed` - 需要认证
- `/api/tools` - 需要权限检查

#### 合理无认证
- `/api/auth/register` - 新用户注册
- `/api/health` - 健康检查
- `/api/public/forms/[token]/*` - 公开表单
- `/api/invite` - 邀请验证（token验证）
- `/api/templates/categories` - 公开分类
