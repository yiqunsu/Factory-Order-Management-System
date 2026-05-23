# Skills — AI 任务技能模块

## 是什么

每个 Skill 对应一类业务任务（录单、排单、通用查询）。  
主路由识别用户意图后，加载对应 Skill，组合成专用的 system prompt 发给 DeepSeek，同时只开放该任务需要的 tools。

**好处：**
- AI 每次只看跟当前任务相关的指令和工具，减少幻觉
- 要调提示词？直接改对应 Skill 文件，不影响其他任务
- 想做 AB 测试？改一个环境变量就能切换 prompt 版本

---

## 文件结构

```
src/lib/skills/
  types.ts          接口定义（Skill 类型）
  router.ts         意图识别 + Skill 路由
  create-order.ts   录单 Skill
  schedule.ts       排单 Skill
  general.ts        通用/兜底 Skill
  index.ts          统一导出
  README.md         本文件
```

---

## Skill 接口

```typescript
interface Skill {
  name: string            // 唯一标识
  taskPrompt: string      // 任务专用提示词，拼接到全局 system prompt 末尾
  allowedTools: string[]  // 该任务允许调用的 tool 名称列表
  loadContext?: (prisma) => Promise<string>  // 预加载 DB 数据（可选）
}
```

---

## 意图识别流程

```
用户消息
    │
    ▼
关键词匹配（router.ts - detectSkillByKeyword）
    │
    ├─ 匹配到 ──→ 返回对应 Skill
    │
    └─ 未匹配 ──→ 返回 generalSkill（兜底）
                  （未来可在这里加 LLM 分类，见 router.ts 注释）
```

当前关键词规则：

| 关键词示例 | 匹配 Skill |
|-----------|-----------|
| 录单、新建订单、帮我录、下单 | `create-order` |
| 排单、安排生产、排产、哪台机 | `schedule` |
| 其他 | `general` |

---

## 数据流

```
POST /api/agent/chat
    │
    ├─ resolveSkill(content)          识别意图，拿到 Skill
    ├─ skill.loadContext(prisma)       预加载 DB 数据（如客户/产品列表）
    ├─ 组合 systemPrompt              SYSTEM_PROMPT + taskPrompt + dbContext
    ├─ 过滤 tools                     只传 skill.allowedTools 里的工具
    │
    └─ callDeepSeek(messages, systemPrompt, activeTools)
```

---

## 怎么修改提示词

直接编辑对应 Skill 文件里的 `PROMPTS.v1` 字符串即可。  
改完重启开发服务器生效（`npm run dev`）。

---

## 怎么做 AB 测试

每个 Skill 文件内置了多版本 prompt 和环境变量切换：

**1. 在 Skill 文件里加一个新版本：**

```typescript
// create-order.ts
const PROMPTS: Record<string, string> = {
  v1: `...旧版提示词...`,
  v2: `...新版提示词，测试用...`,
}
```

**2. 在 `.env` 里切换：**

```env
CREATE_ORDER_SKILL_VERSION=v2
```

**3. 重启服务器，对比效果。**

确认 v2 更好后，把 v1 内容替换成 v2，删掉 v2，把版本号改回 v1（或直接删掉版本管理）。

| Skill | 环境变量 | 默认值 |
|-------|---------|--------|
| 录单 | `CREATE_ORDER_SKILL_VERSION` | `v1` |
| 排单 | `SCHEDULE_SKILL_VERSION` | `v1` |

---

## 怎么新增一个 Skill

以「修改订单」为例：

**1. 新建 `src/lib/skills/update-order.ts`：**

```typescript
import type { Skill } from "./types"

export const updateOrderSkill: Skill = {
  name: "update-order",
  taskPrompt: `
## 当前任务：修改订单
...
`,
  allowedTools: ["update_order", "query_customer", "check_unfinished_task"],
}
```

**2. 在 `router.ts` 注册：**

```typescript
import { updateOrderSkill } from "./update-order"

export const SKILL_MAP = {
  "create-order": createOrderSkill,
  "update-order": updateOrderSkill,   // ← 加这行
  schedule: scheduleSkill,
  general: generalSkill,
}
```

**3. 在 `router.ts` 添加关键词：**

```typescript
{ skill: "update-order", patterns: [/修改订单|改单|更新订单/] },
```

**4. 在 `index.ts` 导出（可选）：**

```typescript
export { updateOrderSkill } from "./update-order"
```

---

## 各 Skill 开放的 Tools

| Tool | 录单 | 排单 | 通用 |
|------|:----:|:----:|:----:|
| extract_order_info | ✓ | | ✓ |
| query_customer | ✓ | | ✓ |
| query_product | ✓ | | ✓ |
| query_formula | ✓ | | ✓ |
| confirm_and_create_order | ✓ | | ✓ |
| update_order | | | ✓ |
| get_pending_orders | | ✓ | ✓ |
| get_machine_status | | ✓ | ✓ |
| generate_schedule_plan | | ✓ | ✓ |
| adjust_schedule_plan | | ✓ | ✓ |
| confirm_and_execute | | ✓ | ✓ |
| check_unfinished_task | ✓ | ✓ | ✓ |

---

## 关于 loadContext（DB 预加载）

**什么时候用：**  
数据量小（< 50 条）、几乎每次都要用到的列表，比如客户列表、产品列表。  
直接塞进 prompt，省去 `query_customer` / `query_product` 的往返调用。

**什么时候不用：**  
数据量大（订单列表、机器队列等），用工具按需查询，不要塞进 prompt。

**当前启用 loadContext 的 Skill：**

| Skill | 预加载内容 |
|-------|-----------|
| create-order | 客户列表 + 产品列表 |
| schedule | 无（数据量大，工具查询） |
| general | 无 |
