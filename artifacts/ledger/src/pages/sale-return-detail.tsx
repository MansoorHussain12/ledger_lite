import { useParams, Link } from "wouter";
import { useGetSaleReturn, getGetSaleReturnQueryKey } from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Undo2 } from "lucide-react";
import { useCompany } from "@/lib/company";
import { useAuth } from "@/lib/auth";

export default function SaleReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const returnId = parseInt(id ?? "0");
  const { settings } = useCompany();
  const { user } = useAuth();

  const { data: ret, isLoading } = useGetSaleReturn(returnId, {
    query: { enabled: !!returnId, queryKey: getGetSaleReturnQueryKey(returnId) }
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!ret) return <div className="p-8 text-center text-muted-foreground">Sale return not found</div>;

  const creditedToBalance = ret.totalAmount - ret.refundPaid;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 no-print">
        <div className="flex items-center gap-3">
          <Link href="/sale-returns">
            <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <h1 className="text-xl font-bold">Sale Return #{ret.id}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer size={14} className="mr-1.5" /> Print
        </Button>
      </div>

      {/* Correction workflow banners — same neutral/low-key convention as sale-order-detail */}
      {ret.status === "reversed" && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          <Undo2 size={15} />
          This return was voided — not a live transaction.
        </div>
      )}
      {ret.status === "reversal" && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          <Undo2 size={15} />
          This is the reversal record for
          <Link href={`/sale-returns/${ret.reversesId}`}><span className="font-medium text-primary cursor-pointer hover:underline">Return #{ret.reversesId}</span></Link>
          — not a live transaction.
        </div>
      )}
      {ret.correctsId != null && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          <Undo2 size={15} />
          This return corrects
          <Link href={`/sale-returns/${ret.correctsId}`}><span className="font-medium text-primary cursor-pointer hover:underline">Return #{ret.correctsId}</span></Link>
        </div>
      )}

      {/* Document */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs p-6">
        {/* Print header */}
        <div className="print-only text-center mb-6 pb-4 border-b">
          {settings.logoData ? (
            <img src={settings.logoData} alt={settings.companyName}
              style={{ maxHeight: `${Math.round((settings.logoScale / 100) * 60)}px`, maxWidth: "220px", objectFit: "contain", display: "block", margin: "0 auto 4px" }} />
          ) : (
            <h1 className="text-2xl font-bold">{settings.companyName}</h1>
          )}
          <p className="text-sm font-semibold mt-1">SALE RETURN RECEIPT</p>
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Returned By</div>
            <div className="font-bold text-lg">{ret.customerName}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Return</div>
            <div className="font-bold">#{ret.id}</div>
            <div className="text-sm text-muted-foreground">{formatDate(ret.date)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Against{" "}
              <Link href={`/sale-orders/${ret.saleOrderId}`}>
                <span className="text-primary cursor-pointer hover:underline no-print">SO-{ret.saleOrderId}</span>
              </Link>
              <span className="hidden print:inline">SO-{ret.saleOrderId}</span>
            </div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="text-left py-2 font-semibold">Product</th>
              <th className="text-right py-2 font-semibold">Qty</th>
              <th className="text-right py-2 font-semibold">Rate</th>
              <th className="text-right py-2 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ret.items.map(item => (
              <tr key={item.id}>
                <td className="py-2.5 font-medium">
                  {item.productName}
                  {item.notes && (
                    <div className="no-print text-xs text-muted-foreground italic mt-0.5">{item.notes}</div>
                  )}
                </td>
                <td className="py-2.5 text-right text-muted-foreground">{item.qty}</td>
                <td className="py-2.5 text-right text-muted-foreground">{settings.currency} {formatAmount(item.rate)}</td>
                <td className="py-2.5 text-right font-semibold">{settings.currency} {formatAmount(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <td colSpan={3} className="pt-3 text-right">Total Return Value:</td>
              <td className="pt-3 text-right text-red-600">{settings.currency} {formatAmount(ret.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="flex justify-between items-center mb-2 text-sm">
          <span className="text-muted-foreground">Refunded Now ({ret.refundMode})</span>
          <span className="font-semibold text-emerald-600">{settings.currency} {formatAmount(ret.refundPaid)}</span>
        </div>
        {creditedToBalance > 0 && (
          <div className="flex justify-between items-center mb-4 text-sm">
            <span className="text-muted-foreground">Credited to Customer Balance</span>
            <span className="font-semibold">{settings.currency} {formatAmount(creditedToBalance)}</span>
          </div>
        )}

        {ret.reason && (
          <div className="text-sm text-muted-foreground border-t border-border pt-3">
            <span className="font-medium">Reason:</span> {ret.reason}
          </div>
        )}
        {ret.notes && (
          <div className="text-sm text-muted-foreground pt-1">
            <span className="font-medium">Notes:</span> {ret.notes}
          </div>
        )}

        <div className="print-only mt-8 pt-4 border-t text-xs text-center text-muted-foreground">
          This is a computer-generated return receipt.
        </div>
        <div className="no-print mt-4 pt-3 border-t text-xs text-muted-foreground">
          Recorded by {user?.name ?? "—"}
        </div>
      </div>
    </div>
  );
}
