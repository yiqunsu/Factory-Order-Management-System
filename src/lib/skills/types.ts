import type { PrismaClient } from "@/generated/prisma/client"

/**
 * Skill — 任务专用提示词 + 工具白名单 + DB 上下文预加载
 *
 * 每个业务任务对应一个 Skill 文件。主路由识别意图后加载对应 Skill，
 * 组合成 system prompt 发给 DeepSeek，同时只开放该任务需要的 tools。
 */
export interface Skill {
  /** Skill 唯一标识，用于日志和路由匹配 */
  name: string

  /**
   * 任务专用指令，会拼接到全局 system prompt 末尾。
   * 写清楚该任务的执行步骤、边界条件、特殊规则。
   */
  taskPrompt: string

  /**
   * 该任务允许调用的 tool 名称列表。
   * 主路由会过滤 TOOL_DEFINITIONS，只把这些 tools 传给 DeepSeek，
   * 减少幻觉、降低 token 消耗。
   */
  allowedTools: string[]

  /**
   * 预加载 DB 数据，结果字符串拼入 system prompt。
   * 适合把小规模列表（客户、产品等）一次性给模型，省去多轮工具调用。
   * 数据量大时不要用，改用工具按需查询。
   */
  loadContext?: (prisma: PrismaClient) => Promise<string>
}
