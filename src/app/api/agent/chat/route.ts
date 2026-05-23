import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  callDeepSeekStream,
  dbMessagesToOpenAI,
  WRITE_TOOLS,
  TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  type DSToolCall,
} from "@/lib/deepseek"
import { generateOrderNo } from "@/lib/server-utils"
import { resolveSkill } from "@/lib/skills"

const MAX_TOOL_ITERATIONS = 8

// ─── 读取当前 session 全部消息（时间正序，仅限本 session）────────────────────────
// where: { sessionId } 保证完全隔离，不会混入其他 session 的消息

async function getSessionHistory(sessionId: string) {
  return prisma.chatMessage.findMany({
    where: { sessionId },        // 严格按 sessionId 过滤，session 间互不干扰
    orderBy: { createdAt: "asc" }, // 时间正序，符合 OpenAI 消息格式要求
  })
}

// ─── GET：加载某 session 的对话历史 ───────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")
  if (!sessionId) return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 })

  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(rows)
}

// ─── POST：发送消息，获取 AI 回复 ─────────────────────────────────────────────

export async function POST(request: Request) {
  const body = await request.json() as { content: string; sessionId: string }
  const content = body.content?.trim()
  const sessionId = body.sessionId

  // ── 前置校验（失败时返回普通 JSON，不启动流）────────────────────────────────
  if (!content) return NextResponse.json({ error: "消息不能为空" }, { status: 400 })
  if (!sessionId) return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 })

  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } })
  if (!session) return NextResponse.json({ error: "Session 不存在" }, { status: 404 })

  const pendingMsg = await prisma.chatMessage.findFirst({ where: { sessionId, isPending: true } })
  if (pendingMsg) return NextResponse.json({ error: "请先处理待确认的操作" }, { status: 409 })

  // ── 保存用户消息 & 准备 Skill ─────────────────────────────────────────────
  const userMsg = await prisma.chatMessage.create({ data: { role: "user", content, sessionId } })

  const skill = resolveSkill(content)
  const dbContext = skill.loadContext ? await skill.loadContext(prisma) : ""
  const fullSystemPrompt = SYSTEM_PROMPT + "\n\n" + skill.taskPrompt + (dbContext ? "\n" + dbContext : "")
  const activeTools = TOOL_DEFINITIONS.filter((t) => skill.allowedTools.includes(t.function.name))

  // ── 启动 SSE 流 ───────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // 工具函数：向客户端发送一条 SSE 消息
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { /* controller 已关闭 */ }
      }

      try {
        // ── Agentic loop ────────────────────────────────────────────────────
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
          const historyRows = await getSessionHistory(sessionId)

          let accContent = ""   // 当前迭代累积的文本内容
          let toolCalls: DSToolCall[] | null = null

          // 流式读取 DeepSeek 响应
          for await (const chunk of callDeepSeekStream(
            dbMessagesToOpenAI(historyRows),
            fullSystemPrompt,
            activeTools,
          )) {
            if (chunk.type === "delta") {
              accContent += chunk.content
              // 实时转发文本片段给客户端
              // 注意：若本轮最终是 tool_call（accContent 非空但有 tool_calls），
              // 前端收到 cancel_delta 后会丢弃这些片段（实际极少发生）
              send({ type: "delta", content: chunk.content })
            } else if (chunk.type === "tool_calls") {
              toolCalls = chunk.tool_calls
              // 如果之前发出了 delta 但本轮实际是 tool_call，通知前端撤销流式消息
              if (accContent) send({ type: "cancel_delta" })
            }
          }

          if (toolCalls && toolCalls.length > 0) {
            const toolCall = toolCalls[0]
            const toolName = toolCall.function.name

            if (WRITE_TOOLS.has(toolName)) {
              // 写操作：保存 isPending 消息，通知前端弹确认卡片
              const assistantMsg = await prisma.chatMessage.create({
                data: {
                  role: "assistant",
                  content: null,
                  toolCalls: JSON.stringify(toolCalls),
                  isPending: true,
                  sessionId,
                },
              })
              const toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
              const display = await enrichToolArgsForDisplay(toolName, toolArgs)
              send({
                type: "pending_confirmation",
                userMessageId: userMsg.id,
                assistantMessageId: assistantMsg.id,
                toolCall: { id: toolCall.id, name: toolName, args: toolArgs, display },
              })
              break
            }

            // 读操作：执行工具，保存结果，继续循环
            await saveAndExecuteReadTool(toolCall, { content: null, tool_calls: toolCalls }, sessionId)
            continue
          }

          // 纯文字响应：保存到 DB，通知前端流结束
          const assistantMsg = await prisma.chatMessage.create({
            data: { role: "assistant", content: accContent, sessionId },
          })
          send({ type: "text_done", messageId: assistantMsg.id, userMessageId: userMsg.id })
          break
        }
      } catch (err) {
        send({ type: "error", error: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",   // 禁止 Nginx 等反向代理缓冲
      "Connection": "keep-alive",
    },
  })
}

// ─── 执行读操作并保存消息（agentic loop 内使用）────────────────────────────────

async function saveAndExecuteReadTool(
  toolCall: DSToolCall,
  aiMessage: { content: string | null; tool_calls?: DSToolCall[] },
  sessionId: string
) {
  const toolName = toolCall.function.name
  const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>

  await prisma.chatMessage.create({
    data: {
      role: "assistant",
      content: aiMessage.content ?? null,
      toolCalls: JSON.stringify([toolCall]),
      sessionId,
    },
  })

  let toolResult: string
  try {
    toolResult = JSON.stringify(await runReadTool(toolName, args))
  } catch (err) {
    toolResult = JSON.stringify({ error: String(err) })
  }

  await prisma.chatMessage.create({
    data: { role: "tool", content: toolResult, toolCallId: toolCall.id, toolName, sessionId },
  })
}

// ─── 读操作 Tool 实现 ──────────────────────────────────────────────────────────

async function runReadTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "extract_order_info": {
      // AI 直接从对话上下文提取，工具本身无需查 DB，返回空对象让 AI 自行处理
      return {}
    }

    case "query_customer": {
      const keyword = String(args.keyword ?? "")
      const customers = await prisma.customer.findMany({
        where: {
          OR: [
            { company: { contains: keyword } },
            { contact: { contains: keyword } },
          ],
        },
        orderBy: { company: "asc" },
        take: 5,
        select: { id: true, company: true, contact: true, notes: true },
      })
      return customers
    }

    case "query_product": {
      const keyword = String(args.keyword ?? "")
      // 关键词为空时返回全部产品（最多 30 条）
      const where = keyword ? { name: { contains: keyword } } : {}
      const products = await prisma.product.findMany({
        where,
        orderBy: { name: "asc" },
        take: 30,
        include: { category: { select: { id: true, name: true } } },
      })
      return products.map((p) => ({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.category.name,
      }))
    }

    case "query_formula": {
      const productId = String(args.product_id ?? "")
      const formulas = await prisma.formula.findMany({
        where: { productId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, name: true, specParams: true, notes: true },
      })
      return formulas
    }

    case "get_pending_orders": {
      const orders = await prisma.order.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        include: {
          customer: { select: { company: true, contact: true } },
          product: { select: { name: true, category: { select: { name: true } } } },
        },
      })
      return orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        customer: `${o.customer.company}·${o.customer.contact}`,
        product: o.product.name,
        category: o.product.category.name,
        specParams: JSON.parse(o.specParams),
        quantity: o.quantity,
        unit: o.unit,
        createdAt: o.createdAt,
      }))
    }

    case "get_machine_status": {
      const machines = await prisma.machine.findMany({
        where: { isActive: true },
        include: {
          categories: { include: { category: { select: { name: true } } } },
          tasks: {
            where: { status: { not: "DONE" } },
            orderBy: { position: "asc" },
            include: {
              orders: {
                select: {
                  id: true,
                  orderNo: true,
                  quantity: true,
                  unit: true,
                  specParams: true,
                  customer: { select: { company: true } },
                  product: { select: { name: true } },
                },
              },
            },
          },
        },
      })
      return machines.map((m) => ({
        id: m.id,
        name: m.name,
        minWidth: m.minWidth,
        maxWidth: m.maxWidth,
        notes: m.notes,
        categories: m.categories.map((c) => c.category.name),
        currentTasks: m.tasks.map((t) => ({
          id: t.id,
          position: t.position,
          status: t.status,
          orders: t.orders.map((o) => ({
            orderNo: o.orderNo,
            customer: o.customer.company,
            product: o.product.name,
            specParams: JSON.parse(o.specParams),
            quantity: `${o.quantity}${o.unit}`,
          })),
        })),
      }))
    }

    case "generate_schedule_plan":
    case "adjust_schedule_plan":
    case "check_unfinished_task": {
      // 纯 AI 推理型工具，不需要额外查询，返回空让 AI 基于已有上下文推理
      return {}
    }

    default:
      throw new Error(`未知的读操作 Tool: ${name}`)
  }
}

// ─── 查询可读名称，供确认卡片展示 ────────────────────────────────────────────────

async function enrichToolArgsForDisplay(
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (toolName === "confirm_and_create_order") {
    const customerId = String(args.customer_id ?? "")
    const productId = String(args.product_id ?? "")

    const formulaId = args.formula_id ? String(args.formula_id) : null

    const [customer, product, formula] = await Promise.all([
      customerId
        ? prisma.customer.findUnique({
            where: { id: customerId },
            select: { company: true, contact: true },
          })
        : null,
      productId
        ? prisma.product.findUnique({
            where: { id: productId },
            select: { name: true, category: { select: { name: true } } },
          })
        : null,
      formulaId
        ? prisma.formula.findUnique({
            where: { id: formulaId },
            select: { name: true, materials: true, notes: true },
          })
        : null,
    ])

    const specParams = args.spec_params as Record<string, string> | undefined

    // materials 存的是 JSON 字符串，解析成数组
    let formulaMaterials: Array<Record<string, string>> = []
    if (formula?.materials) {
      try {
        formulaMaterials = JSON.parse(formula.materials) as Array<Record<string, string>>
      } catch {
        formulaMaterials = []
      }
    }

    return {
      customer: customer ? `${customer.company}·${customer.contact}` : customerId,
      product: product ? `${product.category.name} / ${product.name}` : productId,
      specParams: specParams ?? {},
      quantity: args.quantity,
      unit: args.unit,
      formulaName: formula?.name ?? null,
      formulaMaterials,
      formulaNotes: formula?.notes ?? null,
      extraNotes: args.extra_notes ?? null,
    }
  }

  if (toolName === "update_order") {
    const orderId = String(args.order_id ?? "")
    const order = orderId
      ? await prisma.order.findUnique({
          where: { id: orderId },
          select: { orderNo: true, customer: { select: { company: true } } },
        })
      : null
    return {
      orderNo: order?.orderNo ?? orderId,
      customer: order?.customer.company ?? "",
      changes: args.fields,
    }
  }

  if (toolName === "confirm_and_execute") {
    const plan = args.plan as {
      tasks?: Array<{ machineId: string; machineName?: string; orderIds: string[]; orderNos?: string[] }>
    } | undefined
    const tasks = plan?.tasks ?? []

    // 从 DB 补全机器名称和订单号（AI 可能没传，或者传错了）
    const enrichedTasks = await Promise.all(
      tasks.map(async (t) => {
        const machine = t.machineName
          ? { name: t.machineName }
          : await prisma.machine.findUnique({ where: { id: t.machineId }, select: { name: true } })

        const orderNos = t.orderNos?.length
          ? t.orderNos
          : await prisma.order
              .findMany({ where: { id: { in: t.orderIds } }, select: { orderNo: true } })
              .then((rows) => rows.map((r) => r.orderNo))

        return {
          machineName: machine?.name ?? t.machineId,
          orderIds: t.orderIds,
          orderNos,
        }
      })
    )

    return {
      taskCount: enrichedTasks.length,
      orderCount: enrichedTasks.reduce((n, t) => n + t.orderIds.length, 0),
      tasks: enrichedTasks,  // 供确认卡片逐行展示
    }
  }

  return args
}

// ─── 执行写操作 Tool（由 /confirm 接口调用）───────────────────────────────────

export async function runWriteTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "confirm_and_create_order": {
      const orderNo = await generateOrderNo()
      const order = await prisma.order.create({
        data: {
          orderNo,
          customerId: String(args.customer_id),
          productId: String(args.product_id),
          specParams: JSON.stringify(args.spec_params ?? {}),
          quantity: Number(args.quantity),
          unit: String(args.unit),
          formulaId: args.formula_id ? String(args.formula_id) : null,
          extraNotes: args.extra_notes ? String(args.extra_notes) : null,
          status: "PENDING",
        },
        include: {
          customer: { select: { company: true, contact: true } },
          product: { select: { name: true } },
        },
      })

      if (args.formula_id) {
        const formula = await prisma.formula.findUnique({ where: { id: String(args.formula_id) } })
        if (formula) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              formulaSnapshot: JSON.stringify({
                name: formula.name,
                specParams: formula.specParams,
                materials: formula.materials,
              }),
            },
          })
        }
      }

      return {
        success: true,
        orderNo: order.orderNo,
        customer: `${order.customer.company}·${order.customer.contact}`,
        product: order.product.name,
        quantity: `${order.quantity}${order.unit}`,
      }
    }

    case "update_order": {
      const orderId = String(args.order_id)
      const fields = args.fields as Record<string, unknown>
      const updateData: Record<string, unknown> = {}

      if (fields.spec_params) updateData.specParams = JSON.stringify(fields.spec_params)
      if (fields.quantity !== undefined) updateData.quantity = Number(fields.quantity)
      if (fields.unit) updateData.unit = String(fields.unit)
      if (fields.formula_id !== undefined) updateData.formulaId = fields.formula_id ? String(fields.formula_id) : null
      if (fields.extra_notes !== undefined) updateData.extraNotes = String(fields.extra_notes)
      if (fields.status) updateData.status = String(fields.status)

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: updateData,
        select: { orderNo: true },
      })
      return { success: true, orderNo: updated.orderNo }
    }

    case "confirm_and_execute": {
      const plan = args.plan as {
        tasks: Array<{ machineId: string; orderIds: string[] }>
      }

      const results = []
      for (const task of plan.tasks) {
        const maxPos = await prisma.productionTask.aggregate({
          where: { machineId: task.machineId },
          _max: { position: true },
        })
        const position = (maxPos._max.position ?? 0) + 1

        const createdTask = await prisma.productionTask.create({
          data: {
            machineId: task.machineId,
            position,
            status: "WAITING",
            orders: { connect: task.orderIds.map((id) => ({ id })) },
          },
        })

        await prisma.order.updateMany({
          where: { id: { in: task.orderIds } },
          data: { status: "PRODUCING", taskId: createdTask.id },
        })

        results.push({ taskId: createdTask.id, orderCount: task.orderIds.length })
      }

      return { success: true, tasksCreated: results.length, tasks: results }
    }

    default:
      throw new Error(`未知的写操作 Tool: ${name}`)
  }
}
