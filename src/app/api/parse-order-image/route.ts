import { NextRequest, NextResponse } from "next/server"
import { parseWechatOrder } from "@/lib/ai"

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (!text) {
      return NextResponse.json({ error: "缺少文字内容" }, { status: 400 })
    }
    const result = await parseWechatOrder({ type: "text", content: text })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[parse-order-image]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
