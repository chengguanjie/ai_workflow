
import { prisma } from '@/lib/db'

async function main() {
                  const token = await prisma.passwordResetToken.findFirst({
                                    orderBy: { createdAt: 'desc' },
                  })

                  if (token) {
                                    console.log(`LATEST_TOKEN:${token.token}`)
                                    console.log(`EMAIL:${token.email}`)
                  } else {
                                    console.log('NO_TOKEN_FOUND')
                  }
}

main()
                  .catch((e) => {
                                    console.error(e)
                                    process.exit(1)
                  })
                  .finally(async () => {
                                    await prisma.$disconnect()
                  })
