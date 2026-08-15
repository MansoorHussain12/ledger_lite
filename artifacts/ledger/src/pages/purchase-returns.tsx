import { Fragment, useState } from "react";
import { Link } from "wouter";
import {
  useListPurchaseReturns, getListPurchaseReturnsQueryKey, useCorrectPurchaseReturn,
  useListSuppliers, getListSuppliersQueryKey,
  useGetPurchaseReturn, getGetPurchaseReturnQueryKey,
  getPurchaseReturn, getPurchaseReturnEligibility,
  type PurchaseReturnRow,
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
import { Plus, Filter, Undo2, Pencil, Eye, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

const PAYMENT_MODES = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank Transfer", easypaisa: "Easypaisa",
  jazzcash: "JazzCash", cheque: "Cheque", other: "Other",
};

type CorrectLine = {
  purchaseInvoiceItemId: number; productName: string; unit: string | null;
  rate: number; maxReturnable: number; qty: string;
};

function PurchaseReturnDetailDialog({ id, open, onClose }: { id: number; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useGetPurchaseReturn(id, {
    query: { enabled: open && id > 0, queryKey: getGetPurchaseReturnQueryKey(id) }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Purchase Return #{id}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : data ? (
          <div className="space-y-4">
            {data.status === "reversed" && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                This return was voided — not a live transaction.
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium">{data.supplierName}</span></div>
              <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{data.date}</span></div>
              <div>
                <span className="text-muted-foreground">Against:</span>{" "}
                <Link href={`/purchases/${data.purchaseInvoiceId}`}><span className="font-medium text-primary hover:underline cursor-pointer">PUR-{data.purchaseInvoiceId}</span></Link>
              </div>
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
                    <td className="px-3 py-2 text-right">Rs {formatAmount(item.rate)}</td>
                    <td className="px-3 py-2 text-right font-medium">Rs {formatAmount(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20 font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right">Rs {formatAmount(data.totalAmount)}</td>
                </tr>
                <tr className="font-medium text-emerald-400">
                  <td colSpan={3} className="px-3 py-2 text-right">Refund Received</td>
                  <td className="px-3 py-2 text-right">Rs {formatAmount(data.refundReceived)}</td>
                </tr>
              </tfoot>
            </table>
            {data.reason && <p className="text-sm text-muted-foreground">Reason: {data.reason}</p>}
            {data.notes && <p className="text-sm text-muted-foreground">Notes: {data.notes}</p>}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function PurchaseReturnsPage() {
  const [supplierId, setSupplierId] = useState<number | undefined>();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewId, setViewId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = {
    from: fromDate || undefined, to: toDate || undefined,
    supplierId: supplierId || undefined, includeReversed: true,
  };
  const { data: returns = [], isLoading } = useListPurchaseReturns(params, {
    query: { queryKey: getListPurchaseReturnsQueryKey(params) }
  });
  const { data: suppliers = [] } = useListSuppliers({ query: { queryKey: getListSuppliersQueryKey() } });
  const correctMutation = useCorrectPurchaseReturn();

  const groups = groupCorrections(returns);
  const liveGroups = groups.filter(g => !g.isVoid);
  const totalReturned = liveGroups.reduce((s, g) => s + g.head.totalAmount, 0);
  const totalRefunded = liveGroups.reduce((s, g) => s + g.head.refundReceived, 0);

  const toggleExpanded = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Correction (reverse + optionally replace) ──
  const [correcting, setCorrecting] = useState<PurchaseReturnRow | null>(null);
  const [correctLines, setCorrectLines] = useState<CorrectLine[]>([]);
  const [correctRefundReceived, setCorrectRefundReceived] = useState("");
  const [correctRefundMode, setCorrectRefundMode] = useState<string>("cash");
  const [correctNotes, setCorrectNotes] = useState("");
  const [correctVoid, setCorrectVoid] = useState(false);
  const [correctReason, setCorrectReason] = useState("");
  const [correctLoading, setCorrectLoading] = useState(false);

  const openCorrect = async (row: PurchaseReturnRow) => {
    setCorrecting(row);
    setCorrectLoading(true);
    setCorrectVoid(false);
    setCorrectReason("");
    setCorrectRefundReceived(String(row.refundReceived));
    setCorrectRefundMode(row.refundMode);
    setCorrectNotes(row.notes ?? "");
    try {
      const [detail, eligible] = await Promise.all([
        getPurchaseReturn(row.id),
        getPurchaseReturnEligibility(row.purchaseInvoiceId),
      ]);
      const ownQtyByItem = new Map(detail.items.map(i => [i.purchaseInvoiceItemId, i.qty]));
      setCorrectLines(eligible.items.map(item => ({
        purchaseInvoiceItemId: item.purchaseInvoiceItemId,
        productName: item.productName,
        unit: item.unit ?? null,
        rate: item.rate,
        maxReturnable: item.returnableQty + (ownQtyByItem.get(item.purchaseInvoiceItemId) ?? 0),
        qty: String(ownQtyByItem.get(item.purchaseInvoiceItemId) ?? 0),
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
                .map(l => ({ purchaseInvoiceItemId: l.purchaseInvoiceItemId, qty: parseFloat(l.qty) })),
              refundReceived: parseFloat(correctRefundReceived) || 0,
              refundMode: correctRefundMode as typeof PAYMENT_MODES[number],
              notes: correctNotes || undefined,
            },
      });
      queryClient.invalidateQueries({ queryKey: getListPurchaseReturnsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["cashbook"] });
      queryClient.invalidateQueries({ queryKey: ["cashbook-summary"] });
      setCorrecting(null);
      toast({ title: correctVoid ? "Purchase return voided" : "Purchase return corrected" });
    } catch {
      toast({ title: "Failed to correct purchase return", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Undo2 size={20} className="text-primary" /> Purchase Returns
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Stock returned to suppliers</p>
        </div>
        <Link href="/purchase-returns/new">
          <Button size="sm"><Plus size={14} className="mr-1" /> New Purchase Return</Button>
        </Link>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-muted-foreground text-xs mb-0.5">Total Returned</div>
          <div className="font-bold text-red-400">Rs {formatAmount(totalReturned)}</div>
        </div>
        <div className="bg-card border rounded-lg p-3 text-center">
          <div className="text-muted-foreground text-xs mb-0.5">Total Refund Received</div>
          <div className="font-bold text-emerald-400">Rs {formatAmount(totalRefunded)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Filter size={14} className="text-muted-foreground mb-2" />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Supplier</Label>
          <select
            className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background h-9"
            value={supplierId ?? ""}
            onChange={e => setSupplierId(e.target.value ? parseInt(e.target.value) : undefined)}
          >
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36 h-9 text-sm" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); setSupplierId(undefined); }}>
          Clear
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Against</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Value</th>
                <th className="text-right px-4 py-3 font-medium text-emerald-400">Refunded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Loading…</td></tr>
              )}
              {!isLoading && groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <ShoppingBag size={32} className="mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">No purchase returns in this period</p>
                    <Link href="/purchase-returns/new">
                      <Button variant="outline" size="sm" className="mt-3">Record first return</Button>
                    </Link>
                  </td>
                </tr>
              )}
              {groups.map((g) => {
                const r = g.head;
                const expanded = expandedIds.has(r.id);
                return (
                <Fragment key={r.id}>
                <tr className={cn("border-b border-border/50 hover:bg-muted/20 transition-colors", g.isVoid && "opacity-50")}>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/suppliers/${r.supplierId}`}>
                      <span className={cn("font-medium hover:text-primary cursor-pointer", g.isVoid && "line-through decoration-1")}>{r.supplierName}</span>
                    </Link>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <CorrectionBadge isVoid={g.isVoid} historyCount={g.history.length} expanded={expanded} onToggle={() => toggleExpanded(r.id)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs">
                    <Link href={`/purchases/${r.purchaseInvoiceId}`}>
                      <span className="text-primary cursor-pointer hover:underline">PUR-{r.purchaseInvoiceId}</span>
                    </Link>
                  </td>
                  <td className={cn("px-4 py-3 text-right font-medium", g.isVoid && "line-through decoration-1")}>Rs {formatAmount(r.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-400">Rs {formatAmount(r.refundReceived)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setViewId(r.id)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="View details">
                        <Eye size={13} />
                      </button>
                      {!g.isVoid && (
                        <button onClick={() => openCorrect(r)} className="p-1.5 text-muted-foreground hover:text-primary transition-colors" title="Correct this return">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-muted/10 border-b border-border/50">
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
                                <span className="line-through text-muted-foreground">Rs {formatAmount(step.previous.totalAmount)}</span>
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
      </div>

      {viewId != null && (
        <PurchaseReturnDetailDialog id={viewId} open={viewId != null} onClose={() => setViewId(null)} />
      )}

      {/* Correct Purchase Return Dialog */}
      <Dialog open={!!correcting} onOpenChange={(o) => { if (!o) setCorrecting(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 size={16} /> Correct Purchase Return #{correcting?.id}</DialogTitle>
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
                          <tr key={line.purchaseInvoiceItemId} className="border-b border-border/50">
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
                      <Label>Refund Received (Rs)</Label>
                      <Input type="number" min="0" step="0.01" value={correctRefundReceived} onChange={e => setCorrectRefundReceived(e.target.value)} className="mt-1" />
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
