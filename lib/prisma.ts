import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

// Lazy getter that initializes on first access
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      const connectionString = process.env.DATABASE_URL
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set')
      }

      if (!globalForPrisma.pool) {
        globalForPrisma.pool = new Pool({ connectionString })
      }

      const adapter = new PrismaPg(globalForPrisma.pool)
      globalForPrisma.prisma = new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      })
    }
    return (globalForPrisma.prisma as any)[prop]
  }
})
