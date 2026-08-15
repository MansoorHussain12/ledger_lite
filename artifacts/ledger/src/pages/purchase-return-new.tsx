import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useListPurchases, getListPurchasesQueryKey,
  useGetPurchaseReturnEligibility, getGetPurchaseReturnEligibilityQueryKey,
  useCreatePurchaseReturn, getListPurchaseReturnsQueryKey,
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

export default function PurchaseReturnNewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedInvoiceId = searchParams.get("purchaseInvoiceId") ? parseInt(searchParams.get("purchaseInvoiceId")!) : undefined;

  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState<number | undefined>(preselectedInvoiceId);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [qtyByItem, setQtyByItem] = useState<Record<number, string>>({});
  const [refundReceived, setRefundReceived] = useState("");
  const [refundMode, setRefundMode] = useState<string>("cash");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const { data: invoices = [] } = useListPurchases(undefined, {
    query: { queryKey: getListPurchasesQueryKey(), enabled: !preselectedInvoiceId }
  });

  const { data: eligible, isLoading: eligibleLoading, error: eligibleError } = useGetPurchaseReturnEligibility(
    purchaseInvoiceId ?? 0,
    { query: { enabled: !!purchaseInvoiceId, queryKey: getGetPurchaseReturnEligibilityQueryKey(purchaseInvoiceId ?? 0) } }
  );

  const createMut = useCreatePurchaseReturn();

  const lines = useMemo(() => (eligible?.items ?? []).map(item => ({
    ...item,
    qty: parseFloat(qtyByItem[item.purchaseInvoiceItemId] || "0") || 0,
  })), [eligible, qtyByItem]);

  const totalAmount = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const received = Math.min(parseFloat(refundReceived) || 0, totalAmount);

  const handleSubmit = () => {
    if (!purchaseInvoiceId) return;
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
        purchaseInvoiceId,
        date,
        items: items.map(l => ({ purchaseInvoiceItemId: l.purchaseInvoiceItemId, qty: l.qty })),
        refundReceived: received || undefined,
        refundMode: refundMode as typeof PAYMENT_MODES[number],
        reason: reason || undefined,
        notes: notes || undefined,
      },
    }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListPurchaseReturnsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPurchaseReturnEligibilityQueryKey(purchaseInvoiceId) });
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        queryClient.invalidateQueries({ queryKey: ["supplier", String(data.supplierId)] });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["cashbook"] });
        queryClient.invalidateQueries({ queryKey: ["cashbook-summary"] });
        toast({ title: `Purchase return #${data.id} recorded`, description: `Rs ${formatAmount(data.totalAmount)} against PUR-${data.purchaseInvoiceId}` });
        navigate("/purchase-returns");
      },
      onError: (e: any) => toast({ title: "Error", description: e?.message ?? "Failed to create return", variant: "destructive" }),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/purchase-returns">
          <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Undo2 size={18} className="text-primary" /> New Purchase Return
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Record stock sent back to a supplier</p>
        </div>
      </div>

      <div className="bg-card border rounded-lg p-5 space-y-5">
        {/* Purchase invoice selection */}
        <div>
          <Label>Purchase Invoice *</Label>
          {purchaseInvoiceId && eligible ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">PUR-{eligible.purchaseInvoice.id}</span>
                <span className="text-muted-foreground"> · {eligible.purchaseInvoice.supplierName} · {formatDate(eligible.purchaseInvoice.date)}</span>
              </div>
              {!preselectedInvoiceId && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => { setPurchaseInvoiceId(undefined); setQtyByItem({}); }}
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <Popover open={invoicePickerOpen} onOpenChange={setInvoicePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="mt-1 w-full h-9 text-sm text-left px-3 rounded-md border border-input bg-background flex items-center justify-between text-muted-foreground hover:border-ring transition-colors"
                >
                  Search purchase invoice…
                  <ChevronsUpDown size={13} className="shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by supplier, invoice #…" />
                  <CommandList>
                    <CommandEmpty>No posted purchase invoices found.</CommandEmpty>
                    <CommandGroup>
                      {invoices.map(inv => (
                        <CommandItem
                          key={inv.id}
                          value={`PUR-${inv.id} ${inv.supplierName} ${inv.invoiceNo ?? ""} ${inv.date}`}
                          onSelect={() => { setPurchaseInvoiceId(inv.id); setInvoicePickerOpen(false); setQtyByItem({}); }}
                        >
                          <span className="flex-1 truncate">PUR-{inv.id} · {inv.supplierName}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {formatDate(inv.date)} · Rs {formatAmount(inv.totalAmount)}
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
              {(eligibleError as any)?.error ?? "This purchase invoice can't be returned against."}
            </p>
          )}
        </div>

        {purchaseInvoiceId && (
          <div>
            <Label>Return Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 max-w-xs" />
          </div>
        )}

        {/* Items */}
        {eligibleLoading && <p className="text-sm text-muted-foreground">Loading invoice items…</p>}
        {eligible && eligible.items.length > 0 && (
          <div>
            <Label className="mb-2 block">Items to Return</Label>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Product</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Purchased</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Returned</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Returnable</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Return Qty</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Rate</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => (
                    <tr key={line.purchaseInvoiceItemId} className="border-b border-border/50">
                      <td className="px-3 py-2 font-medium">{line.productName}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.originalQty} {line.unit ?? ""}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.alreadyReturnedQty}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.returnableQty}</td>
                      <td className="px-2 py-2">
                        <Input
                          type="number" min="0" max={line.returnableQty} step="0.01"
                          value={qtyByItem[line.purchaseInvoiceItemId] ?? ""}
                          onChange={e => setQtyByItem(prev => ({ ...prev, [line.purchaseInvoiceItemId]: e.target.value }))}
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
          <p className="text-sm text-muted-foreground">Every item on this invoice has already been fully returned.</p>
        )}

        {/* Refund */}
        {purchaseInvoiceId && (
          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Refund Received (optional)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Refund Received Now (Rs)</Label>
                <Input
                  type="number" min="0" step="0.01" max={totalAmount}
                  value={refundReceived}
                  onChange={e => setRefundReceived(e.target.value)}
                  placeholder="0.00 (leave blank for credit only)"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank if this just reduces the payable balance</p>
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
              <div className="flex justify-between text-emerald-400">
                <span>Received Now</span>
                <span>Rs {formatAmount(received)}</span>
              </div>
              {totalAmount - received > 0 && (
                <div className="flex justify-between text-red-400 font-semibold border-t pt-1 mt-1">
                  <span>Credited Against Payable Balance</span>
                  <span>Rs {formatAmount(totalAmount - received)}</span>
                </div>
              )}
            </div>

            <div>
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. damaged goods, wrong batch" className="mt-1" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes" className="mt-1" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Link href="/purchase-returns"><Button variant="outline">Cancel</Button></Link>
        <Button
          onClick={handleSubmit}
          disabled={createMut.isPending || !purchaseInvoiceId || lines.every(l => l.qty <= 0)}
        >
          {createMut.isPending ? "Saving…" : "Save Purchase Return"}
        </Button>
      </div>
    </div>
  );
}
