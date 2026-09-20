import { db, saleOrdersTable, paymentsTable } from "@workspace/db";
import { saleReturnsTable, customerLoansTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";

// Single source of truth for "what does this customer currently owe" — used by the
// Customers page, the Aging report, the Outstanding report, and the dashboard
// (totalOutstanding + top-debtors). Previously each of those hand-duplicated this
// formula and it was easy to update most of them but miss one (that's exactly how the
// customer-loans balance bug happened) — route everything through here instead so a
// future term (like discountAmount) only needs to be added once.
export async function computeCustomerBalance(customerId: number, openingBalance: string | number): Promise<number> {
  // Only "live" (posted) rows count — a reversed original and its reversal both net to
  // zero here by being excluded entirely, and a correction is itself just a normal
  // posted row. See the correction workflow (lib/db/src/schema/saleOrders.ts).
  const sales = await db.select({
    total: sql<number>`coalesce(sum(${saleOrdersTable.totalAmount}),0)`,
    discount: sql<number>`coalesce(sum(${saleOrdersTable.discountAmount}),0)`,
  }).from(saleOrdersTable).where(and(eq(saleOrdersTable.customerId, customerId), eq(saleOrdersTable.status, "posted")));
  const pmts = await db.select({ total: sql<number>`coalesce(sum(${paymentsTable.amount}),0)` })
    .from(paymentsTable).where(and(eq(paymentsTable.customerId, customerId), eq(paymentsTable.status, "posted")));
  // Sale returns reduce receivable by their full value (goods credited back); any
  // refundPaid on top of that is cash handed back to the customer, which adds back to
  // the balance (settling whatever the return alone would have put us in the red for).
  const returns = await db.select({
    total: sql<number>`coalesce(sum(${saleReturnsTable.totalAmount}),0)`,
    refunded: sql<number>`coalesce(sum(${saleReturnsTable.refundPaid}),0)`,
  }).from(saleReturnsTable).where(and(eq(saleReturnsTable.customerId, customerId), eq(saleReturnsTable.status, "posted")));
  // Loans increase what the customer owes, same direction as a sale (no interest — just
  // cash handed over that's now tracked as receivable).
  const loans = await db.select({ total: sql<number>`coalesce(sum(${customerLoansTable.amount}),0)` })
    .from(customerLoansTable).where(and(eq(customerLoansTable.customerId, customerId), eq(customerLoansTable.status, "posted")));
  return parseFloat(String(openingBalance))
    + parseFloat(String(sales[0]?.total ?? 0))
    - parseFloat(String(pmts[0]?.total ?? 0))
    - parseFloat(String(returns[0]?.total ?? 0))
    + parseFloat(String(returns[0]?.refunded ?? 0))
    + parseFloat(String(loans[0]?.total ?? 0))
    - parseFloat(String(sales[0]?.discount ?? 0));
}
