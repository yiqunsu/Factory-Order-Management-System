import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOrderNo } from "@/lib/server-utils";

const include = {
  customer: { select: { id: true, company: true } },
  product:  { include: { category: true } },
  formula:  { select: { id: true, name: true } },
  task:     { select: { id: true, status: true } },
} as const;

export async function GET() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include,
  });
  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { customerId, productId, specParams, quantity, unit, formulaId, extraNotes } = body;

  if (!customerId || !productId || quantity == null || !unit) {
    return NextResponse.json({ error: "客户、产品、数量和单位为必填项" }, { status: 400 });
  }

  let formulaSnapshot: string | null = null;
  if (formulaId) {
    const f = await prisma.formula.findUnique({ where: { id: formulaId } });
    if (f) {
      formulaSnapshot = JSON.stringify({ name: f.name, specParams: f.specParams, materials: f.materials });
    }
  }

  const orderNo = await generateOrderNo();

  const order = await prisma.order.create({
    data: {
      orderNo,
      customerId,
      productId,
      specParams:      JSON.stringify(specParams ?? {}),
      quantity:        Number(quantity),
      unit,
      formulaId:       formulaId || null,
      formulaSnapshot,
      extraNotes:      extraNotes?.trim() || null,
      status:          "PENDING",
    },
    include,
  });

  return NextResponse.json(order, { status: 201 });
}
