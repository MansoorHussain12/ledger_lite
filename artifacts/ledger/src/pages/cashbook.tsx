import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, TrendingUp, TrendingDown, Wallet, Building2,
  Smartphone, Plus, Trash2, Filter, ChevronDown, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const PAYMENT_MODES = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
const ENTRY_TYPES = ["cash_in", "cash_out"] as const;
const SOURCES = ["manual", "opening_balance", "adjustment", "salary", "transfer"] as const;

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  payment: "Customer Receipt",
  expense: "Expense",
  opening_balance: "Opening Balance",
  adjustment: "Adjustment",
  salary: "Salary",
  transfer: "Transfer",
};

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  easypaisa: "Easypaisa",
  jazzcash: "JazzCash",
  cheque: "Cheque",
  other: "Other",
};

const MODE_COLORS: Record<string, string> = {
  cash: "bg-emerald-500/15 text-emerald-400",
  bank: "bg-blue-500/15 text-blue-400",
  easypaisa: "bg-green-500/15 text-green-400",
  jazzcash: "bg-red-500/15 text-red-400",
  cheque: "bg-purple-500/15 text-purple-400",
  other: "bg-slate-500/15 text-slate-400",
};

// ── API fetch helpers ─────────────────────────────────────────────────────────

async function fetchSummary() {
  const r = await fetch(`${BASE}/api/cashbook/summary`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load summary");
  return r.json() as Promise<{
    cashInHand: number; bankBalance: number; easypaisaBalance: number;
    jazzcashBalance: number; totalBalance: number; todayIn: number; todayOut: number;
  }>;
}

async function fetchLedger(params: { from?: string; to?: string; type?: string; paymentMode?: string }) {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.type) q.set("type", params.type);
  if (params.paymentMode) q.set("paymentMode", params.paymentMode);
  const r = await fetch(`${BASE}/api/cashbook?${q}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load cashbook");
  return r.json() as Promise<{
    entries: Array<{
      id: number; date: string; type: string; source: string;
      referenceId: number | null; description: string; paymentMode: string;
      amount: number; runningBalance: number; notes: string | null; createdAt: string;
    }>;
    totalIn: number; totalOut: number; netBalance: number;
  }>;
}

async function fetchExpenses(params: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  const r = await fetch(`${BASE}/api/expenses?${q}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load expenses");
  return r.json() as Promise<Array<{
    id: number; date: string; category: string; description: string;
    amount: number; paymentMode: string; notes: string | null; createdAt: string;
  }>>;
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon, label, amount, sub, color,
}: { icon: React.ElementType; label: string; amount: number; sub?: string; color: string }) {
  return (
    <div className="bg-card rounded-lg border p-4 flex items-start gap-4">
      <div className={cn("p-2 rounded-md", color)}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs mb-0.5">{label}</div>
        <div className="text-foreground font-bold text-lg leading-tight">
          Rs {fmt(amount)}
        </div>
        {sub && <div className="text-muted-foreground text-xs mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── New Entry dialog ──────────────────────────────────────────────────────────

type NewEntryForm = {
  date: string; type: "cash_in" | "cash_out"; source: string;
  description: string; paymentMode: string; amount: string; notes: string;
};

function NewEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<NewEntryForm>({
    date: today(), type: "cash_in", source: "manual",
    description: "", paymentMode: "cash", amount: "", notes: "",
  });

  const mut = useMutation({
    mutationFn: async (data: NewEntryForm) => {
      const r = await fetch(`${BASE}/api/cashbook`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, amount: parseFloat(data.amount) }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["cashbook-summary"] });
      toast({ title: "Entry recorded" });
      onClose();
      setForm({ date: today(), type: "cash_in", source: "manual", description: "", paymentMode: "cash", amount: "", notes: "" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: keyof NewEntryForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Cash Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_in">Cash In ↑</SelectItem>
                  <SelectItem value="cash_out">Cash Out ↓</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.source} onValueChange={v => set("source", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="opening_balance">Opening Balance</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="salary">Salary Payment</SelectItem>
                <SelectItem value="transfer">Cash ↔ Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="What is this entry for?"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Mode</Label>
              <Select value={form.paymentMode} onValueChange={v => set("paymentMode", v)}>
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
            <div>
              <Label>Amount (Rs)</Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={form.amount}
                onChange={e => set("amount", e.target.value)}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Any additional notes"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mut.mutate(form)}
            disabled={mut.isPending || !form.description || !form.amount}
          >
            {mut.isPending ? "Saving…" : "Save Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New Expense dialog ────────────────────────────────────────────────────────

type NewExpenseForm = {
  date: string; category: string; description: string;
  paymentMode: string; amount: string; notes: string;
};

const EXPENSE_CATEGORIES = [
  "Rent", "Electricity", "Fuel / Transport", "Office Supplies",
  "Repairs & Maintenance", "Telephone / Internet", "Salary",
  "Miscellaneous", "Other",
];

function NewExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<NewExpenseForm>({
    date: today(), category: "Miscellaneous", description: "",
    paymentMode: "cash", amount: "", notes: "",
  });

  const mut = useMutation({
    mutationFn: async (data: NewExpenseForm) => {
      const r = await fetch(`${BASE}/api/expenses`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, amount: parseFloat(data.amount) }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["cashbook-summary"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast({ title: "Expense recorded" });
      onClose();
      setForm({ date: today(), category: "Miscellaneous", description: "", paymentMode: "cash", amount: "", notes: "" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: keyof NewExpenseForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Brief description of expense"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Payment Mode</Label>
              <Select value={form.paymentMode} onValueChange={v => set("paymentMode", v)}>
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
            <div>
              <Label>Amount (Rs)</Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={form.amount}
                onChange={e => set("amount", e.target.value)}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any notes" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mut.mutate(form)}
            disabled={mut.isPending || !form.description || !form.amount}
          >
            {mut.isPending ? "Saving…" : "Save Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "ledger" | "expenses";

export default function CashbookPage() {
  const [tab, setTab] = useState<Tab>("ledger");
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [showNewExpense, setShowNewExpense] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(today);
  const [typeFilter, setTypeFilter] = useState("__all__");
  const [modeFilter, setModeFilter] = useState("__all__");

  const qc = useQueryClient();
  const { toast } = useToast();

  const summaryQ = useQuery({
    queryKey: ["cashbook-summary"],
    queryFn: fetchSummary,
  });

  const ledgerQ = useQuery({
    queryKey: ["cashbook", fromDate, toDate, typeFilter, modeFilter],
    queryFn: () => fetchLedger({ from: fromDate, to: toDate, type: typeFilter === "__all__" ? undefined : typeFilter, paymentMode: modeFilter === "__all__" ? undefined : modeFilter }),
    enabled: tab === "ledger",
  });

  const expensesQ = useQuery({
    queryKey: ["expenses", fromDate, toDate],
    queryFn: () => fetchExpenses({ from: fromDate, to: toDate }),
    enabled: tab === "expenses",
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/cashbook/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cashbook"] }); qc.invalidateQueries({ queryKey: ["cashbook-summary"] }); },
    onError: (e) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["cashbook-summary"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: () => toast({ title: "Error deleting expense", variant: "destructive" }),
  });

  const summary = summaryQ.data;
  const ledger = ledgerQ.data;
  const expenses = expensesQ.data;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen size={20} className="text-primary" />
            Cashbook
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track all cash & bank movement</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["cashbook"] }); qc.invalidateQueries({ queryKey: ["cashbook-summary"] }); qc.invalidateQueries({ queryKey: ["expenses"] }); }}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowNewExpense(true)}>
            <Trash2 size={14} className="mr-1 text-red-400" /> Add Expense
          </Button>
          <Button size="sm" onClick={() => setShowNewEntry(true)}>
            <Plus size={14} className="mr-1" /> Record Entry
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={Wallet} label="Cash in Hand" amount={summary?.cashInHand ?? 0} color="bg-emerald-500/15 text-emerald-400" />
        <SummaryCard icon={Building2} label="Bank Balance" amount={summary?.bankBalance ?? 0} color="bg-blue-500/15 text-blue-400" />
        <SummaryCard icon={Smartphone} label="Mobile Money" amount={(summary?.easypaisaBalance ?? 0) + (summary?.jazzcashBalance ?? 0)} sub={`EP: ${fmt(summary?.easypaisaBalance ?? 0)} | JC: ${fmt(summary?.jazzcashBalance ?? 0)}`} color="bg-green-500/15 text-green-400" />
        <div className="bg-card rounded-lg border p-4 flex flex-col justify-between">
          <div className="text-muted-foreground text-xs mb-1">Today's Movement</div>
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp size={14} className="text-emerald-400" />
            <span className="text-emerald-400 font-medium">+{fmt(summary?.todayIn ?? 0)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm mt-1">
            <TrendingDown size={14} className="text-red-400" />
            <span className="text-red-400 font-medium">-{fmt(summary?.todayOut ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-4">
        {(["ledger", "expenses"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "pb-2 text-sm font-medium capitalize border-b-2 transition-colors",
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "ledger" ? "Cash Ledger" : "Expenses"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        {tab === "ledger" && (
          <>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  <SelectItem value="cash_in">Cash In</SelectItem>
                  <SelectItem value="cash_out">Cash Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Mode</Label>
              <Select value={modeFilter} onValueChange={setModeFilter}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue placeholder="All modes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All modes</SelectItem>
                  {PAYMENT_MODES.map(m => (
                    <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Ledger tab */}
      {tab === "ledger" && (
        <>
          {/* Totals bar */}
          {ledger && (
            <div className="flex flex-wrap gap-4 bg-card border rounded-lg px-4 py-3 text-sm">
              <span className="text-muted-foreground">Period:</span>
              <span className="text-emerald-400 font-medium">IN: Rs {fmt(ledger.totalIn)}</span>
              <span className="text-red-400 font-medium">OUT: Rs {fmt(ledger.totalOut)}</span>
              <span className={cn("font-semibold", ledger.netBalance >= 0 ? "text-emerald-400" : "text-red-400")}>
                NET: Rs {fmt(ledger.netBalance)}
              </span>
              <span className="text-muted-foreground ml-auto">{ledger.entries.length} entries</span>
            </div>
          )}

          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                    <th className="text-right px-4 py-3 font-medium text-emerald-400">Cash In</th>
                    <th className="text-right px-4 py-3 font-medium text-red-400">Cash Out</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQ.isLoading && (
                    <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Loading…</td></tr>
                  )}
                  {ledgerQ.isError && (
                    <tr><td colSpan={8} className="text-center text-red-400 py-8">Failed to load</td></tr>
                  )}
                  {ledger?.entries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-muted-foreground py-12">
                        <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                        No entries in this period
                      </td>
                    </tr>
                  )}
                  {ledger?.entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="font-medium text-foreground truncate">{e.description}</div>
                        {e.notes && <div className="text-muted-foreground text-xs truncate">{e.notes}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs font-normal">
                          {SOURCE_LABELS[e.source] ?? e.source}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", MODE_COLORS[e.paymentMode] ?? "bg-muted text-muted-foreground")}>
                          {MODE_LABELS[e.paymentMode] ?? e.paymentMode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-400">
                        {e.type === "cash_in" ? `${fmt(e.amount)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-400">
                        {e.type === "cash_out" ? `${fmt(e.amount)}` : "—"}
                      </td>
                      <td className={cn("px-4 py-3 text-right font-semibold whitespace-nowrap", e.runningBalance >= 0 ? "text-foreground" : "text-red-400")}>
                        Rs {fmt(e.runningBalance)}
                      </td>
                      <td className="px-4 py-3">
                        {["manual", "opening_balance", "adjustment", "salary", "transfer"].includes(e.source) && (
                          <button
                            onClick={() => deleteEntry.mutate(e.id)}
                            className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                            title="Delete entry"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Expenses tab */}
      {tab === "expenses" && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                  <th className="text-right px-4 py-3 font-medium text-red-400">Amount</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expensesQ.isLoading && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Loading…</td></tr>
                )}
                {expenses?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-12">
                      No expenses recorded in this period
                    </td>
                  </tr>
                )}
                {expenses?.map((ex) => (
                  <tr key={ex.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{ex.date}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{ex.category}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{ex.description}</div>
                      {ex.notes && <div className="text-muted-foreground text-xs">{ex.notes}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", MODE_COLORS[ex.paymentMode] ?? "")}>
                        {MODE_LABELS[ex.paymentMode] ?? ex.paymentMode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-400">
                      Rs {fmt(ex.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteExpense.mutate(ex.id)}
                        className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {expenses && expenses.length > 0 && (
            <div className="px-4 py-3 border-t bg-muted/20 flex justify-end">
              <span className="text-sm font-semibold text-red-400">
                Total: Rs {fmt(expenses.reduce((s, e) => s + e.amount, 0))}
              </span>
            </div>
          )}
        </div>
      )}

      <NewEntryDialog open={showNewEntry} onClose={() => setShowNewEntry(false)} />
      <NewExpenseDialog open={showNewExpense} onClose={() => setShowNewExpense(false)} />
    </div>
  );
}
