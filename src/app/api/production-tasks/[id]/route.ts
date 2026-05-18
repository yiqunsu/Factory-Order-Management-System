import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const orderInclude = {
  customer: { select: { id: true, company: true } },
  product:  { include: { category: true } },
} as const;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status, position, machineId, orderIds } = await request.json();

  await prisma.$transaction(async (tx) => {
    // Sync order bindings
    if (orderIds !== undefined) {
      const existing = await tx.productionTask.findUnique({
        where:   { id },
        include: { orders: { select: { id: true } } },
      });
      const oldIds = existing?.orders.map((o) => o.id) ?? [];
      const removed = oldIds.filter((oid) => !(orderIds as string[]).includes(oid));
      const added   = (orderIds as string[]).filter((oid) => !oldIds.includes(oid));
      if (removed.length) {
        await tx.order.updateMany({ where: { id: { in: removed } }, data: { status: "PENDING", taskId: null } });
      }
      if (added.length) {
        await tx.order.updateMany({ where: { id: { in: added } }, data: { status: "PRODUCING", taskId: id } });
      }
    }

    // Cascade task status → orders
    if (status !== undefined) {
      const orderStatus = status === "DONE" ? "DONE" : "PRODUCING";
      await tx.order.updateMany({ where: { taskId: id }, data: { status: orderStatus } });
    }

    const data: Record<string, unknown> = {};
    if (status    !== undefined) data.status    = status;
    if (position  !== undefined) data.position  = position;
    if (machineId !== undefined) data.machineId = machineId;
    if (Object.keys(data).length) {
      await tx.productionTask.update({ where: { id }, data });
    }
  });

  const task = await prisma.productionTask.findUnique({
    where:   { id },
    include: { orders: { include: orderInclude } },
  });
  return NextResponse.json(task);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({ where: { taskId: id }, data: { status: "PENDING", taskId: null } });
    await tx.productionTask.delete({ where: { id } });
  });
  return new NextResponse(null, { status: 204 });
}
