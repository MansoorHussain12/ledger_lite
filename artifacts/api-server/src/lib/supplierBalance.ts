import { db, suppliersTable } from "@workspace/db";
import { purchaseInvoicesTable, supplierPaymentsTable, purchaseReturnsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Single source of truth for "what do we currently owe this supplier" — used by the
// Suppliers page/ledger and by supplierPayments.ts's payment-amount validation (a
// payment + its discount can't clear more than this). See customerBalance.ts for why
// this lives in one place rather than being hand-duplicated per caller.
//
// balance = opening_balance + sum(purchase.total_amount) - sum(purchase.paid_amount)
//           - sum(supplier_payments.amount) - sum(supplier_payments.discount_amount)
// The last two terms are money (and settlement discount) paid against the running
// balance separately from any one invoice — same relationship customer payments have
// to sale orders. A discount clears payable the same as cash does — see
// supplierPayments.ts's discountAmount column comment.
export async function supplierBalance(supplierId: number): Promise<number> {
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
  if (!s) return 0;
  // Only "live" (posted) invoices — a reversed/corrected mistake is excluded, so this
  // reflects the correction, not the mistake (see the correction workflow).
  const [agg] = await db
    .select({
      totalBilled: sql<string>`coalesce(sum(total_amount),0)`,
      totalPaid: sql<string>`coalesce(sum(paid_amount),0)`,
    })
    .from(purchaseInvoicesTable)
    .where(and(eq(purchaseInvoicesTable.supplierId, supplierId), eq(purchaseInvoicesTable.status, "posted")));

  const [paymentsAgg] = await db
    .select({
      total: sql<string>`coalesce(sum(amount),0)`,
      discount: sql<string>`coalesce(sum(discount_amount),0)`,
    })
    .from(supplierPaymentsTable)
    .where(and(eq(supplierPaymentsTable.supplierId, supplierId), eq(supplierPaymentsTable.status, "posted")));

  // Purchase returns reduce payable by their full value (goods sent back); any
  // refundReceived on top of that is cash the supplier gave back, which adds back to
  // the balance the same way a payment we made would — see returns' worked example.
  const [returnsAgg] = await db
    .select({
      total: sql<string>`coalesce(sum(total_amount),0)`,
      refunded: sql<string>`coalesce(sum(refund_received),0)`,
    })
    .from(purchaseReturnsTable)
    .where(and(eq(purchaseReturnsTable.supplierId, supplierId), eq(purchaseReturnsTable.status, "posted")));

  const opening = parseFloat(s.openingBalance ?? "0");
  const billed = parseFloat(agg?.totalBilled ?? "0");
  const paid = parseFloat(agg?.totalPaid ?? "0");
  const directPayments = parseFloat(paymentsAgg?.total ?? "0");
  const directDiscounts = parseFloat(paymentsAgg?.discount ?? "0");
  const returned = parseFloat(returnsAgg?.total ?? "0");
  const returnRefunded = parseFloat(returnsAgg?.refunded ?? "0");
  return Math.round((opening + billed - paid - directPayments - directDiscounts - returned + returnRefunded) * 100) / 100;
}
