import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useCreateSaleOrder, useListCustomers, getListCustomersQueryKey,
  useListProducts, getListProductsQueryKey, getListSaleOrdersQueryKey,
  useListLookups, getListLookupsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

interface LineItem {
  productId: number;
  productName: string;
  qty: string;
  rate: string;
  unit: string;
}

export default function SaleOrderNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = searchParams.get("customerId") ? parseInt(searchParams.get("customerId")!) : undefined;

  const [customerId, setCustomerId] = useState<number | "">(preselectedCustomerId ?? "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [billtyNo, setBilltyNo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ productId: 0, productName: "", qty: "", rate: "", unit: "" }]);

  const { data: customers = [] } = useListCustomers(undefined, { query: { queryKey: getListCustomersQueryKey() } });
  const { data: products = [] } = useListProducts({ query: { queryKey: getListProductsQueryKey() } });
  const { data: unitLookups = [] } = useListLookups("unit", { query: { queryKey: getListLookupsQueryKey("unit") } });
  const createMutation = useCreateSaleOrder();

  const handleProductChange = (idx: number, productId: number) => {
    const product = products.find(p => p.id === productId);
    setItems(prev => prev.map((item, i) =>
      i === idx
        ? { ...item, productId, productName: product?.name ?? "", rate: product ? String(product.currentRate) : "", unit: product?.unit ?? "" }
        : item
    ));
  };

  const addLine = () => setItems(prev => [...prev, { productId: 0, productName: "", qty: "", rate: "", unit: "" }]);
  const removeLine = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalAmount = items.reduce((s, item) => {
    const qty = parseFloat(item.qty) || 0;
    const rate = parseFloat(item.rate) || 0;
    return s + qty * rate;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast({ title: "Please select a customer", variant: "destructive" }); return; }
    const validItems = items.filter(i => i.productId && i.qty && parseFloat(i.qty) > 0);
    if (validItems.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }

    try {
      const order = await createMutation.mutateAsync({
        data: {
          customerId: customerId as number,
          date,
          vehicleNo: vehicleNo || undefined,
          driverName: driverName || undefined,
          billtyNo: billtyNo || undefined,
          notes: notes || undefined,
          items: validItems.map(i => ({
            productId: i.productId,
            qty: parseFloat(i.qty),
            rate: parseFloat(i.rate) || undefined,
          })),
        }
      });
      queryClient.invalidateQueries({ queryKey: getListSaleOrdersQueryKey() });
      toast({ title: "Sale order created" });
      setLocation(`/sale-orders/${order.id}`);
    } catch {
      toast({ title: "Failed to create sale order", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/sale-orders">
          <button className="p-1.5 hover:bg-muted rounded-md transition-colors">
            <ArrowLeft size={18} />
          </button>
        </Link>
        <h1 className="text-xl font-bold">New Sale Order</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header fields */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Order Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Customer *</Label>
              <select
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
                value={customerId}
                onChange={e => setCustomerId(e.target.value ? parseInt(e.target.value) : "")}
                required
              >
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle Number</Label>
              <Input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} placeholder="e.g. LHR-1234" />
            </div>
            <div className="space-y-1.5">
              <Label>Driver Name</Label>
              <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver's name" />
            </div>
            <div className="space-y-1.5">
              <Label>Billty Number</Label>
              <Input value={billtyNo} onChange={e => setBilltyNo(e.target.value)} placeholder="Billty / receipt no." />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Items</h2>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 mb-1 px-1">
            <div className="col-span-4 text-xs text-muted-foreground font-medium">Product</div>
            <div className="col-span-2 text-xs text-muted-foreground font-medium">Qty</div>
            <div className="col-span-2 text-xs text-muted-foreground font-medium">Unit</div>
            <div className="col-span-2 text-xs text-muted-foreground font-medium">Rate (Rs)</div>
            <div className="col-span-2 text-xs text-muted-foreground font-medium text-right">Amount</div>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const amt = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <select
                      className="w-full text-sm border border-border rounded-md px-2 py-2 bg-background"
                      value={item.productId || ""}
                      onChange={e => handleProductChange(idx, parseInt(e.target.value))}
                    >
                      <option value="">Select product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))}
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <select
                      className="w-full text-sm border border-border rounded-md px-2 py-2 bg-background"
                      value={item.unit}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: e.target.value } : it))}
                    >
                      <option value="">— unit —</option>
                      {unitLookups.map(u => <option key={u.id} value={u.value}>{u.value}</option>)}
                      {item.unit && !unitLookups.some(u => u.value === item.unit) && (
                        <option value={item.unit}>{item.unit}</option>
                      )}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, rate: e.target.value } : it))}
                      min="0"
                    />
                  </div>
                  <div className="col-span-1 text-right text-sm font-semibold text-muted-foreground">
                    {amt > 0 ? `Rs. ${formatAmount(amt)}` : "—"}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)} className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={addLine} className="mt-3 text-sm text-primary hover:underline flex items-center gap-1">
            <Plus size={14} /> Add another item
          </button>

          <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Amount</span>
            <span className="text-xl font-bold text-red-600">Rs. {formatAmount(totalAmount)}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/sale-orders">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Sale Order"}
          </Button>
        </div>
      </form>
    </div>
  );
}
