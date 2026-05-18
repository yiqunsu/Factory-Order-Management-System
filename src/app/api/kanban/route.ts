import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const orderInclude = {
  customer: { select: { id: true, company: true } },
  product:  { include: { category: true } },
} as const;

export async function GET() {
  const [machines, pendingOrders] = await Promise.all([
    prisma.machine.findMany({
      where:   { isActive: true },
      orderBy: { name: "asc" },
      include: {
        categories: { include: { category: true } },
        tasks: {
          where:   { status: { not: "DONE" } },
          orderBy: { position: "asc" },
          include: { orders: { include: orderInclude } },
        },
      },
    }),
    prisma.order.findMany({
      where:   { status: "PENDING", taskId: null },
      orderBy: { createdAt: "asc" },
      include: orderInclude,
    }),
  ]);
  return NextResponse.json({ machines, pendingOrders });
}
