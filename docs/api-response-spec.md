# API 响应格式规范

> 本文档定义了 AI Workflow 项目中 API 响应的统一格式规范。

---

## 📋 概述

所有 API 响应应使用 `@/lib/api/api-response` 中的 `ApiResponse` 类，以确保：

1. **一致性** - 所有响应遵循相同结构
2. **类型安全** - TypeScript 类型推断
3. **可维护性** - 集中管理响应格式
4. **前端友好** - 前端可统一处理响应

---

## 🎯 响应格式

### 成功响应

```json
{
  "success": true,
  "data": { ... }
}
```

### 分页响应

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "message": "错误描述",
    "details": { ... }  // 可选
  }
}
```

---

## 🛠️ 使用方法

### 导入

```typescript
import { ApiResponse } from '@/lib/api/api-response'
```

### 成功响应

```typescript
// 200 OK
return ApiResponse.success(data)

// 自定义状态码
return ApiResponse.success(data, 200)
```

### 创建响应

```typescript
// 201 Created
return ApiResponse.created(newResource)
```

### 无内容响应

```typescript
// 204 No Content
return ApiResponse.noContent()
```

### 分页响应

```typescript
return ApiResponse.paginated(items, {
  page: 1,
  pageSize: 20,
  total: 100
})
```

### 错误响应

```typescript
// 400 Bad Request
return ApiResponse.error('参数无效', 400)

// 401 Unauthorized
return ApiResponse.error('未登录', 401)

// 403 Forbidden
return ApiResponse.error('权限不足', 403)

// 404 Not Found
return ApiResponse.error('资源不存在', 404)

// 500 Internal Server Error
return ApiResponse.error('服务器错误', 500)

// 带详细信息
return ApiResponse.error('验证失败', 400, {
  field: 'email',
  reason: '格式不正确'
})
```

---

## 📝 迁移指南

### 旧代码模式

```typescript
// ❌ 不推荐
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const data = await fetchData()
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: '获取失败' },
      { status: 500 }
    )
  }
}
```

### 新代码模式

```typescript
// ✅ 推荐
import { ApiResponse } from '@/lib/api/api-response'
import { withAuth, AuthContext } from '@/lib/api/with-auth'

export const GET = withAuth(async (request, { user }: AuthContext) => {
  const data = await fetchData(user.organizationId)
  return ApiResponse.success(data)
})
```

---

## 🔧 配合中间件使用

### withAuth

```typescript
import { withAuth, AuthContext } from '@/lib/api/with-auth'

export const GET = withAuth(async (request, { user }: AuthContext) => {
  // user 包含认证信息
  return ApiResponse.success({ userId: user.id })
})
```

### withValidation

```typescript
import { validateRequestBody, validateQueryParams } from '@/lib/api/with-validation'
import { mySchema } from '@/lib/validations/my-schema'

export const POST = withAuth(async (request, { user }) => {
  // 自动验证请求体
  const data = await validateRequestBody(request, mySchema)
  return ApiResponse.created(data)
})
```

---

## 📊 迁移状态

### 统计

| 状态 | 数量 |
|------|------|
| 已迁移 | ~36 |
| 待迁移 | ~83 |
| 总计 | ~119 |

### 优先级

1. **P0 (高)**: 核心业务 API（workflows, executions, templates）
2. **P1 (中)**: 用户认证相关 API（auth, users）
3. **P2 (低)**: 管理后台 API（console/*）
4. **P3 (最低)**: 工具类 API（ai-assistant, debug）

---

## ✅ 检查清单

迁移 API 时，确保：

- [ ] 使用 `ApiResponse` 类
- [ ] 成功响应包含 `success: true`
- [ ] 错误响应包含 `success: false` 和 `error.message`
- [ ] 分页响应使用 `ApiResponse.paginated`
- [ ] 使用 `withAuth` 进行认证
- [ ] 使用 `validateRequestBody` 验证请求体

---

**最后更新**: 2025-12-23
