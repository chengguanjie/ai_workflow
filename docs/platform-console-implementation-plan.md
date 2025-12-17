# 平台管理后台实现计划

## 1. 项目概述

### 1.1 背景
当前 AI Workflow 系统采用企业自助注册模式，缺少平台级管理能力。需要实现一个独立的平台管理后台（Console），让平台管理员能够：
- 给企业开设账号
- 管理企业套餐和配额
- 监控平台运营数据
- 处理用户支持请求

### 1.2 目标
- 建立独立的平台管理员体系（与企业用户分离）
- 实现企业全生命周期管理
- 提供运营数据看板
- 确保平台安全性

---

## 2. 技术架构

### 2.1 整体架构
```
┌─────────────────────────────────────────────────────────────┐
│                      AI Workflow 平台                        │
├─────────────────────────┬───────────────────────────────────┤
│   企业端 (Dashboard)    │      平台端 (Console)              │
│   /dashboard/*          │      /console/*                   │
│   企业用户认证           │      平台管理员认证                 │
│   NextAuth (credentials)│      NextAuth (platform-admin)    │
├─────────────────────────┴───────────────────────────────────┤
│                        共享服务层                            │
│   - Prisma ORM                                              │
│   - API 路由 (/api/*)                                       │
│   - 工具函数                                                 │
├─────────────────────────────────────────────────────────────┤
│                        数据库 (MySQL)                        │
│   - organizations, users (企业数据)                          │
│   - platform_admins (平台管理员)                             │
│   - platform_audit_logs (平台操作日志)                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 路由结构
```
/console                    # 平台管理后台入口
├── /login                  # 平台管理员登录
├── /dashboard              # 运营数据看板
├── /organizations          # 企业管理
│   ├── /                   # 企业列表
│   ├── /create             # 创建企业
│   └── /[id]               # 企业详情/编辑
├── /users                  # 用户管理（跨企业）
├── /plans                  # 套餐管理
├── /billing                # 账单管理
├── /support                # 工单/支持
└── /settings               # 平台设置
    └── /admins             # 管理员账号管理
```

---

## 3. 数据模型设计

### 3.1 新增模型

#### PlatformAdmin（平台管理员）
```prisma
model PlatformAdmin {
  id           String       @id @default(cuid())
  email        String       @unique
  name         String?
  passwordHash String
  role         PlatformRole @default(OPERATOR)
  isActive     Boolean      @default(true)
  lastLoginAt  DateTime?

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  // 创建者（用于审计）
  createdById  String?

  @@map("platform_admins")
}

enum PlatformRole {
  SUPER_ADMIN   // 超级管理员 - 全部权限
  ADMIN         // 管理员 - 企业管理、用户管理
  OPERATOR      // 运营 - 查看数据、处理工单
  SUPPORT       // 客服 - 只读 + 工单处理
}
```

#### PlatformAuditLog（平台操作日志）
```prisma
model PlatformAuditLog {
  id           String   @id @default(cuid())
  action       String   // CREATE_ORG, UPDATE_ORG, DISABLE_ORG, etc.
  resource     String   // organization, user, plan
  resourceId   String?
  detail       Json?
  ip           String?
  userAgent    String?  @db.Text

  createdAt    DateTime @default(now())

  adminId      String
  admin        PlatformAdmin @relation(fields: [adminId], references: [id])

  @@index([adminId])
  @@index([resource])
  @@index([createdAt])
  @@map("platform_audit_logs")
}
```

### 3.2 Organization 模型扩展
```prisma
model Organization {
  // ... 现有字段 ...

  // 新增字段
  status       OrgStatus    @default(ACTIVE)
  statusReason String?      // 禁用原因

  // 平台管理相关
  createdByAdminId String?  // 由哪个管理员创建
  notes            String?  @db.Text  // 平台备注

  // 账单相关
  billingEmail     String?
  billingContact   String?
}

enum OrgStatus {
  PENDING     // 待激活
  ACTIVE      // 正常
  SUSPENDED   // 已暂停（欠费等）
  DISABLED    // 已禁用
}
```

---

## 4. API 设计

### 4.1 平台管理员认证 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/console/auth/login` | POST | 管理员登录 |
| `/api/console/auth/logout` | POST | 管理员登出 |
| `/api/console/auth/me` | GET | 获取当前管理员信息 |
| `/api/console/auth/change-password` | POST | 修改密码 |

### 4.2 企业管理 API

| 端点 | 方法 | 权限 | 描述 |
|------|------|------|------|
| `/api/console/organizations` | GET | OPERATOR+ | 获取企业列表 |
| `/api/console/organizations` | POST | ADMIN+ | 创建企业 |
| `/api/console/organizations/[id]` | GET | OPERATOR+ | 获取企业详情 |
| `/api/console/organizations/[id]` | PUT | ADMIN+ | 更新企业信息 |
| `/api/console/organizations/[id]/status` | PUT | ADMIN+ | 更改企业状态 |
| `/api/console/organizations/[id]/quota` | PUT | ADMIN+ | 调整配额 |
| `/api/console/organizations/[id]/owner` | POST | SUPER_ADMIN | 创建/重置企业主账号 |

### 4.3 创建企业 API 详细设计

**POST /api/console/organizations**

请求体：
```typescript
interface CreateOrganizationRequest {
  // 企业信息
  name: string;              // 企业名称（必填）
  industry?: string;         // 行业
  website?: string;          // 网站
  phone?: string;            // 联系电话
  address?: string;          // 地址

  // 套餐配置
  plan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  apiQuota: number;          // API 配额

  // 企业主账号
  owner: {
    email: string;           // 邮箱（必填）
    name: string;            // 姓名（必填）
    password?: string;       // 初始密码（不填则自动生成）
  };

  // 通知选项
  sendWelcomeEmail: boolean; // 是否发送欢迎邮件

  // 备注
  notes?: string;
}
```

响应：
```typescript
interface CreateOrganizationResponse {
  organization: {
    id: string;
    name: string;
    plan: string;
    status: string;
    createdAt: string;
  };
  owner: {
    id: string;
    email: string;
    name: string;
    tempPassword?: string;   // 仅当自动生成时返回
  };
}
```

### 4.4 管理员管理 API

| 端点 | 方法 | 权限 | 描述 |
|------|------|------|------|
| `/api/console/admins` | GET | SUPER_ADMIN | 获取管理员列表 |
| `/api/console/admins` | POST | SUPER_ADMIN | 创建管理员 |
| `/api/console/admins/[id]` | PUT | SUPER_ADMIN | 更新管理员 |
| `/api/console/admins/[id]` | DELETE | SUPER_ADMIN | 删除管理员 |

### 4.5 统计数据 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/console/stats/overview` | GET | 平台概览数据 |
| `/api/console/stats/organizations` | GET | 企业统计 |
| `/api/console/stats/usage` | GET | 使用量统计 |
| `/api/console/stats/revenue` | GET | 收入统计 |

---

## 5. 前端页面设计

### 5.1 页面清单

| 页面 | 路径 | 描述 |
|------|------|------|
| 登录页 | `/console/login` | 平台管理员登录 |
| 数据看板 | `/console/dashboard` | 运营数据总览 |
| 企业列表 | `/console/organizations` | 企业搜索、筛选、列表 |
| 创建企业 | `/console/organizations/create` | 创建企业表单 |
| 企业详情 | `/console/organizations/[id]` | 企业信息、用户、工作流、配额 |
| 管理员管理 | `/console/settings/admins` | 管理员账号管理 |

### 5.2 企业列表页功能
- 搜索：按名称、邮箱搜索
- 筛选：按状态、套餐、创建时间筛选
- 排序：按创建时间、用户数、API使用量排序
- 批量操作：批量启用/禁用
- 导出：导出企业列表 Excel

### 5.3 创建企业表单
```
┌─────────────────────────────────────────────────────┐
│  创建企业                                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  基本信息                                           │
│  ├─ 企业名称 *: [________________]                  │
│  ├─ 所属行业:   [________________]                  │
│  └─ 联系电话:   [________________]                  │
│                                                     │
│  套餐配置                                           │
│  ├─ 选择套餐:   ○ 免费  ○ 入门  ○ 专业  ○ 企业    │
│  └─ API 配额:   [10000________] 次/月              │
│                                                     │
│  企业主账号                                         │
│  ├─ 邮箱 *:     [________________]                  │
│  ├─ 姓名 *:     [________________]                  │
│  ├─ 初始密码:   [________________] (留空自动生成)   │
│  └─ ☑ 发送欢迎邮件                                 │
│                                                     │
│  备注                                               │
│  └─ [________________________________]             │
│     [________________________________]             │
│                                                     │
│                    [取消]  [创建企业]               │
└─────────────────────────────────────────────────────┘
```

---

## 6. 安全设计

### 6.1 认证安全
- 平台管理员使用独立的认证流程
- JWT Token 有效期：8小时（比企业用户短）
- 支持 IP 白名单限制
- 登录失败锁定：5次失败后锁定30分钟

### 6.2 权限控制
```typescript
const PERMISSIONS = {
  SUPER_ADMIN: ['*'],  // 全部权限
  ADMIN: [
    'organization:read', 'organization:create', 'organization:update',
    'user:read', 'user:update',
    'stats:read',
  ],
  OPERATOR: [
    'organization:read',
    'user:read',
    'stats:read',
  ],
  SUPPORT: [
    'organization:read',
    'user:read',
  ],
};
```

### 6.3 审计日志
所有敏感操作必须记录：
- 创建/修改/删除企业
- 修改企业状态
- 调整配额
- 重置密码
- 管理员账号变更

---

## 7. 实现步骤

### Phase 1: 基础架构（预计 2-3 天）
- [ ] 扩展 Prisma Schema
- [ ] 创建数据库迁移
- [ ] 实现平台管理员认证
- [ ] 创建初始超级管理员账号

### Phase 2: 核心 API（预计 2-3 天）
- [ ] 企业 CRUD API
- [ ] 企业状态管理 API
- [ ] 配额调整 API
- [ ] 创建企业主账号 API

### Phase 3: 前端页面（预计 3-4 天）
- [ ] Console 布局组件
- [ ] 登录页
- [ ] 数据看板
- [ ] 企业列表页
- [ ] 创建企业页
- [ ] 企业详情页

### Phase 4: 完善功能（预计 2 天）
- [ ] 管理员账号管理
- [ ] 审计日志查看
- [ ] 数据导出
- [ ] 邮件通知

---

## 8. 文件结构

```
src/
├── app/
│   ├── (console)/                    # Console 路由组
│   │   ├── layout.tsx                # Console 布局
│   │   ├── console/
│   │   │   ├── login/
│   │   │   │   └── page.tsx          # 登录页
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # 数据看板
│   │   │   ├── organizations/
│   │   │   │   ├── page.tsx          # 企业列表
│   │   │   │   ├── create/
│   │   │   │   │   └── page.tsx      # 创建企业
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # 企业详情
│   │   │   └── settings/
│   │   │       └── admins/
│   │   │           └── page.tsx      # 管理员管理
│   ├── api/
│   │   └── console/                  # Console API
│   │       ├── auth/
│   │       │   └── [...nextauth]/
│   │       │       └── route.ts      # 管理员认证
│   │       ├── organizations/
│   │       │   ├── route.ts          # 列表/创建
│   │       │   └── [id]/
│   │       │       ├── route.ts      # 详情/更新
│   │       │       ├── status/
│   │       │       │   └── route.ts  # 状态管理
│   │       │       └── owner/
│   │       │           └── route.ts  # 企业主管理
│   │       ├── admins/
│   │       │   └── route.ts          # 管理员 CRUD
│   │       └── stats/
│   │           └── route.ts          # 统计数据
├── lib/
│   ├── console-auth/
│   │   └── index.ts                  # Console 认证配置
│   └── permissions/
│       └── index.ts                  # 权限检查工具
└── components/
    └── console/                      # Console 专用组件
        ├── sidebar.tsx
        ├── header.tsx
        └── ...
```

---

## 9. 环境变量

```env
# Console 认证
CONSOLE_NEXTAUTH_SECRET=your-console-secret
CONSOLE_ADMIN_EMAIL=admin@platform.com
CONSOLE_ADMIN_PASSWORD=initial-password

# 邮件服务（可选）
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

---

## 10. 初始化脚本

创建初始超级管理员：
```typescript
// scripts/init-platform-admin.ts
import { prisma } from '@/lib/db';
import { hash } from 'bcryptjs';

async function main() {
  const email = process.env.CONSOLE_ADMIN_EMAIL || 'admin@platform.com';
  const password = process.env.CONSOLE_ADMIN_PASSWORD || 'Admin@123456';

  const existing = await prisma.platformAdmin.findUnique({
    where: { email },
  });

  if (existing) {
    console.log('超级管理员已存在');
    return;
  }

  const passwordHash = await hash(password, 12);

  await prisma.platformAdmin.create({
    data: {
      email,
      name: '超级管理员',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });

  console.log('超级管理员创建成功');
  console.log(`邮箱: ${email}`);
  console.log(`密码: ${password}`);
}

main();
```

---

## 11. 验收标准

### 功能验收
- [ ] 平台管理员可以独立登录 Console
- [ ] 可以创建新企业并自动创建企业主账号
- [ ] 企业主可以使用生成的账号登录企业端
- [ ] 可以修改企业套餐和配额
- [ ] 可以禁用/启用企业
- [ ] 所有操作有审计日志

### 安全验收
- [ ] Console 和 Dashboard 认证完全隔离
- [ ] 权限控制生效
- [ ] 敏感操作记录日志
- [ ] 密码加密存储

---

## 12. 后续扩展

- 支持 SSO 登录（企业微信、钉钉）
- 账单和支付系统
- 工单系统
- API 调用监控和限流
- 多语言支持

---

## 13. 部署和使用说明

### 13.1 数据库迁移

```bash
# 1. 生成 Prisma Client
npm run db:generate

# 2. 推送 Schema 到数据库
npm run db:push

# 或使用迁移（推荐生产环境）
npm run db:migrate
```

### 13.2 初始化超级管理员

```bash
# 使用默认账号
npm run init:admin

# 或指定账号（通过环境变量）
CONSOLE_ADMIN_EMAIL=admin@yourcompany.com \
CONSOLE_ADMIN_PASSWORD=YourSecurePassword \
npm run init:admin
```

默认账号信息：
- 邮箱：`admin@platform.com`
- 密码：`Admin@123456`

### 13.3 访问 Console

1. 启动开发服务器：`npm run dev`
2. 访问：`http://localhost:3000/console/login`
3. 使用超级管理员账号登录

### 13.4 给企业开账号流程

1. 登录 Console 后台
2. 进入「企业管理」
3. 点击「创建企业」
4. 填写企业信息和企业主账号
5. 系统自动生成密码（或使用指定密码）
6. 将账号信息发送给企业主

### 13.5 已实现的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 平台管理员认证 | ✅ | 独立的登录系统 |
| 数据看板 | ✅ | 企业、用户、工作流统计 |
| 企业列表 | ✅ | 搜索、筛选、分页 |
| 创建企业 | ✅ | 自动创建企业主账号 |
| 企业详情 | ✅ | 查看用户、统计信息 |
| 企业状态管理 | ✅ | 启用/暂停/禁用 |
| 重置企业主密码 | ✅ | 生成新密码 |
| 删除企业 | ✅ | 仅超级管理员 |
| 审计日志 | ✅ | 所有操作自动记录 |
| 权限控制 | ✅ | 基于角色的权限 |

### 13.6 待开发功能

- 管理员账号管理页面
- 审计日志查看页面
- 企业编辑页面
- 数据导出功能
- 邮件通知功能
