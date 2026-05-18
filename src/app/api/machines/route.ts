import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const machines = await prisma.machine.findMany({
    orderBy: { name: "asc" },
    include: {
      categories: { include: { category: true } },
      patterns:   { include: { pattern: true } },
    },
  });
  return NextResponse.json(machines);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, isActive, minWidth, maxWidth, notes, categoryIds, patternIds } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "机器名称为必填项" }, { status: 400 });
  }
  if (minWidth == null || maxWidth == null || Number(minWidth) >= Number(maxWidth)) {
    return NextResponse.json({ error: "宽度范围不合法（最小值须小于最大值）" }, { status: 400 });
  }

  const machine = await prisma.machine.create({
    data: {
      name: name.trim(),
      isActive: isActive ?? true,
      minWidth: Number(minWidth),
      maxWidth: Number(maxWidth),
      notes: notes?.trim() || null,
      categories: {
        create: (categoryIds ?? []).map((id: string) => ({ categoryId: id })),
      },
      patterns: {
        create: (patternIds ?? []).map((id: string) => ({ patternId: id })),
      },
    },
    include: {
      categories: { include: { category: true } },
      patterns:   { include: { pattern: true } },
    },
  });
  return NextResponse.json(machine, { status: 201 });
}
