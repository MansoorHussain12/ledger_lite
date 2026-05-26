import { Link } from "wouter";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetTopDebtors, getGetTopDebtorsQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import { TrendingUp, Users, ShoppingCart, CreditCard, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { data: summary, isLoading: sumLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  const { data: debtors } = useGetTopDebtors({
    query: { queryKey: getGetTopDebtorsQueryKey() }
  });
  const { data: activity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() }
  });

  const statCards = [
    {
      label: "Total Outstanding",
      value: `Rs. ${formatAmount(summary?.totalOutstanding ?? 0)}`,
      icon: TrendingUp,
      color: "text-red-500",
      bg: "bg-red-50",
    },
    {
      label: "Today's Collections",
      value: `Rs. ${formatAmount(summary?.todayCollections ?? 0)}`,
      icon: CreditCard,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Today's Sales",
      value: `Rs. ${formatAmount(summary?.todaySales ?? 0)}`,
      icon: ShoppingCart,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Total Customers",
      value: String(summary?.totalCustomers ?? 0),
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Business overview — today at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-card-border rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{card.label}</span>
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", card.bg)}>
                <card.icon size={15} className={card.color} />
              </div>
            </div>
            <div className={cn("text-xl font-bold", sumLoading ? "text-muted-foreground" : "text-foreground")}>
              {sumLoading ? "..." : card.value}
            </div>
          </div>
        ))}
      </div>

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
