import { useState } from "react";
import { Link } from "wouter";
import {
  useListSaleOrders, getListSaleOrdersQueryKey, useDeleteSaleOrder, useListCustomers, getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronRight, Filter } from "lucide-react";

export default function SaleOrdersPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customerId, setCustomerId] = useState<number | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = {
    from: fromDate || undefined,
    to: toDate || undefined,
    customerId: customerId || undefined,
  };

  const { data: orders = [], isLoading } = useListSaleOrders(params, {
    query: { queryKey: getListSaleOrdersQueryKey(params) }
  });
  const { data: customers = [] } = useListCustomers(undefined, {
    query: { queryKey: getListCustomersQueryKey() }
  });
  const deleteMutation = useDeleteSaleOrder();

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this sale order?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListSaleOrdersQueryKey() });
      toast({ title: "Sale order deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const totalAmount = orders.reduce((s, o) => s + o.totalAmount, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sale Orders</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {orders.length} orders · Rs. {formatAmount(totalAmount)}
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
            {!isLoading && orders.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No sale orders found</td></tr>}
            {orders.map(o => (
              <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-muted-foreground text-xs font-mono">#{o.id}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(o.date)}</td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/customers/${o.customerId}`}>
                    <span className="hover:text-primary cursor-pointer">{o.customerName}</span>
                  </Link>
                  <div className="text-xs text-muted-foreground">{o.items.length} item{o.items.length !== 1 ? "s" : ""}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                  {o.billtyNo && <div>Billty: {o.billtyNo}</div>}
                  {o.vehicleNo && <div>Vehicle: {o.vehicleNo}</div>}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">Rs. {formatAmount(o.totalAmount)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleDelete(o.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                    <Link href={`/sale-orders/${o.id}`}>
                      <button className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                        <ChevronRight size={14} />
                      </button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
