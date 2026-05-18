export type OrderStatus = "PENDING" | "PRODUCING" | "DONE"
export type TaskStatus = "WAITING" | "PRODUCING" | "DONE"

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "待排单",
  PRODUCING: "生产中",
  DONE: "已完成",
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  WAITING: "待生产",
  PRODUCING: "生产中",
  DONE: "已完成",
}

export interface SpecParams {
  厚度?: string
  宽度?: string
  [key: string]: string | undefined
}

export interface FormulaSnapshot {
  name: string
  specParams: string
  materials: string
}
