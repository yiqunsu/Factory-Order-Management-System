import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name, productId, specParams, materials, sourceId, notes } = await request.json();
  if (!name?.trim() || !productId) {
    return NextResponse.json({ error: "配方名称和关联产品为必填项" }, { status: 400 });
  }
  const formula = await prisma.formula.update({
    where: { id },
    data: {
      name: name.trim(),
      productId,
      specParams: JSON.stringify(specParams ?? {}),
      materials:  materials ?? "",
      sourceId:   sourceId || null,
      notes:      notes?.trim() || null,
    },
    include: {
      product: { include: { category: true } },
      source:  { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(formula);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderCount = await prisma.order.count({ where: { formulaId: id } });
  if (orderCount > 0) {
    return NextResponse.json({ error: "该配方已被订单引用，无法删除" }, { status: 409 });
  }
  // 解除衍生配方的来源引用
  await prisma.formula.updateMany({ where: { sourceId: id }, data: { sourceId: null } });
  await prisma.formula.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
