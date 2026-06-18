import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Search, X, Plus, Minus, Printer, CheckCircle2,
  User, Package, AlertCircle, ChevronDown, Calendar, Truck, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCompany } from "@/lib/company";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt  = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmtD = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);

// ── Types ─────────────────────────────────────────────────────────────────────

type Customer = {
  id: number; name: string; area: string | null; contact: string | null;
  balance: number; creditLimit: number | null;
};

type Product = {
  id: number; name: string; currentRate: number; costPrice: number | null;
  openingStock: number; minStock: number; currentStock?: number; status?: string;
};

type CartItem = {
  key: string; productId: number; productName: string;
  qty: number; rate: number; amount: number;
};

type PaymentMode = "cash" | "bank" | "cheque" | "credit";

type CompletedOrder = {
  id: number; date: string; customerName: string; customerId: number;
  items: CartItem[]; totalAmount: number;
  payment: { amount: number; mode: PaymentMode } | null;
  vehicleNo: string; driverName: string; billtyNo: string;
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchCustomers(): Promise<Customer[]> {
  const r = await fetch(`${BASE}/api/customers`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function fetchProducts(): Promise<Product[]> {
  const r = await fetch(`${BASE}/api/products`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function fetchInventory(): Promise<Product[]> {
  const r = await fetch(`${BASE}/api/inventory`, { credentials: "include" });
  if (!r.ok) return [];
  return r.json();
}

// ── Customer Search Dropdown ──────────────────────────────────────────────────

function CustomerPicker({
  customers, selected, onSelect,
}: { customers: Customer[]; selected: Customer | null; onSelect: (c: Customer) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hits = customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    (c.area ?? "").toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8);

  const handleSelect = (c: Customer) => {
    onSelect(c);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {selected && !open ? (
        <div
          className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-primary/15 transition-colors"
          onClick={() => setOpen(true)}
        >
          <div>
            <div className="font-semibold text-sm">{selected.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              {selected.area && <span>{selected.area}</span>}
              <span className={cn("font-medium", selected.balance > 0 ? "text-red-400" : "text-emerald-400")}>
                Balance: Rs {fmt(Math.abs(selected.balance))} {selected.balance > 0 ? "▲" : "✓"}
              </span>
            </div>
          </div>
          <ChevronDown size={14} className="text-muted-foreground" />
        </div>
      ) : (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus={open}
            placeholder="Search customer…"
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="pl-8"
          />
        </div>
      )}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-lg shadow-xl overflow-hidden">
          {!selected || open ? (
            <div className="p-1.5 border-b">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Type to search…"
                  className="w-full pl-7 pr-3 py-1.5 text-sm bg-transparent outline-none"
                />
              </div>
            </div>
          ) : null}
          <div className="max-h-56 overflow-y-auto">
            {hits.length === 0 && <div className="px-3 py-3 text-sm text-muted-foreground">No customers found</div>}
            {hits.map(c => (
              <div
                key={c.id}
                onClick={() => handleSelect(c)}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  {c.area && <div className="text-xs text-muted-foreground">{c.area}</div>}
                </div>
                <div className={cn("text-xs font-medium", c.balance > 0 ? "text-red-400" : "text-emerald-400")}>
                  {c.balance > 0 ? `Rs ${fmt(c.balance)} due` : "Clear"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Search Bar ────────────────────────────────────────────────────────

function ProductSearchBar({
  products, stockMap, onAdd,
}: { products: Product[]; stockMap: Map<number, number>; onAdd: (p: Product) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hits = products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 10);

  const handleSelect = (p: Product) => {
    onAdd(p);
    setQ("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && hits.length === 1) handleSelect(hits[0]);
    if (e.key === "Escape") { setOpen(false); setQ(""); }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search & add product… (type name)"
          className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
        {q && (
          <button onClick={() => { setQ(""); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        )}
      </div>
      {open && q && hits.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-lg shadow-xl overflow-hidden">
          {hits.map(p => {
            const stock = stockMap.get(p.id) ?? 0;
            const isOut = stock <= 0;
            return (
              <div
                key={p.id}
                onClick={() => !isOut && handleSelect(p)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors",
                  isOut ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/30"
                )}
              >
                <div>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Rate: Rs {fmt(p.currentRate)} · Stock: {fmt(stock)} bags
                    {isOut && " · OUT OF STOCK"}
                  </div>
                </div>
                <div className="text-xs font-bold text-primary">Rs {fmt(p.currentRate)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Receipt Dialog ────────────────────────────────────────────────────────────

function ReceiptDialog({ order, onClose, onNewSale }: { order: CompletedOrder; onClose: () => void; onNewSale: () => void }) {
  const { settings } = useCompany();
  const handlePrint = () => window.print();

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-center">Sale Complete ✓</DialogTitle></DialogHeader>

        {/* Receipt */}
        <div id="receipt-print" className="border rounded-lg p-4 font-mono text-sm space-y-3">
          {/* Header */}
          <div className="text-center space-y-0.5">
            {settings.logoData ? (
              <img src={settings.logoData} alt={settings.companyName}
                style={{ maxHeight: `${Math.round((settings.logoScale / 100) * 40)}px`, maxWidth: "150px", objectFit: "contain", display: "block", margin: "0 auto" }} />
            ) : (
              <div className="font-bold text-base">{settings.companyName}</div>
            )}
            {settings.tagline && <div className="text-xs text-muted-foreground">{settings.tagline}</div>}
            {settings.address && <div className="text-xs text-muted-foreground">{settings.address}</div>}
            {settings.phone && <div className="text-xs text-muted-foreground">{settings.phone}</div>}
            <div className="text-xs text-muted-foreground">━━━━━━━━━━━━━━━━━━━━━</div>
          </div>

          {/* Meta */}
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice #</span>
              <span className="font-bold">SO-{String(order.id).padStart(5, "0")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{order.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{order.customerName}</span>
            </div>
            {order.vehicleNo && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vehicle</span>
                <span>{order.vehicleNo}</span>
              </div>
            )}
            {order.driverName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Driver</span>
                <span>{order.driverName}</span>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">━━━━━━━━━━━━━━━━━━━━━</div>

          {/* Items */}
          <div className="text-xs space-y-1">
            <div className="flex justify-between font-bold text-muted-foreground mb-1">
              <span className="flex-1">Product</span>
              <span className="w-12 text-right">Qty</span>
              <span className="w-16 text-right">Rate</span>
              <span className="w-20 text-right">Amount</span>
            </div>
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span className="flex-1 truncate pr-1">{item.productName}</span>
                <span className="w-12 text-right">{item.qty}</span>
                <span className="w-16 text-right">{fmt(item.rate)}</span>
                <span className="w-20 text-right font-medium">{fmt(item.amount)}</span>
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground">━━━━━━━━━━━━━━━━━━━━━</div>

          {/* Totals */}
          <div className="text-sm space-y-1">
            <div className="flex justify-between font-bold text-base">
              <span>Total</span>
              <span>Rs {fmt(order.totalAmount)}</span>
            </div>
            {order.payment && order.payment.amount > 0 && (
              <>
                <div className="flex justify-between text-emerald-400 text-xs">
                  <span>Paid ({order.payment.mode})</span>
                  <span>Rs {fmt(order.payment.amount)}</span>
                </div>
                {order.payment.amount < order.totalAmount && (
                  <div className="flex justify-between text-red-400 text-xs">
                    <span>Balance due</span>
                    <span>Rs {fmt(order.totalAmount - order.payment.amount)}</span>
                  </div>
                )}
                {order.payment.amount > order.totalAmount && (
                  <div className="flex justify-between text-emerald-400 text-xs">
                    <span>Change</span>
                    <span>Rs {fmt(order.payment.amount - order.totalAmount)}</span>
                  </div>
                )}
              </>
            )}
            {!order.payment && (
              <div className="flex justify-between text-amber-400 text-xs">
                <span>Credit sale</span>
                <span>Rs {fmt(order.totalAmount)} due</span>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-muted-foreground pt-1">
            Thank you for your business!
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handlePrint}>
            <Printer size={14} className="mr-1" /> Print
          </Button>
          <Button className="flex-1" onClick={onNewSale}>
            New Sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main POS Page ─────────────────────────────────────────────────────────────

export default function PosPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [date, setDate] = useState(todayStr());
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [billtyNo, setBilltyNo] = useState("");
  const [notes, setNotes] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [payMode, setPayMode] = useState<PaymentMode>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payType, setPayType] = useState<"full" | "partial" | "credit">("full");
  const [completing, setCompleting] = useState(false);
  const [receipt, setReceipt] = useState<CompletedOrder | null>(null);
  const [bankAccount, setBankAccount] = useState("");
  const [chequeNo, setChequeNo] = useState("");

  // Data
  const { data: customers = [] } = useQuery({ queryKey: ["customers-list"], queryFn: fetchCustomers });
  const { data: products = [] } = useQuery({ queryKey: ["products-list"], queryFn: fetchProducts });
  const { data: inventory = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });

  const stockMap = new Map<number, number>(inventory.map((p: any) => [p.id, p.currentStock ?? 0]));

  // Derived
  const subtotal = cart.reduce((s, i) => s + i.amount, 0);
  const totalQty  = cart.reduce((s, i) => s + i.qty, 0);

  // Auto-set pay amount when type=full
  useEffect(() => {
    if (payType === "full") setPayAmount(String(subtotal));
    if (payType === "credit") setPayAmount("0");
  }, [payType, subtotal]);

  const paidAmt  = parseFloat(payAmount) || 0;
  const change   = payType === "full" ? Math.max(0, paidAmt - subtotal) : 0;
  const balDue   = Math.max(0, subtotal - paidAmt);

  // ── Cart operations ──

  const addToCart = useCallback((p: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === p.id);
      if (existing) {
        return prev.map(i => i.productId === p.id
          ? { ...i, qty: i.qty + 1, amount: (i.qty + 1) * i.rate }
          : i
        );
      }
      return [...prev, {
        key: `${p.id}-${Date.now()}`,
        productId: p.id, productName: p.name,
        qty: 1, rate: p.currentRate, amount: p.currentRate,
      }];
    });
  }, []);

  const updateQty = (key: string, qty: number) => {
    if (qty <= 0) { removeItem(key); return; }
    setCart(prev => prev.map(i => i.key === key ? { ...i, qty, amount: qty * i.rate } : i));
  };

  const updateRate = (key: string, rate: number) => {
    setCart(prev => prev.map(i => i.key === key ? { ...i, rate, amount: i.qty * rate } : i));
  };

  const removeItem = (key: string) => {
    setCart(prev => prev.filter(i => i.key !== key));
  };

  const clearAll = () => {
    setCart([]);
    setCustomer(null);
    setPayAmount("");
    setPayType("full");
    setPayMode("cash");
    setVehicleNo("");
    setDriverName("");
    setBilltyNo("");
    setNotes("");
    setBankAccount("");
    setChequeNo("");
  };

  // ── Complete Sale ──

  const completeSale = async () => {
    if (!customer) { toast({ title: "Select a customer", variant: "destructive" }); return; }
    if (cart.length === 0) { toast({ title: "Add items to the cart", variant: "destructive" }); return; }
    setCompleting(true);
    try {
      // 1. Create sale order
      const orderRes = await fetch(`${BASE}/api/sale-orders`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          date,
          vehicleNo: vehicleNo || undefined,
          driverName: driverName || undefined,
          billtyNo: billtyNo || undefined,
          notes: notes || undefined,
          items: cart.map(i => ({ productId: i.productId, qty: i.qty, rate: i.rate })),
        }),
      });
      if (!orderRes.ok) { const e = await orderRes.json(); throw new Error(e.error ?? "Failed to create order"); }
      const order = await orderRes.json();

      // 2. Record payment if not credit
      let paymentResult = null;
      if (payType !== "credit" && paidAmt > 0) {
        const apiType = (payMode === "bank" || payMode === "cheque") ? "bank" : "cash";
        const payRes = await fetch(`${BASE}/api/payments`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: customer.id,
            date,
            type: apiType,
            amount: paidAmt,
            bankAccount: bankAccount || undefined,
            chequeNo: chequeNo || undefined,
            notes: notes || undefined,
          }),
        });
        if (payRes.ok) {
          paymentResult = { amount: paidAmt, mode: payMode };
        }
      }

      // Invalidate caches
      qc.invalidateQueries({ queryKey: ["sale-orders"] });
      qc.invalidateQueries({ queryKey: ["customers-list"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });

      setReceipt({
        id: order.id, date, customerName: customer.name, customerId: customer.id,
        items: cart, totalAmount: subtotal, payment: paymentResult,
        vehicleNo, driverName, billtyNo,
      });
    } catch (e: any) {
      toast({ title: "Sale failed", description: e.message, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  const isReady = customer && cart.length > 0;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-card flex-shrink-0">
        <ShoppingCart size={16} className="text-primary" />
        <span className="font-bold text-sm">POS Terminal</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar size={12} />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-transparent outline-none text-foreground font-medium text-xs"
          />
        </div>
        {cart.length > 0 && (
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Main split */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Products + Cart ── */}
        <div className="flex-1 flex flex-col border-r overflow-hidden min-w-0">

          {/* Product search */}
          <div className="p-3 border-b bg-muted/5">
            <ProductSearchBar products={products} stockMap={stockMap} onAdd={addToCart} />
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Package size={40} className="text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">No items yet</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Search for a product above to add it</p>
              </div>
            ) : (
              <>
                {/* Cart header */}
                <div className="grid grid-cols-[1fr_100px_110px_90px_28px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/10">
                  <span>Product</span>
                  <span className="text-right">Qty (bags)</span>
                  <span className="text-right">Rate (Rs)</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>

                {/* Cart rows */}
                <div className="divide-y">
                  {cart.map((item) => (
                    <div key={item.key} className="grid grid-cols-[1fr_100px_110px_90px_28px] gap-2 px-4 py-2.5 items-center hover:bg-muted/10 group">
                      {/* Name */}
                      <div className="font-medium text-sm truncate">{item.productName}</div>

                      {/* Qty */}
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => updateQty(item.key, item.qty - 1)}
                          className="w-5 h-5 rounded flex items-center justify-center bg-muted/30 hover:bg-muted/60 text-muted-foreground transition-colors"
                        >
                          <Minus size={10} />
                        </button>
                        <input
                          type="number"
                          value={item.qty}
                          min="0.01"
                          step="0.01"
                          onChange={e => updateQty(item.key, parseFloat(e.target.value) || 0)}
                          className="w-12 text-center text-sm bg-transparent border-b border-border/50 outline-none focus:border-primary py-0.5"
                        />
                        <button
                          onClick={() => updateQty(item.key, item.qty + 1)}
                          className="w-5 h-5 rounded flex items-center justify-center bg-muted/30 hover:bg-muted/60 text-muted-foreground transition-colors"
                        >
                          <Plus size={10} />
                        </button>
                      </div>

                      {/* Rate */}
                      <div className="flex justify-end">
                        <input
                          type="number"
                          value={item.rate}
                          min="1"
                          onChange={e => updateRate(item.key, parseFloat(e.target.value) || 0)}
                          className="w-24 text-right text-sm bg-transparent border-b border-border/50 outline-none focus:border-primary py-0.5"
                        />
                      </div>

                      {/* Amount */}
                      <div className="text-right font-semibold text-sm">
                        {fmt(item.amount)}
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeItem(item.key)}
                        className="text-muted-foreground/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Cart footer totals */}
                <div className="border-t bg-muted/10 px-4 py-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{cart.length} item{cart.length !== 1 ? "s" : ""} · {fmt(totalQty)} bags</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span className="text-primary">Rs {fmt(subtotal)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Checkout ── */}
        <div className="w-72 xl:w-80 flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-4">

            {/* Customer */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <User size={11} /> Customer *
              </Label>
              <CustomerPicker
                customers={customers}
                selected={customer}
                onSelect={setCustomer}
              />
              {!customer && (
                <p className="text-xs text-muted-foreground mt-1">Required to complete sale</p>
              )}
            </div>

            {/* Extra fields toggle */}
            <div>
              <button
                onClick={() => setShowExtra(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown size={12} className={cn("transition-transform", showExtra ? "rotate-180" : "")} />
                Vehicle / Driver details
              </button>
              {showExtra && (
                <div className="mt-2 space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Vehicle No.</Label>
                    <Input size={1} value={vehicleNo} onChange={e => setVehicleNo(e.target.value)}
                      placeholder="LHR-1234" className="mt-1 h-8 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Driver</Label>
                      <Input size={1} value={driverName} onChange={e => setDriverName(e.target.value)}
                        placeholder="Name" className="mt-1 h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Billty #</Label>
                      <Input size={1} value={billtyNo} onChange={e => setBilltyNo(e.target.value)}
                        placeholder="BL-001" className="mt-1 h-8 text-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Payment section */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Payment</Label>

              {/* Payment type */}
              <div className="grid grid-cols-3 gap-1">
                {(["full", "partial", "credit"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setPayType(t)}
                    className={cn(
                      "text-xs py-1.5 rounded border font-medium transition-colors capitalize",
                      payType === t
                        ? t === "credit" ? "border-amber-400 bg-amber-500/10 text-amber-400"
                          : "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {payType !== "credit" && (
                <>
                  {/* Payment mode */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Mode</Label>
                    <Select value={payMode} onValueChange={v => setPayMode(v as PaymentMode)}>
                      <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Amount */}
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      {payType === "full" ? "Amount Tendered" : "Partial Amount"} (Rs)
                    </Label>
                    <input
                      type="number"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      className="mt-1 w-full px-3 py-1.5 text-sm font-bold bg-card border rounded-lg outline-none focus:border-primary transition-colors text-right"
                    />
                  </div>

                  {/* Bank/Cheque extras */}
                  {payMode === "bank" && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Bank Account</Label>
                      <Input size={1} value={bankAccount} onChange={e => setBankAccount(e.target.value)}
                        placeholder="Account / reference" className="mt-1 h-8 text-sm" />
                    </div>
                  )}
                  {payMode === "cheque" && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Cheque No.</Label>
                      <Input size={1} value={chequeNo} onChange={e => setChequeNo(e.target.value)}
                        placeholder="CHQ-001" className="mt-1 h-8 text-sm" />
                    </div>
                  )}

                  {/* Change / balance */}
                  {paidAmt > 0 && subtotal > 0 && (
                    <div className="rounded-lg bg-muted/20 px-3 py-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-bold">Rs {fmt(subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="text-emerald-400 font-medium">Rs {fmt(paidAmt)}</span>
                      </div>
                      {change > 0 && (
                        <div className="flex justify-between border-t pt-1 font-bold text-emerald-400">
                          <span>Change</span><span>Rs {fmt(change)}</span>
                        </div>
                      )}
                      {balDue > 0 && payType === "partial" && (
                        <div className="flex justify-between border-t pt-1 font-bold text-amber-400">
                          <span>Balance due</span><span>Rs {fmt(balDue)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {payType === "credit" && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
                  <AlertCircle size={12} className="inline mr-1" />
                  Full amount (Rs {fmt(subtotal)}) will be added to customer credit
                </div>
              )}
            </div>
          </div>

          {/* Complete sale button */}
          <div className="p-3 border-t bg-card flex-shrink-0">
            <Button
              className="w-full h-11 text-base font-bold"
              disabled={!isReady || completing}
              onClick={completeSale}
            >
              {completing ? (
                "Processing…"
              ) : (
                <>
                  <CheckCircle2 size={16} className="mr-2" />
                  Complete Sale · Rs {fmt(subtotal)}
                </>
              )}
            </Button>
            {!customer && cart.length > 0 && (
              <p className="text-xs text-center text-muted-foreground mt-1.5 flex items-center justify-center gap-1">
                <AlertCircle size={10} /> Select a customer to continue
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Receipt */}
      {receipt && (
        <ReceiptDialog
          order={receipt}
          onClose={() => setReceipt(null)}
          onNewSale={() => { setReceipt(null); clearAll(); }}
        />
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #receipt-print { display: block !important; position: fixed; top: 0; left: 0; width: 80mm; }
        }
      `}</style>
    </div>
  );
}
