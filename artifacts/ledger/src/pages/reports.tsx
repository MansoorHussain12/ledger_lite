import { useState } from "react";
import {
  useGetAgingReport, getGetAgingReportQueryKey,
  useGetDailyCollectionReport, getGetDailyCollectionReportQueryKey,
  useGetMonthlySalesReport, getGetMonthlySalesReportQueryKey,
  useGetOutstandingReport, getGetOutstandingReportQueryKey,
} from "@workspace/api-client-react";
import { formatAmount, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const tabs = ["Aging", "Daily Collection", "Monthly Sales", "Outstanding"] as const;
type Tab = typeof tabs[number];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Aging");
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Business analytics and summaries</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Aging Report */}
      {activeTab === "Aging" && (
        <div>
          <div className="mb-4 text-sm text-muted-foreground">
            Shows how long receivables have been outstanding. Total: Rs. {formatAmount(aging.reduce((s, r) => s + r.balance, 0))}
          </div>
          <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Due</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">0-30 Days</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">31-60 Days</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">61-90 Days</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground text-red-600">90+ Days</th>
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
                    <td className="px-4 py-3 text-right font-semibold text-red-600">Rs. {formatAmount(r.balance)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.days0to30 > 0 ? formatAmount(r.days0to30) : "—"}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{r.days31to60 > 0 ? formatAmount(r.days31to60) : "—"}</td>
                    <td className="px-4 py-3 text-right text-orange-600">{r.days61to90 > 0 ? formatAmount(r.days61to90) : "—"}</td>
                    <td className="px-4 py-3 text-right text-red-700 font-semibold">{r.daysOver90 > 0 ? formatAmount(r.daysOver90) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Collection */}
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
                <div className="bg-card border border-card-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Cash Collections</div>
                  <div className="text-xl font-bold text-emerald-600">Rs. {formatAmount(collection.totalCash)}</div>
                </div>
                <div className="bg-card border border-card-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Bank Collections</div>
                  <div className="text-xl font-bold text-blue-600">Rs. {formatAmount(collection.totalBank)}</div>
                </div>
                <div className="bg-card border border-card-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total</div>
                  <div className="text-xl font-bold">Rs. {formatAmount(collection.total)}</div>
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
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
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">Rs. {formatAmount(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Monthly Sales */}
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
                <div className="bg-card border border-card-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total Sales</div>
                  <div className="text-xl font-bold text-red-600">Rs. {formatAmount(monthly.totalAmount)}</div>
                </div>
                <div className="bg-card border border-card-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Total Qty (Bags)</div>
                  <div className="text-xl font-bold">{formatAmount(monthly.totalQty)}</div>
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
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

      {/* Outstanding */}
      {activeTab === "Outstanding" && (
        <div>
          <div className="mb-4 text-sm text-muted-foreground">
            {outstanding.length} customers with outstanding balances · Total: Rs. {formatAmount(outstanding.reduce((s, r) => s + r.balance, 0))}
          </div>
          <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
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
                  <tr key={r.customerId} className={cn("hover:bg-muted/20 transition-colors", r.isOverLimit ? "bg-amber-50/50" : "")}>
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {r.customerName}
                        {r.isOverLimit && <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Over limit</span>}
                      </div>
                      {r.area && <div className="text-xs text-muted-foreground">{r.area}</div>}
                      {r.contact && <div className="text-xs text-muted-foreground">{r.contact}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">Rs. {formatAmount(r.balance)}</td>
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
