import { Fragment, useState } from "react";
import { Link } from "wouter";
import {
  useListSaleOrders, getListSaleOrdersQueryKey, useCorrectSaleOrder, useListCustomers, getListCustomersQueryKey,
  useListProducts, getListProductsQueryKey, useListLookups, getListLookupsQueryKey,
  type SaleOrder,
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
import { Plus, Pencil, ChevronRight, Filter, Undo2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LineItem {
  productId: number;
  productName: string;
  qty: string;
  rate: string;
  unit: string;
}

export default function SaleOrdersPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Always pull the full chain (including reversed/reversal rows) — grouping needs them
  // client-side to reconstruct each transaction's history, even though only one row per
  // logical transaction ends up rendered.
  const params = {
    from: fromDate || undefined,
    to: toDate || undefined,
    customerId: customerId || undefined,
    includeReversed: true,
  };

  const { data: orders = [], isLoading } = useListSaleOrders(params, {
    query: { queryKey: getListSaleOrdersQueryKey(params) }
  });
  const { data: customers = [] } = useListCustomers(undefined, {
    query: { queryKey: getListCustomersQueryKey() }
  });
  const { data: products = [] } = useListProducts({ query: { queryKey: getListProductsQueryKey() } });
  const { data: unitLookups = [] } = useListLookups("unit", { query: { queryKey: getListLookupsQueryKey("unit") } });
  const correctMutation = useCorrectSaleOrder();

  // One row per logical transaction: `head` is its current effective state.
  const groups = groupCorrections(orders);
  const totalAmount = groups.reduce((s, g) => s + (g.isVoid ? 0 : g.head.totalAmount), 0);
  const toggleExpanded = (id: number) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Correction (reverse + optionally replace) ──
  const [correcting, setCorrecting] = useState<SaleOrder | null>(null);
  const [correctCustomerId, setCorrectCustomerId] = useState<number | "">("");
  const [correctDate, setCorrectDate] = useState("");
  const [correctVehicleNo, setCorrectVehicleNo] = useState("");
  const [correctDriverName, setCorrectDriverName] = useState("");
  const [correctBilltyNo, setCorrectBilltyNo] = useState("");
  const [correctNotes, setCorrectNotes] = useState("");
  const [correctItems, setCorrectItems] = useState<LineItem[]>([]);
  const [correctVoid, setCorrectVoid] = useState(false);
  const [correctReason, setCorrectReason] = useState("");

  const openCorrect = (o: SaleOrder) => {
    setCorrecting(o);
    setCorrectCustomerId(o.customerId);
    setCorrectDate(o.date);
    setCorrectVehicleNo(o.vehicleNo ?? "");
    setCorrectDriverName(o.driverName ?? "");
    setCorrectBilltyNo(o.billtyNo ?? "");
    setCorrectNotes(o.notes ?? "");
    setCorrectItems(o.items.map(i => ({
      productId: i.productId, productName: i.productName,
      qty: String(i.qty), rate: String(i.rate),
      unit: products.find(p => p.id === i.productId)?.unit ?? "",
    })));
    setCorrectVoid(false);
    setCorrectReason("");
  };

  const handleCorrectProductChange = (idx: number, productId: number) => {
    const product = products.find(p => p.id === productId);
    setCorrectItems(prev => prev.map((item, i) =>
      i === idx
        ? { ...item, productId, productName: product?.name ?? "", rate: product ? String(product.currentRate) : "", unit: product?.unit ?? "" }
        : item
    ));
  };
  const addCorrectLine = () => setCorrectItems(prev => [...prev, { productId: 0, productName: "", qty: "", rate: "", unit: "" }]);
  const removeCorrectLine = (idx: number) => setCorrectItems(prev => prev.filter((_, i) => i !== idx));

  const correctTotal = correctItems.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0), 0);

  const handleCorrect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correcting) return;
    if (!correctVoid) {
      const validItems = correctItems.filter(i => i.productId && i.qty && parseFloat(i.qty) > 0);
      if (!correctCustomerId || validItems.length === 0) {
        toast({ title: "Customer and at least one item are required", variant: "destructive" });
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
              customerId: correctCustomerId as number,
              date: correctDate,
              vehicleNo: correctVehicleNo || undefined,
              driverName: correctDriverName || undefined,
              billtyNo: correctBilltyNo || undefined,
              notes: correctNotes || undefined,
              items: correctItems
                .filter(i => i.productId && i.qty && parseFloat(i.qty) > 0)
                .map(i => ({ productId: i.productId, qty: parseFloat(i.qty), rate: parseFloat(i.rate) || undefined })),
            },
      });
      queryClient.invalidateQueries({ queryKey: getListSaleOrdersQueryKey() });
      setCorrecting(null);
      toast({ title: correctVoid ? "Sale order voided" : "Sale order corrected" });
    } catch {
      toast({ title: "Failed to correct sale order", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sale Orders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {groups.length} orders · Rs. {formatAmount(totalAmount)}
          </p>
        </div>
        <Link href="/sale-orders/new">
          <Button><Plus size={15} className="mr-1.5" /> New Sale Order</Button>
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
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Billty / Vehicle</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && groups.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No sale orders found</td></tr>}
            {groups.map(g => {
              const o = g.head;
              const expanded = expandedIds.has(o.id);
              return (
              <Fragment key={o.id}>
                <tr className={cn("hover:bg-muted/20 transition-colors", g.isVoid && "opacity-50")}>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">#{o.id}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(o.date)}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/customers/${o.customerId}`}>
                      <span className={cn("hover:text-primary cursor-pointer", g.isVoid && "line-through decoration-1")}>{o.customerName}</span>
                    </Link>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span>{o.items.length} item{o.items.length !== 1 ? "s" : ""}</span>
                      <CorrectionBadge isVoid={g.isVoid} historyCount={g.history.length} expanded={expanded} onToggle={() => toggleExpanded(o.id)} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                    {o.billtyNo && <div>Billty: {o.billtyNo}</div>}
                    {o.vehicleNo && <div>Vehicle: {o.vehicleNo}</div>}
                  </td>
                  <td className={cn("px-4 py-3 text-right font-semibold", g.isVoid ? "text-muted-foreground line-through decoration-1" : "text-red-600")}>Rs. {formatAmount(o.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!g.isVoid && (
                        <button onClick={() => openCorrect(o)} title="Correct this sale order" className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                          <Pencil size={14} />
                        </button>
                      )}
                      <Link href={`/sale-orders/${o.id}`}>
                        <button className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                          <ChevronRight size={14} />
                        </button>
                      </Link>
                    </div>
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
                                <span className="line-through text-muted-foreground">Rs. {formatAmount(step.previous.totalAmount)}</span>
                                {" "}<span className="text-muted-foreground">({step.previous.items.length} item{step.previous.items.length !== 1 ? "s" : ""}, #{step.previous.id})</span>
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

      {/* Correct Sale Order Dialog — reverses the original behind the scenes, never edits it */}
      <Dialog open={!!correcting} onOpenChange={(o) => { if (!o) setCorrecting(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Undo2 size={16} /> Correct Sale Order #{correcting?.id}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCorrect} className="space-y-4">
            <VoidToggle isVoid={correctVoid} onVoidChange={setCorrectVoid} reason={correctReason} onReasonChange={setCorrectReason} />
            {!correctVoid && (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Customer *</Label>
                    <select
                      className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
                      value={correctCustomerId}
                      onChange={e => setCorrectCustomerId(e.target.value ? parseInt(e.target.value) : "")}
                      required
                    >
                      <option value="">Select customer...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date *</Label>
                    <Input type="date" value={correctDate} onChange={e => setCorrectDate(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vehicle Number</Label>
                    <Input value={correctVehicleNo} onChange={e => setCorrectVehicleNo(e.target.value)} placeholder="e.g. LHR-1234" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Driver Name</Label>
                    <Input value={correctDriverName} onChange={e => setCorrectDriverName(e.target.value)} placeholder="Driver's name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Billty Number</Label>
                    <Input value={correctBilltyNo} onChange={e => setCorrectBilltyNo(e.target.value)} placeholder="Billty / receipt no." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Input value={correctNotes} onChange={e => setCorrectNotes(e.target.value)} placeholder="Optional notes" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Items</Label>
                  <div className="grid grid-cols-12 gap-2 px-1">
                    <div className="col-span-4 text-xs text-muted-foreground font-medium">Product</div>
                    <div className="col-span-2 text-xs text-muted-foreground font-medium">Qty</div>
                    <div className="col-span-2 text-xs text-muted-foreground font-medium">Unit</div>
                    <div className="col-span-2 text-xs text-muted-foreground font-medium">Rate</div>
                    <div className="col-span-2 text-xs text-muted-foreground font-medium text-right">Amount</div>
                  </div>
                  {correctItems.map((item, idx) => {
                    const amt = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4">
                          <select
                            className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                            value={item.productId || ""}
                            onChange={e => handleCorrectProductChange(idx, parseInt(e.target.value))}
                          >
                            <option value="">Select product...</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <Input type="number" value={item.qty} min="0" step="0.5"
                            onChange={e => setCorrectItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))} />
                        </div>
                        <div className="col-span-2">
                          <select
                            className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                            value={item.unit}
                            onChange={e => setCorrectItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                          >
                            <option value="">— unit —</option>
                            {unitLookups.map(u => <option key={u.id} value={u.value}>{u.value}</option>)}
                            {item.unit && !unitLookups.some(u => u.value === item.unit) && <option value={item.unit}>{item.unit}</option>}
                          </select>
                        </div>
                        <div className="col-span-1">
                          <Input type="number" value={item.rate} min="0" step="0.01"
                            onChange={e => setCorrectItems(prev => prev.map((it, i) => i === idx ? { ...it, rate: e.target.value } : it))} />
                        </div>
                        <div className="col-span-1 text-right text-xs font-semibold">{amt > 0 ? formatAmount(amt) : "—"}</div>
                        <div className="col-span-12 flex justify-end -mt-1">
                          {correctItems.length > 1 && (
                            <button type="button" onClick={() => removeCorrectLine(idx)} className="p-1 text-muted-foreground hover:text-destructive">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button type="button" onClick={addCorrectLine} className="text-sm text-primary hover:underline flex items-center gap-1">
                    <Plus size={14} /> Add another item
                  </button>
                  <div className="pt-2 border-t border-border flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Amount</span>
                    <span className="text-lg font-bold text-red-600">Rs. {formatAmount(correctTotal)}</span>
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCorrecting(null)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={correctMutation.isPending}>
                {correctMutation.isPending ? "Saving..." : correctVoid ? "Void Order" : "Save Correction"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
