import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    include: { category: true },
  });
  return NextResponse.json(products);
}

export async function POST(request: Request) {
  const { name, categoryId } = await request.json();
  if (!name?.trim() || !categoryId) {
    return NextResponse.json({ error: "产品名称和所属大类为必填项" }, { status: 400 });
  }
  const product = await prisma.product.create({
    data: { name: name.trim(), categoryId },
    include: { category: true },
  });
  return NextResponse.json(product, { status: 201 });
}
