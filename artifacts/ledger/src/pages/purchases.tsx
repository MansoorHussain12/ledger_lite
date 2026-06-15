import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ShoppingBag, Plus, Search, Filter, Trash2, FileText, ChevronRight, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
};

type PurchaseDetail = PurchaseRow & {
  items: Array<{ id: number; productId: number; productName: string; qty: number; rate: number; amount: number }>;
};

async function fetchPurchases(from: string, to: string): Promise<PurchaseRow[]> {
  const q = new URLSearchParams({ from, to });
  const r = await fetch(`${BASE}/api/purchases?${q}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function fetchPurchaseDetail(id: number): Promise<PurchaseDetail> {
  const r = await fetch(`${BASE}/api/purchases/${id}`, { credentials: "include" });
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
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases", fromDate, toDate],
    queryFn: () => fetchPurchases(fromDate, toDate),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/purchases/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["cashbook-summary"] });
      toast({ title: "Purchase deleted" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const filtered = purchases.filter(p =>
    p.supplierName.toLowerCase().includes(search.toLowerCase()) ||
    (p.invoiceNo ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalBilled = filtered.reduce((s, p) => s + p.totalAmount, 0);
  const totalPaid = filtered.reduce((s, p) => s + p.paidAmount, 0);
  const totalBalance = filtered.reduce((s, p) => s + p.balance, 0);

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
              {!isLoading && filtered.length === 0 && (
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
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.date}</td>
                  <td className="px-4 py-3">
                    <Link href={`/suppliers/${p.supplierId}`}>
                      <span className="font-medium hover:text-primary cursor-pointer">{p.supplierName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.invoiceNo ?? <span className="text-xs opacity-40">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", MODE_COLORS[p.paymentMode] ?? "")}>
                      {p.paymentMode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">Rs {fmt(p.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">Rs {fmt(p.paidAmount)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", p.balance > 0 ? "text-red-400" : "text-emerald-400")}>
                    Rs {fmt(p.balance)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setViewId(p.id)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="View details">
                        <Eye size={13} />
                      </button>
                      <button onClick={() => setDeleteId(p.id)} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewId != null && (
        <PurchaseDetailDialog id={viewId} open={viewId != null} onClose={() => setViewId(null)} />
      )}

      <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase invoice?</AlertDialogTitle>
            <AlertDialogDescription>This will also remove the associated cashbook payment entry.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId != null && deleteMut.mutate(deleteId)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
