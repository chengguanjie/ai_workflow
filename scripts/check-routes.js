#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Detects conflicting App Router routes in `src/app`.
 *
 * Why:
 * - Route Groups like `(landing)` are NOT part of the URL.
 * - Accidentally creating two `page.*` that map to the same URL (e.g. `/`)
 *   can build successfully but crash at runtime with missing client manifest errors.
 *
 * Usage:
 * - `pnpm check:routes`
 */

const fs = require('fs')
const path = require('path')

const projectRoot = process.cwd()
const appDir = path.join(projectRoot, 'src', 'app')

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function isRouteGroupSegment(segment) {
  return segment.startsWith('(') && segment.endsWith(')')
}

function isParallelRouteSegment(segment) {
  return segment.startsWith('@')
}

function collectTargetFiles(dirPath, out) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      collectTargetFiles(fullPath, out)
      continue
    }

    if (!entry.isFile()) continue

    if (!/^(page|route)\.(tsx|ts|jsx|js)$/.test(entry.name)) continue
    out.push(fullPath)
  }
}

function computeRouteInfo(filePath) {
  const relFromApp = path.relative(appDir, filePath)
  const relDir = path.dirname(relFromApp)
  const segments = relDir === '.' ? [] : relDir.split(path.sep)

  const slotSegments = []
  const urlSegments = []

  for (const segment of segments) {
    if (isParallelRouteSegment(segment)) {
      slotSegments.push(segment.slice(1) || segment)
      continue
    }
    if (isRouteGroupSegment(segment)) continue
    urlSegments.push(segment)
  }

  const pathname = urlSegments.length === 0 ? '/' : `/${urlSegments.join('/')}`
  const slot = slotSegments.length === 0 ? 'default' : `@${slotSegments.join('/')}`

  const base = path.basename(filePath)
  const kind = base.startsWith('page.') ? 'page' : 'route'

  return {
    kind,
    slot,
    pathname,
    file: toPosixPath(path.join('src', 'app', relFromApp)),
  }
}

function main() {
  if (!fs.existsSync(appDir)) {
    console.error(`[check:routes] Missing directory: ${appDir}`)
    process.exit(1)
  }

  const files = []
  collectTargetFiles(appDir, files)

  const bySlotAndPath = new Map()

  for (const filePath of files) {
    const info = computeRouteInfo(filePath)
    const key = `${info.slot}|${info.pathname}`
    const existing = bySlotAndPath.get(key) || {
      slot: info.slot,
      pathname: info.pathname,
      pages: [],
      routes: [],
    }
    if (info.kind === 'page') existing.pages.push(info.file)
    else existing.routes.push(info.file)
    bySlotAndPath.set(key, existing)
  }

  const conflicts = []
  for (const entry of bySlotAndPath.values()) {
    const hasDuplicatePages = entry.pages.length > 1
    const hasDuplicateRoutes = entry.routes.length > 1
    const hasPageAndRoute = entry.pages.length > 0 && entry.routes.length > 0
    if (!hasDuplicatePages && !hasDuplicateRoutes && !hasPageAndRoute) continue
    conflicts.push(entry)
  }

  if (conflicts.length === 0) {
    console.log(`[check:routes] OK (${files.length} route files scanned)`)
    return
  }

  console.error(`[check:routes] Found ${conflicts.length} conflicting route(s):`)
  for (const entry of conflicts) {
    console.error(`\n- ${entry.pathname} (slot: ${entry.slot})`)
    if (entry.pages.length) {
      console.error('  pages:')
      for (const file of entry.pages) console.error(`    - ${file}`)
    }
    if (entry.routes.length) {
      console.error('  routes:')
      for (const file of entry.routes) console.error(`    - ${file}`)
    }
  }

  process.exit(1)
}

main()

