# 企业用户全流程（申请 → 审批 → 建组织 → 员工登录）规划与跟踪测试

## 角色与入口

- 企业用户（未登录）：提交企业入驻申请
- 平台后台管理员（Console / SUPER_ADMIN）：审批入驻申请并开通企业
- 企业管理员（企业 Owner）：创建部门（组织架构）并邀请成员
- 员工：接受邀请并登录

## 关键流程拆解（按真实用户体验顺序）

1. 企业用户提交入驻申请（无需登录）
   - `POST /api/applications`
   - 产物：`orgApplication(status=PENDING)`
2. 企业用户查询申请状态（可选）
   - `GET /api/applications?email=...`
3. 平台后台管理员审批通过（Console）
   - `PUT /api/console/applications/:id` `{ action: "approve" }`
   - 产物：`organization(status=ACTIVE)` + 企业 Owner 用户（返回一次性 `tempPassword`）
4. 企业管理员首次登录（企业侧）
   - Credentials 登录（NextAuth Credentials Provider）
5. 企业管理员配置组织架构（部门）
   - `POST /api/settings/departments`
6. 企业管理员邀请员工
   - `POST /api/settings/invitations`（邮件邀请或链接邀请）
7. 员工接受邀请并设置密码
   - `POST /api/invite/accept`
8. 员工登录
   - Credentials 登录（NextAuth Credentials Provider）

## 跟踪测试（自动回归）

该关键路径已固化为 Vitest 用例：`src/e2e/enterprise-user-journey.test.ts`，覆盖上述 1～8 步。

运行：

```bash
pnpm -s test -- src/e2e/enterprise-user-journey.test.ts
```

说明：

- 用例通过对 `@/lib/db`、`@/lib/auth`、`@/lib/console-auth` 做内存桩，做到**不依赖 MySQL/Redis**也能回归关键业务逻辑与接口契约。
- 真实环境联调（带 MySQL）可按“关键流程拆解”逐步用 UI/接口走一遍，对照该用例的断言点排障。

