# Zeabur 部署成功经验总结（Next.js / App Router）

这份文档记录一次 Zeabur 部署失败→修复→成功的排障过程，目的是把“可复用的模式”固化下来，避免以后再踩坑。

## 现象（运行时崩溃，但构建可能成功）

常见错误：

- `Invariant: Expected clientReferenceManifest to be defined`
- `TypeError: Cannot read properties of undefined (reading 'clientModules')`

特点：

- `next build` 可能可以通过
- Zeabur 运行时一访问页面就崩（通常指向 `.next/server/app/.../page.js`）

## 根因：同一路径存在多个入口（Route Group 造成“隐形冲突”）

Next.js App Router 的 **Route Group** 目录（例如 `(landing)`、`(auth)`）不会出现在 URL 中。

因此以下两份文件会 **同时映射到 `/`**：

- `src/app/page.tsx`
- `src/app/(landing)/page.tsx`

这类冲突在某些情况下会导致运行时选中错误的产物，进而缺少 `clientReferenceManifest`，出现上述报错。

## 修复模式（推荐做法）

1. **保证同一个 URL 只对应一个 `page.*` / `route.*`**
   - 尤其是 `/`、`/login`、`/dashboard` 等高频路径
2. 若要实现“已登录重定向到 `/dashboard`，未登录展示 Landing”：
   - 将逻辑合并到 `src/app/page.tsx`（登录态 `redirect('/dashboard')`，未登录直接返回 Landing UI）
   - 不要再额外创建 `src/app/(landing)/page.tsx` 映射到 `/`
3. **Zeabur 重新部署**建议选择：
   - 「清理构建缓存/无缓存重建」，避免旧 `.next` 产物被复用

## 预防：在构建前自动检测路由冲突

项目已新增脚本：

- `pnpm check:routes`：扫描 `src/app` 下的 `page.*` / `route.*`，检测同一 URL 的冲突
- `pnpm build`：已自动先执行 `pnpm check:routes`，发现冲突会直接失败，避免“构建通过但运行时炸掉”

如果 `pnpm check:routes` 失败：

1. 按输出找到冲突的 URL（例如 `/`）
2. 保留一个入口，删除/合并其余入口（尤其注意 `(xxx)` 目录）
3. 再次执行 `pnpm check:routes` 直到通过

## 关联文档

- `docs/zeabur-deployment.md`：Zeabur 部署指南与常见问题

