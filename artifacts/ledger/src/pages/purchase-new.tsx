import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Plus, Trash2, ShoppingBag, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number) {
  return new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);
}
function today() { return new Date().toISOString().slice(0, 10); }

type Supplier = { id: number; name: string; payableBalance: number };
type Product = { id: number; name: string; costPrice: string | null; currentRate: string; unit: string; category: string | null };
type LookupValue = { id: number; type: string; value: string };

type LineItem = {
  productId: number | "";
  productName: string;
  qty: string;
  rate: string;
  unit: string;
};

function blankLine(): LineItem {
  return { productId: "", productName: "", qty: "", rate: "", unit: "" };
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

const PAYMENT_MODES = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank Transfer", easypaisa: "Easypaisa",
  jazzcash: "JazzCash", cheque: "Cheque", other: "Other",
};

export default function PurchaseNewPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [supplierId, setSupplierId] = useState<number | "">("");
  const [date, setDate] = useState(today());
  const [invoiceNo, setInvoiceNo] = useState("");
  const [lines, setLines] = useState<LineItem[]>([blankLine()]);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [updateCostPrice, setUpdateCostPrice] = useState(true);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});

  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const { data: units = [] } = useQuery({ queryKey: ["lookups", "unit"], queryFn: fetchUnits });

  const lineTotal = (l: LineItem) => {
    const qty = parseFloat(l.qty) || 0;
    const rate = parseFloat(l.rate) || 0;
    return qty * rate;
  };

  const totalAmount = lines.reduce((s, l) => s + lineTotal(l), 0);
  const paid = parseFloat(paidAmount) || 0;
  const balance = Math.max(0, totalAmount - paid);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("Select a supplier");
      const validLines = lines.filter(l => l.productId && parseFloat(l.qty) > 0 && parseFloat(l.rate) > 0);
      if (validLines.length === 0) throw new Error("Add at least one product");

      const r = await fetch(`${BASE}/api/purchases`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          date,
          invoiceNo: invoiceNo || undefined,
          items: validLines.map(l => ({
            productId: l.productId,
            qty: parseFloat(l.qty),
            rate: parseFloat(l.rate),
          })),
          paidAmount: paid,
          paymentMode,
          notes: notes || undefined,
          updateCostPrice,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["supplier", String(supplierId)] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["cashbook-summary"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast({ title: `Purchase #${data.id} recorded`, description: `Rs ${fmt(data.totalAmount)} from ${data.supplierName}` });
      navigate("/purchases");
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function setLine(idx: number, key: keyof LineItem, val: string | number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  function selectProduct(idx: number, product: Product) {
    setLines(prev => prev.map((l, i) => i === idx
      ? { ...l, productId: product.id, productName: product.name, rate: product.costPrice ?? product.currentRate, unit: product.unit }
      : l
    ));
    setProductSearch(prev => ({ ...prev, [idx]: "" }));
  }

  function addLine() {
    setLines(prev => [...prev, blankLine()]);
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  const categorisedProducts = (search: string) => {
    const filtered = products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 20);

    const groups: Record<string, Product[]> = {};
    for (const p of filtered) {
      const key = p.category ?? "Uncategorised";
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/purchases">
          <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag size={18} className="text-primary" /> New Purchase Invoice
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Record stock received from a supplier</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-card border rounded-lg p-5 space-y-5">
        {/* Supplier + Date + Invoice No */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label>Supplier <span className="text-red-400">*</span></Label>
            <Select value={supplierId === "" ? "__none__" : String(supplierId)} onValueChange={v => { if (v !== "__none__") setSupplierId(parseInt(v, 10)); }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    <span>{s.name}</span>
                    {s.payableBalance > 0 && (
                      <span className="ml-2 text-xs text-red-400">owes Rs {fmt(s.payableBalance)}</span>
                    )}
                  </SelectItem>
                ))}
                {suppliers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No suppliers — <Link href="/suppliers"><span className="text-primary cursor-pointer">add one first</span></Link>
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div>
          <Label>Supplier Invoice # (optional)</Label>
          <Input
            value={invoiceNo}
            onChange={e => setInvoiceNo(e.target.value)}
            placeholder="Their invoice number"
            className="mt-1 max-w-xs"
          />
        </div>

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Products Purchased <span className="text-red-400">*</span></Label>
            <button onClick={addLine} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
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
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Rate (Rs)</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Amount</th>
                  <th className="w-8 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const search = productSearch[idx] ?? "";
                  const isSelected = line.productId !== "";
                  const grouped = categorisedProducts(search);
                  const categoryNames = Object.keys(grouped).sort((a, b) =>
                    a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b)
                  );

                  return (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="px-2 py-2">
                        {isSelected ? (
                          <div className="flex items-center gap-2">
                            <Package size={13} className="text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium">{line.productName}</span>
                            <button
                              onClick={() => setLine(idx, "productId", "")}
                              className="text-muted-foreground hover:text-foreground ml-auto"
                            >×</button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Input
                              value={search}
                              onChange={e => setProductSearch(prev => ({ ...prev, [idx]: e.target.value }))}
                              placeholder="Search product…"
                              className="h-8 text-sm"
                            />
                            {search && categoryNames.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-10 bg-popover border rounded-md shadow-lg max-h-52 overflow-y-auto mt-0.5">
                                {categoryNames.map(cat => (
                                  <div key={cat}>
                                    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wide sticky top-0">
                                      {cat}
                                    </div>
                                    {grouped[cat].map(p => (
                                      <button
                                        key={p.id}
                                        onClick={() => selectProduct(idx, p)}
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between"
                                      >
                                        <span>{p.name}</span>
                                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                          {p.unit}{p.costPrice ? ` · Rs ${fmt(parseFloat(p.costPrice))}` : ""}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number" min="0.01" step="0.01"
                          value={line.qty}
                          onChange={e => setLine(idx, "qty", e.target.value)}
                          className="h-8 text-sm text-right"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background h-8"
                          value={line.unit}
                          onChange={e => setLine(idx, "unit", e.target.value)}
                        >
                          <option value="">— unit —</option>
                          {units.map(u => (
                            <option key={u.id} value={u.value}>{u.value}</option>
                          ))}
                          {line.unit && !units.some(u => u.value === line.unit) && (
                            <option value={line.unit}>{line.unit}</option>
                          )}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number" min="0" step="0.01"
                          value={line.rate}
                          onChange={e => setLine(idx, "rate", e.target.value)}
                          className="h-8 text-sm text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-sm">
                        {lineTotal(line) > 0 ? `Rs ${fmt(lineTotal(line))}` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {lines.length > 1 && (
                          <button onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-red-400 p-0.5 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-sm text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-sm">Rs {fmt(totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Payment section */}
        <div className="border-t pt-4 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Amount Paid Now (Rs)</Label>
              <Input
                type="number" min="0" step="0.01" max={totalAmount}
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                placeholder="0.00 (leave blank for full credit)"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave 0 for fully credit purchase</p>
            </div>
            <div>
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
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

          {/* Summary */}
          <div className="bg-muted/20 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Invoice</span>
              <span className="font-medium">Rs {fmt(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>Paid Now</span>
              <span>Rs {fmt(paid)}</span>
            </div>
            {balance > 0 && (
              <div className="flex justify-between text-red-400 font-semibold border-t pt-1 mt-1">
                <span>Remaining (payable to supplier)</span>
                <span>Rs {fmt(balance)}</span>
              </div>
            )}
            {balance === 0 && paid > 0 && (
              <div className="flex justify-between text-emerald-400 font-semibold border-t pt-1 mt-1">
                <span>Fully Paid ✓</span>
                <span>Rs 0.00</span>
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="updateCostPrice"
            checked={updateCostPrice}
            onChange={e => setUpdateCostPrice(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="updateCostPrice" className="text-sm text-muted-foreground cursor-pointer">
            Update product cost price from purchase rate (used for profit calculation)
          </label>
        </div>

        <div>
          <Label>Notes (optional)</Label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about this purchase" className="mt-1" />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Link href="/purchases">
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !supplierId || lines.every(l => !l.productId)}
        >
          {createMut.isPending ? "Saving…" : "Save Purchase Invoice"}
        </Button>
      </div>
    </div>
  );
}
