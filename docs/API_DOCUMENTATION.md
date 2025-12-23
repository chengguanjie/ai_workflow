# AI Workflow API 文档

本文档详细描述了 AI Workflow 平台的 HTTP API 接口。

## 📚 目录

- [概览](#概览)
- [认证](#认证)
- [工作流 (Workflows)](#工作流-workflows)
- [执行 (Executions)](#执行-executions)
- [知识库 (Knowledge Bases)](#知识库-knowledge-bases)
- [模板 (Templates)](#模板-templates)
- [文件 (Files)](#文件-files)
- [AI 助手 (AI Assistant)](#ai-助手-ai-assistant)
- [设置 (Settings)](#设置-settings)
- [公共接口 (Public)](#公共接口-public)

---

## 概览

### 基础 URL

- API Base URL: `/api`
- V1 Public API: `/api/v1`

### 响应格式

所有 API 响应遵循统一的 JSON 格式：

```json
// 成功响应
{
  "success": true,
  "data": { ... }
}

// 错误响应
{
  "success": false,
  "error": {
    "message": "错误描述",
    "details": { ... }
  }
}
```

### 错误码

- `400 Bad Request`: 参数错误
- `401 Unauthorized`: 未登录或 Token 无效
- `403 Forbidden`: 权限不足
- `404 Not Found`: 资源不存在
- `429 Too Many Requests`: 请求过于频繁
- `500 Internal Server Error`: 服务器内部错误

---

## 认证

大部分接口需要通过 Session Cookie 进行认证（由 NextAuth.js 管理）。

### 注册与登录

- `POST /api/auth/register` - 注册新企业账号
- `GET/POST /api/auth/[...nextauth]` - NextAuth 认证端点

### 邀请

- `GET /api/invite?token=xxx` - 获取邀请信息
- `POST /api/invite/accept` - 接受邀请

---

## 工作流 (Workflows)

核心工作流管理接口。

### 列表与详情

- `GET /api/workflows` - 获取工作流列表 (支持分页、搜索、筛选)
- `POST /api/workflows` - 创建新工作流
- `GET /api/workflows/[id]` - 获取工作流详情
- `PUT /api/workflows/[id]` - 更新工作流
- `DELETE /api/workflows/[id]` - 删除工作流

### 版本管理

- `GET /api/workflows/[id]/versions` - 获取版本列表
- `POST /api/workflows/[id]/versions` - 创建新版本
- `POST /api/workflows/[id]/versions/[versionId]/publish` - 发布版本

### 执行与测试

- `POST /api/workflows/[id]/execute` - 执行工作流
- `POST /api/workflows/[id]/compile` - 编译工作流 (验证)
- `POST /api/workflows/[id]/nodes/[nodeId]/debug` - 单节点调试

### 其他

- `POST /api/workflows/[id]/duplicate` - 复制工作流
- `GET /api/workflows/[id]/permissions` - 获取权限设置
- `POST /api/workflows/[id]/permissions` - 更新权限设置

---

## 执行 (Executions)

工作流执行记录与控制。

### 记录管理

- `GET /api/executions` - 获取执行记录列表
- `GET /api/executions/[id]` - 获取单个执行详情
- `GET /api/executions/[id]/files` - 获取执行输出文件

### 实时与控制

- `GET /api/executions/[id]/stream` - SSE 实时进度流
- `POST /api/executions/[id]/resume` - 恢复失败的执行 (断点续传)
- `POST /api/executions/[id]/cancel` - 取消正在运行的执行

### 任务队列

- `GET /api/tasks/[taskId]` - 查询异步任务状态

---

## 知识库 (Knowledge Bases)

RAG 知识库管理。

- `GET /api/knowledge-bases` - 获取知识库列表
- `POST /api/knowledge-bases` - 创建知识库
- `GET /api/knowledge-bases/[id]` - 获取详情
- `GET /api/knowledge-bases/[id]/documents` - 获取文档列表
- `POST /api/knowledge-bases/[id]/documents` - 上传文档
- `DELETE /api/knowledge-bases/[id]/documents/[docId]` - 删除文档
- `GET /api/knowledge-bases/[id]/progress` - 文档处理进度 SSE

---

## 模板 (Templates)

- `GET /api/templates` - 获取模板列表
- `POST /api/templates/[id]/use` - 使用模板创建工作流
- `GET /api/templates/categories` - 获取模板分类

---

## 文件 (Files)

平台文件存储服务。

- `POST /api/files/temp` - 上传临时文件
- `GET /api/files/[fileKey]` - 获取文件信息
- `GET /api/files/[fileKey]/download` - 下载文件 (支持断点续传)

---

## AI 助手 (AI Assistant)

集成 AI 能力。

- `POST /api/ai-assistant/chat` - AI 助手对话 (SSE)
- `POST /api/ai-assistant/optimize` - 工作流优化建议
- `POST /api/ai/generate-form-html` - 生成表单 HTML

---

## 设置 (Settings)

- `GET /api/settings/organization` - 获取企业信息
- `PUT /api/settings/organization` - 更新企业信息
- `GET /api/settings/members` - 成员管理
- `GET /api/settings/api-tokens` - API Token 管理
- `GET /api/settings/ai-config` - AI 模型配置

---

## 公共接口 (Public)

对外公开的接口，无需登录认证。

### Webhooks

- `POST /api/webhooks/[path]` - Webhook 触发器入口

### 公开表单

- `GET /api/public/forms/[token]` - 获取公开表单配置
- `POST /api/public/forms/[token]/submit` - 提交表单
- `GET /api/public/forms/[token]/execution/[id]` - 查询公开执行结果
