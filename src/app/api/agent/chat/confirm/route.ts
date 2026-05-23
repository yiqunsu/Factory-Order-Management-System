import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { callDeepSeek, dbMessagesToOpenAI, TOOL_LABELS_ZH } from "@/lib/deepseek"
import { runWriteTool } from "../route"

export async function POST(request: Request) {
  const body = await request.json() as { sessionId: string }
  const sessionId = body.sessionId
  if (!sessionId) return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 })

  const pendingMsg = await prisma.chatMessage.findFirst({
    where: { sessionId, isPending: true },
    orderBy: { createdAt: "desc" },
  })

  if (!pendingMsg?.toolCalls) {
    return NextResponse.json({ error: "没有待确认的操作" }, { status: 404 })
  }

  const toolCalls = JSON.parse(pendingMsg.toolCalls)
  const toolCall = toolCalls[0]
  const toolName = toolCall.function.name
  const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>

  let toolResult: string
  try {
    toolResult = JSON.stringify(await runWriteTool(toolName, args))
  } catch (err) {
    toolResult = JSON.stringify({ error: String(err) })
  }

  await prisma.chatMessage.update({
    where: { id: pendingMsg.id },
    data: { isPending: false },
  })

  await prisma.chatMessage.create({
    data: { role: "tool", content: toolResult, toolCallId: toolCall.id, toolName, sessionId },
  })

  // 读该 session 全部历史（仅限本 session），调 DeepSeek 生成自然语言确认回复
  const historyRows = await prisma.chatMessage.findMany({
    where: { sessionId },          // 严格按 sessionId 隔离，不涉及其他 session
    orderBy: { createdAt: "asc" }, // 时间正序
  })

  // 操作名称（用于兜底文字）
  const opLabel = TOOL_LABELS_ZH[toolName] ?? toolName
  // 解析工具执行结果，提取关键信息用于兜底描述
  let resultSummary = ""
  try {
    const parsed = JSON.parse(toolResult) as Record<string, unknown>
    if (parsed.orderNo) resultSummary = `订单号 ${String(parsed.orderNo)}`
    else if (parsed.tasksCreated) resultSummary = `共创建 ${String(parsed.tasksCreated)} 个生产任务`
  } catch { /* ignore */ }

  const fallbackText = resultSummary
    ? `✅ ${opLabel}成功！${resultSummary}`
    : `✅ ${opLabel}成功！`

  let summaryText = fallbackText
  try {
    // 不传 tools，强制 DeepSeek 只输出文字总结，不再调工具
    const summaryRes = await callDeepSeek(dbMessagesToOpenAI(historyRows), undefined, [])
    // 用 || 而非 ??，同时过滤空字符串
    summaryText = summaryRes.choices[0].message.content?.trim() || fallbackText
  } catch { /* 总结失败用兜底文字 */ }

  const summaryMsg = await prisma.chatMessage.create({
    data: { role: "assistant", content: summaryText, sessionId },
  })

  return NextResponse.json({ summaryMessage: summaryMsg })
}
