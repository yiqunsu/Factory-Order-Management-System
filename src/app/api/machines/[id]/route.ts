import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, isActive, minWidth, maxWidth, notes, categoryIds, patternIds } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "机器名称为必填项" }, { status: 400 });
  }
  if (minWidth == null || maxWidth == null || Number(minWidth) >= Number(maxWidth)) {
    return NextResponse.json({ error: "宽度范围不合法（最小值须小于最大值）" }, { status: 400 });
  }

  // 先删除旧的关联，再重建
  await prisma.machineCategory.deleteMany({ where: { machineId: id } });
  await prisma.machinePattern.deleteMany({ where: { machineId: id } });

  const machine = await prisma.machine.update({
    where: { id },
    data: {
      name: name.trim(),
      isActive: isActive ?? true,
      minWidth: Number(minWidth),
      maxWidth: Number(maxWidth),
      notes: notes?.trim() || null,
      categories: {
        create: (categoryIds ?? []).map((cid: string) => ({ categoryId: cid })),
      },
      patterns: {
        create: (patternIds ?? []).map((pid: string) => ({ patternId: pid })),
      },
    },
    include: {
      categories: { include: { category: true } },
      patterns:   { include: { pattern: true } },
    },
  });
  return NextResponse.json(machine);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const taskCount = await prisma.productionTask.count({ where: { machineId: id } });
  if (taskCount > 0) {
    return NextResponse.json({ error: "该机器存在关联生产任务，无法删除" }, { status: 409 });
  }

  await prisma.machineCategory.deleteMany({ where: { machineId: id } });
  await prisma.machinePattern.deleteMany({ where: { machineId: id } });
  await prisma.machine.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
