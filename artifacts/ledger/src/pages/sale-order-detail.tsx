import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { useGetSaleOrder, getGetSaleOrderQueryKey } from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Undo2 } from "lucide-react";
import { useCompany } from "@/lib/company";
import { useAuth } from "@/lib/auth";

export default function SaleOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id ?? "0");
  const { settings } = useCompany();
  const { user } = useAuth();
  const canSeeProfit = user?.role === "owner";

  const { data: order, isLoading } = useGetSaleOrder(orderId, {
    query: { enabled: !!orderId, queryKey: getGetSaleOrderQueryKey(orderId) }
  });

  // Order profit (owner-only) — rate minus each item's own snapshotted cost price
  // (captured at sale time), summed across items. Using the frozen per-item snapshot
  // rather than the product's current cost price keeps this figure accurate to what
  // it was on the day of sale, even if the product's cost price changes later.
  const { profit: orderProfit, missingCost: profitMissingCost } = useMemo(() => {
    if (!order) return { profit: 0, missingCost: false };
    let profit = 0;
    let missingCost = false;
    for (const item of order.items) {
      const cost = item.costPrice;
      if (cost == null) { missingCost = true; continue; }
      profit += (item.rate - cost) * item.qty;
    }
    return { profit, missingCost };
  }, [order]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!order) return <div className="p-8 text-center text-muted-foreground">Order not found</div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 no-print">
        <div className="flex items-center gap-3">
          <Link href="/sale-orders">
            <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <h1 className="text-xl font-bold">Sale Order #{order.id}</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer size={14} className="mr-1.5" /> Print Invoice
        </Button>
      </div>

      {/* Correction workflow banner — a posted order is never edited/deleted in place;
          this surfaces where an order sits in that trail. Deliberately neutral/low-key —
          reserve red/alert styling for things that need the user's attention, not routine
          corrections (see the same convention on the list pages' CorrectionBadge). */}
      {order.status === "reversed" && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          <Undo2 size={15} />
          This order was voided — not a live transaction.
        </div>
      )}
      {order.status === "reversal" && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          <Undo2 size={15} />
          This is the reversal record for
          <Link href={`/sale-orders/${order.reversesId}`}><span className="font-medium text-primary cursor-pointer hover:underline">Order #{order.reversesId}</span></Link>
          — not a live transaction.
        </div>
      )}
      {order.correctsId != null && (
        <div className="no-print mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          <Undo2 size={15} />
          This order corrects
          <Link href={`/sale-orders/${order.correctsId}`}><span className="font-medium text-primary cursor-pointer hover:underline">Order #{order.correctsId}</span></Link>
        </div>
      )}

      {/* Invoice */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs p-6">
        {/* Print header */}
        <div className="print-only text-center mb-6 pb-4 border-b">
          {settings.logoData ? (
            <img src={settings.logoData} alt={settings.companyName}
              style={{ maxHeight: `${Math.round((settings.logoScale / 100) * 60)}px`, maxWidth: "220px", objectFit: "contain", display: "block", margin: "0 auto 4px" }} />
          ) : (
            <h1 className="text-2xl font-bold">{settings.companyName}</h1>
          )}
          {settings.tagline && <p className="text-sm text-muted-foreground">{settings.tagline}</p>}
          {(settings.address || settings.phone) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[settings.address, settings.phone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Bill To</div>
            <div className="font-bold text-lg">{order.customerName}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Invoice</div>
            <div className="font-bold">#{order.id}</div>
            <div className="text-sm text-muted-foreground">{formatDate(order.date)}</div>
          </div>
        </div>

        {/* Order meta */}
        {(order.vehicleNo || order.driverName || order.billtyNo) && (
          <div className="grid grid-cols-3 gap-4 mb-6 p-3 bg-muted/30 rounded-lg text-sm">
            {order.vehicleNo && (
              <div><span className="text-muted-foreground block text-xs">Vehicle No.</span>{order.vehicleNo}</div>
            )}
            {order.driverName && (
              <div><span className="text-muted-foreground block text-xs">Driver</span>{order.driverName}</div>
            )}
            {order.billtyNo && (
              <div><span className="text-muted-foreground block text-xs">Billty No.</span>{order.billtyNo}</div>
            )}
          </div>
        )}

        {/* Items table */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="text-left py-2 font-semibold">Product</th>
              <th className="text-right py-2 font-semibold">Qty (Bags)</th>
              <th className="text-right py-2 font-semibold">Rate</th>
              <th className="text-right py-2 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {order.items.map(item => (
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
              <td colSpan={3} className="pt-3 text-right">Total Amount:</td>
              <td className="pt-3 text-right text-red-600">{settings.currency} {formatAmount(order.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {canSeeProfit && (
          <div className="no-print flex justify-between items-center mb-4 text-sm">
            <span className="text-muted-foreground">
              Profit{profitMissingCost && " *"}
            </span>
            <span className={`font-semibold ${orderProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {settings.currency} {formatAmount(orderProfit)}
            </span>
          </div>
        )}
        {canSeeProfit && profitMissingCost && (
          <p className="no-print text-[10px] text-muted-foreground text-right -mt-3 mb-4">
            * excludes item(s) with no cost price set
          </p>
        )}

        {order.notes && (
          <div className="text-sm text-muted-foreground border-t border-border pt-3">
            <span className="font-medium">Notes:</span> {order.notes}
          </div>
        )}

        <div className="print-only mt-8 pt-4 border-t text-xs text-center text-muted-foreground">
          This is a computer-generated invoice.
        </div>
      </div>
    </div>
  );
}
