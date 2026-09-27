import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useCreateSaleOrder, useListCustomers, getListCustomersQueryKey,
  useListProducts, getListProductsQueryKey, getListSaleOrdersQueryKey,
  useListLookups, getListLookupsQueryKey,
  useListInventory, getListInventoryQueryKey,
  useCreatePayment, getListPaymentsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatAmount } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/combobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Per-customer previous rate — see pos.tsx's identical helper. Kept as raw fetch (not
// generated codegen) since this endpoint isn't part of the OpenAPI spec, matching how
// the products page and POS already bypass codegen for a couple of routes.
async function fetchCustomerLastRates(
  customerId: number, productIds: number[]
): Promise<Record<number, { rate: number; date: string }>> {
  if (!productIds.length) return {};
  const r = await fetch(
    `${BASE}/api/sale-orders/last-rates?customerId=${customerId}&productIds=${productIds.join(",")}`,
    { credentials: "include" }
  );
  if (!r.ok) return {};
  return r.json();
}

// Explicit column widths for the item grid — shared by the header and every row so
// they're always pixel-aligned. Product is the only flexible track; everything else
// is sized to its content (e.g. Unit needs room for a combobox + chevron, Amount for
// "Rs. 1,150,000" without wrapping).
const ITEM_GRID_COLS = "grid-cols-[minmax(160px,1fr)_80px_90px_64px_76px_110px_120px_28px]";

interface LineItem {
  productId: number;
  productName: string;
  qty: string;
  rate: string;
  unit: string;
  notes: string;
}

export default function SaleOrderNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const canSeeProfit = user?.role === "owner";
  const queryClient = useQueryClient();

  const searchParams = new URLSearchParams(window.location.search);
  const preselectedCustomerId = searchParams.get("customerId") ? parseInt(searchParams.get("customerId")!) : undefined;

  const [customerId, setCustomerId] = useState<number | "">(preselectedCustomerId ?? "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [billtyNo, setBilltyNo] = useState("");
  const [notes, setNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ productId: 0, productName: "", qty: "", rate: "", unit: "", notes: "" }]);
  // Amount the customer is paying now, at the time of this sale order (optional — an
  // unpaid order is just added to their outstanding balance, same as before this field existed).
  const [receivedAmount, setReceivedAmount] = useState("");
  const [payMode, setPayMode] = useState<"cash" | "bank" | "cheque">("cash");
  const [bankAccount, setBankAccount] = useState("");
  const [chequeNo, setChequeNo] = useState("");

  const { data: customers = [] } = useListCustomers(undefined, { query: { queryKey: getListCustomersQueryKey() } });
  const { data: products = [] } = useListProducts({ query: { queryKey: getListProductsQueryKey() } });
  const { data: unitLookups = [] } = useListLookups("unit", { query: { queryKey: getListLookupsQueryKey("unit") } });
  const { data: inventory = [] } = useListInventory({ query: { queryKey: getListInventoryQueryKey() } });
  const createMutation = useCreateSaleOrder();
  const createPaymentMutation = useCreatePayment();

  const stockMap = useMemo(
    () => new Map<number, number>(inventory.map(p => [p.id, p.currentStock])),
    [inventory]
  );
  const selectedCustomer = customers.find(c => c.id === customerId);
  const previousBalance = selectedCustomer?.balance ?? 0;

  // Previous rate for each line's product — the rate *this customer* was last charged
  // for it, so the rate can be sanity-checked against their own history while typing.
  const itemProductIds = useMemo(
    () => Array.from(new Set(items.map(i => i.productId).filter(id => id > 0))),
    [items]
  );
  const { data: customerLastRates } = useQuery({
    queryKey: ["customer-last-rates", customerId, itemProductIds],
    queryFn: () => fetchCustomerLastRates(customerId as number, itemProductIds),
    enabled: customerId !== "" && itemProductIds.length > 0,
  });

  const handleProductChange = (idx: number, productId: number) => {
    const product = products.find(p => p.id === productId);
    setItems(prev => prev.map((item, i) =>
      i === idx
        ? { ...item, productId, productName: product?.name ?? "", rate: product ? String(product.currentRate) : "", unit: product?.unit ?? "" }
        : item
    ));
  };

  const addLine = () => setItems(prev => [...prev, { productId: 0, productName: "", qty: "", rate: "", unit: "", notes: "" }]);
  const removeLine = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalAmount = items.reduce((s, item) => {
    const qty = parseFloat(item.qty) || 0;
    const rate = parseFloat(item.rate) || 0;
    return s + qty * rate;
  }, 0);
  const discount = Math.min(parseFloat(discountAmount) || 0, totalAmount);
  const netAmount = totalAmount - discount;

  // Balance context — previous balance is the customer's balance before this order;
  // total balance is what they'll owe once this order posts; remaining is what's left
  // after applying whatever they're paying now.
  const totalBalance = previousBalance + netAmount;
  const receivedAmt = parseFloat(receivedAmount) || 0;
  const remainingAmount = totalBalance - receivedAmt;

  // Order profit (owner-only) — rate minus each product's cost price, summed across the items.
  const costPriceMap = useMemo(
    () => new Map<number, number | null | undefined>(products.map(p => [p.id, p.costPrice])),
    [products]
  );
  const { profit: orderProfit, missingCost: profitMissingCost } = useMemo(() => {
    let profit = 0;
    let missingCost = false;
    for (const item of items) {
      const qty = parseFloat(item.qty) || 0;
      const rate = parseFloat(item.rate) || 0;
      if (!item.productId || qty <= 0) continue;
      const cost = costPriceMap.get(item.productId);
      if (cost == null) { missingCost = true; continue; }
      profit += (rate - cost) * qty;
    }
    // Sale-time discount is pure revenue given up, not tied to any one product's cost.
    profit -= discount;
    return { profit, missingCost };
  }, [items, costPriceMap, discount]);

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
          discountAmount: discount || undefined,
          items: validItems.map(i => ({
            productId: i.productId,
            qty: parseFloat(i.qty),
            rate: parseFloat(i.rate) || undefined,
            notes: i.notes || undefined,
          })),
        }
      });

      if (receivedAmt > 0) {
        await createPaymentMutation.mutateAsync({
          data: {
            customerId: customerId as number,
            date,
            type: payMode === "cash" ? "cash" : "bank",
            amount: receivedAmt,
            bankAccount: bankAccount || undefined,
            chequeNo: chequeNo || undefined,
            notes: notes || undefined,
          }
        });
        queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey() });
      }

      queryClient.invalidateQueries({ queryKey: getListSaleOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
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
              <Combobox
                options={customers.map(c => ({ value: String(c.id), label: c.name }))}
                value={customerId ? String(customerId) : undefined}
                onChange={v => setCustomerId(v ? parseInt(v, 10) : "")}
                placeholder="Select customer…"
                searchPlaceholder="Search customer…"
                emptyText="No customers found."
                className="w-full"
              />
              {selectedCustomer && (
                <p className={`text-xs ${previousBalance > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                  Previous balance: Rs. {formatAmount(previousBalance)}
                </p>
              )}
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

          {/* Column headers — explicit pixel/fr tracks (not Tailwind's 12-col span
              system) so the header and each row use the exact same column widths.
              col-span arithmetic across rows with a different number of cells (e.g.
              amount+delete sharing what the header treats as one column) silently
              drifts out of alignment; a shared template can't. */}
          <div className={`grid ${ITEM_GRID_COLS} gap-2 mb-1 px-1`}>
            <div className="text-xs text-muted-foreground font-medium">Product</div>
            <div className="text-xs text-muted-foreground font-medium">Qty</div>
            <div className="text-xs text-muted-foreground font-medium">Unit</div>
            <div className="text-xs text-muted-foreground font-medium text-right">Rem.</div>
            <div className="text-xs text-muted-foreground font-medium text-right">Prev.</div>
            <div className="text-xs text-muted-foreground font-medium">Rate (Rs)</div>
            <div className="text-xs text-muted-foreground font-medium text-right">Amount</div>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const amt = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
              const product = products.find(p => p.id === item.productId);
              const isRateOverridden = !!product && item.rate !== "" && parseFloat(item.rate) !== product.currentRate;
              const previousRate = customerLastRates?.[item.productId]?.rate;
              // Stock left for this product after this line's qty — a negative value
              // flags an oversell before the order is even submitted.
              const stock = item.productId ? stockMap.get(item.productId) : undefined;
              const remainingQty = stock != null ? stock - (parseFloat(item.qty) || 0) : null;
              return (
                <div key={idx} className={`grid ${ITEM_GRID_COLS} gap-2 items-center`}>
                  <div>
                    <Combobox
                      options={products.map(p => ({ value: String(p.id), label: p.name }))}
                      value={item.productId ? String(item.productId) : undefined}
                      onChange={v => handleProductChange(idx, v ? parseInt(v, 10) : 0)}
                      placeholder="Select product…"
                      searchPlaceholder="Search product…"
                      emptyText="No products found."
                      className="h-9 w-full"
                    />
                  </div>
                  <div>
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Combobox
                      options={[
                        ...unitLookups.map(u => ({ value: u.value, label: u.value })),
                        ...(item.unit && !unitLookups.some(u => u.value === item.unit) ? [{ value: item.unit, label: item.unit }] : []),
                      ]}
                      value={item.unit || undefined}
                      onChange={v => setItems(prev => prev.map((it, i) => i === idx ? { ...it, unit: v ?? "" } : it))}
                      placeholder="— unit —"
                      searchPlaceholder="Search unit…"
                      emptyText="No units found."
                      className="h-9 w-full"
                    />
                  </div>
                  <div
                    className={`text-right text-sm truncate ${remainingQty != null && remainingQty < 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}
                    title={remainingQty != null ? formatAmount(remainingQty) : undefined}
                  >
                    {remainingQty != null ? formatAmount(remainingQty) : "—"}
                  </div>
                  <div className="text-right text-sm text-muted-foreground truncate" title={previousRate != null ? formatAmount(previousRate) : undefined}>
                    {previousRate != null ? formatAmount(previousRate) : "—"}
                  </div>
                  <div>
                    <Input
                      type="number"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, rate: e.target.value } : it))}
                      min="0"
                      step="0.01"
                      className={isRateOverridden ? "border-amber-400/70" : undefined}
                    />
                  </div>
                  <div className="text-right text-sm font-semibold text-muted-foreground truncate" title={amt > 0 ? `Rs. ${formatAmount(amt)}` : undefined}>
                    {amt > 0 ? `Rs. ${formatAmount(amt)}` : "—"}
                  </div>
                  <div className="flex justify-end">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)} className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="col-span-full">
                    <Input
                      value={item.notes}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it))}
                      placeholder="Note — e.g. reason for rate change (optional)"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={addLine} className="mt-3 text-sm text-primary hover:underline flex items-center gap-1">
            <Plus size={14} /> Add another item
          </button>

          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-sm font-medium">Rs. {formatAmount(totalAmount)}</span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <Label className="text-sm text-muted-foreground font-normal shrink-0">Discount (Rs.)</Label>
              <Input
                type="number" value={discountAmount} min="0" max={totalAmount} step="0.01"
                onChange={e => setDiscountAmount(e.target.value)}
                placeholder="0" className="h-8 w-32 text-right"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Net Amount</span>
              <span className="text-xl font-bold text-red-600">Rs. {formatAmount(netAmount)}</span>
            </div>
          </div>
          {canSeeProfit && (
            <div className="mt-1 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Profit{profitMissingCost && " *"}
              </span>
              <span className={`text-sm font-semibold ${orderProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                Rs. {formatAmount(orderProfit)}
              </span>
            </div>
          )}
          {canSeeProfit && profitMissingCost && (
            <p className="mt-1 text-[10px] text-muted-foreground text-right">
              * excludes item(s) with no cost price set
            </p>
          )}
        </div>

        {/* Balance & payment */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h2 className="font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wide">Balance & Payment</h2>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Previous Balance</span>
              <span className="text-sm font-medium">Rs. {formatAmount(previousBalance)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total Balance</span>
              <span className="text-lg font-bold">Rs. {formatAmount(totalBalance)}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Received Amount (Rs.)</Label>
              <Input
                type="number" value={receivedAmount} min="0" step="0.01"
                onChange={e => setReceivedAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={payMode} onValueChange={v => setPayMode(v as typeof payMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payMode === "bank" && (
              <div className="space-y-1.5">
                <Label>Bank Account</Label>
                <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="Account / reference" />
              </div>
            )}
            {payMode === "cheque" && (
              <div className="space-y-1.5">
                <Label>Cheque No.</Label>
                <Input value={chequeNo} onChange={e => setChequeNo(e.target.value)} placeholder="CHQ-001" />
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
            <span className="text-sm font-medium">Remaining Amount</span>
            <span className={`text-xl font-bold ${remainingAmount > 0 ? "text-amber-500" : "text-emerald-600"}`}>
              Rs. {formatAmount(remainingAmount)}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/sale-orders">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={createMutation.isPending || createPaymentMutation.isPending}>
            {createMutation.isPending || createPaymentMutation.isPending ? "Creating..." : "Create Sale Order"}
          </Button>
        </div>
      </form>
    </div>
  );
}
