import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const body = await request.json() as { sessionId: string }
  const sessionId = body.sessionId
  if (!sessionId) return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 })

  const pendingMsg = await prisma.chatMessage.findFirst({
    where: { sessionId, isPending: true },
    orderBy: { createdAt: "desc" },
  })

  if (!pendingMsg) {
    return NextResponse.json({ error: "没有待取消的操作" }, { status: 404 })
  }

  await prisma.chatMessage.delete({ where: { id: pendingMsg.id } })

  const cancelMsg = await prisma.chatMessage.create({
    data: {
      role: "assistant",
      content: "已取消。如需继续，请告诉我下一步要做什么。",
      sessionId,
    },
  })

  return NextResponse.json({ cancelMessage: cancelMsg })
}
