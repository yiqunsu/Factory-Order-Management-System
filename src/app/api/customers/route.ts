import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const customers = await prisma.customer.findMany({
    orderBy: { company: "asc" },
  });
  return NextResponse.json(customers);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { company, contact, notes } = body;

  if (!company || !contact) {
    return NextResponse.json(
      { error: "公司名称和联系人为必填项" },
      { status: 400 }
    );
  }

  const customer = await prisma.customer.create({
    data: { company, contact, notes: notes ?? null },
  });
  return NextResponse.json(customer, { status: 201 });
}
