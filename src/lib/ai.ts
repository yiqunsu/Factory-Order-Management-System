export interface ParsedOrder {
  customer: string | null
  product: string | null
  specParams: Record<string, string> | null
  quantity: number | null
  unit: "kg" | "t" | null
  extraNotes: string | null
}

const SYSTEM_PROMPT =
  `你是一个塑料薄膜工厂的订单解析助手。从用户提供的微信截图 OCR 文字中提取订单信息，以 JSON 格式返回。

字段说明：
- customer：客户公司名称
- product：产品名称（如 PE膜、CPE膜、PP膜、POF膜 等）
- specParams：规格参数对象，只提取以下两个字段（没有则为 null）：
    厚度（如 50μm、0.05mm、8C、10丝）
    宽度（如 600mm、70.5cm、70.5）
- quantity：数量（纯数字）
- unit：单位，只能是 "kg" 或 "t"，公斤=kg，吨=t
- extraNotes：其他特殊要求或备注

规则：不确定的字段返回 null，不要强行猜测。只返回 JSON，不要其他文字。

示例输出：
{"customer":"华兴包装","product":"CPE膜","specParams":{"厚度":"8C","宽度":"70.5cm"},"quantity":1200,"unit":"kg","extraNotes":null}`

export async function parseWechatOrder(input: { type: "text"; content: string }): Promise<ParsedOrder> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY 未配置")

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input.content },
      ],
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepSeek API 错误 ${res.status}: ${body}`)
  }

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ""

  // Strip markdown code fences if present
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  return JSON.parse(raw) as ParsedOrder
}
