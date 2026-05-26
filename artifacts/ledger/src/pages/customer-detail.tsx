import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetCustomer, getGetCustomerQueryKey,
  useGetCustomerLedger, getGetCustomerLedgerQueryKey,
  useGetCustomerStatement, getGetCustomerStatementQueryKey,
  useUpdateCustomer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, MessageSquare, Pencil, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id ?? "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", ntn: "", area: "", address: "", contact: "", creditLimit: "", openingBalance: "", openingBalanceDate: ""
  });

  const { data: customer, refetch: refetchCustomer } = useGetCustomer(customerId, {
    query: { enabled: !!customerId, queryKey: getGetCustomerQueryKey(customerId) }
  });

  const ledgerParams = { from: fromDate || undefined, to: toDate || undefined };
  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger } = useGetCustomerLedger(
    customerId,
    ledgerParams,
    { query: { enabled: !!customerId, queryKey: getGetCustomerLedgerQueryKey(customerId, ledgerParams) } }
  );

  const { refetch: fetchStatement } = useGetCustomerStatement(customerId, {
    query: { enabled: false, queryKey: getGetCustomerStatementQueryKey(customerId) }
  });

  const updateMutation = useUpdateCustomer();

  const handleWhatsApp = async () => {
    const { data } = await fetchStatement();
    if (data?.text) {
      await navigator.clipboard.writeText(data.text);
      toast({ title: "Statement copied!", description: "Paste it into WhatsApp." });
    }
  };

  const openEdit = () => {
    if (!customer) return;
    setEditForm({
      name: customer.name,
      ntn: customer.ntn ?? "",
      area: customer.area ?? "",
      address: customer.address ?? "",
      contact: customer.contact ?? "",
      creditLimit: customer.creditLimit != null ? String(customer.creditLimit) : "",
      openingBalance: String(customer.openingBalance),
      openingBalanceDate: customer.openingBalanceDate ?? "",
    });
    setShowEdit(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: customerId,
        data: {
          name: editForm.name,
          ntn: editForm.ntn || null,
          area: editForm.area || undefined,
          address: editForm.address || null,
          contact: editForm.contact || undefined,
          creditLimit: editForm.creditLimit ? parseFloat(editForm.creditLimit) : null,
          openingBalance: editForm.openingBalance ? parseFloat(editForm.openingBalance) : undefined,
          openingBalanceDate: editForm.openingBalanceDate || null,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
      queryClient.invalidateQueries({ queryKey: getGetCustomerLedgerQueryKey(customerId, ledgerParams) });
      setShowEdit(false);
      toast({ title: "Customer updated" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4 no-print">
        <Link href="/customers">
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors mt-1">
            <ArrowLeft size={18} />
          </button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{customer?.name ?? "..."}</h1>
            <button onClick={openEdit} className="p-1 text-muted-foreground hover:text-primary rounded transition-colors">
              <Pencil size={14} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-0.5">
            {customer?.ntn && <span>NTN: {customer.ntn}</span>}
            {customer?.area && <span>{customer.area}</span>}
            {customer?.address && <span>{customer.address}</span>}
            {customer?.contact && <span>{customer.contact}</span>}
          </div>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="outline" size="sm" onClick={handleWhatsApp}>
            <MessageSquare size={14} className="mr-1.5" /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={14} className="mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {/* Print Header */}
      <div className="print-only mb-4 border-b-2 border-black pb-2">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-2xl font-bold">AL-RAHMAN TRADERS</div>
            <div className="text-xs">G.T Road, Bhatar Mor, Wah Cantt</div>
            <div className="text-xs">051-6127869, 03000111903</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">CUSTOMER LEDGER REPORT</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-8 text-sm">
          <div><span className="font-semibold">Customer:</span> {customer?.name}</div>
          <div className="text-right">
            <span className="font-semibold">Opening Balance as on:</span> {formatDate(ledger?.openingBalanceDate)} — {formatAmount(ledger?.openingBalance ?? 0)}
          </div>
          {customer?.ntn && <div><span className="font-semibold">NTN #:</span> {customer.ntn}</div>}
          {customer?.contact && <div><span className="font-semibold">Contact No.:</span> {customer.contact}</div>}
          {(customer?.address || customer?.area) && <div><span className="font-semibold">Address:</span> {customer?.address || customer?.area}</div>}
          <div className="text-right">
            <span className="font-semibold">From:</span> {formatDate(ledger?.from)} &nbsp;
            <span className="font-semibold">To:</span> {formatDate(ledger?.to)}
          </div>
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3 mb-4 no-print bg-card border border-card-border rounded-xl p-3">
        <Filter size={14} className="text-muted-foreground mt-5" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>All time</Button>
        <Button size="sm" onClick={() => refetchLedger()}>Apply</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 no-print">
        <div className="bg-card border border-card-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">Opening Balance</div>
          <div className="font-semibold text-sm">Rs. {formatAmount(ledger?.openingBalance ?? 0)}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">Total Sales (SO)</div>
          <div className="font-semibold text-sm text-red-600">Rs. {formatAmount(ledger?.totalSoValue ?? 0)}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">Total Received</div>
          <div className="font-semibold text-sm text-emerald-600">Rs. {formatAmount(ledger?.totalReceived ?? 0)}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1">Closing Balance</div>
          <div className={cn("font-bold text-base", (ledger?.closingBalance ?? 0) > 0 ? "text-red-600" : "text-emerald-600")}>
            Rs. {formatAmount(ledger?.closingBalance ?? 0)}
          </div>
        </div>
      </div>

      {/* Main ledger table */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-border bg-muted/40 text-muted-foreground">
                <th className="px-2 py-2.5 text-center font-semibold w-8">Sr</th>
                <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Date</th>
                <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Transaction Type</th>
                <th className="px-2 py-2.5 text-left font-semibold">Remarks</th>
                <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Document #</th>
                <th className="px-2 py-2.5 text-left font-semibold">Item</th>
                <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Billty #</th>
                <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Vehicle #</th>
                <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">Tons</th>
                <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">Rate/Ton</th>
                <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">Bags</th>
                <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">Rate/Bag</th>
                <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-emerald-700">Received</th>
                <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">Paid</th>
                <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-red-700">SO Value</th>
                <th className="px-2 py-2.5 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Opening balance row */}
              <tr className="bg-blue-50/50">
                <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                  {formatDate(ledger?.openingBalanceDate ?? fromDate)}
                </td>
                <td className="px-2 py-2 font-medium text-muted-foreground" colSpan={13}>
                  Opening Balance
                </td>
                <td className="px-2 py-2 text-right font-bold text-blue-700 whitespace-nowrap">
                  Rs. {formatAmount(ledger?.openingBalance ?? 0)}
                </td>
              </tr>

              {ledgerLoading && (
                <tr>
                  <td colSpan={16} className="px-4 py-8 text-center text-muted-foreground">Loading...</td>
                </tr>
              )}
              {!ledgerLoading && ledger?.entries.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-4 py-8 text-center text-muted-foreground">No transactions in this period</td>
                </tr>
              )}

              {ledger?.entries.map((entry) => {
                const isSale = entry.transactionType === "Sale Order";
                const isPayment = !isSale;
                return (
                  <tr
                    key={`${entry.srNo}-${entry.date}`}
                    className={cn(
                      "hover:bg-muted/20 transition-colors",
                      isSale ? "" : "bg-emerald-50/30"
                    )}
                  >
                    <td className="px-2 py-2 text-center text-muted-foreground">{entry.srNo}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className={cn("px-2 py-2 font-medium whitespace-nowrap", isSale ? "text-red-700" : "text-emerald-700")}>
                      {entry.transactionType}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground max-w-[120px] truncate" title={entry.remarks ?? undefined}>
                      {entry.remarks ?? ""}
                    </td>
                    <td className="px-2 py-2 font-mono whitespace-nowrap">{entry.documentNo ?? ""}</td>
                    <td className="px-2 py-2 font-medium">{entry.item ?? ""}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{entry.billtyNo ?? ""}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{entry.vehicleNo ?? ""}</td>
                    <td className="px-2 py-2 text-right">
                      {entry.weightTons != null ? entry.weightTons.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {entry.rateTon != null ? formatAmount(entry.rateTon) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {entry.qtyBags != null ? formatAmount(entry.qtyBags) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {entry.rateBag != null ? formatAmount(entry.rateBag) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-emerald-600">
                      {entry.receivedAmount > 0 ? formatAmount(entry.receivedAmount) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {entry.paidAmount > 0 ? formatAmount(entry.paidAmount) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-red-600">
                      {entry.soValue > 0 ? formatAmount(entry.soValue) : "—"}
                    </td>
                    <td className={cn("px-2 py-2 text-right font-bold whitespace-nowrap",
                      entry.balance > 0 ? "text-red-700" : "text-emerald-700"
                    )}>
                      {formatAmount(entry.balance)}
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              {ledger && ledger.entries.length > 0 && (
                <tr className="bg-muted/50 font-bold border-t-2 border-border">
                  <td colSpan={8} className="px-3 py-2.5 text-xs uppercase tracking-wide text-muted-foreground">Totals</td>
                  <td className="px-2 py-2.5 text-right">{(ledger.totalTons ?? 0).toFixed(2)}</td>
                  <td colSpan={2} className="px-2 py-2.5 text-right"></td>
                  <td className="px-2 py-2.5 text-right"></td>
                  <td className="px-2 py-2.5 text-right text-emerald-600">
                    {formatAmount(ledger.totalReceived)}
                  </td>
                  <td className="px-2 py-2.5 text-right text-muted-foreground">
                    {(ledger.totalPaid ?? 0) > 0 ? formatAmount(ledger.totalPaid ?? 0) : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right text-red-600">
                    {formatAmount(ledger.totalSoValue)}
                  </td>
                  <td className="px-2 py-2.5 text-right"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closing balance */}
      {ledger && (
        <div className="mt-3 flex justify-end">
          <div className="bg-card border border-card-border rounded-xl px-5 py-3 text-sm">
            <span className="text-muted-foreground mr-3">
              Closing Balance as on {formatDate(toDate || today)}:
            </span>
            <span className={cn("text-lg font-bold", (ledger.closingBalance) > 0 ? "text-red-600" : "text-emerald-600")}>
              Rs. {formatAmount(ledger.closingBalance)}
            </span>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3 mt-4 no-print">
        <Link href={`/sale-orders/new?customerId=${customerId}`}>
          <Button variant="outline" size="sm">New Sale Order</Button>
        </Link>
        <Link href={`/payments?customerId=${customerId}`}>
          <Button variant="outline" size="sm">Record Payment</Button>
        </Link>
      </div>

      {/* Edit customer dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Name *</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>NTN #</Label>
                <Input value={editForm.ntn} onChange={e => setEditForm(f => ({ ...f, ntn: e.target.value }))} placeholder="Tax number" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Input value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))} placeholder="Phone" />
              </div>
              <div className="space-y-1.5">
                <Label>Area / City</Label>
                <Input value={editForm.area} onChange={e => setEditForm(f => ({ ...f, area: e.target.value }))} placeholder="City" />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address" />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance (Rs.)</Label>
                <Input type="number" value={editForm.openingBalance} onChange={e => setEditForm(f => ({ ...f, openingBalance: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance Date</Label>
                <Input type="date" value={editForm.openingBalanceDate} onChange={e => setEditForm(f => ({ ...f, openingBalanceDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Credit Limit (Rs.)</Label>
                <Input type="number" value={editForm.creditLimit} onChange={e => setEditForm(f => ({ ...f, creditLimit: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowEdit(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
