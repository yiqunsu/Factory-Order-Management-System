import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 先删消息，再删 session（外键约束）
  await prisma.chatMessage.deleteMany({ where: { sessionId: id } })
  await prisma.chatSession.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
