import { PrismaClient } from "@/generated/prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = new URL(process.env.DATABASE_URL!)
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  })
  return new PrismaClient({ adapter })
}

function getClient(): PrismaClient {
  if (!global.prisma) {
    global.prisma = createPrismaClient()
  }
  return global.prisma
}

// Proxy 保证模块被 import 时不立即执行 createPrismaClient()
// 只有真正调用 prisma.xxx 时才初始化，避免 next build 阶段 DATABASE_URL 未注入导致崩溃
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop: string | symbol) {
    return Reflect.get(getClient(), prop)
  },
})
