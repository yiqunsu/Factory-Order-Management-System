// DeepSeek API 客户端（兼容 OpenAI 格式）
// API Key 从环境变量 DEEPSEEK_API_KEY 读取

export type MessageRole = "user" | "assistant" | "tool" | "system"

export interface DSMessage {
  role: MessageRole
  content: string | null
  tool_calls?: DSToolCall[]
  tool_call_id?: string
  name?: string
}

export interface DSToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface DSResponse {
  choices: Array<{
    message: {
      role: "assistant"
      content: string | null
      tool_calls?: DSToolCall[]
    }
    finish_reason: string
  }>
}

// ─── 工具名称中文映射（前后端共用）────────────────────────────────────────────────

export const TOOL_LABELS_ZH: Record<string, string> = {
  confirm_and_create_order: "创建订单",
  update_order: "修改订单",
  confirm_and_execute: "执行排单",
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const today = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
})

export const SYSTEM_PROMPT = `你是「7IL薄膜工厂」的订单管理智能助手，服务对象是工厂老板（唯一用户）。

## 能力范围
- 录入新订单：从老板的描述或微信消息中提取订单信息，逐步收集完整字段后创建订单
- 排单：获取待排单列表和机器状态，生成排单方案，解释决策逻辑，支持对话调整
- 查询：客户、产品、配方、待排单、最近订单等查询可直接执行

## 行为准则
1. **写操作必须调用工具触发确认卡片：** 创建订单、执行排单等写操作，必须通过调用对应工具来触发系统确认卡片。不要用文字描述「已生成卡片」「请查看卡片」——说了也没用，只有调用工具才会弹卡片
2. **老板表示同意就立即调用写操作工具：** 只要老板说「OK」「可以」「就这样」「确认」「行」，立即调用对应的写工具（confirm_and_create_order 或 confirm_and_execute），不要再等待或用文字描述
3. **读操作直接执行：** 查询类工具调用后直接展示结果，无需确认
4. **信息不完整时逐一追问：** 每次只问一个问题，不要猜测，不要一次列出所有缺失字段
5. **任务切换检测：** 如果老板在进行中的录单或排单任务中突然发起其他意图，用 check_unfinished_task 检查，然后主动询问是继续当前任务还是切换
6. **排单必须解释：** 每个排单决策都要用自然语言说明原因（为什么选这台机器、为什么可以合并等）
7. **简洁友好：** 回复简洁，使用中文，适当用 emoji，不要生成过长的回复

## 业务背景
- 工厂生产塑料薄膜：PE膜、PP膜等
- 订单规格参数：厚度（微米μm）、宽度（毫米mm）为主要必填项
- 数量单位：kg 或 t
- 机器限制：每台机器有最小/最大宽度范围，只能生产特定产品类别
- 合并生产条件：同台机器、产品类别相同、宽度之和 ≤ 机器最大宽度
- 老板习惯：口语化表达，如「50厚」=厚度50μm，「600宽」=宽度600mm，「PE膜」等缩写

## 今天日期
${today}`

// ─── 11 个 Tool 定义 ───────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  // ── 录单相关 ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "extract_order_info",
      description:
        "从老板粘贴的微信消息或口语描述中提取结构化订单字段。老板输入原始文字时调用此工具，解析出客户名、产品名、规格参数、数量、单位等信息。字段不确定时返回 null，不要猜测。",
      parameters: {
        type: "object",
        properties: {
          raw_text: {
            type: "string",
            description: "老板粘贴或输入的原始文字",
          },
        },
        required: ["raw_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_customer",
      description:
        "在客户库中模糊搜索客户。当需要匹配老板提到的客户名称时调用。返回匹配度最高的客户列表，供 AI 判断直接使用还是提示老板确认。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "客户名称关键词，如「华兴」「华东纸业」",
          },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_product",
      description:
        "在产品库中搜索匹配的产品。当老板提到产品名称（如「PE膜」「PP膜」）时调用，返回匹配产品列表。",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "产品名称关键词，如「PE膜」「聚乙烯」",
          },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_formula",
      description:
        "查询指定产品下的配方列表。当老板选择从配方库选择配方时调用，需要先确定产品 ID。",
      parameters: {
        type: "object",
        properties: {
          product_id: {
            type: "string",
            description: "产品 ID",
          },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_and_create_order",
      description:
        "创建新订单。所有必填字段（客户、产品、规格参数、数量、单位）收集完毕后，老板确认摘要卡片后才调用此工具。这是写操作，调用后系统会显示确认卡片等待老板最终确认。",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "客户 ID" },
          product_id: { type: "string", description: "产品 ID" },
          spec_params: {
            type: "object",
            description: "规格参数，如 {\"厚度\": \"50μm\", \"宽度\": \"600mm\"}",
            additionalProperties: { type: "string" },
          },
          quantity: { type: "number", description: "数量" },
          unit: { type: "string", enum: ["kg", "t"], description: "单位" },
          formula_id: {
            type: "string",
            description: "配方 ID（可选，不选配方时不传）",
          },
          extra_notes: {
            type: "string",
            description: "额外要求或备注（可选）",
          },
        },
        required: ["customer_id", "product_id", "spec_params", "quantity", "unit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_order",
      description:
        "修改已有订单的字段。当老板要更新某张订单的信息时调用。这是写操作，调用后系统会显示确认卡片等待老板确认。",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "订单 ID" },
          fields: {
            type: "object",
            description:
              "要更新的字段，只传需要修改的字段。可用字段：spec_params、quantity、unit、formula_id、extra_notes、status",
            additionalProperties: true,
          },
        },
        required: ["order_id", "fields"],
      },
    },
  },

  // ── 排单相关 ──────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_pending_orders",
      description:
        "获取所有状态为「待排单」的订单列表。发起排单任务时首先调用此工具，展示给老板选择本次要排哪些订单。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_machine_status",
      description:
        "获取所有机器的当前状态，包括机器规格（最小/最大宽度、可生产产品类别）和当前生产队列。生成排单方案前调用。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_schedule_plan",
      description:
        "根据选定的待排单订单和机器状态，生成排单方案。AI 需综合考虑：机器产品类别匹配、宽度限制、合并生产可能性（同类别+宽度之和≤机器最大宽度）、接单时间顺序。方案需包含每个决策的原因说明。",
      parameters: {
        type: "object",
        properties: {
          order_ids: {
            type: "array",
            items: { type: "string" },
            description: "本次要排单的订单 ID 列表",
          },
        },
        required: ["order_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_schedule_plan",
      description:
        "根据老板的对话指令调整当前排单方案。老板可能说「把某张单放到某台机」「那两张能合并吗」「调整优先级」等。返回调整后的完整方案和变更说明。",
      parameters: {
        type: "object",
        properties: {
          current_plan: {
            type: "object",
            description: "当前排单方案，结构与 confirm_and_execute 的 plan 相同：{ tasks: [{machineId, machineName, orderIds, orderNos}] }",
          },
          instruction: {
            type: "string",
            description: "老板的调整指令，如「把华兴那张放到3号机」",
          },
        },
        required: ["current_plan", "instruction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_and_execute",
      description:
        "执行最终排单方案，在数据库中创建生产任务并关联订单。老板确认方案后才调用此工具。这是写操作，调用后系统会显示确认卡片等待老板最终确认。",
      parameters: {
        type: "object",
        properties: {
          plan: {
            type: "object",
            description: "最终排单方案，包含每个生产任务的机器和订单分配",
            properties: {
              tasks: {
                type: "array",
                description: "生产任务列表，每项对应一台机器上的一个任务",
                items: {
                  type: "object",
                  properties: {
                    machineId: { type: "string", description: "机器 ID" },
                    machineName: { type: "string", description: "机器名称，如「1号机」" },
                    orderIds: {
                      type: "array",
                      items: { type: "string" },
                      description: "该任务包含的订单 ID 列表（合并生产时可含多个）",
                    },
                    orderNos: {
                      type: "array",
                      items: { type: "string" },
                      description: "订单号列表，与 orderIds 一一对应，用于展示",
                    },
                  },
                  required: ["machineId", "orderIds"],
                },
              },
            },
            required: ["tasks"],
          },
        },
        required: ["plan"],
      },
    },
  },

  // ── 通用 ─────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "check_unfinished_task",
      description:
        "检查当前对话中是否有未完成的录单或排单任务。当检测到老板的意图与当前进行中的任务不符时调用（如录单过程中突然提到排单）。返回未完成任务的摘要。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
]

// 需要老板确认才能执行的写操作 Tool
export const WRITE_TOOLS = new Set([
  "confirm_and_create_order",
  "update_order",
  "confirm_and_execute",
])

// ─── DB 消息 → OpenAI 格式转换 ────────────────────────────────────────────────

export interface DBMessageRow {
  role: string
  content: string | null
  toolCalls: string | null
  toolCallId: string | null
  toolName: string | null
}

export function dbMessagesToOpenAI(rows: DBMessageRow[]): DSMessage[] {
  return rows.map((row) => {
    if (row.role === "assistant" && row.toolCalls) {
      return {
        role: "assistant",
        content: row.content ?? null,
        tool_calls: JSON.parse(row.toolCalls) as DSToolCall[],
      }
    }
    if (row.role === "tool") {
      return {
        role: "tool",
        content: row.content ?? "",
        tool_call_id: row.toolCallId!,
        name: row.toolName ?? undefined,
      }
    }
    return {
      role: row.role as MessageRole,
      content: row.content ?? "",
    }
  })
}

// ─── DeepSeek API 调用（非流式，供 confirm/route 等使用）────────────────────────

export async function callDeepSeek(
  messages: DSMessage[],
  /** 自定义 system prompt，不传时使用默认 SYSTEM_PROMPT */
  systemPrompt?: string,
  /** 自定义工具列表，不传时使用全部 TOOL_DEFINITIONS */
  tools?: typeof TOOL_DEFINITIONS,
): Promise<DSResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置")

  const activeTools = tools ?? TOOL_DEFINITIONS

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt ?? SYSTEM_PROMPT }, ...messages],
      tools: activeTools,
      tool_choice: activeTools.length > 0 ? "auto" : undefined,
      max_tokens: 2048,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepSeek API 错误 ${res.status}: ${body}`)
  }

  return res.json() as Promise<DSResponse>
}

// ─── DeepSeek 流式调用 ────────────────────────────────────────────────────────

export type StreamChunk =
  | { type: "delta"; content: string }        // 文本片段，实时转发给客户端
  | { type: "tool_calls"; tool_calls: DSToolCall[] }  // 工具调用（累积完整后一次返回）
  | { type: "done" }                           // 流结束

/**
 * 流式调用 DeepSeek。
 * - 文本 token：逐个 yield delta
 * - 工具调用：累积所有分片后，一次 yield tool_calls（工具名/参数在分片中逐步到达）
 * - 结束：yield done
 *
 * 注意：DeepSeek 在同一轮不会同时产生 content 和 tool_calls，二者互斥。
 */
export async function* callDeepSeekStream(
  messages: DSMessage[],
  systemPrompt?: string,
  tools?: typeof TOOL_DEFINITIONS,
): AsyncGenerator<StreamChunk> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置")

  const activeTools = tools ?? TOOL_DEFINITIONS

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt ?? SYSTEM_PROMPT }, ...messages],
      tools: activeTools,
      tool_choice: activeTools.length > 0 ? "auto" : undefined,
      max_tokens: 2048,
      stream: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepSeek API 错误 ${res.status}: ${body}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  // tool_calls 各分片按 index 累积
  const accToolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = []
  let hasToolCalls = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data: ")) continue
        const raw = trimmed.slice(6)
        if (raw === "[DONE]") {
          if (hasToolCalls) yield { type: "tool_calls", tool_calls: accToolCalls as DSToolCall[] }
          yield { type: "done" }
          return
        }

        let chunk: {
          choices: Array<{
            delta: {
              content?: string | null
              tool_calls?: Array<{
                index: number
                id?: string
                function?: { name?: string; arguments?: string }
              }>
            }
          }>
        }
        try { chunk = JSON.parse(raw) } catch { continue }

        const delta = chunk.choices[0]?.delta
        if (!delta) continue

        if (delta.tool_calls) {
          hasToolCalls = true
          for (const tc of delta.tool_calls) {
            const idx = tc.index
            if (!accToolCalls[idx]) {
              accToolCalls[idx] = { id: "", type: "function", function: { name: "", arguments: "" } }
            }
            if (tc.id) accToolCalls[idx].id += tc.id
            if (tc.function?.name) accToolCalls[idx].function.name += tc.function.name
            if (tc.function?.arguments) accToolCalls[idx].function.arguments += tc.function.arguments
          }
        } else if (delta.content) {
          yield { type: "delta", content: delta.content }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
