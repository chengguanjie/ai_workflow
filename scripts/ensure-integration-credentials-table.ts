/**
 * Ensure IntegrationCredential table exists without destructive schema sync.
 *
 * Usage:
 *   npx tsx scripts/ensure-integration-credentials-table.ts
 *
 * Why:
 *   `prisma db push` may attempt to drop unmanaged tables in an existing DB.
 *   This script only creates `integration_credentials` if missing.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: unknown }>>(`
    SELECT COUNT(*) AS count
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'integration_credentials'
  `)

  const countValue = rows?.[0]?.count ?? 0
  const exists = Number(countValue) > 0

  if (exists) {
    console.log('[ensure-integrations] integration_credentials already exists, skipping.')
    return
  }

  console.log('[ensure-integrations] Creating integration_credentials...')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`integration_credentials\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`provider\` VARCHAR(191) NOT NULL,
      \`accessTokenEncrypted\` TEXT NOT NULL,
      \`refreshTokenEncrypted\` TEXT NULL,
      \`expiresAt\` DATETIME(3) NULL,
      \`scope\` TEXT NULL,
      \`externalAccountId\` VARCHAR(191) NULL,
      \`metadata\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      \`organizationId\` VARCHAR(191) NOT NULL,
      \`userId\` VARCHAR(191) NOT NULL,
      UNIQUE KEY \`integration_credentials_organizationId_provider_key\` (\`organizationId\`, \`provider\`),
      KEY \`integration_credentials_provider_idx\` (\`provider\`),
      KEY \`integration_credentials_userId_idx\` (\`userId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `)

  console.log('[ensure-integrations] Done.')
}

main()
  .catch((error) => {
    console.error('[ensure-integrations] Failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
