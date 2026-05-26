import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListPayments, getListPaymentsQueryKey, useCreatePayment,
  useDeletePayment, useListCustomers, getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Filter, Banknote, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentForm {
  customerId: number | "";
  date: string;
  type: "cash" | "bank";
  amount: string;
  bankAccount: string;
  chequeNo: string;
  notes: string;
}

const defaultForm = (): PaymentForm => ({
  customerId: "",
  date: new Date().toISOString().split("T")[0],
  type: "cash",
  amount: "",
  bankAccount: "",
  chequeNo: "",
  notes: "",
});

export default function PaymentsPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState<number | undefined>();
  const [filterType, setFilterType] = useState<"cash" | "bank" | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PaymentForm>(defaultForm());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = {
    from: fromDate || undefined,
    to: toDate || undefined,
    customerId: filterCustomerId || undefined,
    type: filterType,
  };

  const { data: payments = [], isLoading } = useListPayments(params, { query: { queryKey: getListPaymentsQueryKey(params) } });
  const { data: customers = [] } = useListCustomers(undefined, { query: { queryKey: getListCustomersQueryKey() } });
  const createMutation = useCreatePayment();
  const deleteMutation = useDeletePayment();

  // Pre-select customer from URL
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const preCustomerId = searchParams?.get("customerId");

  const openNewForm = () => {
    setForm({ ...defaultForm(), customerId: preCustomerId ? parseInt(preCustomerId) : "" });
    setShowForm(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.amount) return;
    try {
      await createMutation.mutateAsync({
        data: {
          customerId: form.customerId as number,
          date: form.date,
          type: form.type,
          amount: parseFloat(form.amount),
          bankAccount: form.bankAccount || undefined,
          chequeNo: form.chequeNo || undefined,
          notes: form.notes || undefined,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
      setShowForm(false);
      setForm(defaultForm());
      toast({ title: "Payment recorded" });
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this payment?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
      toast({ title: "Payment deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const totalCash = payments.filter(p => p.type === "cash").reduce((s, p) => s + p.amount, 0);
  const totalBank = payments.filter(p => p.type === "bank").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Cash: Rs. {formatAmount(totalCash)} · Bank: Rs. {formatAmount(totalBank)}
          </p>
        </div>
        <Button onClick={openNewForm}><Plus size={15} className="mr-1.5" /> Record Payment</Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Filter size={14} className="text-muted-foreground mt-6" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Customer</label>
          <select className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background" value={filterCustomerId ?? ""} onChange={e => setFilterCustomerId(e.target.value ? parseInt(e.target.value) : undefined)}>
            <option value="">All</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <select className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background" value={filterType ?? ""} onChange={e => setFilterType((e.target.value as "cash" | "bank") || undefined)}>
            <option value="">All</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
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
        <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); setFilterCustomerId(undefined); setFilterType(undefined); }}>Clear</Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Reference</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && payments.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No payments found</td></tr>}
            {payments.map(p => (
              <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-muted-foreground">{formatDate(p.date)}</td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/customers/${p.customerId}`}>
                    <span className="hover:text-primary cursor-pointer">{p.customerName}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium",
                    p.type === "cash" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                  )}>
                    {p.type === "cash" ? <Banknote size={11} /> : <Building2 size={11} />}
                    {p.type === "cash" ? "Cash" : "Bank"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                  {p.bankAccount && <div>{p.bankAccount}</div>}
                  {p.chequeNo && <div>Chq: {p.chequeNo}</div>}
                  {p.notes && <div>{p.notes}</div>}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-600">Rs. {formatAmount(p.amount)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Payment Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <select className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background" value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value ? parseInt(e.target.value) : "" }))} required>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Amount (Rs.) *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" required min="1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Type *</Label>
              <div className="flex gap-2">
                {(["cash", "bank"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={cn("flex-1 py-2 text-sm rounded-md border transition-colors capitalize", form.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}
                  >
                    {t === "cash" ? "Cash" : "Bank Transfer"}
                  </button>
                ))}
              </div>
            </div>
            {form.type === "bank" && (
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
    </div>
  );
}
