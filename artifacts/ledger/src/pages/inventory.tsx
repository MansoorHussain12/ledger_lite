import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, AlertTriangle, XCircle, CheckCircle2, Settings2,
  ArrowDownCircle, ArrowUpCircle, RefreshCw, Plus, Minus,
  ArrowLeft, TrendingDown, TrendingUp, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);
const fmtQty = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

type InventoryRow = {
  id: number; name: string; category: string | null; unit: string | null;
  currentRate: number; costPrice: number | null;
  openingStock: number; minStock: number;
  purchased: number; sold: number; adjusted: number;
  currentStock: number; status: "ok" | "low" | "out";
};

type LookupValue = { id: number; type: string; value: string };

type MovementEntry = {
  id: string; type: "opening" | "in" | "out" | "adj_in" | "adj_out";
  date: string; qty: number; ref: string; notes: string | null;
  balance: number; adjustmentId?: number;
};

type MovementsData = { product: InventoryRow; movements: MovementEntry[] };

async function fetchInventory(): Promise<InventoryRow[]> {
  const r = await fetch(`${BASE}/api/inventory`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchMovements(productId: number): Promise<MovementsData> {
  const r = await fetch(`${BASE}/api/inventory/${productId}/movements`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

const STATUS_CONFIG = {
  ok:  { label: "In Stock",    icon: CheckCircle2,    cls: "text-emerald-400", bg: "bg-emerald-500/10 text-emerald-400" },
  low: { label: "Low Stock",   icon: AlertTriangle,   cls: "text-amber-400",   bg: "bg-amber-500/10 text-amber-400" },
  out: { label: "Out of Stock",icon: XCircle,         cls: "text-red-400",     bg: "bg-red-500/10 text-red-400" },
};

const TYPE_CONFIG: Record<string, { label: string; sign: string; color: string; Icon: React.ComponentType<any> }> = {
  opening: { label: "Opening Stock", sign: "+", color: "text-blue-400",    Icon: Package },
  in:      { label: "Purchase",      sign: "+", color: "text-emerald-400", Icon: ArrowDownCircle },
  out:     { label: "Sale",          sign: "−", color: "text-red-400",     Icon: ArrowUpCircle },
  adj_in:  { label: "Adjustment ↑",  sign: "+", color: "text-purple-400",  Icon: TrendingUp },
  adj_out: { label: "Adjustment ↓",  sign: "−", color: "text-orange-400",  Icon: TrendingDown },
};

const REASONS = [
  "Manual Adjustment",
  "Damaged / Expired",
  "Theft / Loss",
  "Stock Count Correction",
  "Transfer In",
  "Transfer Out",
  "Return to Supplier",
  "Return from Customer",
  "Other",
];

// ── Settings Dialog ──────────────────────────────────────────────────────────

function SettingsDialog({ product, open, onClose }: { product: InventoryRow; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openingStock, setOpeningStock] = useState(String(product.openingStock));
  const [minStock, setMinStock] = useState(String(product.minStock));

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/inventory/${product.id}/settings`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingStock: parseFloat(openingStock) || 0,
          minStock: parseFloat(minStock) || 0,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast({ title: "Settings updated" });
      onClose();
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Stock Settings — {product.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Opening Stock (bags)</Label>
            <Input type="number" min="0" step="0.01" value={openingStock}
              onChange={e => setOpeningStock(e.target.value)} className="mt-1"
              placeholder="0" />
            <p className="text-xs text-muted-foreground mt-1">Stock on hand before this system was set up</p>
          </div>
          <div>
            <Label>Minimum Stock Alert (bags)</Label>
            <Input type="number" min="0" step="0.01" value={minStock}
              onChange={e => setMinStock(e.target.value)} className="mt-1"
              placeholder="0 = no alert" />
            <p className="text-xs text-muted-foreground mt-1">Alert when stock drops to or below this level</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Adjust Dialog ─────────────────────────────────────────────────────────────

function AdjustDialog({ product, open, onClose }: { product: InventoryRow; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dir, setDir] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Manual Adjustment");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today());

  const mut = useMutation({
    mutationFn: async () => {
      const finalQty = (parseFloat(qty) || 0) * (dir === "add" ? 1 : -1);
      if (finalQty === 0) throw new Error("Qty cannot be zero");
      const r = await fetch(`${BASE}/api/inventory/adjustments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, date, qty: finalQty, reason, notes: notes || undefined }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements", product.id] });
      toast({ title: "Stock adjusted", description: `${dir === "add" ? "+" : "-"}${qty} bags for ${product.name}` });
      setQty(""); setNotes("");
      onClose();
    },
    onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Current stock badge */}
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-sm", STATUS_CONFIG[product.status].bg)}>
            <span>Current stock:</span>
            <span className="font-bold">{fmtQty(product.currentStock)} bags</span>
          </div>

          {/* Add / Remove toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDir("add")}
              className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                dir === "add" ? "border-emerald-400 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground hover:text-foreground")}
            >
              <Plus size={14} /> Add Stock
            </button>
            <button
              onClick={() => setDir("remove")}
              className={cn("flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                dir === "remove" ? "border-red-400 bg-red-500/10 text-red-400" : "border-border text-muted-foreground hover:text-foreground")}
            >
              <Minus size={14} /> Remove Stock
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity (bags)</Label>
              <Input type="number" min="0.01" step="0.01" value={qty}
                onChange={e => setQty(e.target.value)} placeholder="0"
                className="mt-1" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Additional details" className="mt-1" />
          </div>

          {/* Preview */}
          {qty && parseFloat(qty) > 0 && (
            <div className="bg-muted/20 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>Current</span><span>{fmtQty(product.currentStock)}</span>
              </div>
              <div className={cn("flex justify-between font-medium", dir === "add" ? "text-emerald-400" : "text-red-400")}>
                <span>{dir === "add" ? "+" : "−"}</span><span>{fmtQty(parseFloat(qty) || 0)}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>New Stock</span>
                <span>{fmtQty(dir === "add"
                  ? product.currentStock + (parseFloat(qty) || 0)
                  : Math.max(0, product.currentStock - (parseFloat(qty) || 0))
                )}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !qty || parseFloat(qty) <= 0}
            className={dir === "add" ? "" : "bg-red-500 hover:bg-red-600"}
          >
            {mut.isPending ? "Saving…" : dir === "add" ? "Add Stock" : "Remove Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Movements Dialog ──────────────────────────────────────────────────────────

function MovementsDialog({ productId, open, onClose }: { productId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["inventory-movements", productId],
    queryFn: () => fetchMovements(productId),
    enabled: open,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/inventory/adjustments/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements", productId] });
      toast({ title: "Adjustment deleted" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={16} />
            Stock Movements — {data?.product.name ?? "…"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : data ? (
          <>
            {/* Product header stats */}
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="bg-muted/20 rounded p-2 text-center">
                <div className="text-muted-foreground text-xs">Opening</div>
                <div className="font-bold">{fmtQty(data.product.openingStock)}</div>
              </div>
              <div className="bg-emerald-500/10 rounded p-2 text-center">
                <div className="text-muted-foreground text-xs">Purchased</div>
                <div className="font-bold text-emerald-400">+{fmtQty(data.product.purchased)}</div>
              </div>
              <div className="bg-red-500/10 rounded p-2 text-center">
                <div className="text-muted-foreground text-xs">Sold</div>
                <div className="font-bold text-red-400">−{fmtQty(data.product.sold)}</div>
              </div>
              <div className={cn("rounded p-2 text-center", STATUS_CONFIG[data.product.status].bg)}>
                <div className="text-muted-foreground text-xs">Current</div>
                <div className="font-bold">{fmtQty(data.product.currentStock)}</div>
              </div>
            </div>

            {/* Movement table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reference</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qty</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Balance</th>
                    <th className="w-8 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No movements yet</td></tr>
                  )}
                  {[...data.movements].reverse().map(m => {
                    const cfg = TYPE_CONFIG[m.type];
                    const Icon = cfg.Icon;
                    return (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">{m.date || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={cn("flex items-center gap-1 text-xs font-medium", cfg.color)}>
                            <Icon size={12} />{cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <div>{m.ref}</div>
                          {m.notes && <div className="text-xs text-muted-foreground">{m.notes}</div>}
                        </td>
                        <td className={cn("px-3 py-2 text-right font-medium", cfg.color)}>
                          {cfg.sign}{fmtQty(m.qty)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{fmtQty(m.balance)}</td>
                        <td className="px-2 py-2">
                          {m.adjustmentId != null && (
                            <button
                              onClick={() => deleteMut.mutate(m.adjustmentId!)}
                              className="text-muted-foreground hover:text-red-400 transition-colors p-0.5"
                              title="Delete this adjustment"
                            >×</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

async function fetchCategories(): Promise<LookupValue[]> {
  const r = await fetch(`${BASE}/api/lookups/category`, { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}

// ── Main Inventory Page ───────────────────────────────────────────────────────

export default function InventoryPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ok" | "low" | "out">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [settingsProd, setSettingsProd] = useState<InventoryRow | null>(null);
  const [adjustProd, setAdjustProd] = useState<InventoryRow | null>(null);
  const [movementsProdId, setMovementsProdId] = useState<number | null>(null);

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: fetchInventory,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["lookups-category"],
    queryFn: fetchCategories,
  });

  const filtered = inventory.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || p.status === filter;
    const matchCategory = categoryFilter === "all" || p.category === categoryFilter;
    return matchSearch && matchFilter && matchCategory;
  });

  const counts = {
    ok:  inventory.filter(p => p.status === "ok").length,
    low: inventory.filter(p => p.status === "low").length,
    out: inventory.filter(p => p.status === "out").length,
  };
  const totalValue = inventory.reduce((s, p) => s + p.currentStock * (p.costPrice ?? p.currentRate), 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Package size={20} className="text-primary" /> Inventory
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Real-time stock levels across all products</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Total SKUs</div>
          <div className="text-2xl font-bold">{inventory.length}</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
          <div className="text-xs text-emerald-400 mb-1 flex items-center gap-1">
            <CheckCircle2 size={11} /> In Stock
          </div>
          <div className="text-2xl font-bold text-emerald-400">{counts.ok}</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="text-xs text-amber-400 mb-1 flex items-center gap-1">
            <AlertTriangle size={11} /> Low Stock
          </div>
          <div className="text-2xl font-bold text-amber-400">{counts.low}</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="text-xs text-red-400 mb-1 flex items-center gap-1">
            <XCircle size={11} /> Out of Stock
          </div>
          <div className="text-2xl font-bold text-red-400">{counts.out}</div>
        </div>
      </div>

      {/* Inventory value */}
      {totalValue > 0 && (
        <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Estimated Inventory Value (at cost)</span>
          <span className="font-bold text-lg">Rs {fmt(totalValue)}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Package size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {categories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.value}>{c.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-1.5">
          {(["all", "ok", "low", "out"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border transition-colors font-medium capitalize",
                filter === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "All" : f === "ok" ? "In Stock" : f === "low" ? "Low" : "Out"}
              {f !== "all" && (
                <span className="ml-1.5 opacity-70">
                  {f === "ok" ? counts.ok : f === "low" ? counts.low : counts.out}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Opening</th>
                <th className="text-right px-4 py-3 font-medium text-emerald-400 hidden md:table-cell">+Purchased</th>
                <th className="text-right px-4 py-3 font-medium text-red-400 hidden md:table-cell">−Sold</th>
                <th className="text-right px-4 py-3 font-medium text-purple-400 hidden lg:table-cell">±Adj</th>
                <th className="text-right px-4 py-3 font-medium text-foreground">Stock</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Package size={32} className="mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">
                      {search || filter !== "all" ? "No products match this filter" : "No products added yet"}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map(p => {
                const sc = STATUS_CONFIG[p.status];
                const StatusIcon = sc.icon;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/20 transition-colors",
                      p.status === "out" ? "bg-red-500/5" : p.status === "low" ? "bg-amber-500/5" : ""
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Rate: Rs {fmt(p.currentRate)}
                        {p.costPrice != null && ` · Cost: Rs ${fmt(p.costPrice)}`}
                        {p.minStock > 0 && ` · Min: ${fmtQty(p.minStock)}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {fmtQty(p.openingStock)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 hidden md:table-cell">
                      {p.purchased > 0 ? `+${fmtQty(p.purchased)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-red-400 hidden md:table-cell">
                      {p.sold > 0 ? `−${fmtQty(p.sold)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-purple-400 hidden lg:table-cell">
                      {p.adjusted !== 0 ? `${p.adjusted > 0 ? "+" : ""}${fmtQty(p.adjusted)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("font-bold text-base", sc.cls)}>
                        {fmtQty(p.currentStock)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit", sc.bg)}>
                        <StatusIcon size={10} />{sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setMovementsProdId(p.id)}
                          title="View movements"
                          className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <History size={13} />
                        </button>
                        <button
                          onClick={() => setAdjustProd(p)}
                          title="Adjust stock"
                          className="p-1.5 text-muted-foreground hover:text-emerald-400 transition-colors"
                        >
                          <RefreshCw size={13} />
                        </button>
                        <button
                          onClick={() => setSettingsProd(p)}
                          title="Stock settings"
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Settings2 size={13} />
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

      {settingsProd && (
        <SettingsDialog product={settingsProd} open={!!settingsProd} onClose={() => setSettingsProd(null)} />
      )}
      {adjustProd && (
        <AdjustDialog product={adjustProd} open={!!adjustProd} onClose={() => setAdjustProd(null)} />
      )}
      {movementsProdId != null && (
        <MovementsDialog productId={movementsProdId} open={movementsProdId != null} onClose={() => setMovementsProdId(null)} />
      )}
    </div>
  );
}
