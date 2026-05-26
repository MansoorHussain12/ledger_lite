import { useParams, Link } from "wouter";
import { useGetSaleOrder, getGetSaleOrderQueryKey } from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

export default function SaleOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id ?? "0");

  const { data: order, isLoading } = useGetSaleOrder(orderId, {
    query: { enabled: !!orderId, queryKey: getGetSaleOrderQueryKey(orderId) }
  });

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

      {/* Invoice */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs p-6">
        {/* Print header */}
        <div className="print-only text-center mb-6 pb-4 border-b">
          <h1 className="text-2xl font-bold">AL-RAHMAN TRADERS</h1>
          <p className="text-sm text-muted-foreground">Cement Dealers</p>
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
                <td className="py-2.5 font-medium">{item.productName}</td>
                <td className="py-2.5 text-right text-muted-foreground">{item.qty}</td>
                <td className="py-2.5 text-right text-muted-foreground">Rs. {formatAmount(item.rate)}</td>
                <td className="py-2.5 text-right font-semibold">Rs. {formatAmount(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-bold">
              <td colSpan={3} className="pt-3 text-right">Total Amount:</td>
              <td className="pt-3 text-right text-red-600">Rs. {formatAmount(order.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

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
