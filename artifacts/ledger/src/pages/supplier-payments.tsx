import { Fragment, useState } from "react";
import { Link } from "wouter";
import {
  useListSupplierPayments, getListSupplierPaymentsQueryKey, useCreateSupplierPayment,
  useCorrectSupplierPayment, useListSuppliers, getListSuppliersQueryKey,
  type SupplierPayment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VoidToggle, CorrectionBadge } from "@/components/correction-fields";
import { groupCorrections } from "@/lib/correction-chain";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Filter, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PAYMENT_MODES = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
type PaymentMode = typeof PAYMENT_MODES[number];

const MODE_COLORS: Record<string, string> = {
  cash: "bg-emerald-100 text-emerald-700",
  bank: "bg-blue-100 text-blue-700",
  easypaisa: "bg-green-100 text-green-700",
  jazzcash: "bg-red-100 text-red-700",
  cheque: "bg-purple-100 text-purple-700",
  other: "bg-slate-100 text-slate-700",
};

interface SupplierPaymentForm {
  supplierId: number | "";
  date: string;
  paymentMode: PaymentMode;
  amount: string;
  bankAccount: string;
  chequeNo: string;
  notes: string;
}

const defaultForm = (): SupplierPaymentForm => ({
  supplierId: "",
  date: new Date().toISOString().split("T")[0],
  paymentMode: "cash",
  amount: "",
  bankAccount: "",
  chequeNo: "",
  notes: "",
});

export default function SupplierPaymentsPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterSupplierId, setFilterSupplierId] = useState<number | undefined>();
  const [filterMode, setFilterMode] = useState<PaymentMode | undefined>();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SupplierPaymentForm>(defaultForm());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Always pull the full chain (including reversed/reversal rows) — grouping needs them
  // client-side to reconstruct each transaction's history, even though only one row per
  // logical transaction ends up rendered.
  const params = {
    from: fromDate || undefined,
    to: toDate || undefined,
    supplierId: filterSupplierId || undefined,
    paymentMode: filterMode,
    includeReversed: true,
  };

  const { data: payments = [], isLoading } = useListSupplierPayments(params, { query: { queryKey: getListSupplierPaymentsQueryKey(params) } });
  const { data: suppliers = [] } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const createMutation = useCreateSupplierPayment();
  const correctMutation = useCorrectSupplierPayment();

  // Pre-select supplier from URL
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const preSupplierId = searchParams?.get("supplierId");

  const openNewForm = () => {
    setForm({ ...defaultForm(), supplierId: preSupplierId ? parseInt(preSupplierId) : "" });
    setShowForm(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || !form.amount) return;
    try {
      await createMutation.mutateAsync({
        data: {
          supplierId: form.supplierId as number,
          date: form.date,
          paymentMode: form.paymentMode,
          amount: parseFloat(form.amount),
          bankAccount: form.bankAccount || undefined,
          chequeNo: form.chequeNo || undefined,
          notes: form.notes || undefined,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListSupplierPaymentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      setShowForm(false);
      setForm(defaultForm());
      toast({ title: "Payment recorded" });
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    }
  };

  // ── Correction (reverse + optionally replace) ──
  const [correcting, setCorrecting] = useState<SupplierPayment | null>(null);
  const [correctForm, setCorrectForm] = useState<SupplierPaymentForm>(defaultForm());
  const [correctVoid, setCorrectVoid] = useState(false);
  const [correctReason, setCorrectReason] = useState("");

  const openCorrect = (p: SupplierPayment) => {
    setCorrecting(p);
    setCorrectForm({
      supplierId: p.supplierId, date: p.date, paymentMode: p.paymentMode as PaymentMode, amount: String(p.amount),
      bankAccount: p.bankAccount ?? "", chequeNo: p.chequeNo ?? "", notes: p.notes ?? "",
    });
    setCorrectVoid(false);
    setCorrectReason("");
  };

  const handleCorrect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correcting) return;
    try {
      await correctMutation.mutateAsync({
        id: correcting.id,
        data: correctVoid
          ? { void: true, reason: correctReason || undefined }
          : {
              reason: correctReason || undefined,
              supplierId: correctForm.supplierId as number,
              date: correctForm.date,
              paymentMode: correctForm.paymentMode,
              amount: parseFloat(correctForm.amount),
              bankAccount: correctForm.bankAccount || undefined,
              chequeNo: correctForm.chequeNo || undefined,
              notes: correctForm.notes || undefined,
            },
      });
      queryClient.invalidateQueries({ queryKey: getListSupplierPaymentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      setCorrecting(null);
      toast({ title: correctVoid ? "Payment voided" : "Payment corrected" });
    } catch {
      toast({ title: "Failed to correct payment", variant: "destructive" });
    }
  };

  const totalPaid = payments.filter(p => p.status === "posted").reduce((s, p) => s + p.amount, 0);

  // One row per logical transaction: `head` is its current effective state.
  const groups = groupCorrections(payments);
  const toggleExpanded = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Supplier Payments</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Total paid: Rs. {formatAmount(totalPaid)}
          </p>
        </div>
        <Button onClick={openNewForm}><Plus size={15} className="mr-1.5" /> Record Payment</Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Filter size={14} className="text-muted-foreground mt-6" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Supplier</label>
          <select className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background" value={filterSupplierId ?? ""} onChange={e => setFilterSupplierId(e.target.value ? parseInt(e.target.value) : undefined)}>
            <option value="">All</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Mode</label>
          <select className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background" value={filterMode ?? ""} onChange={e => setFilterMode((e.target.value as PaymentMode) || undefined)}>
            <option value="">All</option>
            {PAYMENT_MODES.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="text-sm h-8 w-36" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="text-sm h-8 w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); setFilterSupplierId(undefined); setFilterMode(undefined); }}>Clear</Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supplier</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Reference</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && groups.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No supplier payments found</td></tr>}
            {groups.map(g => {
              const p = g.head;
              const expanded = expandedIds.has(p.id);
              return (
              <Fragment key={p.id}>
                <tr className={cn("hover:bg-muted/20 transition-colors", g.isVoid && "opacity-50")}>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(p.date)}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/suppliers/${p.supplierId}`}>
                      <span className={cn("hover:text-primary cursor-pointer", g.isVoid && "line-through decoration-1")}>{p.supplierName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn("inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium capitalize", MODE_COLORS[p.paymentMode] ?? "bg-muted text-muted-foreground")}>
                        {p.paymentMode}
                      </span>
                      <CorrectionBadge isVoid={g.isVoid} historyCount={g.history.length} expanded={expanded} onToggle={() => toggleExpanded(p.id)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {p.bankAccount && <div>{p.bankAccount}</div>}
                    {p.chequeNo && <div>Chq: {p.chequeNo}</div>}
                    {p.notes && <div>{p.notes}</div>}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-semibold", g.isVoid ? "text-muted-foreground line-through decoration-1" : "text-red-500")}>Rs. {formatAmount(p.amount)}</td>
                  <td className="px-4 py-3">
                    {!g.isVoid && (
                      <button onClick={() => openCorrect(p)} title="Correct this payment" className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-muted/10">
                    <td colSpan={6} className="px-4 py-3">
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
                                <span className="line-through text-muted-foreground">Rs. {formatAmount(step.previous.amount)}</span>
                                {" "}<span className="text-muted-foreground capitalize">({step.previous.paymentMode}, #{step.previous.id})</span>
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

      {/* New Payment Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Supplier Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <select className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background" value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value ? parseInt(e.target.value) : "" }))} required>
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Amount (Rs.) *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" required min="1" step="0.01" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Mode *</Label>
              <select className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background capitalize" value={form.paymentMode} onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value as PaymentMode }))} required>
                {PAYMENT_MODES.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
              </select>
            </div>
            {(form.paymentMode === "bank" || form.paymentMode === "cheque") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Bank Account</Label>
                  <Input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} placeholder="Account name/no." />
                </div>
                <div className="space-y-1.5">
                  <Label>Cheque Number</Label>
                  <Input value={form.chequeNo} onChange={e => setForm(f => ({ ...f, chequeNo: e.target.value }))} placeholder="Chq number" />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Correct Payment Dialog — reverses the original behind the scenes, never edits it */}
      <Dialog open={!!correcting} onOpenChange={(o) => { if (!o) setCorrecting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 size={16} /> Correct Payment #{correcting?.id}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCorrect} className="space-y-4">
            <VoidToggle isVoid={correctVoid} onVoidChange={setCorrectVoid} reason={correctReason} onReasonChange={setCorrectReason} />
            {!correctVoid && (
              <>
                <div className="space-y-1.5">
                  <Label>Supplier *</Label>
                  <select className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background" value={correctForm.supplierId} onChange={e => setCorrectForm(f => ({ ...f, supplierId: e.target.value ? parseInt(e.target.value) : "" }))} required>
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Date *</Label>
                    <Input type="date" value={correctForm.date} onChange={e => setCorrectForm(f => ({ ...f, date: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount (Rs.) *</Label>
                    <Input type="number" value={correctForm.amount} onChange={e => setCorrectForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" required min="1" step="0.01" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Mode *</Label>
                  <select className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background capitalize" value={correctForm.paymentMode} onChange={e => setCorrectForm(f => ({ ...f, paymentMode: e.target.value as PaymentMode }))} required>
                    {PAYMENT_MODES.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
                  </select>
                </div>
                {(correctForm.paymentMode === "bank" || correctForm.paymentMode === "cheque") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Bank Account</Label>
                      <Input value={correctForm.bankAccount} onChange={e => setCorrectForm(f => ({ ...f, bankAccount: e.target.value }))} placeholder="Account name/no." />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cheque Number</Label>
                      <Input value={correctForm.chequeNo} onChange={e => setCorrectForm(f => ({ ...f, chequeNo: e.target.value }))} placeholder="Chq number" />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input value={correctForm.notes} onChange={e => setCorrectForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
                </div>
              </>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCorrecting(null)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={correctMutation.isPending}>
                {correctMutation.isPending ? "Saving..." : correctVoid ? "Void Payment" : "Save Correction"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
