import { db, saleOrdersTable, paymentsTable } from "@workspace/db";
import { saleReturnsTable, customerLoansTable } from "@workspace/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";

// Single source of truth for "what does this customer currently owe" — used by the
// Customers page, the Aging report, the Outstanding report, and the dashboard
// (totalOutstanding + top-debtors). Previously each of those hand-duplicated this
// formula and it was easy to update most of them but miss one (that's exactly how the
// customer-loans balance bug happened) — route everything through here instead so a
// future term (like discountAmount) only needs to be added once.
//
// Batch form: runs 4 GROUP BY aggregate queries TOTAL (one per source table) no matter
// how many customers are passed in, instead of 4 queries PER customer. Every caller that
// needs balances for a list of customers (not just one) must use this instead of looping
// computeCustomerBalance — the old per-customer loop was the main cause of slow list/
// dashboard/report loads in production (4-9 sequential DB round trips per customer).
export async function computeCustomerBalances(
  customers: { id: number; openingBalance: string | number }[]
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  const ids = customers.map((c) => c.id);
  if (ids.length === 0) return result;

  // Only "live" (posted) rows count — a reversed original and its reversal both net to
  // zero here by being excluded entirely, and a correction is itself just a normal
  // posted row. See the correction workflow (lib/db/src/schema/saleOrders.ts).
  const [sales, pmts, returns, loans] = await Promise.all([
    db.select({
      customerId: saleOrdersTable.customerId,
      total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)`,
      discount: sql<number>`coalesce(sum(${saleOrdersTable.discountAmount}),0)`,
    }).from(saleOrdersTable)
      .where(and(inArray(saleOrdersTable.customerId, ids), eq(saleOrdersTable.status, "posted")))
      .groupBy(saleOrdersTable.customerId),
    db.select({
      customerId: paymentsTable.customerId,
      total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)`,
      discount: sql<number>`coalesce(sum(${paymentsTable.discountAmount}),0)`,
    }).from(paymentsTable)
      .where(and(inArray(paymentsTable.customerId, ids), eq(paymentsTable.status, "posted")))
      .groupBy(paymentsTable.customerId),
    // Sale returns reduce receivable by their full value (goods credited back); any
    // refundPaid on top of that is cash handed back to the customer, which adds back to
    // the balance (settling whatever the return alone would have put us in the red for).
    db.select({
      customerId: saleReturnsTable.customerId,
      total: sql<number>`coalesce(sum(${saleReturnsTable.totalAmount}),0)`,
      refunded: sql<number>`coalesce(sum(${saleReturnsTable.refundPaid}),0)`,
    }).from(saleReturnsTable)
      .where(and(inArray(saleReturnsTable.customerId, ids), eq(saleReturnsTable.status, "posted")))
      .groupBy(saleReturnsTable.customerId),
    // Loans increase what the customer owes, same direction as a sale (no interest — just
    // cash handed over that's now tracked as receivable).
    db.select({
      customerId: customerLoansTable.customerId,
      total: sql<number>`coalesce(sum(${customerLoansTable.amount}),0)`,
    }).from(customerLoansTable)
      .where(and(inArray(customerLoansTable.customerId, ids), eq(customerLoansTable.status, "posted")))
      .groupBy(customerLoansTable.customerId),
  ]);

  const salesMap = new Map(sales.map((r) => [r.customerId, r]));
  const pmtsMap = new Map(pmts.map((r) => [r.customerId, r]));
  const returnsMap = new Map(returns.map((r) => [r.customerId, r]));
  const loansMap = new Map(loans.map((r) => [r.customerId, r]));

  for (const c of customers) {
    const s = salesMap.get(c.id);
    const p = pmtsMap.get(c.id);
    const r = returnsMap.get(c.id);
    const l = loansMap.get(c.id);
    result.set(
      c.id,
      parseFloat(String(c.openingBalance))
        + parseFloat(String(s?.total ?? 0))
        - parseFloat(String(p?.total ?? 0))
        - parseFloat(String(p?.discount ?? 0))
        - parseFloat(String(r?.total ?? 0))
        + parseFloat(String(r?.refunded ?? 0))
        + parseFloat(String(l?.total ?? 0))
        - parseFloat(String(s?.discount ?? 0)),
    );
  }
  return result;
}

// Single-customer convenience wrapper around computeCustomerBalances — for the handful
// of callers (GET/POST/PUT /customers/:id) that only ever need one customer's balance.
// Still 4 queries (same as before), just funneled through the shared batch path.
export async function computeCustomerBalance(customerId: number, openingBalance: string | number): Promise<number> {
  const balances = await computeCustomerBalances([{ id: customerId, openingBalance }]);
  return balances.get(customerId) ?? parseFloat(String(openingBalance));
}
