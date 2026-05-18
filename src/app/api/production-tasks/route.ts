import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { machineId, orderIds } = await request.json();
  if (!machineId || !Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "machineId 和 orderIds 为必填项" }, { status: 400 });
  }

  const maxPos = await prisma.productionTask.aggregate({
    where: { machineId },
    _max:  { position: true },
  });
  const position = (maxPos._max.position ?? 0) + 1;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.productionTask.create({
      data: { machineId, position, status: "PRODUCING" },
    });
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data:  { status: "PRODUCING", taskId: created.id },
    });
    return tx.productionTask.findUnique({
      where:   { id: created.id },
      include: {
        orders: {
          include: {
            customer: { select: { id: true, company: true } },
            product:  { include: { category: true } },
          },
        },
      },
    });
  });

  return NextResponse.json(task, { status: 201 });
}
