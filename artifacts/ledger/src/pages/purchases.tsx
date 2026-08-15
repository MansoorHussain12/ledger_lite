import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ShoppingBag, Plus, Search, Pencil, Eye, Undo2, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { VoidToggle, CorrectionBadge } from "@/components/correction-fields";
import { groupCorrections } from "@/lib/correction-chain";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number) {
  return new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);
}

function today() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
}

type PurchaseRow = {
  id: number; supplierId: number; supplierName: string; date: string;
  invoiceNo: string | null; totalAmount: number; paidAmount: number;
  balance: number; paymentMode: string; notes: string | null; createdAt: string;
  status: "posted" | "reversed" | "reversal"; reversesId: number | null; correctsId: number | null;
};

type PurchaseDetail = PurchaseRow & {
  items: Array<{ id: number; productId: number; productName: string; qty: number; rate: number; amount: number }>;
};

type Supplier = { id: number; name: string; payableBalance: number };
type Product = { id: number; name: string; costPrice: string | null; currentRate: string; unit: string; category: string | null };
type LookupValue = { id: number; type: string; value: string };

type CorrectLineItem = { productId: number | ""; productName: string; qty: string; rate: string; unit: string };

async function fetchPurchases(from: string, to: string, includeReversed: boolean): Promise<PurchaseRow[]> {
  const q = new URLSearchParams({ from, to, ...(includeReversed ? { includeReversed: "true" } : {}) });
  const r = await fetch(`${BASE}/api/purchases?${q}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchPurchaseDetail(id: number): Promise<PurchaseDetail> {
  const r = await fetch(`${BASE}/api/purchases/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchSuppliers(): Promise<Supplier[]> {
  const r = await fetch(`${BASE}/api/suppliers`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchProducts(): Promise<Product[]> {
  const r = await fetch(`${BASE}/api/products`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchUnits(): Promise<LookupValue[]> {
  const r = await fetch(`${BASE}/api/lookups/unit`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

const MODE_COLORS: Record<string, string> = {
  cash: "bg-emerald-500/15 text-emerald-400",
  bank: "bg-blue-500/15 text-blue-400",
  easypaisa: "bg-green-500/15 text-green-400",
  jazzcash: "bg-red-500/15 text-red-400",
  cheque: "bg-purple-500/15 text-purple-400",
  other: "bg-slate-500/15 text-slate-400",
};

const PAYMENT_MODES = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank Transfer", easypaisa: "Easypaisa",
  jazzcash: "JazzCash", cheque: "Cheque", other: "Other",
};

function blankCorrectLine(): CorrectLineItem { return { productId: "", productName: "", qty: "", rate: "", unit: "" }; }

function PurchaseDetailDialog({ id, open, onClose }: { id: number; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["purchase-detail", id],
    queryFn: () => fetchPurchaseDetail(id),
    enabled: open && id > 0,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Purchase Invoice #{data?.invoiceNo ?? id}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : data ? (
          <div className="space-y-4">
            {data.status === "reversed" && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                This invoice was voided — not a live transaction.
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{data.supplierName}</span></div>
              <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{data.date}</span></div>
              <div><span className="text-muted-foreground">Mode:</span> <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", MODE_COLORS[data.paymentMode])}>{data.paymentMode}</span></div>
            </div>
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Rate</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="px-3 py-2">{item.productName}</td>
                    <td className="px-3 py-2 text-right">{item.qty}</td>
                    <td className="px-3 py-2 text-right">Rs {fmt(item.rate)}</td>
                    <td className="px-3 py-2 text-right font-medium">Rs {fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20 font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right">Rs {fmt(data.totalAmount)}</td>
                </tr>
                <tr className="font-medium text-emerald-400">
                  <td colSpan={3} className="px-3 py-2 text-right">Paid</td>
                  <td className="px-3 py-2 text-right">Rs {fmt(data.paidAmount)}</td>
                </tr>
                {data.balance > 0 && (
                  <tr className="font-semibold text-red-400">
                    <td colSpan={3} className="px-3 py-2 text-right">Balance Due</td>
                    <td className="px-3 py-2 text-right">Rs {fmt(data.balance)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
            {data.notes && <p className="text-sm text-muted-foreground">Notes: {data.notes}</p>}
            {data.status === "posted" && (
              <div className="flex justify-end">
                <Link href={`/purchase-returns/new?purchaseInvoiceId=${data.id}`}>
                  <Button variant="outline" size="sm">
                    <Undo2 size={14} className="mr-1.5" /> Return
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [viewId, setViewId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Always pull the full chain (including reversed/reversal rows) — grouping needs them
  // client-side to reconstruct each transaction's history, even though only one row per
  // logical transaction ends up rendered.
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases", fromDate, toDate],
    queryFn: () => fetchPurchases(fromDate, toDate, true),
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const { data: units = [] } = useQuery({ queryKey: ["lookups", "unit"], queryFn: fetchUnits });

  // ── Correction (reverse + optionally replace) ──
  const [correcting, setCorrecting] = useState<PurchaseRow | null>(null);
  const [correctSupplierId, setCorrectSupplierId] = useState<number | "">("");
  const [correctDate, setCorrectDate] = useState("");
  const [correctInvoiceNo, setCorrectInvoiceNo] = useState("");
  const [correctLines, setCorrectLines] = useState<CorrectLineItem[]>([blankCorrectLine()]);
  const [correctPaidAmount, setCorrectPaidAmount] = useState("");
  const [correctPaymentMode, setCorrectPaymentMode] = useState<string>("cash");
  const [correctNotes, setCorrectNotes] = useState("");
  const [correctUpdateCostPrice, setCorrectUpdateCostPrice] = useState(true);
  const [correctVoid, setCorrectVoid] = useState(false);
  const [correctReason, setCorrectReason] = useState("");

  const openCorrect = async (row: PurchaseRow) => {
    const detail = await fetchPurchaseDetail(row.id);
    setCorrecting(row);
    setCorrectSupplierId(detail.supplierId);
    setCorrectDate(detail.date);
    setCorrectInvoiceNo(detail.invoiceNo ?? "");
    setCorrectLines(detail.items.map(i => ({
      productId: i.productId, productName: i.productName, qty: String(i.qty), rate: String(i.rate),
      unit: products.find(p => p.id === i.productId)?.unit ?? "",
    })));
    setCorrectPaidAmount(String(detail.paidAmount));
    setCorrectPaymentMode(detail.paymentMode);
    setCorrectNotes(detail.notes ?? "");
    setCorrectUpdateCostPrice(true);
    setCorrectVoid(false);
    setCorrectReason("");
  };

  const correctLineTotal = (l: CorrectLineItem) => (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0);
  const correctTotal = correctLines.reduce((s, l) => s + correctLineTotal(l), 0);

  const correctMut = useMutation({
    mutationFn: async () => {
      if (!correcting) throw new Error("Nothing to correct");
      const body = correctVoid
        ? { void: true, reason: correctReason || undefined }
        : {
            reason: correctReason || undefined,
            supplierId: correctSupplierId,
            date: correctDate,
            invoiceNo: correctInvoiceNo || undefined,
            items: correctLines
              .filter(l => l.productId && parseFloat(l.qty) > 0 && parseFloat(l.rate) > 0)
              .map(l => ({ productId: l.productId, qty: parseFloat(l.qty), rate: parseFloat(l.rate) })),
            paidAmount: parseFloat(correctPaidAmount) || 0,
            paymentMode: correctPaymentMode,
            notes: correctNotes || undefined,
            updateCostPrice: correctUpdateCostPrice,
          };
      const r = await fetch(`${BASE}/api/purchases/${correcting.id}/correct`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["cashbook-summary"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: correctVoid ? "Purchase voided" : "Purchase corrected" });
      setCorrecting(null);
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // One row per logical transaction: `head` is its current effective state.
  const groups = groupCorrections(purchases).filter(g =>
    g.head.supplierName.toLowerCase().includes(search.toLowerCase()) ||
    (g.head.invoiceNo ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const toggleExpanded = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const liveGroups = groups.filter(g => !g.isVoid);
  const totalBilled = liveGroups.reduce((s, g) => s + g.head.totalAmount, 0);
  const totalPaid = liveGroups.reduce((s, g) => s + g.head.paidAmount, 0);
  const totalBalance = liveGroups.reduce((s, g) => s + g.head.balance, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag size={20} className="text-primary" /> Purchases
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Purchase invoices from suppliers</p>
        </div>
        <Link href="/purchases/new">
          <Button size="sm">
            <Plus size={14} className="mr-1" /> New Purchase
          </Button>
        </Link>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-muted-foreground text-xs mb-0.5">Total Billed</div>
          <div className="font-bold text-orange-400">Rs {fmt(totalBilled)}</div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-muted-foreground text-xs mb-0.5">Total Paid</div>
          <div className="font-bold text-emerald-400">Rs {fmt(totalPaid)}</div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-muted-foreground text-xs mb-0.5">Balance Due</div>
          <div className={cn("font-bold", totalBalance > 0 ? "text-red-400" : "text-foreground")}>Rs {fmt(totalBalance)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search supplier or invoice…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36 h-9 text-sm" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Mode</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                <th className="text-right px-4 py-3 font-medium text-emerald-400">Paid</th>
                <th className="text-right px-4 py-3 font-medium text-red-400">Balance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Loading…</td></tr>
              )}
              {!isLoading && groups.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <ShoppingBag size={32} className="mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">No purchases in this period</p>
                    <Link href="/purchases/new">
                      <Button variant="outline" size="sm" className="mt-3">Record first purchase</Button>
                    </Link>
                  </td>
                </tr>
              )}
              {groups.map((g) => {
                const p = g.head;
                const expanded = expandedIds.has(p.id);
                return (
                <Fragment key={p.id}>
                <tr className={cn("border-b border-border/50 hover:bg-muted/20 transition-colors", g.isVoid && "opacity-50")}>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.date}</td>
                  <td className="px-4 py-3">
                    <Link href={`/suppliers/${p.supplierId}`}>
                      <span className={cn("font-medium hover:text-primary cursor-pointer", g.isVoid && "line-through decoration-1")}>{p.supplierName}</span>
                    </Link>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <CorrectionBadge isVoid={g.isVoid} historyCount={g.history.length} expanded={expanded} onToggle={() => toggleExpanded(p.id)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.invoiceNo ?? <span className="text-xs opacity-40">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", MODE_COLORS[p.paymentMode] ?? "")}>
                      {p.paymentMode}
                    </span>
                  </td>
                  <td className={cn("px-4 py-3 text-right font-medium", g.isVoid && "line-through decoration-1")}>Rs {fmt(p.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">Rs {fmt(p.paidAmount)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", p.balance > 0 ? "text-red-400" : "text-emerald-400")}>
                    Rs {fmt(p.balance)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setViewId(p.id)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="View details">
                        <Eye size={13} />
                      </button>
                      {!g.isVoid && (
                        <button onClick={() => openCorrect(p)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Correct this invoice">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-muted/10 border-b border-border/50">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="text-xs space-y-2 max-w-2xl">
                        {g.isVoid && (
                          <div className="text-muted-foreground">
                            Voided{g.voidReversal?.notes ? ` — ${g.voidReversal.notes}` : ""}
                          </div>
                        )}
                        {g.history.length === 0 && !g.isVoid && (
                          <div className="text-muted-foreground">No correction history.</div>
                        )}
                        {g.history.map((step, i) => (
                          <div key={step.previous.id} className="flex items-start gap-2">
                            <span className="text-muted-foreground font-mono">{i + 1}.</span>
                            <div>
                              <div>
                                <span className="line-through text-muted-foreground">Rs {fmt(step.previous.totalAmount)}</span>
                                {" "}<span className="text-muted-foreground">(#{step.previous.id}{step.previous.invoiceNo ? `, ${step.previous.invoiceNo}` : ""})</span>
                              </div>
                              {step.reversal?.notes && <div className="text-muted-foreground mt-0.5">Reason: {step.reversal.notes}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewId != null && (
        <PurchaseDetailDialog id={viewId} open={viewId != null} onClose={() => setViewId(null)} />
      )}

      {/* Correct Purchase Dialog — reverses the original behind the scenes, never edits it */}
      <Dialog open={!!correcting} onOpenChange={(o) => { if (!o) setCorrecting(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 size={16} /> Correct Purchase Invoice #{correcting?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <VoidToggle isVoid={correctVoid} onVoidChange={setCorrectVoid} reason={correctReason} onReasonChange={setCorrectReason} />
            {!correctVoid && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label>Supplier *</Label>
                    <Select value={correctSupplierId === "" ? "__none__" : String(correctSupplierId)} onValueChange={v => { if (v !== "__none__") setCorrectSupplierId(parseInt(v, 10)); }}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={correctDate} onChange={e => setCorrectDate(e.target.value)} className="mt-1" />
                  </div>
                </div>

                <div>
                  <Label>Supplier Invoice # (optional)</Label>
                  <Input value={correctInvoiceNo} onChange={e => setCorrectInvoiceNo(e.target.value)} placeholder="Their invoice number" className="mt-1 max-w-xs" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Products</Label>
                    <button type="button" onClick={() => setCorrectLines(prev => [...prev, blankCorrectLine()])} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                      <Plus size={12} /> Add row
                    </button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground w-20">Qty</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Unit</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Rate</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Amount</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {correctLines.map((line, idx) => (
                          <tr key={idx} className="border-b border-border/50">
                            <td className="px-2 py-2">
                              <select
                                className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background h-8"
                                value={line.productId || ""}
                                onChange={e => {
                                  const productId = parseInt(e.target.value);
                                  const product = products.find(p => p.id === productId);
                                  setCorrectLines(prev => prev.map((l, i) => i === idx
                                    ? { ...l, productId, productName: product?.name ?? "", rate: product?.costPrice ?? product?.currentRate ?? l.rate, unit: product?.unit ?? "" }
                                    : l));
                                }}
                              >
                                <option value="">Select product...</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <Input type="number" min="0.01" step="0.01" value={line.qty}
                                onChange={e => setCorrectLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: e.target.value } : l))}
                                className="h-8 text-sm text-right" />
                            </td>
                            <td className="px-2 py-2">
                              <select
                                className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background h-8"
                                value={line.unit}
                                onChange={e => setCorrectLines(prev => prev.map((l, i) => i === idx ? { ...l, unit: e.target.value } : l))}
                              >
                                <option value="">— unit —</option>
                                {units.map(u => <option key={u.id} value={u.value}>{u.value}</option>)}
                                {line.unit && !units.some(u => u.value === line.unit) && <option value={line.unit}>{line.unit}</option>}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <Input type="number" min="0" step="0.01" value={line.rate}
                                onChange={e => setCorrectLines(prev => prev.map((l, i) => i === idx ? { ...l, rate: e.target.value } : l))}
                                className="h-8 text-sm text-right" />
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-sm">
                              {correctLineTotal(line) > 0 ? `Rs ${fmt(correctLineTotal(line))}` : "—"}
                            </td>
                            <td className="px-2 py-2">
                              {correctLines.length > 1 && (
                                <button type="button" onClick={() => setCorrectLines(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-red-400 p-0.5">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20 font-semibold">
                          <td colSpan={4} className="px-3 py-2 text-right text-sm text-muted-foreground">Total</td>
                          <td className="px-3 py-2 text-right text-sm">Rs {fmt(correctTotal)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Amount Paid (Rs)</Label>
                    <Input type="number" min="0" step="0.01" value={correctPaidAmount} onChange={e => setCorrectPaidAmount(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>Payment Mode</Label>
                    <Select value={correctPaymentMode} onValueChange={setCorrectPaymentMode}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_MODES.map(m => (
                          <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox checked={correctUpdateCostPrice} onCheckedChange={v => setCorrectUpdateCostPrice(v === true)} />
                  <label className="text-sm text-muted-foreground cursor-pointer" onClick={() => setCorrectUpdateCostPrice(v => !v)}>
                    Update product cost price from corrected rate
                  </label>
                </div>

                <div>
                  <Label>Notes (optional)</Label>
                  <Input value={correctNotes} onChange={e => setCorrectNotes(e.target.value)} placeholder="Any notes about this purchase" className="mt-1" />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCorrecting(null)} className="flex-1">Cancel</Button>
            <Button
              onClick={() => correctMut.mutate()}
              disabled={correctMut.isPending || (!correctVoid && (!correctSupplierId || correctLines.every(l => !l.productId)))}
              className="flex-1"
            >
              {correctMut.isPending ? "Saving…" : correctVoid ? "Void Invoice" : "Save Correction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
