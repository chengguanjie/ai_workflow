# Requirements Document

## Introduction

本功能旨在修复和改进企业账号管理用户流程中发现的安全性和功能性问题。涵盖从平台管理员创建企业账号，到企业主登录、创建部门、成员管理等完整用户流程的改进。

## Glossary

- **Platform_Admin**: 平台管理员，负责创建和管理企业账号
- **Organization_Owner**: 企业主，企业的最高权限用户
- **Organization**: 企业/组织实体
- **Member**: 企业成员
- **Department**: 部门
- **Password_Validator**: 密码验证器，用于统一验证密码强度
- **Login_Limiter**: 登录限制器，用于防止暴力破解

## Requirements

### Requirement 1: 企业账号创建密码安全

**User Story:** As a Platform_Admin, I want newly created organization owner accounts to require password change on first login, so that temporary passwords are not used long-term.

#### Acceptance Criteria

1. WHEN a Platform_Admin creates a new Organization, THE System SHALL set `mustChangePassword: true` for the Organization_Owner account
2. WHEN generating a temporary password for Organization_Owner, THE System SHALL generate a 16-character password containing uppercase letters, lowercase letters, numbers, and special characters
3. WHEN an Organization_Owner with `mustChangePassword: true` logs in, THE System SHALL redirect them to the password change page before allowing access to the dashboard

### Requirement 2: 企业状态验证

**User Story:** As a System Administrator, I want users from suspended or disabled organizations to be blocked from logging in, so that organization-level access control is enforced.

#### Acceptance Criteria

1. WHEN a User attempts to login, THE System SHALL check the status of their associated Organization
2. IF the Organization status is PENDING, THEN THE System SHALL block login and display message "您的企业账号正在审核中"
3. IF the Organization status is SUSPENDED, THEN THE System SHALL block login and display message "您的企业账号已被暂停，请联系管理员"
4. IF the Organization status is DISABLED, THEN THE System SHALL block login and display message "您的企业账号已被禁用"
5. WHEN Organization status is ACTIVE, THE System SHALL allow the login process to continue

### Requirement 3: 登录失败锁定机制

**User Story:** As a Security Administrator, I want enterprise user accounts to be locked after multiple failed login attempts, so that brute force attacks are prevented.

#### Acceptance Criteria

1. WHEN a User fails to login, THE System SHALL increment the `loginAttempts` counter for that User
2. WHEN a User successfully logs in, THE System SHALL reset the `loginAttempts` counter to zero
3. IF a User has 5 consecutive failed login attempts, THEN THE System SHALL lock the account for 30 minutes by setting `lockedUntil` timestamp
4. WHILE a User account is locked, THE System SHALL reject login attempts and display remaining lock time
5. WHEN the lock period expires, THE System SHALL allow login attempts again

### Requirement 4: 统一密码强度验证

**User Story:** As a Security Administrator, I want all password setting scenarios to use consistent strength requirements, so that security policies are uniformly enforced.

#### Acceptance Criteria

1. THE Password_Validator SHALL require passwords to be at least 12 characters long
2. THE Password_Validator SHALL require passwords to contain at least one uppercase letter
3. THE Password_Validator SHALL require passwords to contain at least one lowercase letter
4. THE Password_Validator SHALL require passwords to contain at least one number
5. THE Password_Validator SHALL require passwords to contain at least one special character from the set: !@#$%^&*()_+-=[]{}|;:,.<>?
6. WHEN a User sets a password in change-password page, THE System SHALL validate using Password_Validator
7. WHEN a User sets a password via invitation link, THE System SHALL validate using Password_Validator
8. WHEN creating a Member with initial password, THE System SHALL generate a password that meets Password_Validator requirements

### Requirement 5: 部门负责人管理

**User Story:** As an Organization_Owner, I want to assign and manage department managers, so that I can delegate department-level responsibilities.

#### Acceptance Criteria

1. WHEN creating a Department, THE System SHALL allow selecting a Member as the department manager
2. WHEN editing a Department, THE System SHALL allow changing the department manager
3. WHEN displaying Department list, THE System SHALL show the manager name for each department
4. WHEN a Member is removed from the Organization, THE System SHALL clear their manager assignment from any departments

### Requirement 6: 完善成员角色管理

**User Story:** As an Organization_Owner, I want to assign fine-grained roles to members, so that I can control access permissions precisely.

#### Acceptance Criteria

1. WHEN adding or editing a Member, THE System SHALL display all available roles: ADMIN, EDITOR, MEMBER, VIEWER
2. THE System SHALL display role descriptions explaining the permissions for each role
3. WHEN a role is selected, THE System SHALL apply the corresponding permissions to the Member

### Requirement 7: 改进初始密码生成

**User Story:** As an Organization Admin, I want each new member to receive a unique random password, so that security is improved over fixed default passwords.

#### Acceptance Criteria

1. WHEN creating a new Member directly, THE System SHALL generate a unique random password meeting Password_Validator requirements
2. WHEN Member creation succeeds, THE System SHALL display the generated password to the admin once
3. THE System SHALL set `mustChangePassword: true` for newly created Members
