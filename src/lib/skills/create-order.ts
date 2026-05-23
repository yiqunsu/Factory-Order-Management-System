import type { PrismaClient } from "@/generated/prisma/client"
import type { Skill } from "./types"

// ─── Prompt 版本管理（AB 测试：改 env CREATE_ORDER_SKILL_VERSION=v2）────────────

const PROMPTS: Record<string, string> = {
  v1: `
## 当前任务：录入新订单

### 执行步骤
1. **提取字段**：从老板的描述里识别以下信息
   - 客户名称
   - 产品名称（如 PE膜、PP膜）
   - 规格参数：厚度（μm）、宽度（mm）至少要有这两项
   - 数量 + 单位（kg 或 t）
   - 额外要求（可选）

2. **匹配客户**（对照下方【客户列表】）
   - 完全或高度匹配 → 直接使用，告知老板已匹配
   - 相似但不确定 → 列出候选让老板选
   - 完全找不到 → 询问：是否直接用这个名字新建客户？

3. **匹配产品**（对照下方【产品列表】）
   - 规则同上；只有一个高度匹配时先默认选它，告知老板并确认

4. **追问缺失字段**：每次只问一个，不要把所有缺失字段一次列出

5. **确认后建单**：所有字段齐全后，调用 confirm_and_create_order
   - 系统会弹出确认卡片，等老板点「确认」才真正写入

### 边界处理
- 老板说「50厚」→ 厚度 50μm；「600宽」→ 宽度 600mm
- 数量单位不明时默认问清楚，不要猜
- 配方字段是可选的，不要主动追问，除非老板提到
`,

  v2: `
## 当前任务：录入新订单（简洁版）

从老板描述里提取：客户、产品、厚度/宽度、数量/单位。
对照【客户列表】和【产品列表】匹配，不确定就给选项让老板选，缺字段就问。
全齐后调 confirm_and_create_order。
`,
}

const VERSION = (process.env.CREATE_ORDER_SKILL_VERSION ?? "v1") as string
const taskPrompt = PROMPTS[VERSION] ?? PROMPTS.v1

// ─── 预加载 DB 上下文（客户列表 + 产品列表，数量少可以一次塞进 prompt）──────────

async function loadContext(prisma: PrismaClient): Promise<string> {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      select: { id: true, company: true, contact: true },
      orderBy: { company: "asc" },
    }),
    prisma.product.findMany({
      select: { id: true, name: true, category: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ])

  const customerList =
    customers.length > 0
      ? customers.map((c: { id: string; company: string; contact: string }) =>
          `  - ${c.company}（${c.contact}）[id:${c.id}]`
        ).join("\n")
      : "  （暂无客户，如有需要可新建）"

  const productList =
    products.length > 0
      ? products.map((p: { id: string; name: string; category: { name: string } }) =>
          `  - [${p.category.name}] ${p.name}  [id:${p.id}]`
        ).join("\n")
      : "  （暂无产品）"

  return `
【客户列表】
${customerList}

【产品列表】
${productList}
`
}

// ─── 导出 ──────────────────────────────────────────────────────────────────────

export const createOrderSkill: Skill = {
  name: "create-order",
  taskPrompt,
  allowedTools: [
    "extract_order_info",
    "query_customer",
    "query_product",
    "query_formula",
    "confirm_and_create_order",
    "check_unfinished_task",
  ],
  loadContext,
}
