import type { Skill } from "./types"

// 通用 Skill：意图不明确时的兜底。
// 开放全部工具，不做额外预加载，让 AI 自由发挥。
// 当识别出具体意图后，下一轮会切换到对应专用 Skill。

const taskPrompt = `
## 当前状态：等待指令

老板还没有明确说要做什么。请：
- 简单问清楚意图（录单？排单？查询？）
- 或者直接根据老板的描述推断并开始执行
`

export const generalSkill: Skill = {
  name: "general",
  taskPrompt,
  allowedTools: [
    "extract_order_info",
    "query_customer",
    "query_product",
    "query_formula",
    "confirm_and_create_order",
    "update_order",
    "get_pending_orders",
    "get_machine_status",
    "generate_schedule_plan",
    "adjust_schedule_plan",
    "confirm_and_execute",
    "check_unfinished_task",
  ],
}
