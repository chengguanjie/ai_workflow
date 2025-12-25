# Requirements Document

## Introduction

本文档定义了AI Workflow平台权限管理系统的完善需求。基于现有权限系统问题分析报告，需要修复安全漏洞、完善API权限检查、统一缓存策略、补充审计日志，并优化性能问题。

## Glossary

- **Permission_System**: 权限管理系统，负责控制用户对资源的访问权限
- **API_Token**: API访问令牌，用于外部系统调用API时的身份验证
- **Scope**: API Token的作用域，定义Token可访问的资源范围
- **Audit_Log**: 审计日志，记录系统中的重要操作事件
- **Resource_Permission**: 资源权限，包括VIEWER、EDITOR、MANAGER三个级别
- **Department**: 部门，组织内的层级结构单元
- **Organization**: 企业/组织，系统中的顶级租户单位
- **Cache**: 缓存系统，用于提升权限查询性能

## Requirements

### Requirement 1: 模板权限API实现

**User Story:** As a 企业管理员, I want to 管理模板的访问权限, so that 我可以控制哪些用户或部门可以使用特定模板。

#### Acceptance Criteria

1. WHEN 管理员请求获取模板权限列表 THEN THE Permission_System SHALL 返回该模板的所有权限设置，包括目标类型、目标ID、权限级别和创建者信息
2. WHEN 管理员添加模板权限 THEN THE Permission_System SHALL 创建新的权限记录并返回成功状态
3. WHEN 管理员更新模板权限 THEN THE Permission_System SHALL 更新现有权限记录的权限级别
4. WHEN 管理员删除模板权限 THEN THE Permission_System SHALL 移除指定的权限记录
5. IF 用户没有模板的MANAGER权限 THEN THE Permission_System SHALL 拒绝权限管理操作并返回403错误

### Requirement 2: 知识库权限缓存

**User Story:** As a 系统架构师, I want to 为知识库权限添加Redis缓存, so that 大规模企业下知识库权限查询性能得到优化。

#### Acceptance Criteria

1. WHEN 查询用户对知识库的权限 THEN THE Permission_System SHALL 首先检查Redis缓存
2. WHEN 缓存命中 THEN THE Permission_System SHALL 直接返回缓存的权限结果，不查询数据库
3. WHEN 缓存未命中 THEN THE Permission_System SHALL 查询数据库并将结果存入缓存
4. WHEN 知识库权限被修改 THEN THE Permission_System SHALL 清除该知识库相关的所有权限缓存
5. THE Permission_System SHALL 设置权限缓存的TTL为5分钟

### Requirement 3: API Token作用域验证

**User Story:** As a 安全工程师, I want to 验证API Token的作用域, so that Token只能访问其被授权的资源范围。

#### Acceptance Criteria

1. WHEN API请求携带Token THEN THE Permission_System SHALL 验证Token的scopes字段
2. WHEN Token的scopes不包含请求的资源类型 THEN THE Permission_System SHALL 拒绝请求并返回403错误
3. WHEN Token的scopes为空或包含通配符 THEN THE Permission_System SHALL 允许访问所有资源
4. THE Permission_System SHALL 支持以下作用域：workflows、knowledge-bases、templates、executions、tools

### Requirement 4: 部门API权限检查

**User Story:** As a 普通成员, I want to 只能看到自己所在部门的信息, so that 企业组织结构信息得到保护。

#### Acceptance Criteria

1. WHEN 普通成员请求部门列表 THEN THE Permission_System SHALL 只返回该成员所在部门及其子部门
2. WHEN OWNER或ADMIN请求部门列表 THEN THE Permission_System SHALL 返回企业的所有部门
3. WHEN 部门负责人请求部门列表 THEN THE Permission_System SHALL 返回其管理的部门及所有子部门
4. IF 用户请求不属于其可见范围的部门详情 THEN THE Permission_System SHALL 返回404错误

### Requirement 5: 部门层级深度限制

**User Story:** As a 系统管理员, I want to 限制部门嵌套深度, so that 避免无限嵌套导致的性能问题。

#### Acceptance Criteria

1. WHEN 创建或移动部门 THEN THE Permission_System SHALL 检查目标层级深度
2. IF 部门层级深度超过10级 THEN THE Permission_System SHALL 拒绝操作并返回错误信息
3. THE Permission_System SHALL 在部门创建时自动计算并存储level字段

### Requirement 6: 跨组织验证增强

**User Story:** As a 安全工程师, I want to 确保API Token只能访问其所属组织的资源, so that 防止跨组织数据泄露。

#### Acceptance Criteria

1. WHEN 使用API Token访问任务详情 THEN THE Permission_System SHALL 验证任务是否属于Token所属组织
2. WHEN 使用API Token访问工作流 THEN THE Permission_System SHALL 验证工作流是否属于Token所属组织
3. IF 资源不属于Token所属组织 THEN THE Permission_System SHALL 返回404错误而非403，避免信息泄露

### Requirement 7: 审计日志完善

**User Story:** As a 合规审计员, I want to 查看完整的权限变更记录, so that 我可以追踪所有敏感操作。

#### Acceptance Criteria

1. WHEN 权限被添加、更新或删除 THEN THE Audit_Log SHALL 记录permission.added、permission.updated或permission.removed事件
2. WHEN 部门被创建、更新或删除 THEN THE Audit_Log SHALL 记录department.created、department.updated或department.deleted事件
3. WHEN API Token被创建或撤销 THEN THE Audit_Log SHALL 记录api_token.created或api_token.revoked事件
4. WHEN 企业状态变更 THEN THE Audit_Log SHALL 记录organization.status_changed事件
5. THE Audit_Log SHALL 包含操作者ID、操作时间、操作类型、目标资源和变更详情

### Requirement 8: 权限API返回格式统一

**User Story:** As a 前端开发者, I want to 所有权限API返回统一的数据格式, so that 前端代码可以复用权限处理逻辑。

#### Acceptance Criteria

1. THE Permission_System SHALL 统一所有权限API的返回格式为：{ data: [...], currentUserPermission: string, canManage: boolean }
2. WHEN 返回权限列表 THEN THE Permission_System SHALL 包含targetType、targetId、targetName、permission、createdAt、createdBy字段
3. THE Permission_System SHALL 在响应中包含当前用户对该资源的权限级别

### Requirement 9: N+1查询优化

**User Story:** As a 后端开发者, I want to 优化权限查询的N+1问题, so that 权限列表查询性能得到提升。

#### Acceptance Criteria

1. WHEN 获取资源权限列表 THEN THE Permission_System SHALL 使用批量查询获取用户和部门信息
2. THE Permission_System SHALL 避免在循环中执行单独的数据库查询
3. THE Permission_System SHALL 使用findMany批量查询替代多次findUnique查询

### Requirement 10: 成员批量操作

**User Story:** As a 企业管理员, I want to 批量管理成员, so that 我可以高效地处理大量成员的角色和部门变更。

#### Acceptance Criteria

1. WHEN 管理员提交批量删除成员请求 THEN THE Permission_System SHALL 删除指定的多个成员
2. WHEN 管理员提交批量修改角色请求 THEN THE Permission_System SHALL 更新指定成员的角色
3. WHEN 管理员提交批量修改部门请求 THEN THE Permission_System SHALL 更新指定成员的部门
4. THE Permission_System SHALL 在批量操作完成后返回成功和失败的成员列表
5. THE Audit_Log SHALL 记录每个成员的变更操作

### Requirement 11: 企业安全设置类型定义

**User Story:** As a 开发者, I want to 为企业安全设置定义TypeScript类型, so that 代码更加类型安全且易于维护。

#### Acceptance Criteria

1. THE Permission_System SHALL 定义OrganizationSecuritySettings接口，包含passwordPolicy、sessionTimeout、ipWhitelist等字段
2. WHEN 读取或写入securitySettings THEN THE Permission_System SHALL 使用类型安全的方式处理数据
3. THE Permission_System SHALL 提供默认的安全设置值

