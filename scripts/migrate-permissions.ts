/**
 * 权限系统数据迁移脚本
 *
 * 执行方式：npx tsx scripts/migrate-permissions.ts
 *
 * 功能：
 * 1. 更新所有部门的层级路径
 * 2. 将旧模板标记为内部模板
 * 3. 将官方模板标记为公域模板
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function updateDepartmentPaths() {
  console.log('正在更新部门层级路径...')

  // 获取所有组织
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
  })

  for (const org of organizations) {
    console.log(`  处理组织: ${org.name}`)

    // 获取组织下的所有部门
    const departments = await prisma.department.findMany({
      where: { organizationId: org.id },
      orderBy: { parentId: 'asc' },
    })

    // 构建部门树并更新路径
    const deptMap = new Map<string, { id: string; parentId: string | null; level: number; path: string }>()

    // 首先找到所有根部门
    for (const dept of departments) {
      if (!dept.parentId) {
        deptMap.set(dept.id, {
          id: dept.id,
          parentId: null,
          level: 0,
          path: `/${dept.id}`,
        })
      }
    }

    // 递归处理子部门
    let processed = deptMap.size
    while (processed < departments.length) {
      for (const dept of departments) {
        if (deptMap.has(dept.id)) continue

        if (dept.parentId && deptMap.has(dept.parentId)) {
          const parent = deptMap.get(dept.parentId)!
          deptMap.set(dept.id, {
            id: dept.id,
            parentId: dept.parentId,
            level: parent.level + 1,
            path: `${parent.path}/${dept.id}`,
          })
          processed++
        }
      }

      // 防止死循环（如果有孤立的部门）
      if (processed === deptMap.size) break
    }

    // 批量更新
    for (const [id, data] of deptMap) {
      await prisma.department.update({
        where: { id },
        data: {
          level: data.level,
          path: data.path,
        },
      })
    }

    console.log(`    更新了 ${deptMap.size} 个部门`)
  }

  console.log('部门层级路径更新完成\n')
}

async function migrateTemplates() {
  console.log('正在迁移模板类型...')

  // 将官方模板标记为公域模板
  const officialResult = await prisma.workflowTemplate.updateMany({
    where: { isOfficial: true },
    data: {
      templateType: 'PUBLIC',
      isHidden: false,
    },
  })
  console.log(`  标记 ${officialResult.count} 个官方模板为公域模板`)

  // 将非官方模板标记为内部模板
  const internalResult = await prisma.workflowTemplate.updateMany({
    where: { isOfficial: false },
    data: {
      templateType: 'INTERNAL',
      isHidden: false,
    },
  })
  console.log(`  标记 ${internalResult.count} 个模板为内部模板`)

  // 更新创建者部门信息
  const templates = await prisma.workflowTemplate.findMany({
    where: {
      creatorId: { not: null },
      creatorDepartmentId: null,
    },
    select: { id: true, creatorId: true },
  })

  for (const template of templates) {
    if (template.creatorId) {
      const user = await prisma.user.findUnique({
        where: { id: template.creatorId },
        select: { departmentId: true },
      })
      if (user?.departmentId) {
        await prisma.workflowTemplate.update({
          where: { id: template.id },
          data: { creatorDepartmentId: user.departmentId },
        })
      }
    }
  }
  console.log(`  更新了 ${templates.length} 个模板的创建者部门信息`)

  console.log('模板类型迁移完成\n')
}

async function main() {
  console.log('========================================')
  console.log('权限系统数据迁移')
  console.log('========================================\n')

  try {
    await updateDepartmentPaths()
    await migrateTemplates()

    console.log('========================================')
    console.log('迁移完成！')
    console.log('========================================')
  } catch (error) {
    console.error('迁移失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
