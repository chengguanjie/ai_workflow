import { PrismaClient } from '@prisma/client'
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'

export type MockPrismaClient = DeepMockProxy<PrismaClient>

export function createMockPrisma(): MockPrismaClient {
  return mockDeep<PrismaClient>()
}

// Singleton mock for use in tests
let mockPrisma: MockPrismaClient | null = null

export function getMockPrisma(): MockPrismaClient {
  if (!mockPrisma) {
    mockPrisma = createMockPrisma()
  }
  return mockPrisma
}

export function resetMockPrisma(): void {
  mockPrisma = null
}
