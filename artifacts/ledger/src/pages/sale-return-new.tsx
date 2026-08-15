import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useListSaleOrders, getListSaleOrdersQueryKey,
  useGetSaleReturnEligibility, getGetSaleReturnEligibilityQueryKey,
  useCreateSaleReturn, getListSaleReturnsQueryKey,
  getGetCustomerQueryKey, getGetCustomerLedgerQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronsUpDown, Undo2 } from "lucide-react";

const PAYMENT_MODES = ["cash", "bank", "easypaisa", "jazzcash", "cheque", "other"] as const;
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", bank: "Bank Transfer", easypaisa: "Easypaisa",
  jazzcash: "JazzCash", cheque: "Cheque", other: "Other",
};

export default function SaleReturnNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedOrderId = searchParams.get("saleOrderId") ? parseInt(searchParams.get("saleOrderId")!) : undefined;

  const [saleOrderId, setSaleOrderId] = useState<number | undefined>(preselectedOrderId);
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [qtyByItem, setQtyByItem] = useState<Record<number, string>>({});
  const [refundPaid, setRefundPaid] = useState("");
  const [refundMode, setRefundMode] = useState<string>("cash");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const { data: orders = [] } = useListSaleOrders(undefined, {
    query: { queryKey: getListSaleOrdersQueryKey(), enabled: !preselectedOrderId }
  });

  const { data: eligible, isLoading: eligibleLoading, error: eligibleError } = useGetSaleReturnEligibility(
    saleOrderId ?? 0,
    { query: { enabled: !!saleOrderId, queryKey: getGetSaleReturnEligibilityQueryKey(saleOrderId ?? 0) } }
  );

  const createMut = useCreateSaleReturn();

  const lines = useMemo(() => (eligible?.items ?? []).map(item => ({
    ...item,
    qty: parseFloat(qtyByItem[item.saleOrderItemId] || "0") || 0,
  })), [eligible, qtyByItem]);

  const totalAmount = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const paid = Math.min(parseFloat(refundPaid) || 0, totalAmount);

  const handleSubmit = () => {
    if (!saleOrderId) return;
    const items = lines.filter(l => l.qty > 0);
    if (items.length === 0) {
      toast({ title: "Enter a return quantity for at least one item", variant: "destructive" });
      return;
    }
    const overLimit = items.find(l => l.qty > l.returnableQty);
    if (overLimit) {
      toast({ title: `Cannot return more than ${overLimit.returnableQty} of ${overLimit.productName}`, variant: "destructive" });
      return;
    }

    createMut.mutate({
      data: {
        saleOrderId,
        date,
        items: items.map(l => ({ saleOrderItemId: l.saleOrderItemId, qty: l.qty })),
        refundPaid: paid || undefined,
        refundMode: refundMode as typeof PAYMENT_MODES[number],
        reason: reason || undefined,
        notes: notes || undefined,
      },
    }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListSaleReturnsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSaleReturnEligibilityQueryKey(saleOrderId) });
        queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(data.customerId) });
        queryClient.invalidateQueries({ queryKey: getGetCustomerLedgerQueryKey(data.customerId) });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["cashbook"] });
        queryClient.invalidateQueries({ queryKey: ["cashbook-summary"] });
        toast({ title: `Sale return #${data.id} recorded`, description: `Rs ${formatAmount(data.totalAmount)} against SO-${data.saleOrderId}` });
        navigate(`/sale-returns/${data.id}`);
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Failed to create return", variant: "destructive" }),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/sale-returns">
          <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Undo2 size={18} className="text-primary" /> New Sale Return
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Record goods returned against a sale order</p>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-5 space-y-5">
        {/* Sale order selection */}
        <div>
          <Label>Sale Order *</Label>
          {saleOrderId && eligible ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">SO-{eligible.saleOrder.id}</span>
                <span className="text-muted-foreground"> · {eligible.saleOrder.customerName} · {formatDate(eligible.saleOrder.date)}</span>
              </div>
              {!preselectedOrderId && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setSaleOrderId(undefined); setQtyByItem({}); }}
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <Popover open={orderPickerOpen} onOpenChange={setOrderPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-1 w-full h-9 text-sm text-left px-3 rounded-md border border-input bg-background flex items-center justify-between text-muted-foreground hover:border-ring transition-colors"
                >
                  Search sale order…
                  <ChevronsUpDown size={13} className="shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by customer, order #…" />
                  <CommandList>
                    <CommandEmpty>No posted sale orders found.</CommandEmpty>
                    <CommandGroup>
                      {orders.map(o => (
                        <CommandItem
                          key={o.id}
                          value={`SO-${o.id} ${o.customerName} ${o.date}`}
                          onSelect={() => { setSaleOrderId(o.id); setOrderPickerOpen(false); setQtyByItem({}); }}
                        >
                          <span className="flex-1 truncate">SO-{o.id} · {o.customerName}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {formatDate(o.date)} · Rs {formatAmount(o.totalAmount)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          {eligibleError && (
            <p className="text-xs text-destructive mt-1">
              {(eligibleError as any)?.error ?? "This sale order can't be returned against."}
            </p>
          )}
        </div>

        {saleOrderId && (
          <div>
            <Label>Return Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 max-w-xs" />
          </div>
        )}

        {/* Items */}
        {eligibleLoading && <p className="text-sm text-muted-foreground">Loading order items…</p>}
        {eligible && eligible.items.length > 0 && (
          <div>
            <Label className="mb-2 block">Items to Return</Label>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sold</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Returned</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Returnable</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Return Qty</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Rate</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => (
                    <tr key={line.saleOrderItemId} className="border-b border-border/50">
                      <td className="px-3 py-2 font-medium">{line.productName}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.originalQty} {line.unit ?? ""}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.alreadyReturnedQty}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.returnableQty}</td>
                      <td className="px-2 py-2">
                        <Input
                          type="number" min="0" max={line.returnableQty} step="0.01"
                          value={qtyByItem[line.saleOrderItemId] ?? ""}
                          onChange={e => setQtyByItem(prev => ({ ...prev, [line.saleOrderItemId]: e.target.value }))}
                          disabled={line.returnableQty <= 0}
                          placeholder="0"
                          className="h-8 text-sm text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">Rs {formatAmount(line.rate)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {line.qty > 0 ? `Rs ${formatAmount(line.qty * line.rate)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20 font-semibold">
                    <td colSpan={6} className="px-3 py-2 text-right text-sm text-muted-foreground">Total Return Value</td>
                    <td className="px-3 py-2 text-right text-sm">Rs {formatAmount(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {eligible && eligible.items.every(i => i.returnableQty <= 0) && (
          <p className="text-sm text-muted-foreground">Every item on this order has already been fully returned.</p>
        )}

        {/* Refund */}
        {saleOrderId && (
          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Refund (optional)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Refund Paid Now (Rs)</Label>
                <Input
                  type="number" min="0" step="0.01" max={totalAmount}
                  value={refundPaid}
                  onChange={e => setRefundPaid(e.target.value)}
                  placeholder="0.00 (leave blank for credit only)"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank if this just reduces their balance</p>
              </div>
              <div>
                <Label>Refund Mode</Label>
                <Select value={refundMode} onValueChange={setRefundMode}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map(m => <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="bg-muted/20 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Return Value</span>
                <span className="font-medium">Rs {formatAmount(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-red-400">
                <span>Refunded Now</span>
                <span>Rs {formatAmount(paid)}</span>
              </div>
              {totalAmount - paid > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold border-t pt-1 mt-1">
                  <span>Credited to Customer Balance</span>
                  <span>Rs {formatAmount(totalAmount - paid)}</span>
                </div>
              )}
            </div>

            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. damaged goods, wrong item" className="mt-1" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes" className="mt-1" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Link href="/sale-returns"><Button variant="outline">Cancel</Button></Link>
        <Button
          onClick={handleSubmit}
          disabled={createMut.isPending || !saleOrderId || lines.every(l => l.qty <= 0)}
        >
          {createMut.isPending ? "Saving…" : "Save Sale Return"}
        </Button>
      </div>
    </div>
  );
}
