import { Fragment, useState } from "react";
import { Link } from "wouter";
import {
  useListSaleReturns, getListSaleReturnsQueryKey, useCorrectSaleReturn,
  useListCustomers, getListCustomersQueryKey,
  getSaleReturn, getSaleReturnEligibility,
  type SaleReturnRow,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VoidToggle, CorrectionBadge } from "@/components/correction-fields";
import { groupCorrections } from "@/lib/correction-chain";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronRight, Filter, Undo2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const PAYMENT_MODES = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank Transfer", easypaisa: "Easypaisa",
  jazzcash: "JazzCash", cheque: "Cheque", other: "Other",
};

type CorrectLine = {
  saleOrderItemId: number; productName: string; unit: string | null;
  rate: number; maxReturnable: number; qty: string;
};

export default function SaleReturnsPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = {
    from: fromDate || undefined, to: toDate || undefined,
    customerId: customerId || undefined, includeReversed: true,
  };
  const { data: returns = [], isLoading } = useListSaleReturns(params, {
    query: { queryKey: getListSaleReturnsQueryKey(params) }
  });
  const { data: customers = [] } = useListCustomers(undefined, { query: { queryKey: getListCustomersQueryKey() } });
  const correctMutation = useCorrectSaleReturn();

  const groups = groupCorrections(returns);
  const liveGroups = groups.filter(g => !g.isVoid);
  const totalReturned = liveGroups.reduce((s, g) => s + g.head.totalAmount, 0);
  const totalRefunded = liveGroups.reduce((s, g) => s + g.head.refundPaid, 0);

  const toggleExpanded = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Correction (reverse + optionally replace) ──
  const [correcting, setCorrecting] = useState<SaleReturnRow | null>(null);
  const [correctLines, setCorrectLines] = useState<CorrectLine[]>([]);
  const [correctRefundPaid, setCorrectRefundPaid] = useState("");
  const [correctRefundMode, setCorrectRefundMode] = useState<string>("cash");
  const [correctNotes, setCorrectNotes] = useState("");
  const [correctVoid, setCorrectVoid] = useState(false);
  const [correctReason, setCorrectReason] = useState("");
  const [correctLoading, setCorrectLoading] = useState(false);

  const openCorrect = async (row: SaleReturnRow) => {
    setCorrecting(row);
    setCorrectLoading(true);
    setCorrectVoid(false);
    setCorrectReason("");
    setCorrectRefundPaid(String(row.refundPaid));
    setCorrectRefundMode(row.refundMode);
    setCorrectNotes(row.notes ?? "");
    try {
      const [detail, eligible] = await Promise.all([
        getSaleReturn(row.id),
        getSaleReturnEligibility(row.saleOrderId),
      ]);
      // The returnable qty from /eligible already has this return's own (still-posted)
      // qty subtracted — add it back per item so the correction form shows what's truly
      // available once this row is voided/replaced (which is exactly what the server
      // re-validates against when the correction actually posts).
      const ownQtyByItem = new Map(detail.items.map(i => [i.saleOrderItemId, i.qty]));
      setCorrectLines(eligible.items.map(item => ({
        saleOrderItemId: item.saleOrderItemId,
        productName: item.productName,
        unit: item.unit ?? null,
        rate: item.rate,
        maxReturnable: item.returnableQty + (ownQtyByItem.get(item.saleOrderItemId) ?? 0),
        qty: String(ownQtyByItem.get(item.saleOrderItemId) ?? 0),
      })));
    } catch {
      toast({ title: "Failed to load return details", variant: "destructive" });
      setCorrecting(null);
    } finally {
      setCorrectLoading(false);
    }
  };

  const correctTotal = correctLines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * l.rate, 0);

  const handleCorrect = async () => {
    if (!correcting) return;
    if (!correctVoid) {
      const items = correctLines.filter(l => (parseFloat(l.qty) || 0) > 0);
      if (items.length === 0) {
        toast({ title: "Enter a return quantity for at least one item", variant: "destructive" });
        return;
      }
      const overLimit = items.find(l => (parseFloat(l.qty) || 0) > l.maxReturnable);
      if (overLimit) {
        toast({ title: `Cannot return more than ${overLimit.maxReturnable} of ${overLimit.productName}`, variant: "destructive" });
        return;
      }
    }
    try {
      await correctMutation.mutateAsync({
        id: correcting.id,
        data: correctVoid
          ? { void: true, reason: correctReason || undefined }
          : {
              reason: correctReason || undefined,
              items: correctLines
                .filter(l => (parseFloat(l.qty) || 0) > 0)
                .map(l => ({ saleOrderItemId: l.saleOrderItemId, qty: parseFloat(l.qty) })),
              refundPaid: parseFloat(correctRefundPaid) || 0,
              refundMode: correctRefundMode as typeof PAYMENT_MODES[number],
              notes: correctNotes || undefined,
            },
      });
      queryClient.invalidateQueries({ queryKey: getListSaleReturnsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["cashbook"] });
      queryClient.invalidateQueries({ queryKey: ["cashbook-summary"] });
      setCorrecting(null);
      toast({ title: correctVoid ? "Sale return voided" : "Sale return corrected" });
    } catch {
      toast({ title: "Failed to correct sale return", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sale Returns</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {liveGroups.length} returns · Rs. {formatAmount(totalReturned)} returned · Rs. {formatAmount(totalRefunded)} refunded
          </p>
        </div>
        <Link href="/sale-returns/new">
          <Button><Plus size={15} className="mr-1.5" /> New Sale Return</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-card border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Filter size={14} className="text-muted-foreground mt-6" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Customer</label>
          <select
            className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background"
            value={customerId ?? ""}
            onChange={e => setCustomerId(e.target.value ? parseInt(e.target.value) : undefined)}
          >
            <option value="">All customers</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
        <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); setCustomerId(undefined); }}>
          Clear
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Against</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
              <th className="text-right px-4 py-3 font-medium text-emerald-400">Refunded</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && groups.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No sale returns found</td></tr>}
            {groups.map(g => {
              const r = g.head;
              const expanded = expandedIds.has(r.id);
              return (
              <Fragment key={r.id}>
                <tr className={cn("hover:bg-muted/20 transition-colors", g.isVoid && "opacity-50")}>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">#{r.id}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/customers/${r.customerId}`}>
                      <span className={cn("hover:text-primary cursor-pointer", g.isVoid && "line-through decoration-1")}>{r.customerName}</span>
                    </Link>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                      <CorrectionBadge isVoid={g.isVoid} historyCount={g.history.length} expanded={expanded} onToggle={() => toggleExpanded(r.id)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                    <Link href={`/sale-orders/${r.saleOrderId}`}>
                      <span className="text-primary cursor-pointer hover:underline">SO-{r.saleOrderId}</span>
                    </Link>
                  </td>
                  <td className={cn("px-4 py-3 text-right font-semibold", g.isVoid ? "text-muted-foreground line-through decoration-1" : "text-red-600")}>Rs. {formatAmount(r.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">Rs. {formatAmount(r.refundPaid)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!g.isVoid && (
                        <button onClick={() => openCorrect(r)} title="Correct this return" className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                          <Pencil size={14} />
                        </button>
                      )}
                      <Link href={`/sale-returns/${r.id}`}>
                        <button className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                          <ChevronRight size={14} />
                        </button>
                      </Link>
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-muted/10">
                    <td colSpan={7} className="px-4 py-3">
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
                                <span className="line-through text-muted-foreground">Rs. {formatAmount(step.previous.totalAmount)}</span>
                                {" "}<span className="text-muted-foreground">(#{step.previous.id})</span>
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

      {/* Correct Sale Return Dialog */}
      <Dialog open={!!correcting} onOpenChange={(o) => { if (!o) setCorrecting(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 size={16} /> Correct Sale Return #{correcting?.id}</DialogTitle>
          </DialogHeader>
          {correctLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-4">
              <VoidToggle isVoid={correctVoid} onVoidChange={setCorrectVoid} reason={correctReason} onReasonChange={setCorrectReason} />
              {!correctVoid && (
                <>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30 border-b">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Max</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Qty</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {correctLines.map((line, idx) => (
                          <tr key={line.saleOrderItemId} className="border-b border-border/50">
                            <td className="px-3 py-2">{line.productName}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{line.maxReturnable} {line.unit ?? ""}</td>
                            <td className="px-2 py-2">
                              <Input
                                type="number" min="0" max={line.maxReturnable} step="0.01"
                                value={line.qty}
                                onChange={e => setCorrectLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: e.target.value } : l))}
                                className="h-8 text-sm text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              Rs {formatAmount((parseFloat(line.qty) || 0) * line.rate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20 font-semibold">
                          <td colSpan={3} className="px-3 py-2 text-right text-sm text-muted-foreground">Total</td>
                          <td className="px-3 py-2 text-right text-sm">Rs {formatAmount(correctTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Refund Paid (Rs)</Label>
                      <Input type="number" min="0" step="0.01" value={correctRefundPaid} onChange={e => setCorrectRefundPaid(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label>Refund Mode</Label>
                      <Select value={correctRefundMode} onValueChange={setCorrectRefundMode}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Notes (optional)</Label>
                    <Input value={correctNotes} onChange={e => setCorrectNotes(e.target.value)} placeholder="Any notes about this return" className="mt-1" />
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setCorrecting(null)} className="flex-1">Cancel</Button>
                <Button onClick={handleCorrect} className="flex-1" disabled={correctMutation.isPending}>
                  {correctMutation.isPending ? "Saving..." : correctVoid ? "Void Return" : "Save Correction"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
