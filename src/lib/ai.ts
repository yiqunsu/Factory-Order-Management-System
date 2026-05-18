import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ParsedOrder {
  customer: string | null
  product: string | null
  specParams: Record<string, string> | null
  quantity: number | null
  unit: "kg" | "t" | null
  extraNotes: string | null
}

export async function parseWechatOrder(text: string): Promise<ParsedOrder> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "你是一个塑料薄膜工厂的订单解析助手。从用户粘贴的微信对话中提取订单信息，以 JSON 格式返回。字段包括：customer（客户名）、product（产品名）、specParams（规格参数对象，如厚度/宽度）、quantity（数量，数字）、unit（单位，只能是 kg 或 t）、extraNotes（其他要求）。不确定的字段返回 null，不要强行猜测。只返回 JSON，不要其他文字。",
    messages: [{ role: "user", content: text }],
  })

  const content = message.content[0]
  if (content.type !== "text") throw new Error("Unexpected response type")

  return JSON.parse(content.text) as ParsedOrder
}
