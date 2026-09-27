import { db, suppliersTable } from "@workspace/db";
import { purchaseInvoicesTable, supplierPaymentsTable, purchaseReturnsTable } from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// Single source of truth for "what do we currently owe this supplier" — used by the
// Suppliers page/ledger and by supplierPayments.ts's payment-amount validation (a
// payment + its discount can't clear more than this). See customerBalance.ts for why
// this lives in one place rather than being hand-duplicated per caller.
//
// balance = opening_balance + sum(purchase.total_amount) - sum(purchase.paid_amount)
//           - sum(supplier_payments.amount) - sum(supplier_payments.discount_amount)
//           - sum(purchase_returns.total_amount) + sum(purchase_returns.refund_received)
// The payment/discount terms are money (and settlement discount) paid against the running
// balance separately from any one invoice — same relationship customer payments have
// to sale orders. A discount clears payable the same as cash does — see
// supplierPayments.ts's discountAmount column comment. Purchase returns reduce payable by
// their full value (goods sent back); any refundReceived on top of that is cash the
// supplier gave back, which adds back to the balance the same way a payment we made would.
//
// Batch form: runs 3 GROUP BY aggregate queries TOTAL (one per source table) no matter how
// many suppliers are passed in, instead of 3 queries PER supplier — see
// computeCustomerBalances in customerBalance.ts for the identical rationale. Every caller
// that needs balances for a list of suppliers (not just one) must use this instead of
// looping supplierBalance.
export async function supplierBalances(
  suppliers: { id: number; openingBalance: string | number }[]
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  const ids = suppliers.map((s) => s.id);
  if (ids.length === 0) return result;

  // Only "live" (posted) rows count — a reversed/corrected mistake is excluded, so this
  // reflects the correction, not the mistake (see the correction workflow).
  const [invoices, payments, returns] = await Promise.all([
    db.select({
      supplierId: purchaseInvoicesTable.supplierId,
      totalBilled: sql<string>`coalesce(sum(total_amount),0)`,
      totalPaid: sql<string>`coalesce(sum(paid_amount),0)`,
    }).from(purchaseInvoicesTable)
      .where(and(inArray(purchaseInvoicesTable.supplierId, ids), eq(purchaseInvoicesTable.status, "posted")))
      .groupBy(purchaseInvoicesTable.supplierId),
    db.select({
      supplierId: supplierPaymentsTable.supplierId,
      total: sql<string>`coalesce(sum(amount),0)`,
      discount: sql<string>`coalesce(sum(discount_amount),0)`,
    }).from(supplierPaymentsTable)
      .where(and(inArray(supplierPaymentsTable.supplierId, ids), eq(supplierPaymentsTable.status, "posted")))
      .groupBy(supplierPaymentsTable.supplierId),
    db.select({
      supplierId: purchaseReturnsTable.supplierId,
      total: sql<string>`coalesce(sum(total_amount),0)`,
      refunded: sql<string>`coalesce(sum(refund_received),0)`,
    }).from(purchaseReturnsTable)
      .where(and(inArray(purchaseReturnsTable.supplierId, ids), eq(purchaseReturnsTable.status, "posted")))
      .groupBy(purchaseReturnsTable.supplierId),
  ]);

  const invMap = new Map(invoices.map((r) => [r.supplierId, r]));
  const pmtMap = new Map(payments.map((r) => [r.supplierId, r]));
  const retMap = new Map(returns.map((r) => [r.supplierId, r]));

  for (const s of suppliers) {
    const inv = invMap.get(s.id);
    const pmt = pmtMap.get(s.id);
    const ret = retMap.get(s.id);
    const balance =
      parseFloat(String(s.openingBalance))
      + parseFloat(inv?.totalBilled ?? "0")
      - parseFloat(inv?.totalPaid ?? "0")
      - parseFloat(pmt?.total ?? "0")
      - parseFloat(pmt?.discount ?? "0")
      - parseFloat(ret?.total ?? "0")
      + parseFloat(ret?.refunded ?? "0");
    result.set(s.id, Math.round(balance * 100) / 100);
  }
  return result;
}

// Single-supplier convenience wrapper around supplierBalances — for callers that only
// have a supplierId (not the row itself), e.g. supplierPayments.ts's validation. Still
// fetches the supplier row plus 3 aggregate queries (same as before), just funneled
// through the shared batch path.
export async function supplierBalance(supplierId: number): Promise<number> {
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!s) return 0;
  const balances = await supplierBalances([{ id: s.id, openingBalance: s.openingBalance ?? "0" }]);
  return balances.get(supplierId) ?? 0;
}
