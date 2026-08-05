import { useState } from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetTopDebtors, getGetTopDebtorsQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetProfitBreakdown, getGetProfitBreakdownQueryKey,
} from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Users, ShoppingCart, CreditCard,
  ArrowRight, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function DashboardPage() {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { data: summary, isLoading: sumLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  const { data: debtors } = useGetTopDebtors({
    query: { queryKey: getGetTopDebtorsQueryKey() }
  });
  const { data: activity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  const todayProfit = summary?.todayProfit ?? 0;
  const profitPositive = todayProfit >= 0;

  const statCards = [
    {
      label: "Total Outstanding",
      value: `Rs. ${formatAmount(summary?.totalOutstanding ?? 0)}`,
      icon: TrendingUp,
      color: "text-red-500",
      bg: "bg-red-50",
      clickable: false,
    },
    {
      label: "Today's Collections",
      value: `Rs. ${formatAmount(summary?.todayCollections ?? 0)}`,
      icon: CreditCard,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      clickable: false,
    },
    {
      label: "Today's Sales",
      value: `Rs. ${formatAmount(summary?.todaySales ?? 0)}`,
      icon: ShoppingCart,
      color: "text-blue-600",
      bg: "bg-blue-50",
      clickable: true,
    },
    {
      label: "Today's Profit",
      value: `Rs. ${formatAmount(todayProfit)}`,
      icon: profitPositive ? TrendingUp : TrendingDown,
      color: profitPositive ? "text-emerald-600" : "text-red-500",
      bg: profitPositive ? "bg-emerald-50" : "bg-red-50",
      clickable: true,
    },
    {
      label: "Total Customers",
      value: String(summary?.totalCustomers ?? 0),
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50",
      clickable: false,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Business overview — today at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            onClick={card.clickable ? () => setShowBreakdown(true) : undefined}
            className={cn(
              "bg-card border border-card-border rounded-xl p-4 shadow-xs",
              card.clickable && "cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{card.label}</span>
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", card.bg)}>
                <card.icon size={15} className={card.color} />
              </div>
            </div>
            <div className={cn("text-xl font-bold flex items-center gap-1", sumLoading ? "text-muted-foreground" : "text-foreground")}>
              {sumLoading ? "..." : card.value}
              {card.clickable && !sumLoading && <ArrowRight size={13} className="text-muted-foreground/50" />}
            </div>
          </div>
        ))}
      </div>

      <ProfitBreakdownDialog open={showBreakdown} onOpenChange={setShowBreakdown} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Debtors */}
        <div className="bg-card border border-card-border rounded-xl shadow-xs">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">Top Debtors</h2>
            <Link href="/reports">
              <span className="text-xs text-primary flex items-center gap-1 hover:underline cursor-pointer">
                Full report <ArrowRight size={12} />
              </span>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {debtors?.length === 0 && (
              <div className="px-5 py-8 text-center text-muted-foreground text-sm">No outstanding balances</div>
            )}
            {debtors?.slice(0, 8).map((d) => (
              <Link key={d.customerId} href={`/customers/${d.customerId}`}>
                <div className="px-5 py-3 flex items-center justify-between hover:bg-muted/30 cursor-pointer transition-colors">
                  <div>
                    <div className="text-sm font-medium">{d.customerName}</div>
                    {d.area && <div className="text-xs text-muted-foreground">{d.area}</div>}
                  </div>
                  <div className="text-sm font-semibold text-red-600">Rs. {formatAmount(d.balance)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-card-border rounded-xl shadow-xs">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm">Recent Activity</h2>
          </div>
          <div className="divide-y divide-border">
            {activity?.length === 0 && (
              <div className="px-5 py-8 text-center text-muted-foreground text-sm">No recent activity</div>
            )}
            {activity?.slice(0, 10).map((item, i) => (
              <Link key={`${item.type}-${item.id}-${i}`} href={item.type === "sale" ? `/sale-orders/${item.id}` : `/payments`}>
                <div className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 cursor-pointer transition-colors">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold",
                    item.type === "sale" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"
                  )}>
                    {item.type === "sale" ? "S" : "P"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.customerName}</div>
                    <div className="text-xs text-muted-foreground">{item.description} · {formatDate(item.date)}</div>
                  </div>
                  <div className={cn("text-sm font-semibold", item.type === "sale" ? "text-red-600" : "text-emerald-600")}>
                    {item.type === "sale" ? "+" : "-"}Rs. {formatAmount(item.amount)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Today's Profit drill-down ───────────────────────────────────────────────

function ProfitBreakdownDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const params = { date: todayStr() };
  const { data, isLoading } = useGetProfitBreakdown(params, {
    query: { queryKey: getGetProfitBreakdownQueryKey(params), enabled: open },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>Today's Profit Breakdown</span>
            {data && <span className="text-sm font-normal text-muted-foreground">{formatDate(data.date)}</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="text-center py-12 text-muted-foreground text-sm">Calculating…</div>}

        {!isLoading && data && (
          <div className="space-y-4">
            {data.hasMissingCost && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-400">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>Some items don't have a cost price set — their profit isn't included in the totals below.</span>
              </div>
            )}

            {data.customers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No sales today yet</div>
            )}

            {data.customers.map((c) => (
              <div key={c.customerId} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">{c.customerName}</h3>
                  <div className="text-xs text-muted-foreground">
                    Rs. {formatAmount(c.subtotalAmount)} · <span className={c.subtotalProfit >= 0 ? "text-emerald-500" : "text-red-500"}>
                      {c.subtotalProfit >= 0 ? "+" : "-"}Rs. {formatAmount(Math.abs(c.subtotalProfit))}
                    </span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-1.5 text-left font-semibold">Item</th>
                      <th className="pb-1.5 text-left font-semibold pl-4">Category</th>
                      <th className="pb-1.5 text-right font-semibold pl-4">Qty</th>
                      <th className="pb-1.5 text-left font-semibold pl-4">Unit</th>
                      <th className="pb-1.5 text-right font-semibold pl-4">Amount (Rs.)</th>
                      <th className="pb-1.5 text-right font-semibold pl-4">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {c.items.map((item, i) => (
                      <tr key={`${item.productId}-${i}`} className="hover:bg-muted/20">
                        <td className="py-1.5 font-medium">{item.productName}</td>
                        <td className="py-1.5 pl-4 text-muted-foreground text-xs">{item.category ?? "—"}</td>
                        <td className="py-1.5 pl-4 text-right">{formatAmount(item.qty)}</td>
                        <td className="py-1.5 pl-4 text-muted-foreground text-xs">{item.unit}</td>
                        <td className="py-1.5 pl-4 text-right font-bold">{formatAmount(item.amount)}</td>
                        <td className={cn(
                          "py-1.5 pl-4 text-right",
                          item.profit == null ? "text-muted-foreground" : item.profit >= 0 ? "text-emerald-500" : "text-red-500"
                        )}>
                          {item.profit == null ? "—" : `${item.profit >= 0 ? "+" : "-"}Rs. ${formatAmount(Math.abs(item.profit))}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {data.customers.length > 0 && (
              <div className="rounded-xl border border-border bg-muted/10 px-4 py-3 flex items-center justify-between font-bold text-sm">
                <span>Total</span>
                <span>
                  Rs. {formatAmount(data.totalAmount)} · <span className={data.totalProfit >= 0 ? "text-emerald-500" : "text-red-500"}>
                    {data.totalProfit >= 0 ? "+" : "-"}Rs. {formatAmount(Math.abs(data.totalProfit))}
                  </span>
                </span>
              </div>
            )}

            <div className="text-right">
              <Link href="/reports">
                <span className="text-xs text-primary flex items-center justify-end gap-1 hover:underline cursor-pointer">
                  View full report <ArrowRight size={12} />
                </span>
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
