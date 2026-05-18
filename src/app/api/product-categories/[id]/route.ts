import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { name, desc } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "大类名称为必填项" }, { status: 400 });
  }
  const category = await prisma.productCategory.update({
    where: { id },
    data: { name: name.trim(), desc: desc?.trim() || null },
  });
  return NextResponse.json(category);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    return NextResponse.json({ error: "该大类下存在产品，请先删除产品" }, { status: 409 });
  }
  await prisma.machineCategory.deleteMany({ where: { categoryId: id } });
  await prisma.productCategory.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
