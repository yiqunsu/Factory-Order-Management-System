"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button }   from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import ImageUploadParser from "@/components/orders/ImageUploadParser";
import type { ParsedOrder } from "@/lib/ai";

/* ─── Types ─── */
interface Category { id: string; name: string }
interface Product  { id: string; name: string; categoryId: string; category: Category }
interface Customer { id: string; company: string; contact: string }
interface Formula  {
  id: string; name: string; productId: string;
  specParams: string; materials: string; notes: string | null;
}

interface SpecParam { key: string; value: string; [k: string]: string }
type FormulaMode = "none" | "existing" | "new";

interface FormState {
  customerId:  string;
  productId:   string;
  specParams:  SpecParam[];
  quantity:    string;
  unit:        "kg" | "t";
  extraNotes:  string;
  formulaMode: FormulaMode;
  formulaId:        string;
  formulaMaterials: string;
  newFormulaName:      string;
  newFormulaMaterials: string;
}

const emptyForm: FormState = {
  customerId: "", productId: "",
  specParams: [{ key: "", value: "" }],
  quantity: "", unit: "kg", extraNotes: "",
  formulaMode: "none",
  formulaId: "", formulaMaterials: "",
  newFormulaName: "", newFormulaMaterials: "",
};

/* ─── Helpers ─── */
function specParamsToObj(rows: SpecParam[]): Record<string, string> {
  const obj: Record<string, string> = {};
  rows.forEach(({ key, value }) => { if (key.trim()) obj[key.trim()] = value.trim(); });
  return obj;
}

function parseSpecParams(json: string): SpecParam[] {
  try {
    const obj = JSON.parse(json);
    const entries = Object.entries(obj);
    return entries.length ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ key: "", value: "" }];
  } catch { return [{ key: "", value: "" }]; }
}

/* Build a readable label for formula option: name · spec hints · notes */
function formulaLabel(f: Formula): string {
  const parts: string[] = [f.name];
  try {
    const spec = JSON.parse(f.specParams) as Record<string, string>;
    const hints = Object.entries(spec).slice(0, 2).map(([k, v]) => `${k}:${v}`).join(" ");
    if (hints) parts.push(hints);
  } catch { /* empty */ }
  if (f.notes?.trim()) parts.push(`备注:${f.notes.trim()}`);
  return parts.join("  ·  ");
}

/* ─── SpecParamRows ─── */
function SpecParamRows({ rows, onChange }: { rows: SpecParam[]; onChange: (r: SpecParam[]) => void }) {
  function update(i: number, field: "key" | "value", val: string) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)); }
  function add() { onChange([...rows, { key: "", value: "" }]); }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={row.key}   onChange={(e) => update(i, "key",   e.target.value)} placeholder="参数名（如：厚度）" className="w-36 shrink-0 border-slate-200 h-8 text-sm" />
          <Input value={row.value} onChange={(e) => update(i, "value", e.target.value)} placeholder="数值（如：50μm）"   className="flex-1 border-slate-200 h-8 text-sm" />
          <button type="button" onClick={() => remove(i)} disabled={rows.length === 1} className="p-1.5 rounded text-slate-300 hover:text-red-400 disabled:opacity-30 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        添加规格参数
      </button>
    </div>
  );
}

/* ─── Section wrapper ─── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Main Component
═══════════════════════════════════════ */
export default function OrderForm({ orderId }: { orderId?: string }) {
  const router  = useRouter();
  const isEdit  = Boolean(orderId);

  /* Reference data */
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [formulas,   setFormulas]   = useState<Formula[]>([]);

  /* Page state */
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  /* Main form */
  const [form, setForm] = useState<FormState>(emptyForm);

  /* Formula change tracking */
  const [origFormulaSpecParams, setOrigFormulaSpecParams] = useState("");
  const [origFormulaMaterials,  setOrigFormulaMaterials]  = useState("");

  /* ── Dialog: new customer ── */
  const [newCustomerOpen,    setNewCustomerOpen]    = useState(false);
  const [newCustomerCompany, setNewCustomerCompany] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [newCustomerSaving,  setNewCustomerSaving]  = useState(false);
  const [newCustomerError,   setNewCustomerError]   = useState("");

  /* ── Dialog: new product ── */
  const [newProductOpen,       setNewProductOpen]       = useState(false);
  const [newProductName,       setNewProductName]       = useState("");
  const [newProductCategoryId, setNewProductCategoryId] = useState("");
  const [newProductSaving,     setNewProductSaving]     = useState(false);
  const [newProductError,      setNewProductError]      = useState("");

  /* ── Dialog: save-as-new formula ── */
  const [saveFormulaOpen,   setSaveFormulaOpen]   = useState(false);
  const [saveFormulaName,   setSaveFormulaName]   = useState("");
  const [saveFormulaSaving, setSaveFormulaSaving] = useState(false);
  const [saveFormulaError,  setSaveFormulaError]  = useState("");

  /* ─── Setters ─── */
  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  /* ─── Load ─── */
  async function load() {
    setLoading(true);
    const [c, cat, p, f] = await Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/product-categories").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/formulas").then((r) => r.json()),
    ]);
    setCustomers(c);
    setCategories(cat);
    setProducts(p);
    setFormulas(f);

    if (orderId) {
      const order = await fetch(`/api/orders/${orderId}`).then((r) => r.json());
      const fId = order.formulaId ?? "";
      const matchedFormula: Formula | undefined = f.find((x: Formula) => x.id === fId);
      setForm({
        customerId:  order.customerId,
        productId:   order.productId,
        specParams:  parseSpecParams(order.specParams),
        quantity:    String(order.quantity),
        unit:        order.unit,
        extraNotes:  order.extraNotes ?? "",
        formulaMode: fId ? "existing" : "none",
        formulaId:   fId,
        formulaMaterials:    matchedFormula?.materials ?? "",
        newFormulaName:      "",
        newFormulaMaterials: "",
      });
      if (matchedFormula) {
        setOrigFormulaSpecParams(matchedFormula.specParams);
        setOrigFormulaMaterials(matchedFormula.materials);
      }
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  /* ─── Formula select ─── */
  function handleFormulaSelect(fId: string) {
    const f = formulas.find((x) => x.id === fId);
    if (!f) { set("formulaId", ""); return; }
    setForm((prev) => ({
      ...prev,
      formulaId:        fId,
      specParams:       parseSpecParams(f.specParams),
      formulaMaterials: f.materials,
    }));
    setOrigFormulaSpecParams(f.specParams);
    setOrigFormulaMaterials(f.materials);
  }

  const formulaModified = form.formulaMode === "existing" && form.formulaId && (
    JSON.stringify(specParamsToObj(form.specParams)) !== origFormulaSpecParams ||
    form.formulaMaterials !== origFormulaMaterials
  );

  /* ─── Update existing formula ─── */
  async function handleUpdateFormula() {
    if (!form.formulaId) return;
    const res = await fetch(`/api/formulas/${form.formulaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:       formulas.find((x) => x.id === form.formulaId)?.name ?? "",
        productId:  form.productId,
        specParams: specParamsToObj(form.specParams),
        materials:  form.formulaMaterials,
      }),
    });
    if (!res.ok) { setError("配方更新失败"); return; }
    const updated: Formula = await res.json();
    setOrigFormulaSpecParams(updated.specParams);
    setOrigFormulaMaterials(updated.materials);
    setFormulas((prev) => prev.map((x) => x.id === updated.id ? updated : x));
  }

  /* ─── Save as new formula (via dialog) ─── */
  async function handleSaveAsNewFormula() {
    if (!saveFormulaName.trim()) { setSaveFormulaError("请填写配方名称"); return; }
    setSaveFormulaSaving(true); setSaveFormulaError("");
    const res = await fetch("/api/formulas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:       saveFormulaName.trim(),
        productId:  form.productId,
        specParams: specParamsToObj(form.specParams),
        materials:  form.formulaMaterials,
        sourceId:   form.formulaId || null,
      }),
    });
    setSaveFormulaSaving(false);
    if (!res.ok) { setSaveFormulaError("保存失败，请重试"); return; }
    const created: Formula = await res.json();
    setFormulas((prev) => [...prev, created]);
    setForm((f) => ({ ...f, formulaId: created.id }));
    setOrigFormulaSpecParams(created.specParams);
    setOrigFormulaMaterials(created.materials);
    setSaveFormulaOpen(false);
    setSaveFormulaName("");
  }

  /* ─── Create new customer (via dialog) ─── */
  async function handleCreateCustomer() {
    if (!newCustomerCompany.trim()) { setNewCustomerError("请填写公司名称"); return; }
    if (!newCustomerContact.trim()) { setNewCustomerError("请填写联系人姓名"); return; }
    setNewCustomerSaving(true); setNewCustomerError("");
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: newCustomerCompany.trim(), contact: newCustomerContact.trim() }),
    });
    setNewCustomerSaving(false);
    if (!res.ok) { setNewCustomerError((await res.json()).error ?? "创建失败"); return; }
    const created: Customer = await res.json();
    setCustomers((prev) => [...prev, created].sort((a, b) => a.company.localeCompare(b.company)));
    setForm((f) => ({ ...f, customerId: created.id }));
    setNewCustomerOpen(false);
    setNewCustomerCompany("");
    setNewCustomerContact("");
  }

  /* ─── Create new product (via dialog) ─── */
  async function handleCreateProduct() {
    if (!newProductName.trim())       { setNewProductError("请填写产品名称"); return; }
    if (!newProductCategoryId)        { setNewProductError("请选择产品大类"); return; }
    setNewProductSaving(true); setNewProductError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProductName.trim(), categoryId: newProductCategoryId }),
    });
    setNewProductSaving(false);
    if (!res.ok) { setNewProductError((await res.json()).error ?? "创建失败"); return; }
    const created: Product = await res.json();
    setProducts((prev) => [...prev, created].sort((a, b) =>
      a.category.name.localeCompare(b.category.name) || a.name.localeCompare(b.name)
    ));
    setForm((f) => ({ ...f, productId: created.id, formulaId: "", formulaMaterials: "" }));
    setNewProductOpen(false);
    setNewProductName("");
    setNewProductCategoryId("");
  }

  /* ─── Submit order ─── */
  async function handleSave() {
    if (!form.customerId) { setError("请选择客户"); return; }
    if (!form.productId)  { setError("请选择产品"); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { setError("请填写有效的数量"); return; }

    setSaving(true); setError("");
    try {
      let formulaId: string | null = null;

      if (form.formulaMode === "new") {
        if (!form.newFormulaName.trim()) { setError("请填写配方名称"); return; }
        const fRes = await fetch("/api/formulas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:       form.newFormulaName.trim(),
            productId:  form.productId,
            specParams: specParamsToObj(form.specParams),
            materials:  form.newFormulaMaterials,
          }),
        });
        if (!fRes.ok) { setError("配方创建失败"); return; }
        formulaId = (await fRes.json()).id;
      } else if (form.formulaMode === "existing" && form.formulaId) {
        formulaId = form.formulaId;
      }

      const url    = isEdit ? `/api/orders/${orderId}` : "/api/orders";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId:  form.customerId,
          productId:   form.productId,
          specParams:  specParamsToObj(form.specParams),
          quantity:    Number(form.quantity),
          unit:        form.unit,
          formulaId,
          extraNotes:  form.extraNotes,
        }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "保存失败"); return; }
      router.push("/orders");
    } finally {
      setSaving(false);
    }
  }

  /* ─── Handle image parsed result ─── */
  const [parseNotice, setParseNotice] = useState("");

  function handleImageParsed(result: ParsedOrder) {
    const filled: string[] = [];
    const warnings: string[] = [];

    setForm((prev) => {
      const next = { ...prev };

      // Customer
      if (result.customer) {
        const matched = customers.find((c) =>
          c.company.includes(result.customer!) || result.customer!.includes(c.company)
        );
        if (matched) {
          next.customerId = matched.id;
          filled.push("客户");
        } else {
          warnings.push(`识别到客户「${result.customer}」但系统中不存在，建议先新建客户`);
        }
      } else {
        warnings.push("未识别到客户，建议新建客户或手动选择");
      }

      // Product
      if (result.product) {
        const matched = products.find((p) =>
          p.name.includes(result.product!) ||
          result.product!.includes(p.name) ||
          p.category.name.includes(result.product!) ||
          result.product!.includes(p.category.name)
        );
        if (matched) {
          next.productId = matched.id;
          next.formulaId = "";
          next.formulaMaterials = "";
          filled.push("产品");
        } else {
          warnings.push(`识别到产品「${result.product}」但系统中不存在，建议先新建产品`);
        }
      } else {
        warnings.push("未识别到产品，建议新建产品或手动选择");
      }

      // Spec params
      if (result.specParams && Object.keys(result.specParams).length > 0) {
        next.specParams = Object.entries(result.specParams).map(([key, value]) => ({ key, value }));
        filled.push("规格参数");
      }

      // Quantity & unit
      if (result.quantity !== null) {
        next.quantity = String(result.quantity);
        filled.push("数量");
      }
      if (result.unit !== null) next.unit = result.unit;

      // Extra notes
      if (result.extraNotes) next.extraNotes = result.extraNotes;

      return next;
    });

    const parts: string[] = [];
    if (filled.length > 0) parts.push(`已填入：${filled.join("、")}`);
    if (warnings.length > 0) parts.push(...warnings);
    setParseNotice(parts.join("\n"));
  }

  const selectedProduct    = products.find((p) => p.id === form.productId);
  const selectedCategoryId = selectedProduct?.categoryId;
  const filteredFormulas   = formulas.filter((f) => {
    if (f.productId === form.productId) return true;
    if (!selectedCategoryId) return false;
    const fp = products.find((p) => p.id === f.productId);
    return fp?.categoryId === selectedCategoryId;
  });

  if (loading) {
    return <div className="py-16 text-center text-sm text-slate-400">加载中…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-5">

      {/* ── 截图识别 ── */}
      <ImageUploadParser onParsed={handleImageParsed} />

      {parseNotice && (
        <div className="text-sm bg-blue-50 border border-blue-100 rounded-md px-4 py-3 space-y-1">
          {parseNotice.split("\n").map((line, i) => (
            <p key={i} className={line.startsWith("已填入") ? "text-blue-700" : "text-amber-600"}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* ── Section 1: 基本信息 ── */}
      <Section title="基本信息">
        <div className="grid grid-cols-2 gap-5">

          {/* 客户 */}
          <div className="space-y-1.5">
            <Label className="text-slate-700 text-sm font-medium">客户 <span className="text-red-400">*</span></Label>
            <div className="flex gap-2">
              <select
                value={form.customerId}
                onChange={(e) => set("customerId", e.target.value)}
                className="flex-1 min-w-0 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">请选择客户</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
              </select>
              <button
                type="button"
                onClick={() => { setNewCustomerOpen(true); setNewCustomerError(""); }}
                title="新建客户"
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
          </div>

          {/* 产品 + 新建按钮 */}
          <div className="space-y-1.5">
            <Label className="text-slate-700 text-sm font-medium">产品 <span className="text-red-400">*</span></Label>
            <div className="flex gap-2">
              <select
                value={form.productId}
                onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value, formulaId: "", formulaMaterials: "" }))}
                className="flex-1 min-w-0 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">请选择产品</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.category.name} / {p.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => { setNewProductOpen(true); setNewProductCategoryId(categories[0]?.id ?? ""); setNewProductError(""); }}
                title="新建产品"
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
          </div>

          {/* 数量 */}
          <div className="space-y-1.5">
            <Label className="text-slate-700 text-sm font-medium">数量 <span className="text-red-400">*</span></Label>
            <Input
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              placeholder="如：500"
              className="border-slate-200 focus:border-blue-400 focus:ring-blue-400"
            />
          </div>

          {/* 单位 */}
          <div className="space-y-1.5">
            <Label className="text-slate-700 text-sm font-medium">单位 <span className="text-red-400">*</span></Label>
            <div className="flex gap-4 h-9 items-center">
              {(["kg", "t"] as const).map((u) => (
                <label key={u} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="unit" value={u} checked={form.unit === u} onChange={() => set("unit", u)} className="accent-blue-600" />
                  <span className="text-sm text-slate-700">{u}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Section 2: 规格参数 ── */}
      <Section title="规格参数">
        <SpecParamRows rows={form.specParams} onChange={(rows) => set("specParams", rows)} />
      </Section>

      {/* ── Section 3: 配方 ── */}
      <Section title="配方">
        <div className="flex gap-5 mb-5">
          {([
            ["none",     "不选配方"],
            ["existing", "选择已有配方"],
            ["new",      "新建配方"],
          ] as [FormulaMode, string][]).map(([mode, label]) => (
            <label key={mode} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="formulaMode"
                value={mode}
                checked={form.formulaMode === mode}
                onChange={() => setForm((f) => ({ ...f, formulaMode: mode, formulaId: "", formulaMaterials: "" }))}
                className="accent-blue-600"
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>

        {/* Path A: 选择已有配方 */}
        {form.formulaMode === "existing" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">选择配方</Label>
              {filteredFormulas.length === 0 ? (
                <p className="text-sm text-slate-400 py-1">
                  {form.productId ? "该大类下暂无配方，可切换到「新建配方」" : "请先选择产品"}
                </p>
              ) : (
                <select
                  value={form.formulaId}
                  onChange={(e) => handleFormulaSelect(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">请选择配方</option>
                  {filteredFormulas.map((f) => {
                    const fp = products.find((p) => p.id === f.productId);
                    const prefix = fp && fp.id !== form.productId ? `[${fp.name}] ` : "";
                    return (
                      <option key={f.id} value={f.id}>{prefix}{formulaLabel(f)}</option>
                    );
                  })}
                </select>
              )}
            </div>

            {form.formulaId && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-slate-700 text-sm font-medium">原材料及比例</Label>
                  <Textarea
                    value={form.formulaMaterials}
                    onChange={(e) => set("formulaMaterials", e.target.value)}
                    rows={4}
                    placeholder={"例：\nXX树脂 60%\nYY添加剂 30%"}
                    className="border-slate-200 focus:border-blue-400 focus:ring-blue-400 resize-none text-sm"
                  />
                </div>

                {formulaModified && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleUpdateFormula}
                      className="text-sm border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600"
                    >
                      更新此配方
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setSaveFormulaName(""); setSaveFormulaError(""); setSaveFormulaOpen(true); }}
                      className="text-sm border-slate-200 text-slate-700 hover:border-green-300 hover:text-green-600"
                    >
                      另存为新配方
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Path B: 新建配方 */}
        {form.formulaMode === "new" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">配方名称 <span className="text-red-400">*</span></Label>
              <Input
                value={form.newFormulaName}
                onChange={(e) => set("newFormulaName", e.target.value)}
                placeholder="如：PE-50μm-透明-001"
                className="border-slate-200 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">原材料及比例</Label>
              <Textarea
                value={form.newFormulaMaterials}
                onChange={(e) => set("newFormulaMaterials", e.target.value)}
                rows={4}
                placeholder={"例：\nXX树脂 60%\nYY添加剂 30%\nZZ助剂 10%"}
                className="border-slate-200 focus:border-blue-400 focus:ring-blue-400 resize-none text-sm"
              />
            </div>
            <p className="text-xs text-slate-400">保存订单时将自动创建该配方并关联。</p>
          </div>
        )}

        {form.formulaMode === "none" && (
          <p className="text-sm text-slate-400">不关联配方，后续可在编辑订单时补充。</p>
        )}
      </Section>

      {/* ── Section 4: 额外要求 ── */}
      <Section title="额外要求">
        <Textarea
          value={form.extraNotes}
          onChange={(e) => set("extraNotes", e.target.value)}
          placeholder="可选：交期要求、包装规格、特殊注意事项…"
          rows={3}
          className="border-slate-200 focus:border-blue-400 focus:ring-blue-400 resize-none"
        />
      </Section>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-4 py-3">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 pb-8">
        <Button type="button" variant="outline" onClick={() => router.back()} className="border-slate-200 text-slate-600">取消</Button>
        <Button type="button" onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6">
          {saving ? "保存中…" : isEdit ? "保存修改" : "创建订单"}
        </Button>
      </div>

      {/* ── Dialog: 新建客户 ── */}
      <Dialog open={newCustomerOpen} onOpenChange={(o) => !o && setNewCustomerOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-slate-800">新建客户</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">公司名称 <span className="text-red-400">*</span></Label>
              <Input
                value={newCustomerCompany}
                onChange={(e) => setNewCustomerCompany(e.target.value)}
                placeholder="如：华兴包装"
                className="border-slate-200 focus:border-blue-400 focus:ring-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleCreateCustomer()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">联系人姓名 <span className="text-red-400">*</span></Label>
              <Input
                value={newCustomerContact}
                onChange={(e) => setNewCustomerContact(e.target.value)}
                placeholder="如：张三"
                className="border-slate-200 focus:border-blue-400 focus:ring-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleCreateCustomer()}
              />
            </div>
            {newCustomerError && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{newCustomerError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustomerOpen(false)} className="border-slate-200 text-slate-600">取消</Button>
            <Button onClick={handleCreateCustomer} disabled={newCustomerSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {newCustomerSaving ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: 新建产品 ── */}
      <Dialog open={newProductOpen} onOpenChange={(o) => !o && setNewProductOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-slate-800">新建产品</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">所属大类 <span className="text-red-400">*</span></Label>
              <select
                value={newProductCategoryId}
                onChange={(e) => setNewProductCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                <option value="">请选择</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">产品名称 <span className="text-red-400">*</span></Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="如：透明 PE 拉伸膜"
                className="border-slate-200 focus:border-blue-400 focus:ring-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleCreateProduct()}
              />
            </div>
            {newProductError && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{newProductError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProductOpen(false)} className="border-slate-200 text-slate-600">取消</Button>
            <Button onClick={handleCreateProduct} disabled={newProductSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {newProductSaving ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: 另存为新配方 ── */}
      <Dialog open={saveFormulaOpen} onOpenChange={(o) => !o && setSaveFormulaOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-slate-800">另存为新配方</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500">当前修改将保存为一个新配方，原配方保持不变。</p>
            <div className="space-y-1.5">
              <Label className="text-slate-700 text-sm font-medium">新配方名称 <span className="text-red-400">*</span></Label>
              <Input
                value={saveFormulaName}
                onChange={(e) => setSaveFormulaName(e.target.value)}
                placeholder="如：PE-50μm-透明-改"
                className="border-slate-200 focus:border-blue-400 focus:ring-blue-400"
                onKeyDown={(e) => e.key === "Enter" && handleSaveAsNewFormula()}
              />
            </div>
            {saveFormulaError && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">{saveFormulaError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveFormulaOpen(false)} className="border-slate-200 text-slate-600">取消</Button>
            <Button onClick={handleSaveAsNewFormula} disabled={saveFormulaSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saveFormulaSaving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
