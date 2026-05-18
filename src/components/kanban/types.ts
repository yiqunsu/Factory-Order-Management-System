export interface KanbanCategory { id: string; name: string }
export interface KanbanProduct  { id: string; name: string; category: KanbanCategory }
export interface KanbanCustomer { id: string; company: string }

export interface KanbanOrder {
  id:         string;
  orderNo:    string;
  customer:   KanbanCustomer;
  product:    KanbanProduct;
  specParams: string;
  quantity:   number;
  unit:       string;
  status:     string;
  taskId:     string | null;
}

export type TaskStatus = "WAITING" | "PRODUCING" | "DONE";

export interface KanbanTask {
  id:        string;
  machineId: string;
  position:  number;
  status:    TaskStatus;
  notes:     string | null;
  orders:    KanbanOrder[];
}

export interface KanbanMachine {
  id:         string;
  name:       string;
  isActive:   boolean;
  minWidth:   number;
  maxWidth:   number;
  notes:      string | null;
  categories: Array<{ category: KanbanCategory }>;
  tasks:      KanbanTask[];
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  WAITING:   "待生产",
  PRODUCING: "生产中",
  DONE:      "已完成",
};

export const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  WAITING:   "bg-slate-100 text-slate-600 border border-slate-200",
  PRODUCING: "bg-blue-50  text-blue-700  border border-blue-200",
  DONE:      "bg-green-50 text-green-700 border border-green-200",
};

export const TASK_STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  WAITING:   "PRODUCING",
  PRODUCING: "DONE",
  DONE:      "WAITING",
};
