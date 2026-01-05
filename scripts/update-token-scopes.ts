import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 查找所有使用旧scope格式的tokens
  const tokens = await prisma.apiToken.findMany({
    select: {
      id: true,
      name: true,
      scopes: true,
    }
  })

  console.log('Found tokens:', tokens.length)

  for (const token of tokens) {
    const scopes = token.scopes as string[]
    console.log(`Token ${token.name}: current scopes =`, scopes)

    // 检查是否需要更新
    const needsUpdate = scopes.some(s => s.includes(':')) || 
                        !scopes.includes('workflows')

    if (needsUpdate) {
      // 更新为新的scope格式
      await prisma.apiToken.update({
        where: { id: token.id },
        data: {
          scopes: ['workflows', 'executions'],
        }
      })
      console.log(`  -> Updated to ['workflows', 'executions']`)
    } else {
      console.log(`  -> No update needed`)
    }
  }

  console.log('Done!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
