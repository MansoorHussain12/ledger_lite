import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock, AlertTriangle, CheckCircle2, Clock, Plus,
  ChevronRight, Trash2, DollarSign, Calendar, ArrowLeft, User, FileText,
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
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const fmtD = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);

// ── Types ─────────────────────────────────────────────────────────────────────

type ScheduleItem = {
  id: number; planId: number; installmentNo: number; dueDate: string;
  scheduledAmount: number; paidAmount: number; balance: number;
  status: "pending" | "paid" | "overdue";
};

type PaymentRecord = {
  id: number; planId: number; scheduleId: number | null;
  date: string; amount: number; paymentMode: string; notes: string | null;
};

type Plan = {
  id: number; customerId: number; customerName: string;
  saleOrderId: number | null; saleOrderRef: string | null;
  title: string; totalAmount: number; downPayment: number;
  installmentsCount: number; frequency: string; startDate: string;
  notes: string | null; createdAt: string;
  totalPaid: number; outstanding: number; isFullyPaid: boolean;
  overdueCount: number; nextDueDate: string | null; nextDueAmount: number | null;
  status: "active" | "paid" | "overdue";
  schedule: ScheduleItem[]; payments: PaymentRecord[];
};

type Customer = { id: number; name: string };
type SaleOrder = { id: number; date: string; totalAmount: number };

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchPlans(): Promise<Plan[]> {
  const r = await fetch(`${BASE}/api/installments`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function fetchPlan(id: number): Promise<Plan> {
  const r = await fetch(`${BASE}/api/installments/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function fetchCustomers(): Promise<Customer[]> {
  const r = await fetch(`${BASE}/api/customers`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function fetchCustomerOrders(customerId: number): Promise<SaleOrder[]> {
  const r = await fetch(`${BASE}/api/customers/${customerId}/orders`, { credentials: "include" });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.orders ?? data) as SaleOrder[];
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  active:  { label: "Active",      icon: Clock,         bg: "bg-blue-500/10 text-blue-400",    border: "border-blue-500/20" },
  overdue: { label: "Overdue",     icon: AlertTriangle, bg: "bg-red-500/10 text-red-400",      border: "border-red-500/20" },
  paid:    { label: "Fully Paid",  icon: CheckCircle2,  bg: "bg-emerald-500/10 text-emerald-400", border: "border-emerald-500/20" },
};

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly",
};

const MODE_LABELS: Record<string, string> = {
  cash: "Cash", bank_transfer: "Bank Transfer", cheque: "Cheque", online: "Online",
};

// ── Payment progress bar ──────────────────────────────────────────────────────

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  return (
    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden mt-1">
      <div
        className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-emerald-400" : pct > 50 ? "bg-blue-400" : "bg-amber-400")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── New Plan Dialog ───────────────────────────────────────────────────────────

function NewPlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [saleOrderId, setSaleOrderId] = useState("__none__");
  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [downPayment, setDownPayment] = useState("0");
  const [installmentsCount, setInstallmentsCount] = useState("3");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(todayStr());
  const [notes, setNotes] = useState("");

  const { data: customers = [] } = useQuery({ queryKey: ["customers-list"], queryFn: fetchCustomers });
  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders", customerId],
    queryFn: () => fetchCustomerOrders(parseInt(customerId, 10)),
    enabled: !!customerId,
  });

  // Auto-fill title when customer or order selected
  const handleCustomerChange = (val: string) => {
    setCustomerId(val);
    setSaleOrderId("__none__");
    const cust = customers.find(c => c.id === parseInt(val, 10));
    if (cust && !title) setTitle(`${cust.name} — Installment Plan`);
  };
  const handleOrderChange = (val: string) => {
    setSaleOrderId(val);
    if (val !== "__none__") {
      const ord = orders.find(o => o.id === parseInt(val, 10));
      if (ord) {
        setTotalAmount(String(ord.totalAmount));
        const cust = customers.find(c => c.id === parseInt(customerId, 10));
        setTitle(`${cust?.name ?? ""} — SO-${String(ord.id).padStart(4, "0")}`);
      }
    }
  };

  // Preview installment amount
  const netAmount = (parseFloat(totalAmount) || 0) - (parseFloat(downPayment) || 0);
  const perInstallment = installmentsCount && parseInt(installmentsCount) > 0
    ? netAmount / parseInt(installmentsCount)
    : 0;

  const mut = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Select a customer");
      if (!totalAmount || parseFloat(totalAmount) <= 0) throw new Error("Enter total amount");
      const r = await fetch(`${BASE}/api/installments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: parseInt(customerId, 10),
          saleOrderId: saleOrderId !== "__none__" ? parseInt(saleOrderId, 10) : undefined,
          title, totalAmount: parseFloat(totalAmount),
          downPayment: parseFloat(downPayment) || 0,
          installmentsCount: parseInt(installmentsCount, 10),
          frequency, startDate,
          notes: notes || undefined,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installments"] });
      toast({ title: "Installment plan created" });
      onClose();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reset = () => {
    setCustomerId(""); setSaleOrderId("__none__"); setTitle("");
    setTotalAmount(""); setDownPayment("0"); setInstallmentsCount("3");
    setFrequency("monthly"); setStartDate(todayStr()); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Installment Plan</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          {/* Customer */}
          <div>
            <Label>Customer *</Label>
            <Select value={customerId} onValueChange={handleCustomerChange}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Link to Sale Order (optional) */}
          {customerId && (
            <div>
              <Label>Link to Sale Order (optional)</Label>
              <Select value={saleOrderId} onValueChange={handleOrderChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose order…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No link</SelectItem>
                  {orders.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      SO-{String(o.id).padStart(4, "0")} — {o.date} — Rs {fmt(o.totalAmount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div>
            <Label>Plan Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" placeholder="e.g. Customer Name — 3 Month Plan" />
          </div>

          {/* Amount row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Total Amount (Rs) *</Label>
              <Input type="number" min="1" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Down Payment (Rs)</Label>
              <Input type="number" min="0" value={downPayment} onChange={e => setDownPayment(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Schedule row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>No. of Installments *</Label>
              <Input type="number" min="1" max="120" value={installmentsCount}
                onChange={e => setInstallmentsCount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Preview */}
          {parseFloat(totalAmount) > 0 && parseInt(installmentsCount) > 0 && (
            <div className="bg-muted/20 rounded-lg p-3 text-sm space-y-1.5">
              <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">Plan Preview</div>
              {parseFloat(downPayment) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Down payment</span>
                  <span className="font-medium">Rs {fmtD(parseFloat(downPayment))}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount to finance</span>
                <span className="font-medium">Rs {fmtD(netAmount)}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-1.5 mt-1">
                <span>Per installment</span>
                <span className="text-primary">Rs {fmtD(perInstallment)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>× {installmentsCount} × {FREQ_LABELS[frequency]}</span>
                <span>starts {startDate}</span>
              </div>
            </div>
          )}

          <div>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" placeholder="Additional notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !customerId || !title || !totalAmount}>
            {mut.isPending ? "Creating…" : "Create Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Record Payment Dialog ─────────────────────────────────────────────────────

function RecordPaymentDialog({
  plan, open, preselectedScheduleId, onClose,
}: {
  plan: Plan; open: boolean; preselectedScheduleId?: number; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [scheduleId, setScheduleId] = useState(preselectedScheduleId ? String(preselectedScheduleId) : "__none__");
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState(
    preselectedScheduleId
      ? String(plan.schedule.find(s => s.id === preselectedScheduleId)?.balance ?? "")
      : String(plan.nextDueAmount ?? "")
  );
  const [paymentMode, setPaymentMode] = useState("cash");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/installments/${plan.id}/payments`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: scheduleId !== "__none__" ? parseInt(scheduleId, 10) : undefined,
          date, amount: parseFloat(amount),
          paymentMode, notes: notes || undefined,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: (updated) => {
      qc.setQueryData(["installment", plan.id], updated);
      qc.invalidateQueries({ queryKey: ["installments"] });
      toast({ title: "Payment recorded", description: `Rs ${fmtD(parseFloat(amount))} recorded` });
      onClose();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pendingItems = plan.schedule.filter(s => s.status !== "paid");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Record Payment — {plan.title}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          {/* Outstanding badge */}
          <div className="bg-muted/20 rounded-lg px-3 py-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Outstanding</span>
            <span className="font-bold text-red-400">Rs {fmtD(plan.outstanding)}</span>
          </div>

          {/* Link to installment */}
          <div>
            <Label>Installment #</Label>
            <Select value={scheduleId} onValueChange={(v) => {
              setScheduleId(v);
              if (v !== "__none__") {
                const s = plan.schedule.find(i => i.id === parseInt(v, 10));
                if (s) setAmount(String(s.balance));
              }
            }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="General payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">General payment</SelectItem>
                {pendingItems.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    #{s.installmentNo} — {s.dueDate} — Rs {fmtD(s.balance)}
                    {s.status === "overdue" ? " ⚠️" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (Rs) *</Label>
              <Input type="number" min="1" value={amount}
                onChange={e => setAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Payment Mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(MODE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" placeholder="Cheque no., reference…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !amount || parseFloat(amount) <= 0}>
            {mut.isPending ? "Saving…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan Detail View ──────────────────────────────────────────────────────────

function PlanDetail({ planId, onBack }: { planId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [payDialog, setPayDialog] = useState(false);
  const [payScheduleId, setPayScheduleId] = useState<number | undefined>();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["installment", planId],
    queryFn: () => fetchPlan(planId),
  });

  const deletePlanMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/installments/${planId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installments"] });
      toast({ title: "Plan deleted" });
      onBack();
    },
  });

  const deletePaymentMut = useMutation({
    mutationFn: async (paymentId: number) => {
      const r = await fetch(`${BASE}/api/installments/payments/${paymentId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (updated) => {
      qc.setQueryData(["installment", planId], updated);
      qc.invalidateQueries({ queryKey: ["installments"] });
      toast({ title: "Payment deleted" });
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!plan) return <div className="p-6 text-muted-foreground">Plan not found</div>;

  const sc = STATUS_CFG[plan.status];
  const StatusIcon = sc.icon;
  const paidPct = plan.totalAmount > 0 ? Math.min(100, ((plan.downPayment + plan.totalPaid) / plan.totalAmount) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Back + header */}
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={onBack} className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{plan.title}</h1>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1", sc.bg)}>
              <StatusIcon size={10} />{sc.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><User size={12} />{plan.customerName}</span>
            {plan.saleOrderRef && <span className="flex items-center gap-1"><FileText size={12} />{plan.saleOrderRef}</span>}
            <span className="flex items-center gap-1"><Calendar size={12} />{FREQ_LABELS[plan.frequency]} · starts {plan.startDate}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!plan.isFullyPaid && (
            <Button size="sm" onClick={() => { setPayScheduleId(undefined); setPayDialog(true); }}>
              <Plus size={14} className="mr-1" /> Record Payment
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => {
            if (confirm("Delete this entire installment plan?")) deletePlanMut.mutate();
          }}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-bold">Rs {fmt(plan.totalAmount)}</div>
        </div>
        {plan.downPayment > 0 && (
          <div className="bg-card border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">Down Payment</div>
            <div className="text-lg font-bold text-blue-400">Rs {fmt(plan.downPayment)}</div>
          </div>
        )}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-xs text-emerald-400">Paid</div>
          <div className="text-lg font-bold text-emerald-400">Rs {fmt(plan.totalPaid)}</div>
        </div>
        <div className={cn("rounded-lg p-3 border", plan.outstanding > 0 ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20")}>
          <div className={cn("text-xs", plan.outstanding > 0 ? "text-red-400" : "text-emerald-400")}>Outstanding</div>
          <div className={cn("text-lg font-bold", plan.outstanding > 0 ? "text-red-400" : "text-emerald-400")}>
            Rs {fmt(plan.outstanding)}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-card border rounded-lg p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium">Payment Progress</span>
          <span className="text-muted-foreground">{Math.round(paidPct)}%</span>
        </div>
        <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", paidPct >= 100 ? "bg-emerald-400" : "bg-primary")}
            style={{ width: `${paidPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Rs {fmt(plan.downPayment + plan.totalPaid)} paid</span>
          <span>Rs {fmt(plan.totalAmount)} total</span>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Installment Schedule</h2>
          <span className="text-xs text-muted-foreground">{plan.installmentsCount} installments</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">#</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Due Date</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Scheduled</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Paid</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Balance</th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {plan.schedule.map(s => {
                const isOverdue = s.status === "overdue";
                const isPaid = s.status === "paid";
                return (
                  <tr key={s.id} className={cn(
                    "border-b border-border/50 transition-colors",
                    isOverdue ? "bg-red-500/5 hover:bg-red-500/10" : isPaid ? "bg-emerald-500/5" : "hover:bg-muted/10"
                  )}>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">#{s.installmentNo}</td>
                    <td className="px-4 py-2.5 font-medium">{s.dueDate}</td>
                    <td className="px-4 py-2.5 text-right">Rs {fmtD(s.scheduledAmount)}</td>
                    <td className={cn("px-4 py-2.5 text-right", s.paidAmount > 0 ? "text-emerald-400 font-medium" : "text-muted-foreground")}>
                      {s.paidAmount > 0 ? `Rs ${fmtD(s.paidAmount)}` : "—"}
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-medium", isOverdue ? "text-red-400" : isPaid ? "text-emerald-400" : "")}>
                      {isPaid ? "—" : `Rs ${fmtD(s.balance)}`}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", {
                        "bg-emerald-500/10 text-emerald-400": isPaid,
                        "bg-red-500/10 text-red-400": isOverdue,
                        "bg-muted/30 text-muted-foreground": s.status === "pending",
                      })}>
                        {isPaid ? "✓ Paid" : isOverdue ? "⚠ Overdue" : "Pending"}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      {!isPaid && (
                        <button
                          onClick={() => { setPayScheduleId(s.id); setPayDialog(true); }}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors px-1"
                          title="Pay this installment"
                        >
                          Pay
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments history */}
      {plan.payments.length > 0 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20">
            <h2 className="font-semibold text-sm">Payment History</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/10">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Date</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Mode</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Notes</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Amount</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...plan.payments].reverse().map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2.5">{p.date}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{MODE_LABELS[p.paymentMode] ?? p.paymentMode}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.notes ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-emerald-400">Rs {fmtD(p.amount)}</td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => deletePaymentMut.mutate(p.id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors p-0.5"
                      title="Delete payment"
                    >×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan && (
        <RecordPaymentDialog
          plan={plan}
          open={payDialog}
          preselectedScheduleId={payScheduleId}
          onClose={() => { setPayDialog(false); setPayScheduleId(undefined); }}
        />
      )}
    </div>
  );
}

// ── Main List Page ────────────────────────────────────────────────────────────

export default function InstallmentsPage() {
  const { toast } = useToast();
  const [newDialog, setNewDialog] = useState(false);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "overdue" | "paid">("all");

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["installments"],
    queryFn: fetchPlans,
  });

  // If a plan is selected, show detail
  if (activePlanId !== null) {
    return <PlanDetail planId={activePlanId} onBack={() => setActivePlanId(null)} />;
  }

  const counts = {
    active:  plans.filter(p => p.status === "active").length,
    overdue: plans.filter(p => p.status === "overdue").length,
    paid:    plans.filter(p => p.status === "paid").length,
  };
  const totalOutstanding = plans.reduce((s, p) => s + p.outstanding, 0);

  const filtered = plans.filter(p => statusFilter === "all" || p.status === statusFilter);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarClock size={20} className="text-primary" /> Installments
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage EMI & installment payment plans</p>
        </div>
        <Button onClick={() => setNewDialog(true)}>
          <Plus size={14} className="mr-1" /> New Plan
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Plans</div>
          <div className="text-2xl font-bold">{plans.length}</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="text-xs text-blue-400 mb-1 flex items-center gap-1"><Clock size={11} /> Active</div>
          <div className="text-2xl font-bold text-blue-400">{counts.active}</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="text-xs text-red-400 mb-1 flex items-center gap-1"><AlertTriangle size={11} /> Overdue</div>
          <div className="text-2xl font-bold text-red-400">{counts.overdue}</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
          <div className="text-xs text-emerald-400 mb-1 flex items-center gap-1"><CheckCircle2 size={11} /> Paid Off</div>
          <div className="text-2xl font-bold text-emerald-400">{counts.paid}</div>
        </div>
      </div>

      {/* Total outstanding */}
      {totalOutstanding > 0 && (
        <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total Outstanding Receivable</span>
          <span className="font-bold text-lg text-red-400">Rs {fmtD(totalOutstanding)}</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(["all", "active", "overdue", "paid"] as const).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-md border transition-colors font-medium capitalize",
              statusFilter === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && (
              <span className="ml-1.5 opacity-70">
                {f === "active" ? counts.active : f === "overdue" ? counts.overdue : counts.paid}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Plans list */}
      <div className="space-y-3">
        {isLoading && <div className="text-center py-8 text-muted-foreground">Loading…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="bg-card border rounded-lg py-16 text-center">
            <CalendarClock size={36} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {statusFilter !== "all" ? "No plans in this category" : "No installment plans yet"}
            </p>
            {statusFilter === "all" && (
              <Button className="mt-4" onClick={() => setNewDialog(true)}>
                <Plus size={14} className="mr-1" /> Create First Plan
              </Button>
            )}
          </div>
        )}
        {filtered.map(plan => {
          const sc = STATUS_CFG[plan.status];
          const StatusIcon = sc.icon;
          const paidPct = plan.totalAmount > 0
            ? Math.min(100, ((plan.downPayment + plan.totalPaid) / plan.totalAmount) * 100)
            : 0;
          return (
            <div
              key={plan.id}
              onClick={() => setActivePlanId(plan.id)}
              className={cn(
                "bg-card border rounded-lg p-4 cursor-pointer hover:shadow-md transition-all group",
                plan.status === "overdue" ? "border-red-500/30 bg-red-500/5" : ""
              )}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{plan.title}</span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5", sc.bg)}>
                      <StatusIcon size={9} />{sc.label}
                    </span>
                    {plan.overdueCount > 0 && (
                      <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                        {plan.overdueCount} overdue
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-0.5"><User size={10} />{plan.customerName}</span>
                    {plan.saleOrderRef && <span className="flex items-center gap-0.5"><FileText size={10} />{plan.saleOrderRef}</span>}
                    <span>{plan.installmentsCount}× {FREQ_LABELS[plan.frequency]}</span>
                    {!plan.isFullyPaid && plan.nextDueDate && (
                      <span className={cn("flex items-center gap-0.5", plan.status === "overdue" ? "text-red-400" : "")}>
                        <Calendar size={10} /> Next: {plan.nextDueDate}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-muted-foreground">Outstanding</div>
                  <div className={cn("font-bold text-lg", plan.outstanding > 0 ? "text-red-400" : "text-emerald-400")}>
                    Rs {fmt(plan.outstanding)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">of Rs {fmt(plan.totalAmount)}</div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors mt-1 flex-shrink-0" />
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <ProgressBar paid={plan.downPayment + plan.totalPaid} total={plan.totalAmount} />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>{Math.round(paidPct)}% paid</span>
                  <span>{plan.payments.length} payments</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <NewPlanDialog open={newDialog} onClose={() => setNewDialog(false)} />
    </div>
  );
}
