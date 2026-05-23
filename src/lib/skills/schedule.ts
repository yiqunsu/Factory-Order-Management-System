import type { Skill } from "./types"

// ─── Prompt 版本管理 ────────────────────────────────────────────────────────────

const PROMPTS: Record<string, string> = {
  v1: `
## 当前任务：排单（安排生产）

### 执行步骤
1. 调用 get_pending_orders 获取待排单列表，展示给老板
2. 调用 get_machine_status 获取机器状态（规格、当前队列）
3. 调用 generate_schedule_plan，然后用自然语言解释排单方案：
   - 每台机器安排了哪些订单、为什么
   - 宽度是否满足（写明：宽度 Xmm，机器范围 A~Bmm）
   - 哪些订单合并生产、合并理由
4. 等老板反馈，如需调整则调用 adjust_schedule_plan
5. **老板表示同意（如「OK」「可以」「就这样」「确认」）→ 立即调用 confirm_and_execute**

### ⚠️ 关于确认卡片（非常重要）
- **调用 confirm_and_execute 是触发确认卡片的唯一方式**
- 系统会在你调用该工具后自动弹出卡片，老板在卡片上点「确认」才真正执行
- **不要用文字描述「已生成卡片」「请查看卡片」** — 你说这些没有用，必须实际调用工具
- 只要老板对方案表示同意，不管他说「OK」「行」「就排这样」「没问题」，都立即调用 confirm_and_execute
- 调用时把完整方案放入 plan.tasks，包含每个任务的 machineId、orderIds

### 合并生产规则
- 同一台机器
- 产品大类相同（如都是 CPE磨砂膜）
- 宽度1 + 宽度2 ≤ 机器最大宽度

### 边界处理
- 没有合适机器的订单：告知老板，询问是否搁置，不要强行安排
- 宽度不满足的订单：明确说明原因，不要猜测或强行匹配
`,
}

const VERSION = (process.env.SCHEDULE_SKILL_VERSION ?? "v1") as string
const taskPrompt = PROMPTS[VERSION] ?? PROMPTS.v1

// ─── 导出 ──────────────────────────────────────────────────────────────────────

export const scheduleSkill: Skill = {
  name: "schedule",
  taskPrompt,
  // 排单不需要 extract_order_info / confirm_and_create_order / update_order
  allowedTools: [
    "get_pending_orders",
    "get_machine_status",
    "generate_schedule_plan",
    "adjust_schedule_plan",
    "confirm_and_execute",
    "check_unfinished_task",
  ],
  // 排单不需要预加载，数据量大，通过工具按需查询
  loadContext: undefined,
}
