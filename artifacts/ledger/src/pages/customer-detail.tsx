import { useParams, Link } from "wouter";
import {
  useGetCustomer, getGetCustomerQueryKey,
  useGetCustomerLedger, getGetCustomerLedgerQueryKey,
  useGetCustomerStatement, getGetCustomerStatementQueryKey,
} from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, MessageSquare, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id ?? "0");
  const { toast } = useToast();

  const { data: customer } = useGetCustomer(customerId, {
    query: { enabled: !!customerId, queryKey: getGetCustomerQueryKey(customerId) }
  });
  const { data: ledger, isLoading } = useGetCustomerLedger(customerId, {
    query: { enabled: !!customerId, queryKey: getGetCustomerLedgerQueryKey(customerId) }
  });
  const { refetch: fetchStatement } = useGetCustomerStatement(customerId, {
    query: { enabled: false, queryKey: getGetCustomerStatementQueryKey(customerId) }
  });

  const handleWhatsApp = async () => {
    const { data } = await fetchStatement();
    if (data?.text) {
      await navigator.clipboard.writeText(data.text);
      toast({ title: "Statement copied to clipboard", description: "Paste it into WhatsApp." });
    }
  };

  const overLimit = customer?.creditLimit != null && (customer?.balance ?? 0) > customer.creditLimit;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link href="/customers">
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <ArrowLeft size={18} />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{customer?.name ?? "..."}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
            {customer?.area && <span>{customer.area}</span>}
            {customer?.contact && <span>{customer.contact}</span>}
            {overLimit && (
              <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-xs">
                <AlertTriangle size={11} /> Over credit limit
              </span>
            )}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Opening Balance</div>
          <div className="font-semibold">Rs. {formatAmount(ledger?.openingBalance ?? 0)}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Sales</div>
          <div className="font-semibold text-red-600">Rs. {formatAmount(ledger?.totalDebit ?? 0)}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Payments</div>
          <div className="font-semibold text-emerald-600">Rs. {formatAmount(ledger?.totalCredit ?? 0)}</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Balance Due</div>
          <div className={cn("font-bold text-lg", (ledger?.closingBalance ?? 0) > 0 ? "text-red-600" : "text-emerald-600")}>
            Rs. {formatAmount(ledger?.closingBalance ?? 0)}
          </div>
        </div>
      </div>

      {/* Printable heading */}
      <div className="print-only mb-4">
        <h2 className="text-xl font-bold">AL-RAHMAN TRADERS</h2>
        <div className="text-sm">Customer Ledger: {customer?.name}</div>
        <div className="text-sm">Printed: {new Date().toLocaleDateString()}</div>
      </div>

      {/* Ledger Table */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">Transaction History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Debit (Dr)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Credit (Cr)</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Opening balance row */}
              <tr className="bg-muted/20">
                <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs font-medium">Opening Balance</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">—</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">—</td>
                <td className="px-4 py-2.5 text-right text-xs font-semibold">
                  Rs. {formatAmount(ledger?.openingBalance ?? 0)}
                </td>
              </tr>
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!isLoading && ledger?.entries.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No transactions yet</td></tr>
              )}
              {ledger?.entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(entry.date)}</td>
                  <td className="px-4 py-2.5 font-medium">{entry.description}</td>
                  <td className="px-4 py-2.5 text-right">
                    {entry.debit > 0 ? <span className="text-red-600 font-medium">{formatAmount(entry.debit)}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {entry.credit > 0 ? <span className="text-emerald-600 font-medium">{formatAmount(entry.credit)}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn("font-semibold", entry.balance > 0 ? "text-red-600" : "text-emerald-600")}>
                      Rs. {formatAmount(entry.balance)}
                    </span>
                  </td>
                </tr>
              ))}
              {/* Closing balance row */}
              {ledger && ledger.entries.length > 0 && (
                <tr className="bg-muted/40 font-semibold border-t-2 border-border">
                  <td colSpan={2} className="px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">Closing Balance</td>
                  <td className="px-4 py-3 text-right text-sm text-red-600">Rs. {formatAmount(ledger.totalDebit)}</td>
                  <td className="px-4 py-3 text-right text-sm text-emerald-600">Rs. {formatAmount(ledger.totalCredit)}</td>
                  <td className={cn("px-4 py-3 text-right text-sm font-bold", ledger.closingBalance > 0 ? "text-red-600" : "text-emerald-600")}>
                    Rs. {formatAmount(ledger.closingBalance)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mt-4 no-print">
        <Link href={`/sale-orders/new?customerId=${customerId}`}>
          <Button variant="outline" size="sm">New Sale Order</Button>
        </Link>
        <Link href={`/payments/new?customerId=${customerId}`}>
          <Button variant="outline" size="sm">Record Payment</Button>
        </Link>
      </div>
    </div>
  );
}
