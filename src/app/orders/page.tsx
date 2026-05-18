"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/* ─── Types ─── */
type OrderStatus = "PENDING" | "PRODUCING" | "DONE";

interface Category { id: string; name: string }
interface Product  { id: string; name: string; category: Category }
interface Customer { id: string; company: string }
interface Formula  { id: string; name: string }

interface Order {
  id:         string;
  orderNo:    string;
  customer:   Customer;
  product:    Product;
  specParams: string;
  quantity:   number;
  unit:       string;
  formula:    Formula | null;
  status:     OrderStatus;
  createdAt:  string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING:   "待排单",
  PRODUCING: "生产中",
  DONE:      "已完成",
};

const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING:   "bg-amber-50 text-amber-700 border border-amber-200",
  PRODUCING: "bg-blue-50 text-blue-700 border border-blue-200",
  DONE:      "bg-green-50 text-green-700 border border-green-200",
};

const STATUS_CYCLE: Record<OrderStatus, OrderStatus> = {
  PENDING:   "PRODUCING",
  PRODUCING: "DONE",
  DONE:      "PENDING",
};

const FILTER_TABS: { key: OrderStatus | "ALL"; label: string }[] = [
  { key: "ALL",       label: "全部" },
  { key: "PENDING",   label: "待排单" },
  { key: "PRODUCING", label: "生产中" },
  { key: "DONE",      label: "已完成" },
];

/* ─── Main ─── */
export default function OrdersPage() {
  const router = useRouter();
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [filter,       setFilter]       = useState<OrderStatus | "ALL">("ALL");
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/orders").then((r) => r.json());
    setOrders(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function cycleStatus(order: Order, e: React.MouseEvent) {
    e.stopPropagation();
    const next = STATUS_CYCLE[order.status];
    await fetch(`/api/orders/${order.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: next } : o));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/orders/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    setOrders((prev) => prev.filter((o) => o.id !== deleteTarget.id));
  }

  const displayed = filter === "ALL" ? orders : orders.filter((o) => o.status === filter);

  const counts: Record<OrderStatus | "ALL", number> = {
    ALL:       orders.length,
    PENDING:   orders.filter((o) => o.status === "PENDING").length,
    PRODUCING: orders.filter((o) => o.status === "PRODUCING").length,
    DONE:      orders.filter((o) => o.status === "DONE").length,
  };

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-8 flex items-center h-14 gap-6">
          <h1 className="text-base font-semibold text-slate-800 shrink-0">订单管理</h1>

          {/* Status filter tabs */}
          <nav className="flex items-center h-14 gap-1 flex-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`relative h-full px-4 text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? "text-blue-600"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
                {counts[tab.key] > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    filter === tab.key ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                  }`}>
                    {counts[tab.key]}
                  </span>
                )}
                {filter === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </nav>

          <button
            onClick={() => router.push("/orders/new")}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-sm shadow-blue-200 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新建订单
          </button>
        </div>
      </header>

      <main className="flex-1 px-8 py-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-400">加载中…</div>
          ) : displayed.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-400 text-sm">
                {filter === "ALL" ? "暂无订单" : `暂无「${STATUS_LABEL[filter as OrderStatus]}」订单`}
              </p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-44" />
                  <col className="w-32" />
                  <col className="w-48" />
                  <col />
                  <col className="w-24" />
                  <col className="w-28" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["订单号", "客户", "产品", "规格参数", "数量", "状态", ""].map((h) => (
                      <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayed.map((order) => {
                    let specObj: Record<string, string> = {};
                    try { specObj = JSON.parse(order.specParams); } catch { /* empty */ }
                    const specEntries = Object.entries(specObj);

                    return (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                      >
                        {/* 订单号 */}
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs">
                            <span className="text-slate-400">ORD-</span>
                            <span className="text-slate-800 font-semibold">{order.orderNo.replace("ORD-", "")}</span>
                          </span>
                        </td>

                        {/* 客户 */}
                        <td className="px-5 py-4">
                          <span className="text-slate-700 font-medium truncate block">{order.customer.company}</span>
                        </td>

                        {/* 产品 */}
                        <td className="px-5 py-4">
                          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide leading-tight truncate">
                            {order.product.category.name}
                          </p>
                          <p className="text-sm font-medium text-slate-800 mt-0.5 truncate">
                            {order.product.name}
                          </p>
                        </td>

                        {/* 规格参数 */}
                        <td className="px-5 py-4">
                          {specEntries.length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {specEntries.map(([k, v]) => (
                                <span key={k} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs whitespace-nowrap">
                                  <span className="text-slate-400">{k}</span>
                                  <span className="mx-0.5 text-slate-300">·</span>
                                  <span className="font-medium">{v}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* 数量 */}
                        <td className="px-5 py-4">
                          <span className="text-slate-700 font-medium">{order.quantity}</span>
                          <span className="text-slate-400 text-xs ml-1">{order.unit}</span>
                        </td>

                        {/* 状态 badge — 点击循环切换 */}
                        <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => cycleStatus(order, e)}
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-75 ${STATUS_STYLE[order.status]}`}
                          >
                            {STATUS_LABEL[order.status]}
                          </button>
                        </td>

                        {/* 操作 */}
                        <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => router.push(`/orders/${order.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-300 text-xs font-medium transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                              </svg>
                              编辑
                            </button>
                            <button
                              onClick={() => setDeleteTarget(order)}
                              className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100">
                <span className="text-xs text-slate-400">显示 {displayed.length} / {orders.length} 个订单</span>
              </div>
            </>
          )}
        </div>
      </main>

      {/* 删除确认 */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-slate-800">确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 py-2">
            确定删除订单「<span className="font-medium text-slate-700">{deleteTarget?.orderNo}</span>」吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-slate-200 text-slate-600">取消</Button>
            <Button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white border-0">删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
