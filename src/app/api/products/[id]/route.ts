import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name, categoryId } = await request.json();
  if (!name?.trim() || !categoryId) {
    return NextResponse.json({ error: "产品名称和所属大类为必填项" }, { status: 400 });
  }
  const product = await prisma.product.update({
    where: { id },
    data: { name: name.trim(), categoryId },
    include: { category: true },
  });
  return NextResponse.json(product);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [orderCount, formulaCount] = await Promise.all([
    prisma.order.count({ where: { productId: id } }),
    prisma.formula.count({ where: { productId: id } }),
  ]);
  if (orderCount > 0 || formulaCount > 0) {
    return NextResponse.json({ error: "该产品存在关联订单或配方，无法删除" }, { status: 409 });
  }
  await prisma.product.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
