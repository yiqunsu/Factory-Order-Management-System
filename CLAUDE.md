# 工厂订单管理系统 — CLAUDE.md

## 项目概述

面向国内塑料薄膜工厂的 AI 订单管理系统。核心功能是帮助工厂老板管理订单录入和生产排单，替代 Excel 手工管理。

**目标用户：** 工厂老板（一个人用，手机+电脑都要好用）
**核心价值：** 微信收到订单 → 丢给 AI 解析 → 一键录入 → 可视化排单

---

## 技术栈

```
框架        Next.js 15 (App Router)
语言        TypeScript（全程）
数据库      SQLite（开发） → PostgreSQL（生产，阿里云/腾讯云）
ORM         Prisma
UI组件      shadcn/ui + Tailwind CSS
拖拽        @dnd-kit/core（排单看板拖拽）
AI          Anthropic Claude API（微信对话解析）
部署        开发阶段本地运行，正式部署阿里云/腾讯云
```

---

## 项目结构

```
/
├── prisma/
│   └── schema.prisma          # 数据库表结构
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── layout.tsx         # 根布局
│   │   ├── page.tsx           # 首页（重定向到看板）
│   │   ├── kanban/            # 排单看板页
│   │   │   └── page.tsx
│   │   ├── orders/            # 订单列表页
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx   # 订单详情/编辑
│   │   ├── orders/new/        # 新建订单页
│   │   │   └── page.tsx
│   │   ├── settings/          # 基础数据管理
│   │   │   └── page.tsx
│   │   └── api/               # API Routes
│   │       ├── orders/
│   │       ├── machines/
│   │       ├── products/
│   │       ├── formulas/
│   │       ├── customers/
│   │       └── production-tasks/
│   ├── components/
│   │   ├── ui/                # shadcn 基础组件
│   │   ├── kanban/            # 排单看板相关组件
│   │   ├── orders/            # 订单相关组件
│   │   └── settings/          # 基础数据管理组件
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client 单例
│   │   ├── utils.ts           # 工具函数
│   │   └── ai.ts              # Claude API 调用
│   └── types/
│       └── index.ts           # 全局类型定义
└── CLAUDE.md                  # 本文件
```

---

## 数据库 Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"   // 生产环境改为 "postgresql"
  url      = env("DATABASE_URL")
}

// 产品大类
model ProductCategory {
  id        String    @id @default(cuid())
  name      String    // 如"PE膜"、"PP膜"
  desc      String?
  products  Product[]
  machines  MachineCategory[]
  createdAt DateTime  @default(now())
}

// 产品
model Product {
  id         String          @id @default(cuid())
  name       String          // 详细产品名称
  categoryId String
  category   ProductCategory @relation(fields: [categoryId], references: [id])
  formulas   Formula[]
  orders     Order[]
  createdAt  DateTime        @default(now())
}

// 花纹
model Pattern {
  id       String           @id @default(cuid())
  name     String
  desc     String?
  machines MachinePattern[]
}

// 机器
model Machine {
  id         String            @id @default(cuid())
  name       String            // 如"1号机"
  isActive   Boolean           @default(true)
  minWidth   Float             // 最小宽度 mm
  maxWidth   Float             // 最大宽度 mm
  notes      String?           // 其他限制说明，自由文本，AI可读
  categories MachineCategory[] // 可生产的产品大类
  patterns   MachinePattern[]  // 可用花纹
  tasks      ProductionTask[]
  createdAt  DateTime          @default(now())
}

// 机器-产品大类 多对多
model MachineCategory {
  machineId  String
  categoryId String
  machine    Machine         @relation(fields: [machineId], references: [id])
  category   ProductCategory @relation(fields: [categoryId], references: [id])
  @@id([machineId, categoryId])
}

// 机器-花纹 多对多
model MachinePattern {
  machineId String
  patternId String
  machine   Machine @relation(fields: [machineId], references: [id])
  pattern   Pattern @relation(fields: [patternId], references: [id])
  @@id([machineId, patternId])
}

// 配方表
model Formula {
  id           String    @id @default(cuid())
  name         String    // 配方名称/编号
  productId    String
  product      Product   @relation(fields: [productId], references: [id])
  specParams   String    // JSON，如 {"厚度":"50μm"}
  materials    String    // JSON，如 [{"原料":"XX树脂","比例":"60%"}]
  sourceId     String?   // 来源配方id，记录衍生关系
  source       Formula?  @relation("FormulaSource", fields: [sourceId], references: [id])
  derived      Formula[] @relation("FormulaSource")
  notes        String?
  orders       Order[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

// 客户
model Customer {
  id        String   @id @default(cuid())
  company   String   // 公司名称
  contact   String   // 联系人姓名
  notes     String?
  orders    Order[]
  createdAt DateTime @default(now())
}

// 订单
model Order {
  id             String          @id @default(cuid())
  orderNo        String          @unique // ORD-YYYYMMDD-XXX，自动生成
  customerId     String
  customer       Customer        @relation(fields: [customerId], references: [id])
  productId      String
  product        Product         @relation(fields: [productId], references: [id])
  specParams     String          // JSON，如 {"厚度":"50μm","宽度":"600mm"}
  quantity       Float           // 数量
  unit           String          // "kg" 或 "t"
  formulaId      String?         // 关联配方（记录来源）
  formula        Formula?        @relation(fields: [formulaId], references: [id])
  formulaSnapshot String?        // JSON，配方快照（创建时从配方表复制）
  extraNotes     String?         // 额外要求/备注
  status         OrderStatus     @default(PENDING)
  taskId         String?         // 关联生产任务（排单后更新）
  task           ProductionTask? @relation(fields: [taskId], references: [id])
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

enum OrderStatus {
  PENDING    // 待排单
  PRODUCING  // 生产中
  DONE       // 已完成
}

// 生产任务
model ProductionTask {
  id        String      @id @default(cuid())
  machineId String
  machine   Machine     @relation(fields: [machineId], references: [id])
  position  Int         // 在该机器队列中的排序位置
  status    TaskStatus  @default(WAITING)
  notes     String?
  orders    Order[]     // 一个任务可挂多张订单（合并生产）
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
}

enum TaskStatus {
  WAITING    // 待生产
  PRODUCING  // 生产中
  DONE       // 已完成
}
```

---

## 业务 SOP

### 接单流程

1. 老板收到微信消息
2. 打开系统「新建订单」页面
3. 粘贴微信对话到 AI 输入框
4. AI 自动提取：客户、产品、规格、数量
5. 老板确认/修改字段
6. 选择配方（三种操作见下方）
7. 填写额外要求
8. 确认创建，状态默认「待排单」

### 配方操作三种路径

```
A. 选择已有配方
   → 展示该配方的原材料及比例（可修改）
   → 若有修改：「更新旧配方」或「另存为新配方」
   → 若无修改：直接保存，快照写入订单

B. 新建配方
   → 填写配方名称、规格参数、原材料及比例
   → 保存后自动关联到本订单
   → 只能「另存为新配方」（无旧配方可更新）

C. 不选配方
   → formulaId 和 formulaSnapshot 均为空
   → 后续可编辑订单时补充
```

### 排单流程

1. 进入排单看板
2. 右侧「待排单」列显示所有未分配订单
3. 拖拽订单卡片到对应机器列 → 创建 ProductionTask
4. 同一机器列内拖拽调整顺序 → 更新 position
5. 合并生产：将多张订单拖入同一个 Task（或新建 Task 时选多张订单）
6. 点击卡片更新状态：待生产 → 生产中 → 已完成

### 订单状态说明

```
待排单（PENDING）    刚创建，taskId 为空
生产中（PRODUCING）  已分配机器，taskId 不为空
已完成（DONE）       生产结束，移交仓库
```

订单全程可编辑，包括生产中途修改配方。

---

## 页面说明

### 1. 排单看板（默认首页 `/kanban`）

**布局：** 横向多列，每列对应一台机器 + 最右侧「待排单」列

**功能：**
- 顶部显示今日交期数量、待排单数量
- 每列显示机器名称和规格限制
- 订单卡片显示：订单号、客户名、产品规格、数量、状态
- 合并生产用蓝色虚线框包裹
- 交期临近（当天）卡片高亮橙色
- 拖拽排序和分配
- 顶部「新建订单」快捷按钮

**响应式：** 手机端横向滚动，机器列固定宽度

### 2. 订单列表（`/orders`）

**功能：**
- 列表展示所有订单
- 筛选：按状态、按客户、按产品
- 搜索：按订单号快速定位
- 点击进入详情/编辑
- 顶部「新建订单」按钮

### 3. 新建/编辑订单（`/orders/new` 和 `/orders/[id]`）

**字段顺序：**
1. AI 解析区（粘贴微信对话 → 自动填充）
2. 客户（下拉选择，可搜索）
3. 产品（下拉选择）
4. 规格参数（JSON 结构，动态表单）
5. 数量 + 单位（kg/t）
6. 配方（选择/新建/修改，内嵌配方编辑器）
7. 原材料及比例（配方选定后展示，可修改）
8. 配方操作按钮（更新旧配方 / 另存为新配方）
9. 额外要求（文本域）

### 4. 基础数据管理（`/settings`）

分四个 Tab：
- **机器：** 增删改，配置宽度范围、产品类别、花纹
- **产品：** 产品大类 + 产品名称管理
- **配方：** 配方库，支持查看衍生关系
- **客户：** 客户档案

---

## AI 功能说明

### 微信对话解析

**调用时机：** 用户在新建订单页粘贴文本后点击「AI识别」

**Prompt 设计原则：**
- 系统提示：告知 AI 这是塑料薄膜工厂订单场景，需提取字段
- 输出格式：JSON，字段包括 customer、product、specParams、quantity、unit
- 对于不确定的字段返回 null，由用户手动填写
- 不强行猜测，宁可留空

**示例输出：**
```json
{
  "customer": "华兴包装",
  "product": "PE膜",
  "specParams": { "厚度": "50μm", "宽度": "600mm" },
  "quantity": 500,
  "unit": "kg",
  "extraNotes": null
}
```

---

## 开发顺序

```
Phase 1  环境搭建
         - Next.js 项目初始化
         - Prisma + SQLite 配置
         - shadcn/ui 安装
         - 执行 prisma migrate 建表

Phase 2  基础数据管理页面
         - 机器 CRUD
         - 产品大类 + 产品 CRUD
         - 配方 CRUD
         - 客户 CRUD
         （先把数据录进去，后面订单才能正常使用）

Phase 3  订单功能
         - 订单列表页
         - 新建订单页（含配方选择逻辑）
         - 订单编辑页

Phase 4  排单看板
         - 看板布局（机器列 + 待排单列）
         - 拖拽交互（@dnd-kit）
         - 合并生产逻辑
         - 状态更新

Phase 5  AI 接入
         - Claude API 集成
         - 微信对话解析
         - 自动填充表单
```

---

## 关键实现注意事项

### 订单编号生成

```typescript
// 格式：ORD-YYYYMMDD-XXX
// 每天从001开始，当天第N张单
async function generateOrderNo(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const count = await prisma.order.count({
    where: { orderNo: { startsWith: `ORD-${today}` } }
  })
  return `ORD-${today}-${String(count + 1).padStart(3, '0')}`
}
```

### 配方快照写入

```typescript
// 创建/更新订单时，将配方数据复制为快照
const formula = await prisma.formula.findUnique({ where: { id: formulaId } })
const formulaSnapshot = JSON.stringify({
  name: formula.name,
  specParams: formula.specParams,
  materials: formula.materials,
})
```

### 排单位置管理

```typescript
// 新任务插入到机器队列末尾
const maxPosition = await prisma.productionTask.aggregate({
  where: { machineId },
  _max: { position: true }
})
const position = (maxPosition._max.position ?? 0) + 1
```

### 合并生产判断逻辑（供 AI 提示或 UI 提示使用）

```
同一台机器的两张订单可以合并，当且仅当：
1. 产品大类相同（如都是 PE 膜）
2. 宽度1 + 宽度2 ≤ 机器最大宽度
```

---

## 环境变量

```env
# .env
DATABASE_URL="file:./dev.db"      # 开发用 SQLite
# DATABASE_URL="postgresql://..."  # 生产用 PostgreSQL

ANTHROPIC_API_KEY="sk-ant-..."    # Claude API Key
```

---

## 常用命令

```bash
# 初始化数据库
npx prisma migrate dev --name init

# 重置数据库（开发时）
npx prisma migrate reset

# 查看数据库（可视化）
npx prisma studio

# 启动开发服务器
npm run dev
```
