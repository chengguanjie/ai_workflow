# Design Document: Security Vulnerabilities Fix

## Overview

本设计文档描述了 AI Workflow 项目安全漏洞修复的技术方案。基于安全审计发现的问题，我们将实现一套完整的安全加固措施，包括 XSS 防护、SQL 注入防护、安全响应头、速率限制等。

## Architecture

### 安全模块架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js Middleware                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Rate Limiter│  │Security Hdrs│  │   Request Logger    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Route Handlers                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  withAuth   │  │withValidation│  │   File Upload      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Security Utilities                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │XSS Sanitizer│  │SQL Validator│  │  Sensitive Masker   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. XSS Sanitizer Module

**文件位置**: `src/lib/security/xss-sanitizer.ts`

```typescript
interface SanitizeOptions {
  allowedTags?: string[]
  allowedAttributes?: Record<string, string[]>
  allowedStyles?: string[]
}

interface XSSSanitizer {
  // 消毒 HTML 内容
  sanitizeHtml(html: string, options?: SanitizeOptions): string
  
  // 消毒 CSS 内容
  sanitizeCss(css: string): string
  
  // 检查内容是否包含危险元素
  containsDangerousContent(content: string): boolean
}
```

**实现策略**:
- 使用 `isomorphic-dompurify` 库进行 HTML 消毒（支持 SSR）
- 自定义 CSS 消毒器，移除 `url()`, `expression()`, `javascript:` 等危险规则
- 默认移除所有 `<script>`, `<iframe>`, `on*` 事件处理器

### 2. SQL Identifier Validator

**文件位置**: `src/lib/security/sql-validator.ts`

```typescript
interface SQLValidator {
  // 验证表名
  validateTableName(name: string): boolean
  
  // 验证索引名
  validateIndexName(name: string): boolean
  
  // 验证通用标识符
  validateIdentifier(identifier: string): boolean
  
  // 获取安全的标识符（验证失败则抛出错误）
  getSafeIdentifier(identifier: string): string
}
```

**验证规则**:
- 只允许字母、数字、下划线
- 必须以字母或下划线开头
- 长度限制 1-64 字符
- 禁止 SQL 保留关键字

### 3. Security Headers Configuration

**文件位置**: `next.config.ts` (更新)

```typescript
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" },
]
```

### 4. Rate Limiter Middleware

**文件位置**: `src/middleware.ts` (新建/更新)

```typescript
interface RateLimitMiddlewareConfig {
  // 端点配置
  endpoints: {
    pattern: RegExp
    config: RateLimitConfig
  }[]
  
  // 默认配置
  defaultConfig: RateLimitConfig
  
  // 白名单路径
  whitelist: string[]
}
```

### 5. Sensitive Data Masker

**文件位置**: `src/lib/security/sensitive-masker.ts`

```typescript
interface SensitiveMasker {
  // 掩码 API Key
  maskApiKey(key: string): string
  
  // 掩码密码
  maskPassword(password: string): string
  
  // 掩码邮箱
  maskEmail(email: string): string
  
  // 通用掩码
  mask(value: string, visibleStart?: number, visibleEnd?: number): string
  
  // 从对象中移除敏感字段
  redactSensitiveFields(obj: Record<string, unknown>, sensitiveKeys: string[]): Record<string, unknown>
}
```

### 6. File Upload Security

**文件位置**: `src/lib/security/file-validator.ts`

```typescript
interface FileValidationResult {
  valid: boolean
  error?: string
}

interface FileValidator {
  // 验证文件扩展名
  validateExtension(filename: string, allowedExtensions: Set<string>): FileValidationResult
  
  // 验证 MIME 类型
  validateMimeType(mimeType: string, extension: string): FileValidationResult
  
  // 验证文件大小
  validateSize(size: number, maxSize: number): FileValidationResult
  
  // 消毒文件名
  sanitizeFilename(filename: string): string
  
  // 验证存储路径安全
  validateStoragePath(path: string, baseDir: string): FileValidationResult
  
  // 综合验证
  validateFile(file: File, options: FileValidationOptions): FileValidationResult
}
```

## Data Models

### 安全配置模型

```typescript
interface SecurityConfig {
  // XSS 配置
  xss: {
    enabled: boolean
    allowedTags: string[]
    allowedAttributes: Record<string, string[]>
  }
  
  // 速率限制配置
  rateLimit: {
    enabled: boolean
    defaultWindowMs: number
    defaultMaxRequests: number
    endpoints: Record<string, { windowMs: number; maxRequests: number }>
  }
  
  // 文件上传配置
  fileUpload: {
    maxSize: number
    allowedExtensions: string[]
    allowedMimeTypes: string[]
  }
  
  // Session 配置
  session: {
    maxAge: number
    sensitiveOperationMaxAge: number
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: HTML/CSS Sanitization Safety

*For any* HTML or CSS string input, after sanitization, the output SHALL NOT contain any script tags, event handlers (on* attributes), javascript: URLs, or dangerous CSS functions (expression, url with javascript).

**Validates: Requirements 1.1, 1.2, 1.3, 1.5**

### Property 2: Sanitization Idempotence

*For any* HTML content, sanitizing it once and sanitizing it twice SHALL produce identical output (idempotence property).

**Validates: Requirements 1.5**

### Property 3: SQL Identifier Validation Correctness

*For any* string input to the SQL identifier validator, if the string matches the pattern `^[a-zA-Z_][a-zA-Z0-9_]{0,63}$` and is not a SQL reserved keyword, the validator SHALL return true; otherwise it SHALL return false.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 4: Security Headers Presence

*For any* HTTP response from the application, all configured security headers SHALL be present with their specified values.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

### Property 5: Sensitive Data Masking

*For any* string passed through the masking function, the output SHALL NOT contain the original sensitive content in full, and SHALL preserve only the specified visible portions.

**Validates: Requirements 4.3, 4.4**

### Property 6: Rate Limiting Enforcement

*For any* sequence of N requests from the same client within a time window, if N <= limit, all requests SHALL be allowed; if N > limit, requests beyond the limit SHALL be blocked with HTTP 429.

**Validates: Requirements 5.3, 5.4, 5.6**

### Property 7: File Upload Path Containment

*For any* uploaded file, the final storage path SHALL be a descendant of the configured upload directory, preventing path traversal attacks.

**Validates: Requirements 6.3, 6.6**

### Property 8: Filename Sanitization Safety

*For any* filename input containing path traversal sequences (../, ..\, etc.) or special characters, the sanitized output SHALL NOT contain these dangerous sequences.

**Validates: Requirements 6.3**

## Error Handling

### 错误类型定义

```typescript
// XSS 相关错误
class XSSSanitizationError extends AppError {
  code = 'XSS_SANITIZATION_FAILED'
  statusCode = 400
}

// SQL 验证错误
class SQLValidationError extends AppError {
  code = 'INVALID_SQL_IDENTIFIER'
  statusCode = 400
}

// 文件验证错误
class FileValidationError extends AppError {
  code = 'FILE_VALIDATION_FAILED'
  statusCode = 400
}

// 配置错误
class SecurityConfigError extends AppError {
  code = 'SECURITY_CONFIG_ERROR'
  statusCode = 500
}
```

### 错误处理策略

1. **XSS 检测**: 记录警告日志，返回消毒后的内容
2. **SQL 注入尝试**: 记录安全日志，拒绝请求
3. **文件验证失败**: 返回详细错误信息，不暴露内部路径
4. **配置缺失**: 启动时失败，记录错误

## Testing Strategy

### 单元测试

- 测试各安全模块的独立功能
- 测试边界条件和错误处理
- 使用 Vitest 框架

### 属性测试

- 使用 `fast-check` 库进行属性测试
- 每个属性测试至少运行 100 次迭代
- 测试标签格式: `**Feature: security-vulnerabilities-fix, Property {number}: {property_text}**`

### 测试覆盖

| 模块 | 单元测试 | 属性测试 |
|------|---------|---------|
| XSS Sanitizer | ✓ | ✓ (Property 1, 2) |
| SQL Validator | ✓ | ✓ (Property 3) |
| Security Headers | ✓ | ✓ (Property 4) |
| Sensitive Masker | ✓ | ✓ (Property 5) |
| Rate Limiter | ✓ | ✓ (Property 6) |
| File Validator | ✓ | ✓ (Property 7, 8) |

### 集成测试

- 测试中间件与 API 路由的集成
- 测试安全头在实际响应中的存在
- 测试速率限制在实际请求中的效果
