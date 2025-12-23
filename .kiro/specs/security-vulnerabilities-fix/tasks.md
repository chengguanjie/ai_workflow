# Implementation Plan: Security Vulnerabilities Fix

## Overview

本实现计划将安全漏洞修复分解为可执行的编码任务。任务按优先级排序，高风险漏洞优先修复。使用 TypeScript 实现，测试框架为 Vitest + fast-check。

## Tasks

- [x] 1. 安装安全相关依赖
  - 安装 `isomorphic-dompurify` 用于 XSS 防护
  - 安装 `@types/dompurify` 类型定义
  - _Requirements: 1.1, 1.2_

- [x] 2. 实现 XSS Sanitizer 模块
  - [x] 2.1 创建 XSS Sanitizer 核心实现
    - 创建 `src/lib/security/xss-sanitizer.ts`
    - 实现 `sanitizeHtml()` 函数使用 DOMPurify
    - 实现 `sanitizeCss()` 函数移除危险 CSS
    - 实现 `containsDangerousContent()` 检测函数
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.2 编写 XSS Sanitizer 属性测试
    - **Property 1: HTML/CSS Sanitization Safety**
    - **Property 2: Sanitization Idempotence**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**

  - [x] 2.3 修复公开表单页面 XSS 漏洞
    - 更新 `src/app/(public)/form/[token]/page.tsx`
    - 在渲染前对 `htmlTemplate` 和 `cssStyles` 进行消毒
    - _Requirements: 1.4_

- [x] 3. 实现 SQL Identifier Validator 模块
  - [x] 3.1 创建 SQL Validator 核心实现
    - 创建 `src/lib/security/sql-validator.ts`
    - 实现 `validateIdentifier()` 函数
    - 实现 `validateTableName()` 和 `validateIndexName()` 函数
    - 实现 `getSafeIdentifier()` 函数（验证失败抛出错误）
    - 定义 SQL 保留关键字列表
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.2 编写 SQL Validator 属性测试
    - **Property 3: SQL Identifier Validation Correctness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [x] 3.3 修复 PgVectorStore SQL 注入漏洞
    - 更新 `src/lib/knowledge/vector-store/pg-vector-store.ts`
    - 在构造函数中验证 `tableName`
    - 在 `createVectorIndex()` 中验证索引名
    - _Requirements: 2.1, 2.2_

- [x] 4. Checkpoint - 确保高风险漏洞修复测试通过
  - 运行 XSS 和 SQL 相关测试
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 配置安全响应头
  - [x] 5.1 更新 Next.js 配置添加安全头
    - 更新 `next.config.ts`
    - 添加 X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
    - 添加 Strict-Transport-Security, Referrer-Policy
    - 添加 Permissions-Policy, Content-Security-Policy
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 5.2 编写安全头属性测试
    - **Property 4: Security Headers Presence**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

- [x] 6. 实现 Sensitive Data Masker 模块
  - [x] 6.1 创建 Sensitive Masker 核心实现
    - 创建 `src/lib/security/sensitive-masker.ts`
    - 实现 `maskApiKey()`, `maskPassword()`, `maskEmail()` 函数
    - 实现通用 `mask()` 函数
    - 实现 `redactSensitiveFields()` 函数
    - _Requirements: 4.3, 4.4_

  - [x] 6.2 编写 Sensitive Masker 属性测试
    - **Property 5: Sensitive Data Masking**
    - **Validates: Requirements 4.3, 4.4**

  - [x] 6.3 修复默认密码和敏感信息泄露
    - 更新 `scripts/init-platform-admin.ts`
    - 移除默认密码，强制要求环境变量
    - 移除密码日志输出
    - 更新 `src/lib/crypto/index.ts` 移除默认盐值
    - _Requirements: 4.1, 4.2, 4.5_

- [x] 7. 实现全局速率限制中间件
  - [x] 7.1 创建速率限制中间件
    - 创建 `src/middleware.ts`
    - 集成现有 RateLimiter 类
    - 配置不同端点的速率限制
    - 实现 IP 提取和白名单功能
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 7.2 编写速率限制属性测试
    - **Property 6: Rate Limiting Enforcement**
    - **Validates: Requirements 5.3, 5.4, 5.6**

- [x] 8. Checkpoint - 确保中风险漏洞修复测试通过
  - 运行安全头、敏感数据、速率限制相关测试
  - 确保所有测试通过，如有问题请询问用户

- [x] 9. 实现 File Validator 模块
  - [x] 9.1 创建 File Validator 核心实现
    - 创建 `src/lib/security/file-validator.ts`
    - 实现 `validateExtension()`, `validateMimeType()` 函数
    - 实现 `validateSize()`, `sanitizeFilename()` 函数
    - 实现 `validateStoragePath()` 函数
    - 实现综合 `validateFile()` 函数
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 9.2 编写 File Validator 属性测试
    - **Property 7: File Upload Path Containment**
    - **Property 8: Filename Sanitization Safety**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**

  - [x] 9.3 集成 File Validator 到文件上传 API
    - 更新 `src/app/api/files/route.ts`
    - 更新 `src/app/api/files/temp/route.ts`
    - 使用 File Validator 进行验证
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 10. Session 安全增强
  - [x] 10.1 更新认证配置
    - 更新 `src/lib/auth/index.ts`
    - 添加环境变量配置 session 时长
    - 确保 cookie 配置为 secure 和 httpOnly
    - _Requirements: 7.1, 7.2, 7.5_

- [x] 11. 依赖安全审计
  - [x] 11.1 创建安全审计脚本
    - 创建 `scripts/security-audit.sh`
    - 实现依赖漏洞扫描
    - 输出漏洞报告
    - _Requirements: 8.1, 8.2_

  - [x] 11.2 更新 package.json 脚本
    - 添加 `security:audit` 脚本
    - _Requirements: 8.1_

- [x] 12. 创建安全模块导出索引
  - 创建 `src/lib/security/index.ts`
  - 导出所有安全模块
  - _Requirements: 1.1, 2.1, 4.3, 6.1_

- [x] 13. Final Checkpoint - 确保所有安全测试通过
  - 运行完整测试套件
  - 确保所有属性测试通过
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 所有任务均为必需，确保全面的安全测试覆盖
- 每个任务引用具体需求以便追溯
- 检查点确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
