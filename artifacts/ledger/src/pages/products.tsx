import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, History } from "lucide-react";
import { useCompany } from "@/lib/company";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Product = {
  id: number; name: string; currentRate: number; costPrice: number | null;
  openingStock: number; minStock: number; unit: string; category: string | null;
  createdAt: string;
};

type ProductRate = { id: number; productId: number; rate: number; effectiveDate: string };

type ProductForm = {
  name: string; currentRate: string; costPrice: string;
  openingStock: string; minStock: string; unit: string; category: string;
};

const UNITS = ["bag", "piece", "ton", "kg", "foot", "meter", "sq. ft.", "cu. ft.", "liter", "bundle", "sheet"];
const COMMON_CATEGORIES = ["Cement", "Bricks", "Steel / TMT Bars", "Sand", "Gravel / Crush", "Tiles", "PVC Pipes", "Paint", "Hardware", "Other"];

async function fetchProducts(): Promise<Product[]> {
  const r = await fetch(`${BASE}/api/products`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchRates(id: number): Promise<ProductRate[]> {
  const r = await fetch(`${BASE}/api/products/${id}/rates`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function saveProduct(form: ProductForm, editId: number | null): Promise<Product> {
  const body = {
    name: form.name,
    currentRate: parseFloat(form.currentRate),
    costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
    openingStock: parseFloat(form.openingStock) || 0,
    minStock: parseFloat(form.minStock) || 0,
    unit: form.unit,
    category: form.category || null,
  };
  const url = editId ? `${BASE}/api/products/${editId}` : `${BASE}/api/products`;
  const r = await fetch(url, {
    method: editId ? "PATCH" : "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
  return r.json();
}

async function deleteProduct(id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/products/${id}`, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error("Failed");
}

const BLANK: ProductForm = { name: "", currentRate: "", costPrice: "", openingStock: "0", minStock: "0", unit: "bag", category: "" };

export default function ProductsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(BLANK);
  const [showHistory, setShowHistory] = useState<number | null>(null);
  const [catInput, setCatInput] = useState("");
  const [showCatSuggestions, setShowCatSuggestions] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { settings } = useCompany();

  const { data: products = [], isLoading } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const { data: rateHistory = [] } = useQuery({
    queryKey: ["product-rates", showHistory],
    queryFn: () => fetchRates(showHistory!),
    enabled: !!showHistory,
  });

  const saveMutation = useMutation({
    mutationFn: () => saveProduct(form, editId),
    onSuccess: () => {
      toast({ title: editId ? "Product updated" : "Product added" });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      setShowForm(false);
    },
    onError: (e: Error) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => { toast({ title: "Product deleted" }); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: () => toast({ title: "Cannot delete — product has existing orders", variant: "destructive" }),
  });

  const openNew = () => {
    setEditId(null);
    setForm(BLANK);
    setCatInput("");
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditId(p.id);
    setForm({
      name: p.name, currentRate: String(p.currentRate), costPrice: p.costPrice != null ? String(p.costPrice) : "",
      openingStock: String(p.openingStock), minStock: String(p.minStock), unit: p.unit, category: p.category ?? "",
    });
    setCatInput(p.category ?? "");
    setShowForm(true);
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    deleteMutation.mutate(id);
  };

  const setField = (k: keyof ProductForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Group products by category
  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category ?? "Uncategorised";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const catSuggestions = COMMON_CATEGORIES.filter(c =>
    c.toLowerCase().includes(catInput.toLowerCase()) && c !== catInput
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Materials catalogue — rates, units & stock levels</p>
        </div>
        <Button onClick={openNew}><Plus size={15} className="mr-1.5" /> Add Product</Button>
      </div>

      {Object.keys(grouped).length === 0 && !isLoading && (
        <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground">
          <p className="font-medium mb-1">No products yet</p>
          <p className="text-sm">Add your first material to get started</p>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">{cat}</h2>
          <div className="bg-card border rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Unit</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sale Rate</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Cost</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Margin</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Min Stock</th>
                  <th className="px-4 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
                {items.map(p => {
                  const margin = p.costPrice != null ? p.currentRate - p.costPrice : null;
                  return (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-semibold">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">{p.unit}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {settings.currency} {formatAmount(p.currentRate)}
                        <span className="text-xs text-muted-foreground font-normal"> / {p.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                        {p.costPrice != null ? `${settings.currency} ${formatAmount(p.costPrice)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {margin != null ? (
                          <span className={margin >= 0 ? "text-emerald-500 font-medium" : "text-red-500"}>
                            {settings.currency} {formatAmount(margin)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                        {p.minStock > 0 ? `${p.minStock} ${p.unit}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setShowHistory(p.id)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Rate history">
                            <History size={14} />
                          </button>
                          <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">

            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="e.g. DG Khan Cement, Class A Brick" required />
            </div>

            {/* Category with autocomplete */}
            <div className="space-y-1.5 relative">
              <Label>Category</Label>
              <Input
                value={catInput}
                onChange={e => { setCatInput(e.target.value); setField("category", e.target.value); setShowCatSuggestions(true); }}
                onFocus={() => setShowCatSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCatSuggestions(false), 150)}
                placeholder="e.g. Cement, Bricks, Steel…"
              />
              {showCatSuggestions && catSuggestions.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-lg shadow-lg overflow-hidden">
                  {catSuggestions.map(s => (
                    <button
                      key={s} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
                      onMouseDown={() => { setCatInput(s); setField("category", s); setShowCatSuggestions(false); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Groups products in the catalogue. Type anything or pick a suggestion.</p>
            </div>

            {/* Unit */}
            <div className="space-y-1.5">
              <Label>Unit of Measurement *</Label>
              <Select value={form.unit} onValueChange={v => setField("unit", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used in invoices, POS, and stock tracking</p>
            </div>

            {/* Rates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sale Rate / {form.unit} ({settings.currency}) *</Label>
                <Input type="number" value={form.currentRate} onChange={e => setField("currentRate", e.target.value)} placeholder="0" required min="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Cost Price / {form.unit} ({settings.currency})</Label>
                <Input type="number" value={form.costPrice} onChange={e => setField("costPrice", e.target.value)} placeholder="optional" min="0" />
              </div>
            </div>

            {/* Stock */}
            {!editId && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Opening Stock ({form.unit})</Label>
                  <Input type="number" value={form.openingStock} onChange={e => setField("openingStock", e.target.value)} placeholder="0" min="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Min Stock ({form.unit})</Label>
                  <Input type="number" value={form.minStock} onChange={e => setField("minStock", e.target.value)} placeholder="0" min="0" />
                </div>
              </div>
            )}
            {editId && (
              <div className="space-y-1.5">
                <Label>Min Stock ({form.unit})</Label>
                <Input type="number" value={form.minStock} onChange={e => setField("minStock", e.target.value)} placeholder="0" min="0" />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
                {editId ? "Update" : "Add"} Product
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rate History Dialog */}
      <Dialog open={!!showHistory} onOpenChange={() => setShowHistory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate History — {products.find(p => p.id === showHistory)?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {rateHistory.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No history</p>}
            {rateHistory.map(r => (
              <div key={r.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{formatDate(r.effectiveDate)}</span>
                <span className="text-sm font-semibold">{settings.currency} {formatAmount(r.rate)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
