"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDndContext, useDraggable } from "@dnd-kit/core";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KanbanOrder, KanbanTask, TaskStatus } from "./types";
import { TASK_STATUS_LABEL, TASK_STATUS_STYLE, TASK_STATUS_CYCLE } from "./types";

function specBadges(json: string) {
  try { return Object.entries(JSON.parse(json) as Record<string, string>); }
  catch { return []; }
}

/* ── Draggable row for a single order inside a task ── */
function OrderRow({ order, fromTaskId }: { order: KanbanOrder; fromTaskId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   order.id,
    data: { type: "task-order", orderId: order.id, fromTaskId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`px-3 py-2.5 flex gap-2 items-start transition-opacity ${isDragging ? "opacity-40" : ""}`}
    >
      {/* Per-order drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="mt-1 p-0.5 shrink-0 cursor-grab text-slate-300 hover:text-slate-500 transition-colors"
        title="拖出可拆分"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="5"  cy="3.5" r="1.3" />
          <circle cx="11" cy="3.5" r="1.3" />
          <circle cx="5"  cy="8"   r="1.3" />
          <circle cx="11" cy="8"   r="1.3" />
          <circle cx="5"  cy="12.5" r="1.3" />
          <circle cx="11" cy="12.5" r="1.3" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="font-mono text-xs text-slate-500">
            <span className="text-slate-400">ORD-</span>
            <span className="font-semibold text-slate-700">{order.orderNo.replace("ORD-", "")}</span>
          </span>
          <span className="text-xs text-slate-500 font-medium">
            {order.quantity}<span className="text-slate-400 ml-0.5">{order.unit}</span>
          </span>
        </div>
        <p className="text-sm font-medium text-slate-800 truncate">{order.customer.company}</p>
        <p className="text-xs text-slate-400 truncate">{order.product.category.name} · {order.product.name}</p>
        {specBadges(order.specParams).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {specBadges(order.specParams).map(([k, v]) => (
              <span key={k} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-xs">
                {k}:{v}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  task:          KanbanTask;
  pendingOrders: KanbanOrder[];
  onStatusChange: (status: TaskStatus) => void;
  onDelete:       () => void;
  onAddOrder:     (orderId: string) => void;
  overlay?:       boolean;
}

export default function TaskCard({
  task, pendingOrders, onStatusChange, onDelete, onAddOrder, overlay = false,
}: Props) {
  const [deleteOpen,   setDeleteOpen]   = useState(false);
  const [addOrderOpen, setAddOrderOpen] = useState(false);

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id:   task.id,
    data: { type: "task", machineId: task.machineId },
    disabled: overlay,
  });

  /* Detect when a pending-order or task-order is being dragged over this card */
  const { active, over } = useDndContext();
  const isOrderOverMe = !overlay &&
    over?.id === task.id &&
    (active?.data.current?.type === "order" ||
     (active?.data.current?.type === "task-order" && active?.data.current?.fromTaskId !== task.id));

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.4 : 1,
    zIndex:     isDragging ? 50 : undefined,
  };

  const nextStatus = TASK_STATUS_CYCLE[task.status];

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-white rounded-lg border shadow-sm overflow-hidden relative ${
          overlay ? "shadow-xl rotate-1" : "hover:shadow-md transition-shadow"
        } ${isOrderOverMe ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"}`}
      >
        {/* Merge-drop visual overlay */}
        {isOrderOverMe && (
          <div className="absolute inset-0 bg-blue-50/85 flex items-center justify-center z-10 rounded-lg pointer-events-none">
            <span className="text-sm font-semibold text-blue-600 bg-white px-3 py-1.5 rounded-full border border-blue-200 shadow-sm">
              合并到此任务
            </span>
          </div>
        )}

        {/* Card header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/70">
          {/* Task drag handle */}
          <div
            {...attributes}
            {...listeners}
            className={`p-1 rounded text-slate-300 hover:text-slate-500 transition-colors shrink-0 ${overlay ? "cursor-grabbing" : "cursor-grab"}`}
            title="拖拽整个任务"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5h16.5M3.75 12h16.5M3.75 19h16.5" />
            </svg>
          </div>

          {/* Status badge — click to advance */}
          <button
            onClick={() => onStatusChange(nextStatus)}
            className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-75 ${TASK_STATUS_STYLE[task.status]}`}
            title={`点击标记「${TASK_STATUS_LABEL[nextStatus]}」`}
          >
            {TASK_STATUS_LABEL[task.status]}
          </button>

          <span className="flex-1" />

          {/* Add order button */}
          <button
            onClick={() => setAddOrderOpen(true)}
            disabled={pendingOrders.length === 0}
            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 transition-colors"
            title="添加订单（合并生产）"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>

          {/* Delete button */}
          <button
            onClick={() => setDeleteOpen(true)}
            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="删除任务（订单退回待排单）"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Orders list — each row is independently draggable */}
        <div className="divide-y divide-slate-50">
          {task.orders.map((order) => (
            <OrderRow key={order.id} order={order} fromTaskId={task.id} />
          ))}
        </div>

        {/* Merge indicator */}
        {task.orders.length > 1 && (
          <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-100">
            <span className="text-xs text-blue-600 font-medium">合并生产 · {task.orders.length} 张订单</span>
          </div>
        )}
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-slate-800">删除生产任务</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 py-2">
            确认删除该任务？任务内 <span className="font-medium text-slate-700">{task.orders.length}</span> 张订单将退回「待排单」。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="border-slate-200 text-slate-600">取消</Button>
            <Button onClick={() => { setDeleteOpen(false); onDelete(); }} className="bg-red-500 hover:bg-red-600 text-white border-0">确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add order dialog */}
      <Dialog open={addOrderOpen} onOpenChange={(o) => !o && setAddOrderOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-slate-800">添加订单（合并生产）</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2 max-h-72 overflow-y-auto">
            {pendingOrders.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">暂无待排单订单</p>
            ) : (
              pendingOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => { onAddOrder(order.id); setAddOrderOpen(false); }}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-xs text-slate-500">{order.orderNo}</span>
                    <span className="text-xs text-slate-500">{order.quantity}{order.unit}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{order.customer.company}</p>
                  <p className="text-xs text-slate-400">{order.product.category.name} · {order.product.name}</p>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOrderOpen(false)} className="border-slate-200 text-slate-600">取消</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
