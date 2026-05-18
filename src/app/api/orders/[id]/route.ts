import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const include = {
  customer: { select: { id: true, company: true } },
  product:  { include: { category: true } },
  formula:  { select: { id: true, name: true, materials: true } },
  task:     { select: { id: true, status: true } },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include });
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { customerId, productId, specParams, quantity, unit, formulaId, extraNotes, status } = body;

  if (customerId !== undefined && productId !== undefined && quantity == null) {
    return NextResponse.json({ error: "数量为必填项" }, { status: 400 });
  }

  let formulaSnapshot: string | null | undefined = undefined;
  if (formulaId !== undefined) {
    if (formulaId) {
      const f = await prisma.formula.findUnique({ where: { id: formulaId } });
      formulaSnapshot = f
        ? JSON.stringify({ name: f.name, specParams: f.specParams, materials: f.materials })
        : null;
    } else {
      formulaSnapshot = null;
    }
  }

  const data: Record<string, unknown> = {};
  if (customerId !== undefined) data.customerId = customerId;
  if (productId  !== undefined) data.productId  = productId;
  if (specParams !== undefined) data.specParams  = JSON.stringify(specParams ?? {});
  if (quantity   !== undefined) data.quantity    = Number(quantity);
  if (unit       !== undefined) data.unit        = unit;
  if (formulaId  !== undefined) data.formulaId   = formulaId || null;
  if (formulaSnapshot !== undefined) data.formulaSnapshot = formulaSnapshot;
  if (extraNotes !== undefined) data.extraNotes  = extraNotes?.trim() || null;
  if (status !== undefined) {
    data.status = status;
    if (status === "PENDING") data.taskId = null;
  }

  const order = await prisma.order.update({ where: { id }, data, include });
  return NextResponse.json(order);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Detach from production task if linked
  await prisma.order.update({ where: { id }, data: { taskId: null } });
  await prisma.order.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
