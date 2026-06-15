import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  ArrowLeft, Truck, Phone, MapPin, FileText, Calendar,
  TrendingDown, Wallet, AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number) {
  return new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);
}

type PurchaseRow = {
  id: number; date: string; invoiceNo: string | null;
  totalAmount: number; paidAmount: number; balance: number;
  paymentMode: string; notes: string | null; createdAt: string;
};

type SupplierDetail = {
  id: number; name: string; contact: string | null; address: string | null;
  ntn: string | null; openingBalance: number; payableBalance: number;
  createdAt: string; invoices: PurchaseRow[];
};

async function fetchSupplier(id: string): Promise<SupplierDetail> {
  const r = await fetch(`${BASE}/api/suppliers/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

const MODE_COLORS: Record<string, string> = {
  cash: "bg-emerald-500/15 text-emerald-400",
  bank: "bg-blue-500/15 text-blue-400",
  easypaisa: "bg-green-500/15 text-green-400",
  jazzcash: "bg-red-500/15 text-red-400",
  cheque: "bg-purple-500/15 text-purple-400",
  other: "bg-slate-500/15 text-slate-400",
};

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: supplier, isLoading, isError } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => fetchSupplier(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">Loading…</div>
    );
  }

  if (isError || !supplier) {
    return (
      <div className="p-6 text-center">
        <AlertCircle size={32} className="mx-auto mb-2 text-red-400" />
        <p className="text-muted-foreground">Supplier not found</p>
        <Link href="/suppliers"><Button variant="outline" size="sm" className="mt-3">Back to Suppliers</Button></Link>
      </div>
    );
  }

  const totalBilled = supplier.invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalPaid = supplier.invoices.reduce((s, i) => s + i.paidAmount, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Back + Header */}
      <div className="flex items-start gap-3">
        <Link href="/suppliers">
          <button className="mt-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <ArrowLeft size={16} />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Truck size={18} className="text-primary" />
            {supplier.name}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            {supplier.contact && <span className="flex items-center gap-1"><Phone size={12} />{supplier.contact}</span>}
            {supplier.address && <span className="flex items-center gap-1"><MapPin size={12} />{supplier.address}</span>}
            {supplier.ntn && <span>NTN: {supplier.ntn}</span>}
          </div>
        </div>
        <Link href="/purchases/new">
          <Button size="sm">
            <FileText size={14} className="mr-1" /> New Purchase
          </Button>
        </Link>
      </div>

      {/* Balance summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-muted-foreground text-xs mb-1">Opening Balance</div>
          <div className="font-bold text-lg">Rs {fmt(supplier.openingBalance)}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-muted-foreground text-xs mb-1">Total Purchased</div>
          <div className="font-bold text-lg text-orange-400">Rs {fmt(totalBilled)}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-muted-foreground text-xs mb-1">Total Paid</div>
          <div className="font-bold text-lg text-emerald-400">Rs {fmt(totalPaid)}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-muted-foreground text-xs mb-1">Balance Due</div>
          <div className={cn("font-bold text-lg", supplier.payableBalance > 0 ? "text-red-400" : "text-emerald-400")}>
            Rs {fmt(supplier.payableBalance)}
          </div>
        </div>
      </div>

      {/* Purchase history */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Calendar size={15} className="text-muted-foreground" />
          Purchase History
          <Badge variant="outline" className="ml-auto text-xs">{supplier.invoices.length} invoices</Badge>
        </h2>

        {supplier.invoices.length === 0 ? (
          <div className="bg-card border rounded-lg p-10 text-center text-muted-foreground">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            No purchases recorded yet
          </div>
        ) : (
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mode</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                    <th className="text-right px-4 py-3 font-medium text-emerald-400">Paid</th>
                    <th className="text-right px-4 py-3 font-medium text-red-400">Balance</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{inv.date}</td>
                      <td className="px-4 py-3">
                        {inv.invoiceNo
                          ? <span className="font-medium">{inv.invoiceNo}</span>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                        {inv.notes && <div className="text-muted-foreground text-xs truncate max-w-[160px]">{inv.notes}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", MODE_COLORS[inv.paymentMode] ?? "bg-muted text-muted-foreground")}>
                          {inv.paymentMode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">Rs {fmt(inv.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">Rs {fmt(inv.paidAmount)}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold", inv.balance > 0 ? "text-red-400" : "text-emerald-400")}>
                        Rs {fmt(inv.balance)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/purchases/${inv.id}`}>
                          <button className="text-muted-foreground hover:text-primary transition-colors p-1">
                            <FileText size={13} />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 font-semibold text-sm">
                    <td colSpan={3} className="px-4 py-3 text-muted-foreground">Total</td>
                    <td className="px-4 py-3 text-right">Rs {fmt(totalBilled)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">Rs {fmt(totalPaid)}</td>
                    <td className={cn("px-4 py-3 text-right", supplier.payableBalance > 0 ? "text-red-400" : "text-emerald-400")}>
                      Rs {fmt(supplier.payableBalance)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
