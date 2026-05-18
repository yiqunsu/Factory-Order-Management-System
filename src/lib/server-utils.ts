import { prisma } from "@/lib/prisma"

export async function generateOrderNo(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const count = await prisma.order.count({
    where: { orderNo: { startsWith: `ORD-${today}` } },
  })
  return `ORD-${today}-${String(count + 1).padStart(3, "0")}`
}
