import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET：获取所有 session 列表，按创建时间倒序
export async function GET() {
  const sessions = await prisma.chatSession.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
  })
  return NextResponse.json(sessions)
}

// POST：创建新 session
export async function POST() {
  const now = new Date()
  const title = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(/\//g, "-")

  const session = await prisma.chatSession.create({
    data: { title },
  })
  return NextResponse.json(session)
}
