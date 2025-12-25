# Implementation Plan: Enterprise User Flow Enhancement

## Overview

本实施计划将企业用户流程改进分为多个阶段，优先实现安全性修复，然后完善核心功能。

## Tasks

- [-] 1. 创建密码验证器和生成器
  - [x] 1.1 创建 `src/lib/auth/password-validator.ts`
    - 实现 `validatePassword()` 函数，验证密码强度
    - 实现 `generateSecurePassword()` 函数，生成安全密码
    - 导出 `PasswordRequirements` 和 `PasswordValidationResult` 类型
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 1.2, 7.1_
  - [ ] 1.2 编写密码验证器属性测试
    - **Property 1: Password Validation Completeness**
    - **Property 2: Secure Password Generation**
    - **Validates: Requirements 4.1-4.5, 1.2, 7.1**

- [ ] 2. 实现登录失败锁定机制
  - [ ] 2.1 添加数据库迁移
    - 在 User 模型添加 `loginAttempts` 和 `lockedUntil` 字段
    - 运行 `prisma migrate dev`
    - _Requirements: 3.1, 3.3_
  - [ ] 2.2 创建 `src/lib/auth/login-limiter.ts`
    - 实现 `checkLoginAllowed()` 检查是否允许登录
    - 实现 `recordFailedAttempt()` 记录失败尝试
    - 实现 `resetLoginAttempts()` 重置计数器
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ] 2.3 编写登录限制器属性测试
    - **Property 4: Login Attempt Tracking**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [ ] 3. 实现企业状态验证
  - [ ] 3.1 创建 `src/lib/auth/org-status-checker.ts`
    - 实现 `checkOrganizationStatus()` 函数
    - 定义状态消息映射
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ] 3.2 编写企业状态检查属性测试
    - **Property 3: Organization Status Blocking**
    - **Validates: Requirements 2.1-2.5**

- [ ] 4. 集成认证流程改进
  - [ ] 4.1 修改 `src/lib/auth/index.ts`
    - 在 authorize 函数中集成企业状态检查
    - 在 authorize 函数中集成登录限制检查
    - 登录成功后重置失败计数
    - _Requirements: 2.1, 3.1, 3.2_
  - [ ] 4.2 编写认证流程集成测试
    - 测试企业状态阻断
    - 测试登录锁定
    - _Requirements: 2.1-2.5, 3.1-3.5_

- [ ] 5. Checkpoint - 安全性修复验证
  - 确保所有测试通过，如有问题请询问用户

- [ ] 6. 修复企业创建时的密码安全问题
  - [ ] 6.1 修改 `src/app/api/console/organizations/route.ts`
    - 使用 `generateSecurePassword(16)` 替换现有密码生成
    - 创建用户时设置 `mustChangePassword: true`
    - _Requirements: 1.1, 1.2_
  - [ ] 6.2 编写企业创建属性测试
    - **Property 5: Must Change Password Flag**
    - **Validates: Requirements 1.1**

- [ ] 7. 改进成员创建密码生成
  - [ ] 7.1 修改 `src/app/api/settings/members/route.ts`
    - 使用 `generateSecurePassword()` 替换固定密码 "123456"
    - 在响应中返回生成的密码
    - 确保 `mustChangePassword: true` 已设置
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ] 7.2 编写成员创建测试
    - 验证密码生成和 mustChangePassword 设置
    - _Requirements: 7.1, 7.3_

- [ ] 8. 统一密码修改页面验证
  - [ ] 8.1 修改 `src/app/(auth)/change-password/page.tsx`
    - 集成 Password_Validator 进行前端验证
    - 显示密码强度指示器
    - _Requirements: 4.6_
  - [ ] 8.2 修改 `src/app/(auth)/invite/[token]/page.tsx`
    - 集成 Password_Validator 进行前端验证
    - _Requirements: 4.7_

- [ ] 9. Checkpoint - 密码安全验证
  - 确保所有测试通过，如有问题请询问用户

- [ ] 10. 实现部门负责人管理功能
  - [ ] 10.1 修改 `src/app/api/settings/departments/route.ts`
    - POST 接口支持 managerId 参数
    - 返回数据包含 manager 信息
    - _Requirements: 5.1, 5.3_
  - [ ] 10.2 修改 `src/app/api/settings/departments/[id]/route.ts`
    - PATCH 接口支持修改 managerId
    - _Requirements: 5.2_
  - [ ] 10.3 修改 `src/app/(dashboard)/settings/departments/page.tsx`
    - 添加部门负责人选择器
    - 在部门列表显示负责人信息
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 11. 实现成员删除时清理负责人
  - [ ] 11.1 修改成员删除 API
    - 删除成员前清理其负责的部门
    - _Requirements: 5.4_
  - [ ] 11.2 编写负责人清理属性测试
    - **Property 6: Manager Cleanup on Member Removal**
    - **Validates: Requirements 5.4**

- [ ] 12. 完善成员角色管理
  - [ ] 12.1 修改 `src/app/(dashboard)/settings/members/page.tsx`
    - 添加 EDITOR 和 VIEWER 角色选项
    - 添加角色说明文案
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 13. Final Checkpoint - 全面验证
  - 确保所有测试通过，如有问题请询问用户
  - 验证完整用户流程

## Notes

- 所有任务均为必需，包括测试任务
- 每个任务都引用了具体的需求以便追溯
- 检查点用于增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
