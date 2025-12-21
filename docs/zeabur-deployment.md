# Zeabur 部署指南

本文档介绍如何将 AI Workflow 部署到 Zeabur 平台。

## 前置要求

- Zeabur 账号
- GitHub 账号（用于连接代码仓库）
- 项目已推送到 GitHub

## 部署步骤

### 1. 创建 Zeabur 项目

1. 登录 [Zeabur 控制台](https://dash.zeabur.com)
2. 点击「新建项目」
3. 选择区域（推荐选择离用户最近的区域）

### 2. 添加 MySQL 数据库服务

1. 在项目中点击「添加服务」
2. 选择「Marketplace」→「MySQL」
3. 等待数据库创建完成
4. 记录数据库连接信息（会自动注入为 `DATABASE_URL`）

### 3. 添加 Redis 服务（可选，用于队列）

1. 点击「添加服务」
2. 选择「Marketplace」→「Redis」
3. 等待创建完成（会自动注入为 `REDIS_URL`）

### 4. 部署应用

1. 点击「添加服务」→「Git」
2. 选择 GitHub 仓库
3. Zeabur 会自动检测为 Next.js 项目

### 5. 配置环境变量

在服务设置中添加以下环境变量：

#### 必需变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `AUTH_SECRET` | NextAuth 密钥 | 使用 `openssl rand -base64 32` 生成 |
| `AUTH_URL` | 应用访问 URL | `https://your-app.zeabur.app` |
| `NEXTAUTH_URL` | 同 AUTH_URL | `https://your-app.zeabur.app` |
| `NEXT_PUBLIC_APP_URL` | 公开访问 URL | `https://your-app.zeabur.app` |
| `ENCRYPTION_KEY` | 数据加密密钥 | 使用 `openssl rand -base64 32` 生成 |

#### 可选变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SHENSUAN_BASE_URL` | 胜算云 API 地址 | `https://router.shengsuanyun.com/api/v1` |
| `STORAGE_TYPE` | 存储类型 | `LOCAL` |
| `UPLOAD_DIR` | 上传目录 | `./uploads` |

### 6. 绑定域名（可选）

1. 在服务设置中点击「域名」
2. 可以使用 Zeabur 提供的子域名，或绑定自定义域名
3. 更新 `AUTH_URL` 和 `NEXT_PUBLIC_APP_URL` 为新域名

### 7. 初始化管理员

部署成功后，在 Zeabur 终端中运行：

```bash
npx tsx scripts/init-platform-admin.ts
```

按提示输入管理员信息。

## 环境变量完整列表

```env
# 数据库 (由 Zeabur 自动注入)
DATABASE_URL=

# 认证
AUTH_SECRET=your-secret
AUTH_URL=https://your-app.zeabur.app
NEXTAUTH_URL=https://your-app.zeabur.app

# 公开 URL
NEXT_PUBLIC_APP_URL=https://your-app.zeabur.app
NEXT_PUBLIC_BASE_URL=https://your-app.zeabur.app

# 加密
ENCRYPTION_KEY=your-encryption-key

# Redis (由 Zeabur 自动注入，如果添加了 Redis 服务)
REDIS_URL=

# AI 服务 (按需配置)
SHENSUAN_BASE_URL=https://router.shengsuanyun.com/api/v1
# OPENAI_API_KEY=
# JINA_API_KEY=

# 存储
STORAGE_TYPE=LOCAL
UPLOAD_DIR=./uploads

# 阿里云 OSS (使用 OSS 存储时)
# ALIYUN_OSS_ACCESS_KEY_ID=
# ALIYUN_OSS_ACCESS_KEY_SECRET=
# ALIYUN_OSS_BUCKET=
# ALIYUN_OSS_REGION=oss-cn-hangzhou
```

## 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                     Zeabur Platform                       │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │   Next.js   │   │    MySQL    │   │    Redis    │   │
│  │     App     │◄──│   Database  │   │   (可选)    │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   │
│         │                                                 │
│         ▼                                                 │
│  ┌─────────────┐                                         │
│  │   Domain    │                                         │
│  │  Binding    │                                         │
│  └─────────────┘                                         │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## 常见问题

### Q: 部署失败，提示数据库连接错误

确保：
1. MySQL 服务已创建并运行
2. 等待几秒让数据库完全启动
3. 检查 `DATABASE_URL` 是否正确注入

### Q: 登录后 401 错误

检查 `AUTH_SECRET` 和 `AUTH_URL` 是否正确配置。

### Q: 运行时报错 `clientReferenceManifest` / `clientModules` 缺失

常见报错包括：
- `Invariant: Expected clientReferenceManifest to be defined`
- `TypeError: Cannot read properties of undefined (reading 'clientModules')`

通常原因是 **App Router 路由冲突**：Route Group 目录（例如 `(landing)`）不会出现在 URL 中，如果同时存在多个 `page.*` 映射到同一路径（尤其是 `/`），构建可能成功，但运行时会选到错误的产物从而缺少客户端引用清单。

解决方式：
1. 确保同一个 URL 只对应一个 `page.*`（例如不要同时存在 `src/app/page.tsx` 和 `src/app/(landing)/page.tsx`）。
2. 如果想实现「已登录重定向到 `/dashboard`、未登录展示 Landing」，将逻辑合并到 `src/app/page.tsx` 中即可。
3. Zeabur 重新部署时建议选择「清理构建缓存/无缓存重建」，避免旧的 `.next` 产物被复用。

自检（可选）：
- 本地 `pnpm build` 后检查 `.next/server/app-paths-manifest.json`，确认不存在与 `/` 重复的入口（例如 `"/(landing)/page"`）。

### Q: 文件上传失败

如需持久化存储，建议使用阿里云 OSS：
1. 设置 `STORAGE_TYPE=ALIYUN_OSS`
2. 配置相关 OSS 环境变量

### Q: 如何查看日志

在 Zeabur 服务页面点击「日志」标签即可查看实时日志。

### Q: 如何重新部署

推送代码到 GitHub 后，Zeabur 会自动触发重新部署。也可以在控制台手动触发。

## 生产环境优化

1. **使用 OSS 存储** - 避免本地存储在容器重启时丢失
2. **配置 Redis** - 启用任务队列以提高并发处理能力
3. **设置自定义域名** - 配置 HTTPS 和自定义域名
4. **监控告警** - 利用 Zeabur 的监控功能设置告警

## 更新部署

1. 本地修改代码
2. 提交并推送到 GitHub
3. Zeabur 自动检测并重新部署
4. 查看部署日志确认成功
