import { useState } from "react";
import {
  useGetAgingReport, getGetAgingReportQueryKey,
  useGetDailyCollectionReport, getGetDailyCollectionReportQueryKey,
  useGetMonthlySalesReport, getGetMonthlySalesReportQueryKey,
  useGetOutstandingReport, getGetOutstandingReportQueryKey,
  useGetDailyProfitReport, getGetDailyProfitReportQueryKey,
} from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, Package, ShoppingCart,
  AlertTriangle, ChevronUp, ChevronDown
} from "lucide-react";

const tabs = ["Daily Profit", "Aging", "Daily Collection", "Monthly Sales", "Outstanding"] as const;
type Tab = typeof tabs[number];

function fmt(n: number) {
  return new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function firstOfMonth() {
  const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }

function SummaryCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub?: string; color?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
        {Icon && <Icon size={15} className={color ?? "text-muted-foreground"} />}
      </div>
      <div className={cn("text-xl font-bold", color)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function MarginBadge({ value }: { value: number }) {
  const good = value >= 10;
  const ok = value >= 5;
  return (
    <span className={cn(
      "text-xs px-1.5 py-0.5 rounded font-medium",
      good ? "bg-emerald-500/15 text-emerald-400"
        : ok ? "bg-amber-500/15 text-amber-400"
          : value < 0 ? "bg-red-500/15 text-red-400"
            : "bg-slate-500/15 text-slate-400"
    )}>
      {value.toFixed(1)}%
    </span>
  );
}

function DailyProfitTab() {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [view, setView] = useState<"days" | "products">("days");

  const { data, isLoading } = useGetDailyProfitReport(
    { from, to },
    { query: { queryKey: getGetDailyProfitReportQueryKey({ from, to }) } }
  );

  const s = data?.summary;
  const hasCogs = (s?.cogs ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* Date range */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36 h-9 text-sm" />
        </div>
        {/* Quick ranges */}
        <div className="flex gap-2 pb-0.5">
          {[
            { label: "Today", f: today(), t: today() },
            { label: "This Month", f: firstOfMonth(), t: today() },
            { label: "Last 7d", f: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), t: today() },
            { label: "Last 30d", f: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), t: today() },
          ].map(r => (
            <button
              key={r.label}
              onClick={() => { setFrom(r.f); setTo(r.t); }}
              className={cn(
                "text-xs px-3 py-1.5 rounded-md border transition-colors",
                from === r.f && to === r.t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">Calculating…</div>}

      {!isLoading && s && (
        <>
          {/* No cost price warning */}
          {!hasCogs && s.revenue > 0 && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-400">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                Cost prices are not set — COGS shows 0. Set cost prices on products or record a purchase invoice to enable accurate profit calculation.
              </span>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              label="Revenue"
              value={`Rs ${fmt(s.revenue)}`}
              sub={`${s.orders} orders · ${fmt(s.qty)} bags`}
              color="text-foreground"
              icon={DollarSign}
            />
            <SummaryCard
              label="Gross Profit"
              value={`Rs ${fmt(s.grossProfit)}`}
              sub={`After COGS · ${s.grossMargin.toFixed(1)}% margin`}
              color={s.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={s.grossProfit >= 0 ? TrendingUp : TrendingDown}
            />
            <SummaryCard
              label="Expenses"
              value={`Rs ${fmt(s.expenses)}`}
              color="text-orange-400"
              icon={ShoppingCart}
            />
            <SummaryCard
              label="Net Profit"
              value={`Rs ${fmt(s.netProfit)}`}
              sub={`${s.netMargin.toFixed(1)}% margin`}
              color={s.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={s.netProfit >= 0 ? TrendingUp : TrendingDown}
            />
          </div>

          {/* COGS breakdown bar */}
          {s.revenue > 0 && (
            <div className="bg-card border rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-2 font-medium">Revenue Breakdown</div>
              <div className="flex h-6 rounded overflow-hidden text-xs font-medium">
                {s.cogs > 0 && (
                  <div
                    className="bg-slate-500/70 flex items-center justify-center text-white whitespace-nowrap overflow-hidden"
                    style={{ width: `${(s.cogs / s.revenue) * 100}%` }}
                    title={`COGS Rs ${fmt(s.cogs)}`}
                  >
                    {((s.cogs / s.revenue) * 100) > 10 ? `COGS ${((s.cogs / s.revenue) * 100).toFixed(0)}%` : ""}
                  </div>
                )}
                {s.expenses > 0 && (
                  <div
                    className="bg-orange-500/70 flex items-center justify-center text-white whitespace-nowrap overflow-hidden"
                    style={{ width: `${(s.expenses / s.revenue) * 100}%` }}
                    title={`Expenses Rs ${fmt(s.expenses)}`}
                  >
                    {((s.expenses / s.revenue) * 100) > 8 ? `Exp ${((s.expenses / s.revenue) * 100).toFixed(0)}%` : ""}
                  </div>
                )}
                {s.netProfit > 0 && (
                  <div
                    className="bg-emerald-500/70 flex items-center justify-center text-white whitespace-nowrap overflow-hidden flex-1"
                    title={`Net Profit Rs ${fmt(s.netProfit)}`}
                  >
                    {s.netMargin > 8 ? `Profit ${s.netMargin.toFixed(0)}%` : ""}
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-500/70 inline-block" />COGS Rs {fmt(s.cogs)}</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500/70 inline-block" />Expenses Rs {fmt(s.expenses)}</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70 inline-block" />Net Profit Rs {fmt(s.netProfit)}</span>
              </div>
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["days", "products"] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px capitalize",
                  view === v ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "days" ? "Day-by-Day" : "By Product"}
              </button>
            ))}
          </div>

          {/* Day-by-day table */}
          {view === "days" && (
            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Orders</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Qty</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">COGS</th>
                      <th className="text-right px-4 py-3 font-medium text-emerald-400">Gross Profit</th>
                      <th className="text-right px-4 py-3 font-medium text-orange-400 hidden md:table-cell">Expenses</th>
                      <th className="text-right px-4 py-3 font-medium text-primary">Net Profit</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-muted-foreground">
                          No sales or expenses in this period
                        </td>
                      </tr>
                    )}
                    {data.days.map(d => (
                      <tr key={d.date} className={cn(
                        "border-b border-border/50 hover:bg-muted/20 transition-colors",
                        d.netProfit < 0 ? "bg-red-500/5" : ""
                      )}>
                        <td className="px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{d.date}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">{d.orders}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">{fmt(d.qty)}</td>
                        <td className="px-4 py-2.5 text-right font-medium">Rs {fmt(d.revenue)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground hidden lg:table-cell">Rs {fmt(d.cogs)}</td>
                        <td className={cn("px-4 py-2.5 text-right font-medium", d.grossProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                          Rs {fmt(d.grossProfit)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-orange-400 hidden md:table-cell">
                          {d.expenses > 0 ? `Rs ${fmt(d.expenses)}` : "—"}
                        </td>
                        <td className={cn("px-4 py-2.5 text-right font-semibold", d.netProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                          Rs {fmt(d.netProfit)}
                        </td>
                        <td className="px-4 py-2.5 text-right hidden lg:table-cell">
                          <MarginBadge value={d.netMargin} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {data.days.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/30 font-semibold text-sm border-t">
                        <td className="px-4 py-3 text-muted-foreground">Total</td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{s.orders}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{fmt(s.qty)}</td>
                        <td className="px-4 py-3 text-right">Rs {fmt(s.revenue)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">Rs {fmt(s.cogs)}</td>
                        <td className={cn("px-4 py-3 text-right", s.grossProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                          Rs {fmt(s.grossProfit)}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-400 hidden md:table-cell">Rs {fmt(s.expenses)}</td>
                        <td className={cn("px-4 py-3 text-right", s.netProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                          Rs {fmt(s.netProfit)}
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <MarginBadge value={s.netMargin} />
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* By Product table */}
          {view === "products" && (
            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty Sold</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">COGS</th>
                      <th className="text-right px-4 py-3 font-medium text-emerald-400">Profit</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byProduct.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No product sales in this period</td></tr>
                    )}
                    {data.byProduct.map(p => (
                      <tr key={p.productId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{p.productName}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{fmt(p.qty)}</td>
                        <td className="px-4 py-2.5 text-right">Rs {fmt(p.revenue)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">Rs {fmt(p.cogs)}</td>
                        <td className={cn("px-4 py-2.5 text-right font-semibold", p.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                          Rs {fmt(p.profit)}
                        </td>
                        <td className="px-4 py-2.5 text-right"><MarginBadge value={p.margin} /></td>
                      </tr>
                    ))}
                  </tbody>
                  {data.byProduct.length > 1 && (
                    <tfoot>
                      <tr className="bg-muted/30 font-semibold text-sm border-t">
                        <td className="px-4 py-3">Total</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{fmt(s.qty)}</td>
                        <td className="px-4 py-3 text-right">Rs {fmt(s.revenue)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">Rs {fmt(s.cogs)}</td>
                        <td className={cn("px-4 py-3 text-right", s.grossProfit >= 0 ? "text-emerald-400" : "text-red-400")}>
                          Rs {fmt(s.grossProfit)}
                        </td>
                        <td className="px-4 py-3 text-right"><MarginBadge value={s.grossMargin} /></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Daily Profit");
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split("T")[0]);
  const [salesYear, setSalesYear] = useState(new Date().getFullYear());
  const [salesMonth, setSalesMonth] = useState(new Date().getMonth() + 1);

  const { data: aging = [] } = useGetAgingReport({ query: { queryKey: getGetAgingReportQueryKey() } });
  const { data: collection } = useGetDailyCollectionReport(
    { date: collectionDate },
    { query: { queryKey: getGetDailyCollectionReportQueryKey({ date: collectionDate }) } }
  );
  const { data: monthly } = useGetMonthlySalesReport(
    { year: salesYear, month: salesMonth },
    { query: { queryKey: getGetMonthlySalesReportQueryKey({ year: salesYear, month: salesMonth }) } }
  );
  const { data: outstanding = [] } = useGetOutstandingReport({ query: { queryKey: getGetOutstandingReportQueryKey() } });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Business analytics and summaries</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Daily Profit ── */}
      {activeTab === "Daily Profit" && <DailyProfitTab />}

      {/* ── Aging ── */}
      {activeTab === "Aging" && (
        <div>
          <div className="mb-4 text-sm text-muted-foreground">
            Receivables aging · Total: Rs. {formatAmount(aging.reduce((s, r) => s + r.balance, 0))}
          </div>
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Due</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">0-30d</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">31-60d</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">61-90d</th>
                  <th className="text-right px-4 py-3 font-medium text-red-400">90+d</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {aging.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No outstanding balances</td></tr>}
                {aging.map(r => (
                  <tr key={r.customerId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.customerName}</div>
                      {r.area && <div className="text-xs text-muted-foreground">{r.area}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-400">Rs. {formatAmount(r.balance)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.days0to30 > 0 ? formatAmount(r.days0to30) : "—"}</td>
                    <td className="px-4 py-3 text-right text-amber-400">{r.days31to60 > 0 ? formatAmount(r.days31to60) : "—"}</td>
                    <td className="px-4 py-3 text-right text-orange-400">{r.days61to90 > 0 ? formatAmount(r.days61to90) : "—"}</td>
                    <td className="px-4 py-3 text-right text-red-400 font-semibold">{r.daysOver90 > 0 ? formatAmount(r.daysOver90) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Daily Collection ── */}
      {activeTab === "Daily Collection" && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Date</label>
              <Input type="date" value={collectionDate} onChange={e => setCollectionDate(e.target.value)} className="w-40" />
            </div>
          </div>
          {collection && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-card border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Cash Collections</div>
                  <div className="text-xl font-bold text-emerald-400">Rs. {formatAmount(collection.totalCash)}</div>
                </div>
                <div className="bg-card border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Bank Collections</div>
                  <div className="text-xl font-bold text-blue-400">Rs. {formatAmount(collection.totalBank)}</div>
                </div>
                <div className="bg-card border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total</div>
                  <div className="text-xl font-bold">Rs. {formatAmount(collection.total)}</div>
                </div>
              </div>
              <div className="bg-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Reference</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {collection.payments.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No collections on this date</td></tr>}
                    {collection.payments.map(p => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-medium">{p.customerName}</td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">{p.type}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                          {p.chequeNo && `Chq: ${p.chequeNo}`}
                          {p.bankAccount && ` · ${p.bankAccount}`}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-400">Rs. {formatAmount(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Monthly Sales ── */}
      {activeTab === "Monthly Sales" && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Month</label>
              <Input type="number" value={salesMonth} onChange={e => setSalesMonth(parseInt(e.target.value))} min={1} max={12} className="w-20" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Year</label>
              <Input type="number" value={salesYear} onChange={e => setSalesYear(parseInt(e.target.value))} className="w-28" />
            </div>
          </div>
          {monthly && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-card border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total Sales</div>
                  <div className="text-xl font-bold text-orange-400">Rs. {formatAmount(monthly.totalAmount)}</div>
                </div>
                <div className="bg-card border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total Qty (Bags)</div>
                  <div className="text-xl font-bold">{formatAmount(monthly.totalQty)}</div>
                </div>
              </div>
              <div className="bg-card border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty (Bags)</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {monthly.byProduct.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No sales this month</td></tr>}
                    {monthly.byProduct.map(r => (
                      <tr key={r.productId}>
                        <td className="px-4 py-3 font-medium">{r.productName}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatAmount(r.totalQty)}</td>
                        <td className="px-4 py-3 text-right font-semibold">Rs. {formatAmount(r.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Outstanding ── */}
      {activeTab === "Outstanding" && (
        <div>
          <div className="mb-4 text-sm text-muted-foreground">
            {outstanding.length} customers · Total: Rs. {formatAmount(outstanding.reduce((s, r) => s + r.balance, 0))}
          </div>
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Credit Limit</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Last Sale</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Last Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {outstanding.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No outstanding balances</td></tr>}
                {outstanding.map(r => (
                  <tr key={r.customerId} className={cn("hover:bg-muted/20 transition-colors", r.isOverLimit ? "bg-amber-500/5" : "")}>
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {r.customerName}
                        {r.isOverLimit && <span className="text-xs text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">Over limit</span>}
                      </div>
                      {r.area && <div className="text-xs text-muted-foreground">{r.area}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-400">Rs. {formatAmount(r.balance)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                      {r.creditLimit != null ? `Rs. ${formatAmount(r.creditLimit)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{formatDate(r.lastSaleDate ?? null)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{formatDate(r.lastPaymentDate ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
