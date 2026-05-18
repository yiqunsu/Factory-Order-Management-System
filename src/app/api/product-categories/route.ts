import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const categories = await prisma.productCategory.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(request: Request) {
  const { name, desc } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "大类名称为必填项" }, { status: 400 });
  }
  const category = await prisma.productCategory.create({
    data: { name: name.trim(), desc: desc?.trim() || null },
  });
  return NextResponse.json(category, { status: 201 });
}
