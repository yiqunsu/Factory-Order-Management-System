import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const formulas = await prisma.formula.findMany({
    orderBy: { name: "asc" },
    include: {
      product: { include: { category: true } },
      source:  { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(formulas);
}

export async function POST(request: Request) {
  const { name, productId, specParams, materials, sourceId, notes } = await request.json();
  if (!name?.trim() || !productId) {
    return NextResponse.json({ error: "配方名称和关联产品为必填项" }, { status: 400 });
  }
  const formula = await prisma.formula.create({
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
  return NextResponse.json(formula, { status: 201 });
}
