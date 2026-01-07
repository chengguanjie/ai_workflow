# API 快速上手指南

本指南将帮助你快速开始使用 AI Workflow 的 API 接口。

---

## 📋 前置准备

### 1. 启动开发服务器

```bash
# 进入项目目录
cd /path/to/ai-workflow

# 启动开发服务器（默认端口 3000）
pnpm dev
```

服务器启动后会显示：

```
✓ Ready on http://localhost:3000
```

### 2. 获取 API Token

有两种方式获取 API Token：

#### 方式一：通过 Web 界面（推荐）

1. 登录系统：http://localhost:3000
2. 进入「设置」→「API Token」
3. 点击「创建 Token」
4. 选择权限范围（scopes），例如：
   - `workflows` - 工作流管理
   - `executions` - 执行记录
   - `knowledge_bases` - 知识库
5. 复制生成的 Token（格式：`wf_xxxxx...`）

#### 方式二：通过数据库查询

```bash
# 查询现有 Token
pnpm db:studio
# 在 Prisma Studio 中打开 ApiToken 表查看
```

---

## 🚀 API 调用示例

### 示例 1：获取工作流列表

#### 使用项目脚本

```bash
# 设置环境变量并运行
WORKFLOW_API_TOKEN="wf_xIQi-ljimvi3LudxmHXpU7Fjy3g_VVAaLpaZLq39NXI" \
pnpm -s workflow:list:api --base-url http://localhost:3000
```

可选参数：
- `--page` - 页码（默认：1）
- `--pageSize` - 每页数量（默认：20，最大：100）
- `--search` - 搜索关键词
- `--category` - 分类筛选

#### 使用 curl

```bash
curl -X GET "http://localhost:3000/api/v1/workflows?page=1&pageSize=20" \
  -H "Authorization: Bearer wf_xIQi-ljimvi3LudxmHXpU7Fjy3g_VVAaLpaZLq39NXI" \
  -H "Content-Type: application/json"
```

#### 使用 JavaScript

```javascript
const TOKEN = 'wf_xIQi-ljimvi3LudxmHXpU7Fjy3g_VVAaLpaZLq39NXI';
const BASE_URL = 'http://localhost:3000';

async function getWorkflows() {
  const response = await fetch(`${BASE_URL}/api/v1/workflows`, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  console.log('工作流列表:', result.data);
  console.log('分页信息:', result.pagination);
  return result;
}

getWorkflows();
```

#### 响应格式

```json
{
  "success": true,
  "data": [
    {
      "id": "cm12345678",
      "name": "我的工作流",
      "description": "工作流描述",
      "category": "数据处理",
      "tags": ["AI", "自动化"],
      "isActive": true,
      "publishStatus": "published",
      "version": "1.0.0",
      "createdAt": "2025-01-07T10:00:00.000Z",
      "updatedAt": "2025-01-07T12:00:00.000Z",
      "creator": {
        "id": "user_123",
        "name": "张三",
        "email": "zhangsan@example.com"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 15
  }
}
```

---

### 示例 2：执行工作流

```bash
curl -X POST "http://localhost:3000/api/v1/workflows/cm12345678/execute" \
  -H "Authorization: Bearer wf_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "query": "你好，世界"
    }
  }'
```

响应：

```json
{
  "success": true,
  "data": {
    "executionId": "exec_abc123",
    "status": "running",
    "createdAt": "2025-01-07T12:30:00.000Z"
  }
}
```

---

### 示例 3：获取工作流详情

```bash
curl -X GET "http://localhost:3000/api/v1/workflows/cm12345678" \
  -H "Authorization: Bearer wf_your_token"
```

---

## ⚠️ 常见问题

### 1. 连接超时 `ECONNREFUSED`

**原因**：开发服务器未启动或端口不匹配

**解决**：
```bash
# 检查服务器是否运行
lsof -i :3000

# 如果没有运行，启动服务器
pnpm dev
```

### 2. 401 Unauthorized

**原因**：API Token 无效、已过期或权限不足

**解决**：
- 检查 Token 是否正确复制
- 确认 Token 包含所需的 scopes
- 在数据库中检查 Token 是否 `isActive=true` 且未过期

### 3. 数据库连接失败

**原因**：缺少 `DATABASE_URL` 环境变量

**解决**：
```bash
# 创建 .env 文件
cat > .env << EOF
DATABASE_URL="mysql://user:password@localhost:3306/ai_workflow"
EOF

# 初始化数据库
pnpm db:push
```

### 4. 端口被占用

**原因**：3000 端口已被其他程序使用

**解决**：
```bash
# 方式 1：停止占用端口的程序
lsof -ti :3000 | xargs kill

# 方式 2：使用其他端口
PORT=3004 pnpm dev
```

---

## 📖 进阶使用

### 分页查询

```javascript
// 获取第 2 页，每页 50 条
const response = await fetch(
  `${BASE_URL}/api/v1/workflows?page=2&pageSize=50`,
  { headers: { 'Authorization': `Bearer ${TOKEN}` } }
);
```

### 搜索和筛选

```javascript
// 搜索包含"客服"的工作流，分类为"AI助手"
const response = await fetch(
  `${BASE_URL}/api/v1/workflows?search=客服&category=AI助手`,
  { headers: { 'Authorization': `Bearer ${TOKEN}` } }
);
```

### 批量操作

```javascript
// 获取所有工作流
async function getAllWorkflows() {
  const allWorkflows = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await fetch(
      `${BASE_URL}/api/v1/workflows?page=${page}&pageSize=100`,
      { headers: { 'Authorization': `Bearer ${TOKEN}` } }
    );
    const result = await response.json();
    
    allWorkflows.push(...result.data);
    hasMore = result.data.length === 100;
    page++;
  }
  
  return allWorkflows;
}
```

---

## 🔗 相关文档

- [完整 API 文档](./API_DOCUMENTATION.md)
- [权限系统设计](./permission-system-design.md)
- [部署指南](./zeabur-deployment.md)

---

**维护者**: AI Workflow Team  
**最后更新**: 2025-01-07

