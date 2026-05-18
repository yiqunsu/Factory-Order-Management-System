import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const patterns = await prisma.pattern.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(patterns);
}
