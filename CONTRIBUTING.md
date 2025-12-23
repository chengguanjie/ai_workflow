# 贡献指南

感谢您对 AI Workflow 项目的关注！本文档将帮助您了解如何为项目做出贡献。

---

## 📋 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境设置](#开发环境设置)
- [代码规范](#代码规范)
- [Git 提交规范](#git-提交规范)
- [Pull Request 流程](#pull-request-流程)
- [代码审查](#代码审查)

---

## 行为准则

请确保所有交互都遵循相互尊重的原则。我们致力于为每个人提供一个友好、安全和包容的环境。

---

## 如何贡献

### 报告 Bug

1. 在 Issues 中搜索是否已有相同的问题
2. 如果没有，创建一个新的 Issue
3. 使用 Bug 报告模板，提供以下信息：
   - 问题描述
   - 复现步骤
   - 期望行为
   - 实际行为
   - 环境信息（浏览器、Node.js 版本等）

### 提交功能建议

1. 在 Issues 中创建功能请求
2. 清晰描述功能需求和使用场景
3. 如果可能，提供设计草图或参考链接

### 提交代码

1. Fork 本仓库
2. 创建功能分支
3. 编写代码和测试
4. 提交 Pull Request

---

## 开发环境设置

### 环境要求

- Node.js >= 20.19.0
- pnpm >= 10.23.0
- MySQL >= 8.0
- Redis >= 6.0

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/ai-workflow.git
cd ai-workflow

# 2. 安装依赖
pnpm install

# 3. 复制环境变量
cp .env.example .env
# 编辑 .env 配置数据库和其他服务

# 4. 初始化数据库
pnpm db:generate
pnpm db:push

# 5. 启动开发服务器
pnpm dev
```

### 常用命令

```bash
pnpm dev          # 启动开发服务器
pnpm test         # 运行测试
pnpm test:watch   # 监听模式运行测试
pnpm lint         # 代码检查
pnpm build        # 构建生产版本
```

---

## 代码规范

### TypeScript

- 使用 TypeScript 严格模式（`strict: true`）
- 为所有导出的函数和类添加 JSDoc 注释
- 使用有意义的变量和函数名
- 避免使用 `any` 类型，优先使用 `unknown`

### React 组件

- 使用函数组件和 Hooks
- 组件文件使用 PascalCase 命名（如 `NodePanel.tsx`）
- 保持组件职责单一
- 使用 TypeScript 定义 Props 类型

```typescript
// 推荐
interface ButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

export function Button({ label, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button className={variant} onClick={onClick}>
      {label}
    </button>
  )
}
```

### API 路由

- 使用统一的响应格式（`ApiResponse` 类）
- 添加适当的错误处理
- 使用 Zod 进行请求验证

```typescript
// 推荐
import { ApiResponse } from '@/lib/api'
import { z } from 'zod'

const requestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = requestSchema.parse(body)
    
    // 处理逻辑...
    
    return ApiResponse.success(result)
  } catch (error) {
    return ApiResponse.error('请求处理失败', 500)
  }
}
```

### 测试

- 为新功能编写单元测试
- 测试覆盖率要求：行 >= 80%，分支 >= 70%
- 使用 Vitest + Testing Library
- 复杂逻辑考虑使用属性测试（fast-check）

---

## Git 提交规范

### 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

| 类型 | 描述 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响代码含义） |
| `refactor` | 代码重构（既非新功能，也非修复） |
| `perf` | 性能优化 |
| `test` | 添加或修改测试 |
| `chore` | 构建过程或辅助工具变动 |
| `ci` | CI 配置变更 |

### 示例

```bash
feat(workflow): 添加条件分支节点支持

- 实现 CONDITION 节点处理器
- 添加条件表达式解析器
- 支持 AND/OR 逻辑运算

Closes #123
```

```bash
fix(api): 修复工作流保存时的并发问题

问题原因：乐观锁版本号未正确更新
解决方案：使用事务确保版本号原子更新

Fixes #456
```

---

## 分支策略

```
main
  └── develop
        ├── feature/xxx
        ├── bugfix/xxx
        └── release/x.x.x
```

| 分支 | 描述 |
|------|------|
| `main` | 生产分支，只接受来自 release 的合并 |
| `develop` | 开发分支，功能开发的基准 |
| `feature/*` | 功能分支，从 develop 创建 |
| `bugfix/*` | 修复分支，从 develop 创建 |
| `release/*` | 发布分支，用于版本发布准备 |
| `hotfix/*` | 热修复分支，从 main 创建 |

---

## Pull Request 流程

### 创建 PR

1. 确保代码在本地测试通过
2. 推送分支到远程仓库
3. 创建 Pull Request
4. 填写 PR 模板

### PR 模板

```markdown
## 变更描述

<!-- 简要描述本次变更的内容 -->

## 变更类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 代码重构
- [ ] 文档更新
- [ ] 测试
- [ ] 其他

## 测试

- [ ] 已添加/更新相关测试
- [ ] 所有测试通过

## 检查清单

- [ ] 代码符合项目规范
- [ ] 已更新相关文档
- [ ] 无 ESLint 错误
- [ ] TypeScript 编译通过
```

---

## 代码审查

### 审查要点

1. **功能正确性**: 代码是否实现了预期功能？
2. **代码质量**: 代码是否清晰、可维护？
3. **测试覆盖**: 是否有足够的测试覆盖？
4. **性能**: 是否有明显的性能问题？
5. **安全性**: 是否有安全隐患？

### 审查反馈

- 使用建设性的语言
- 提供具体的改进建议
- 区分必须修改和可选建议

---

## 🎉 感谢贡献

感谢您花时间阅读本指南并考虑为项目做出贡献！

如有任何问题，请随时在 Issues 中提问或联系维护者。
