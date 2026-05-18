import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { company, contact, notes } = body;

  if (!company || !contact) {
    return NextResponse.json(
      { error: "公司名称和联系人为必填项" },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: { company, contact, notes: notes ?? null },
  });
  return NextResponse.json(customer);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const orderCount = await prisma.order.count({ where: { customerId: id } });
  if (orderCount > 0) {
    return NextResponse.json(
      { error: "该客户存在关联订单，无法删除" },
      { status: 409 }
    );
  }

  await prisma.customer.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
