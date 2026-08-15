import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetSupplier, getGetSupplierQueryKey,
  useGetSupplierLedger, getGetSupplierLedgerQueryKey,
  useGetSupplierStatement, getGetSupplierStatementQueryKey,
  useUpdateSupplier, getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate, formatDatePrint } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, MessageSquare, Pencil, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company";
import { useAuth } from "@/lib/auth";

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = parseInt(id ?? "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useCompany();
  const { user } = useAuth();

  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", ntn: "", address: "", contact: "", openingBalance: "", openingBalanceDate: ""
  });

  const { data: supplier } = useGetSupplier(supplierId, {
    query: { enabled: !!supplierId, queryKey: getGetSupplierQueryKey(supplierId) }
  });

  const ledgerParams = { from: fromDate || undefined, to: toDate || undefined };
  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger } = useGetSupplierLedger(
    supplierId, ledgerParams,
    { query: { enabled: !!supplierId, queryKey: getGetSupplierLedgerQueryKey(supplierId, ledgerParams) } }
  );

  const { refetch: fetchStatement } = useGetSupplierStatement(supplierId, {
    query: { enabled: false, queryKey: getGetSupplierStatementQueryKey(supplierId) }
  });

  const updateMutation = useUpdateSupplier();

  const handleWhatsApp = async () => {
    const { data } = await fetchStatement();
    if (data?.text) {
      await navigator.clipboard.writeText(data.text);
      toast({ title: "Statement copied!", description: "Paste it into WhatsApp." });
    }
  };

  const openEdit = () => {
    if (!supplier) return;
    setEditForm({
      name: supplier.name,
      ntn: supplier.ntn ?? "",
      address: supplier.address ?? "",
      contact: supplier.contact ?? "",
      openingBalance: String(supplier.openingBalance),
      openingBalanceDate: supplier.openingBalanceDate ?? "",
    });
    setShowEdit(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: supplierId,
        data: {
          name: editForm.name,
          ntn: editForm.ntn || undefined,
          address: editForm.address || undefined,
          contact: editForm.contact || undefined,
          openingBalance: editForm.openingBalance ? parseFloat(editForm.openingBalance) : undefined,
          openingBalanceDate: editForm.openingBalanceDate || undefined,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetSupplierQueryKey(supplierId) });
      queryClient.invalidateQueries({ queryKey: getGetSupplierLedgerQueryKey(supplierId, ledgerParams) });
      queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      setShowEdit(false);
      toast({ title: "Supplier updated" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const printDateTime = new Date().toLocaleString("en-PK", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">

      {/* ======= SCREEN-ONLY UI ======= */}
      <div className="no-print">
        {/* Header bar */}
        <div className="flex items-start gap-3 mb-4">
          <Link href="/suppliers">
            <button className="p-1.5 hover:bg-muted rounded-md transition-colors mt-1">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{supplier?.name ?? "..."}</h1>
              <button onClick={openEdit} className="p-1 text-muted-foreground hover:text-primary rounded transition-colors">
                <Pencil size={14} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-0.5">
              {supplier?.ntn && <span>NTN: {supplier.ntn}</span>}
              {supplier?.address && <span>{supplier.address}</span>}
              {supplier?.contact && <span>{supplier.contact}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleWhatsApp}>
              <MessageSquare size={14} className="mr-1.5" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer size={14} className="mr-1.5" /> Print
            </Button>
          </div>
        </div>

        {/* Date range filter */}
        <div className="flex flex-wrap items-end gap-3 mb-4 bg-card border border-card-border rounded-xl p-3">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-card border border-card-border rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-1">Opening Balance</div>
            <div className="font-semibold text-sm">Rs. {formatAmount(ledger?.openingBalance ?? 0)}</div>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Purchased</div>
            <div className="font-semibold text-sm text-red-600">Rs. {formatAmount(ledger?.totalPurchased ?? 0)}</div>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Paid</div>
            <div className="font-semibold text-sm text-emerald-600">Rs. {formatAmount(ledger?.totalPaid ?? 0)}</div>
          </div>
          <div className="bg-card border border-card-border rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-1">Closing Balance</div>
            <div className={cn("font-bold text-base", (ledger?.closingBalance ?? 0) > 0 ? "text-red-600" : "text-emerald-600")}>
              Rs. {formatAmount(ledger?.closingBalance ?? 0)}
            </div>
          </div>
        </div>

        {/* Screen ledger table */}
        <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-border bg-muted/40 text-muted-foreground">
                  <th className="px-2 py-2.5 text-center font-semibold w-8">Sr</th>
                  <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Date</th>
                  <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Transaction Type</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Remarks</th>
                  <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Invoice #</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Item(s)</th>
                  <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">Qty</th>
                  <th className="px-2 py-2.5 text-left font-semibold whitespace-nowrap">Unit</th>
                  <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap">Rate</th>
                  <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-red-700">Purchase Value</th>
                  <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-emerald-700">Paid</th>
                  <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-emerald-700">Return Value</th>
                  <th className="px-2 py-2.5 text-right font-semibold whitespace-nowrap text-red-700">Refund</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-blue-50/50">
                  <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                    {formatDate(ledger?.openingBalanceDate ?? fromDate)}
                  </td>
                  <td className="px-2 py-2 font-medium text-muted-foreground" colSpan={11}>Opening Balance</td>
                  <td className="px-2 py-2 text-right font-bold text-blue-700 whitespace-nowrap">
                    Rs. {formatAmount(ledger?.openingBalance ?? 0)}
                  </td>
                </tr>
                {ledgerLoading && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                )}
                {!ledgerLoading && ledger?.entries.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">No transactions in this period</td></tr>
                )}
                {ledger?.entries.map((entry) => {
                  // Balance direction, not just "is a purchase" — a return refund
                  // increases the payable the same way a purchase does (it undoes the
                  // return's credit), while a return itself decreases it like a payment.
                  const isDebit = entry.transactionType === "Purchase" || entry.transactionType === "Return Refund";
                  return (
                    <tr key={`${entry.srNo}-${entry.documentNo}`}
                      className={cn("hover:bg-muted/20 transition-colors", !isDebit && "bg-emerald-50/30")}>
                      <td className="px-2 py-2 text-center text-muted-foreground">{entry.srNo}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatDate(entry.date)}</td>
                      <td className={cn("px-2 py-2 font-medium whitespace-nowrap", isDebit ? "text-red-700" : "text-emerald-700")}>
                        {entry.transactionType}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground max-w-[120px] truncate" title={entry.remarks ?? undefined}>
                        {entry.remarks ?? ""}
                      </td>
                      <td className="px-2 py-2 font-mono whitespace-nowrap text-xs">{entry.documentNo ?? ""}</td>
                      <td className="px-2 py-2 font-medium max-w-[180px] truncate" title={entry.item ?? undefined}>{entry.item ?? ""}</td>
                      <td className="px-2 py-2 text-right">{entry.qtyBags != null ? formatAmount(entry.qtyBags) : "—"}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{entry.unit ?? ""}</td>
                      <td className="px-2 py-2 text-right">{entry.rateBag != null ? formatAmount(entry.rateBag) : "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-red-600">
                        {entry.purchaseValue > 0 ? formatAmount(entry.purchaseValue) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-600">
                        {entry.paidAmount > 0 ? formatAmount(entry.paidAmount) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-600">
                        {(entry.returnValue ?? 0) > 0 ? formatAmount(entry.returnValue) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-red-600">
                        {(entry.refundAmount ?? 0) > 0 ? formatAmount(entry.refundAmount) : "—"}
                      </td>
                      <td className={cn("px-2 py-2 text-right font-bold whitespace-nowrap",
                        entry.balance > 0 ? "text-red-700" : "text-emerald-700")}>
                        {formatAmount(entry.balance)}
                      </td>
                    </tr>
                  );
                })}
                {ledger && ledger.entries.length > 0 && (
                  <tr className="bg-muted/50 font-bold border-t-2 border-border">
                    <td colSpan={9} className="px-3 py-2.5 text-xs uppercase tracking-wide text-muted-foreground">Totals</td>
                    <td className="px-2 py-2.5 text-right text-red-600">{formatAmount(ledger.totalPurchased)}</td>
                    <td className="px-2 py-2.5 text-right text-emerald-600">{formatAmount(ledger.totalPaid)}</td>
                    <td className="px-2 py-2.5 text-right text-emerald-600">{formatAmount(ledger.totalReturnValue)}</td>
                    <td className="px-2 py-2.5 text-right text-red-600">{formatAmount(ledger.totalRefundAmount)}</td>
                    <td className="px-2 py-2.5 text-right"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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

        {ledger && ledger.categoryBreakdown && ledger.categoryBreakdown.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Material Category Summary
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-1.5 text-left font-semibold">Category</th>
                  <th className="pb-1.5 text-right font-semibold pl-4">Quantity</th>
                  <th className="pb-1.5 text-left font-semibold pl-4">Unit</th>
                  <th className="pb-1.5 text-right font-semibold">Amount (Rs.)</th>
                  <th className="pb-1.5 text-right font-semibold pl-4">Share %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {ledger.categoryBreakdown.map((row) => (
                  <tr key={row.category} className="hover:bg-muted/20">
                    <td className="py-1.5 font-medium">{row.category}</td>
                    <td className="py-1.5 pl-4 text-right">{formatAmount(row.qty)}</td>
                    <td className="py-1.5 pl-4 text-muted-foreground text-xs">{row.unit ?? "—"}</td>
                    <td className="py-1.5 text-right font-bold">{formatAmount(row.amount)}</td>
                    <td className="py-1.5 pl-4 text-right text-muted-foreground">{row.share}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-bold text-sm">
                  <td className="pt-2">Total Purchases</td>
                  <td className="pt-2 pl-4"></td>
                  <td className="pt-2 pl-4"></td>
                  <td className="pt-2 text-right">
                    Rs. {formatAmount(ledger.categoryBreakdown.reduce((s, r) => s + r.amount, 0))}
                  </td>
                  <td className="pt-2 pl-4 text-right text-muted-foreground">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <Link href="/purchases/new">
            <Button variant="outline" size="sm">New Purchase</Button>
          </Link>
          <Link href={`/supplier-payments?supplierId=${supplierId}`}>
            <Button variant="outline" size="sm">Record Payment</Button>
          </Link>
        </div>
      </div>{/* end no-print */}

      {/* ======= PRINT-ONLY PDF-FORMAT REPORT ======= */}
      <div className="print-only">
        {/* Company Header */}
        <div className="print-header" style={{ borderBottom: "1.5pt solid #000", paddingBottom: "4pt", marginBottom: "4pt" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", border: "none" }}>
            <tbody>
              <tr>
                <td style={{ border: "none", width: "60%", verticalAlign: "top" }}>
                  {settings.logoData ? (
                    <img src={settings.logoData} alt={settings.companyName}
                      style={{ maxHeight: `${Math.round((settings.logoScale / 100) * 50)}px`, maxWidth: "180px", objectFit: "contain", display: "block", marginBottom: "2pt" }} />
                  ) : (
                    <div style={{ fontSize: "14pt", fontWeight: "bold", fontFamily: "Arial" }}>{settings.companyName}</div>
                  )}
                  <div style={{ fontSize: "12pt", fontWeight: "bold", fontFamily: "Arial", marginTop: "2pt" }}>SUPPLIER LEDGER REPORT</div>
                </td>
                <td style={{ border: "none", width: "40%", textAlign: "right", verticalAlign: "top", fontSize: "7.5pt", fontFamily: "Arial" }}>
                  {settings.address && <div>{settings.address}</div>}
                  {settings.phone && <div>{settings.phone}</div>}
                  {settings.email && <div>{settings.email}</div>}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Supplier info block */}
          <table style={{ width: "100%", borderCollapse: "collapse", border: "none", marginTop: "4pt", fontSize: "7.5pt", fontFamily: "Arial" }}>
            <tbody>
              <tr>
                <td style={{ border: "none", width: "50%" }}>
                  <strong>Supplier :</strong> {supplier?.name}
                </td>
                <td style={{ border: "none", width: "50%", textAlign: "right" }}>
                  <strong>Opening Balance as on :</strong>&nbsp;&nbsp;
                  {formatDatePrint(ledger?.openingBalanceDate)}&nbsp;&nbsp;&nbsp;&nbsp;
                  <strong>{formatAmount(ledger?.openingBalance ?? 0)}</strong>
                </td>
              </tr>
              <tr>
                <td style={{ border: "none" }}>
                  <strong>NTN # :</strong> {supplier?.ntn ?? ""}
                  &nbsp;&nbsp;&nbsp;&nbsp;
                  <strong>Contact No. :</strong> {supplier?.contact ?? ""}
                </td>
                <td style={{ border: "none", textAlign: "right" }}>
                  <strong>From :</strong>&nbsp; {formatDatePrint(ledger?.from)}&nbsp;&nbsp;&nbsp;
                  <strong>To :</strong>&nbsp; {formatDatePrint(ledger?.to)}
                </td>
              </tr>
              {supplier?.address && (
                <tr>
                  <td style={{ border: "none" }}>
                    <strong>Address :</strong> {supplier?.address}
                  </td>
                  <td style={{ border: "none" }}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Main Ledger Table — exact PDF format */}
        <table className="print-ledger-table">
          <thead>
            <tr>
              <th className="col-center" style={{ width: "3%" }}>Sr<br/>No.</th>
              <th className="col-center" style={{ width: "6%" }}>Transaction<br/>Date</th>
              <th className="col-center" style={{ width: "10%" }}>Transaction<br/>Type</th>
              <th className="col-center" style={{ width: "10%" }}>Remarks</th>
              <th className="col-center" style={{ width: "8%" }}>Invoice<br/>#</th>
              <th className="col-center" style={{ width: "16%" }}>Item(s)</th>
              <th className="col-center" style={{ width: "6%" }}>Qty</th>
              <th className="col-center" style={{ width: "5%" }}>Unit</th>
              <th className="col-center" style={{ width: "7%" }}>Rate</th>
              <th className="col-center" style={{ width: "8%" }}>Purchase<br/>Value</th>
              <th className="col-center" style={{ width: "7%" }}>Paid<br/>Amount</th>
              <th className="col-center" style={{ width: "7%" }}>Return<br/>Value</th>
              <th className="col-center" style={{ width: "6%" }}>Refund</th>
              <th className="col-center" style={{ width: "8%" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row */}
            <tr className="opening-row">
              <td className="col-center">—</td>
              <td className="col-center">{formatDatePrint(ledger?.openingBalanceDate)}</td>
              <td colSpan={7} style={{ fontStyle: "italic" }}>Opening Balance</td>
              <td className="col-right"></td>
              <td className="col-right"></td>
              <td className="col-right"></td>
              <td className="col-right"></td>
              <td className="col-right" style={{ fontWeight: "bold" }}>{formatAmount(ledger?.openingBalance ?? 0)}</td>
            </tr>

            {ledger?.entries.map((entry) => (
              <tr key={`p-${entry.srNo}-${entry.documentNo}`}>
                <td className="col-center">{entry.srNo}</td>
                <td className="col-center" style={{ whiteSpace: "nowrap" }}>{formatDatePrint(entry.date)}</td>
                <td>{entry.transactionType}</td>
                <td style={{ maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.remarks ?? ""}
                </td>
                <td style={{ fontSize: "5.5pt", whiteSpace: "nowrap" }}>{entry.documentNo ?? ""}</td>
                <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>{entry.item ?? ""}</td>
                <td className="col-right">{entry.qtyBags != null ? entry.qtyBags.toFixed(2) : ""}</td>
                <td className="col-center" style={{ fontSize: "5.5pt" }}>{entry.unit ?? ""}</td>
                <td className="col-right">{entry.rateBag != null ? formatAmount(entry.rateBag) : ""}</td>
                <td className="col-right">{entry.purchaseValue > 0 ? formatAmount(entry.purchaseValue) : ""}</td>
                <td className="col-right">{entry.paidAmount > 0 ? formatAmount(entry.paidAmount) : ""}</td>
                <td className="col-right">{(entry.returnValue ?? 0) > 0 ? formatAmount(entry.returnValue) : ""}</td>
                <td className="col-right">{(entry.refundAmount ?? 0) > 0 ? formatAmount(entry.refundAmount) : ""}</td>
                <td className="col-right" style={{ fontWeight: "bold" }}>{formatAmount(entry.balance)}</td>
              </tr>
            ))}

            {/* Totals row */}
            {ledger && ledger.entries.length > 0 && (
              <tr className="totals-row">
                <td colSpan={9} className="col-right" style={{ paddingRight: "4pt" }}>
                  <strong>Totals :</strong>
                </td>
                <td className="col-right" style={{ fontWeight: "bold" }}>{formatAmount(ledger.totalPurchased)}</td>
                <td className="col-right" style={{ fontWeight: "bold" }}>{formatAmount(ledger.totalPaid)}</td>
                <td className="col-right" style={{ fontWeight: "bold" }}>{formatAmount(ledger.totalReturnValue)}</td>
                <td className="col-right" style={{ fontWeight: "bold" }}>{formatAmount(ledger.totalRefundAmount)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Closing balance */}
        <div className="print-closing">
          Closing Balance as on :&nbsp;&nbsp;
          {formatDatePrint(ledger?.to)}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          {formatAmount(ledger?.closingBalance ?? 0)}
        </div>

        {/* Category breakdown — print */}
        {ledger && ledger.categoryBreakdown && ledger.categoryBreakdown.length > 0 && (
          <div style={{ marginTop: "6pt", fontFamily: "Arial", fontSize: "7.5pt" }}>
            <div style={{ fontWeight: "bold", marginBottom: "3pt", borderBottom: "0.5pt solid #000", paddingBottom: "2pt" }}>
              Material Category Summary
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "none" }}>
              <thead>
                <tr style={{ backgroundColor: "#f0f0f0" }}>
                  <th style={{ border: "0.5pt solid #999", padding: "2pt 4pt", textAlign: "left" }}>Category</th>
                  <th style={{ border: "0.5pt solid #999", padding: "2pt 4pt", textAlign: "right", width: "12%" }}>Quantity</th>
                  <th style={{ border: "0.5pt solid #999", padding: "2pt 4pt", textAlign: "left", width: "12%" }}>Unit</th>
                  <th style={{ border: "0.5pt solid #999", padding: "2pt 4pt", textAlign: "right", width: "20%" }}>Amount (Rs)</th>
                  <th style={{ border: "0.5pt solid #999", padding: "2pt 4pt", textAlign: "right", width: "10%" }}>Share %</th>
                </tr>
              </thead>
              <tbody>
                {ledger.categoryBreakdown.map((row) => (
                  <tr key={row.category}>
                    <td style={{ border: "0.5pt solid #ccc", padding: "2pt 4pt" }}>{row.category}</td>
                    <td style={{ border: "0.5pt solid #ccc", padding: "2pt 4pt", textAlign: "right" }}>{formatAmount(row.qty)}</td>
                    <td style={{ border: "0.5pt solid #ccc", padding: "2pt 4pt" }}>{row.unit ?? "—"}</td>
                    <td style={{ border: "0.5pt solid #ccc", padding: "2pt 4pt", textAlign: "right" }}>{formatAmount(row.amount)}</td>
                    <td style={{ border: "0.5pt solid #ccc", padding: "2pt 4pt", textAlign: "right" }}>{row.share}%</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: "bold", backgroundColor: "#f0f0f0" }}>
                  <td style={{ border: "0.5pt solid #999", padding: "2pt 4pt" }}>Total</td>
                  <td style={{ border: "0.5pt solid #999", padding: "2pt 4pt" }}></td>
                  <td style={{ border: "0.5pt solid #999", padding: "2pt 4pt" }}></td>
                  <td style={{ border: "0.5pt solid #999", padding: "2pt 4pt", textAlign: "right" }}>
                    {formatAmount(ledger.categoryBreakdown.reduce((s, r) => s + r.amount, 0))}
                  </td>
                  <td style={{ border: "0.5pt solid #999", padding: "2pt 4pt", textAlign: "right" }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Print footer */}
        <div className="print-footer">
          <table style={{ width: "100%", borderCollapse: "collapse", border: "none" }}>
            <tbody>
              <tr>
                <td style={{ border: "none", fontSize: "6.5pt", fontFamily: "Arial" }}>
                  Printed: {printDateTime}
                </td>
                <td style={{ border: "none", textAlign: "center", fontSize: "6.5pt", fontFamily: "Arial" }}>
                  {supplier?.name}
                </td>
                <td style={{ border: "none", textAlign: "right", fontSize: "6.5pt", fontFamily: "Arial" }}>
                  Printed by: {user?.name ?? "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>{/* end print-only */}

      {/* Edit supplier dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Supplier</DialogTitle></DialogHeader>
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
              <div className="col-span-2 space-y-1.5">
                <Label>Address</Label>
                <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address" />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance (Rs.)</Label>
                <Input type="number" value={editForm.openingBalance} onChange={e => setEditForm(f => ({ ...f, openingBalance: e.target.value }))} step="0.01" />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance Date</Label>
                <Input type="date" value={editForm.openingBalanceDate} onChange={e => setEditForm(f => ({ ...f, openingBalanceDate: e.target.value }))} />
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
