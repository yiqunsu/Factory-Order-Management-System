import type { Skill } from "./types"
import { createOrderSkill } from "./create-order"
import { scheduleSkill } from "./schedule"
import { generalSkill } from "./general"

// ─── Skill 注册表 ──────────────────────────────────────────────────────────────

export const SKILL_MAP: Record<string, Skill> = {
  "create-order": createOrderSkill,
  schedule: scheduleSkill,
  general: generalSkill,
}

// ─── 阶段一：关键词快速匹配（0 延迟、0 费用）────────────────────────────────────

const SKILL_KEYWORDS: Array<{ skill: string; patterns: RegExp[] }> = [
  {
    skill: "create-order",
    patterns: [
      /录单|录一张|新建订单|帮我录|帮我建单|下单|接单|建个单/,
      /有.*订单|订单.*帮我/,
    ],
  },
  {
    skill: "schedule",
    patterns: [
      /排单|排产|安排生产|生产计划|帮我排|机器.*安排/,
      /哪台机|放.*机|分配.*机器/,
    ],
  },
]

export function detectSkillByKeyword(text: string): string | null {
  for (const { skill, patterns } of SKILL_KEYWORDS) {
    if (patterns.some((p) => p.test(text))) return skill
  }
  return null
}

// ─── 阶段二：LLM 分类（仅关键词匹配失败时调用）────────────────────────────────
// 目前暂时 fallback 到 general，后续可接入一次轻量 DeepSeek 调用做分类
// 使用方式：
//   const skillName = detectSkillByKeyword(text) ?? await detectSkillByLLM(text)
//
// export async function detectSkillByLLM(text: string): Promise<string> {
//   const res = await callDeepSeek([
//     { role: "user", content: `判断用户意图，只回复以下之一：create-order / schedule / general\n用户：${text}` },
//   ], { tools: [] })
//   const name = res.choices[0].message.content?.trim() ?? "general"
//   return SKILL_MAP[name] ? name : "general"
// }

// ─── 主入口：根据文本返回 Skill ───────────────────────────────────────────────

export function resolveSkill(text: string): Skill {
  const skillName = detectSkillByKeyword(text) ?? "general"
  return SKILL_MAP[skillName] ?? generalSkill
}
