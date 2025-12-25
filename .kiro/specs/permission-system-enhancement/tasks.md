# Implementation Plan: Permission System Enhancement

## Overview

本实现计划将权限系统完善功能分解为可执行的编码任务，按照优先级和依赖关系组织。每个任务都包含具体的实现目标和验收标准。

## Tasks

- [x] 1. 基础类型定义和工具函数
  - [x] 1.1 创建企业安全设置类型定义
    - 在 `src/types/organization.ts` 中定义 `OrganizationSecuritySettings` 接口
    - 定义 `PasswordPolicy` 接口
    - 提供 `DEFAULT_SECURITY_SETTINGS` 常量
    - _Requirements: 11.1, 11.3_
  - [x] 1.2 创建API Token作用域类型和验证器
    - 在 `src/lib/auth/token-scope-validator.ts` 中定义 `TokenScope` 类型
    - 实现 `validateScope()` 函数
    - 实现 `inferScopeFromPath()` 函数
    - _Requirements: 3.1, 3.4_
  - [x] 1.3 编写Token作用域验证器属性测试
    - **Property 5: API Token Scope Enforcement**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 2. 知识库权限缓存实现
  - [x] 2.1 创建知识库权限缓存服务
    - 在 `src/lib/permissions/knowledge-base.ts` 中实现缓存逻辑
    - 实现 `getKnowledgeBasePermissionLevel()` 带缓存版本
    - 实现 `checkKnowledgeBasePermission()` 带缓存版本
    - 实现 `invalidateKnowledgeBasePermissionCache()` 缓存清除
    - 设置缓存TTL为5分钟
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 2.2 编写知识库权限缓存属性测试
    - **Property 3: Knowledge Base Permission Cache Behavior**
    - **Property 4: Cache Invalidation on Permission Change**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [x] 3. 模板权限API实现
  - [x] 3.1 创建模板权限API路由
    - 创建 `src/app/api/templates/[id]/permissions/route.ts`
    - 实现 GET 方法获取权限列表
    - 实现 POST 方法添加/更新权限
    - 实现 DELETE 方法删除权限
    - 添加MANAGER权限检查
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 3.2 编写模板权限API属性测试
    - **Property 1: Template Permission CRUD Consistency**
    - **Property 2: Permission Management Authorization**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

- [x] 4. 部门权限检查增强
  - [x] 4.1 创建部门可见性服务
    - 在 `src/lib/permissions/department-visibility.ts` 中实现
    - 实现 `getVisibleDepartmentIds()` 函数
    - 实现 `canViewDepartment()` 函数
    - 根据用户角色返回不同的可见部门
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 4.2 更新部门API添加可见性检查
    - 修改 `src/app/api/settings/departments/route.ts`
    - 在GET方法中添加部门可见性过滤
    - 在部门详情API中添加访问权限检查
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 4.3 添加部门层级深度限制
    - 在部门创建/移动时检查层级深度
    - 最大深度限制为10级
    - 自动计算并存储level字段
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 4.4 编写部门权限属性测试
    - **Property 6: Department Visibility by Role**
    - **Property 7: Department Level Calculation**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.3**

- [x] 5. Checkpoint - 核心权限功能验证
  - 确保所有测试通过，ask the user if questions arise.

- [x] 6. API Token作用域验证中间件
  - [x] 6.1 创建Token作用域验证中间件
    - 在 `src/lib/auth/token-scope-middleware.ts` 中实现
    - 在API路由中集成作用域验证
    - 支持workflows、knowledge-bases、templates、executions、tools作用域
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 6.2 添加跨组织验证增强
    - 在 `src/app/api/v1/tasks/[taskId]/route.ts` 中添加组织验证
    - 在工作流API中添加组织验证
    - 跨组织访问返回404而非403
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 6.3 编写跨组织验证属性测试
    - **Property 8: Cross-Organization Access Prevention**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 7. 审计日志完善
  - [x] 7.1 扩展审计日志服务
    - 在 `src/lib/audit/audit-service.ts` 中添加新事件类型
    - 实现 `logPermissionChange()` 方法
    - 实现 `logDepartmentChange()` 方法
    - 实现 `logApiTokenChange()` 方法
    - 实现 `logOrganizationStatusChange()` 方法
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 7.2 在权限操作中集成审计日志
    - 在模板权限API中添加审计日志
    - 在知识库权限API中添加审计日志
    - 在工作流权限API中添加审计日志
    - _Requirements: 7.1_
  - [x] 7.3 在部门操作中集成审计日志
    - 在部门创建时记录日志
    - 在部门更新时记录日志
    - 在部门删除时记录日志
    - _Requirements: 7.2_
  - [x] 7.4 在Token操作中集成审计日志
    - 在API Token创建时记录日志
    - 在API Token撤销时记录日志
    - _Requirements: 7.3_
  - [x] 7.5 编写审计日志属性测试
    - **Property 9: Audit Log Completeness**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 8. 权限API格式统一
  - [x] 8.1 统一工作流权限API返回格式
    - 修改 `src/app/api/workflows/[id]/permissions/route.ts`
    - 返回格式统一为 `{ data, currentUserPermission, canManage }`
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 8.2 统一知识库权限API返回格式
    - 修改 `src/app/api/knowledge-bases/[id]/permissions/route.ts`
    - 返回格式统一为 `{ data, currentUserPermission, canManage }`
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 8.3 编写API格式统一属性测试
    - **Property 10: Permission API Response Format Consistency**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 9. Checkpoint - API完善验证
  - 确保所有测试通过，ask the user if questions arise.

- [x] 10. 成员批量操作API
  - [x] 10.1 创建成员批量操作API
    - 创建 `src/app/api/settings/members/batch/route.ts`
    - 实现批量删除成员功能
    - 实现批量修改角色功能
    - 实现批量修改部门功能
    - 返回成功和失败的成员列表
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 10.2 在批量操作中集成审计日志
    - 为每个成员变更记录审计日志
    - 使用批量日志记录优化性能
    - _Requirements: 10.5_
  - [x] 10.3 编写批量操作属性测试
    - **Property 11: Batch Operation Result Completeness**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

- [x] 11. N+1查询优化
  - [x] 11.1 优化资源权限列表查询
    - 修改 `src/lib/permissions/resource.ts` 中的 `getResourcePermissions()`
    - 使用 `findMany` 批量查询用户和部门信息
    - 避免在循环中执行单独的数据库查询
    - _Requirements: 9.1_

- [x] 12. Final Checkpoint - 完整功能验证
  - 确保所有测试通过，ask the user if questions arise.
  - 验证所有权限API返回格式一致
  - 验证审计日志记录完整
  - 验证缓存功能正常工作

## Notes

- All tasks are required for comprehensive testing from the start
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 建议按照任务顺序执行，因为后续任务可能依赖前面的实现
- 缓存相关功能需要确保Redis服务可用
- 审计日志功能需要确保AuditLog表已存在

