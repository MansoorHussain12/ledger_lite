// Groups the raw rows of a "correction workflow" entity (sale orders, payments,
// purchases, cashbook entries, expenses, installment payments) into one entry per
// *logical* transaction, instead of one row per underlying DB row.
//
// Background: correcting a posted row never edits it — it inserts a 'reversal' mirror
// (pure paper trail, never meant to be shown on its own), flips the original to
// 'reversed', and — unless voided — inserts a new 'posted' row linked via correctsId.
// A chain can be corrected more than once, each time growing by one more link.
//
// This turns that flat list of rows back into what the user actually thinks of as "one
// order" / "one payment": its current effective state (the head), whether it's void,
// and its full history for anyone who clicks in to see it.

export interface CorrectableRow {
  id: number;
  status: "posted" | "reversed" | "reversal";
  // Generated API types mark these optional (`?: number | null`) rather than always-present
  // nullable fields — match that shape so entity types satisfy this constraint structurally.
  reversesId?: number | null;
  correctsId?: number | null;
}

export interface CorrectionStep<T> {
  /** The superseded row from this step of the chain (status: 'reversed'). */
  previous: T;
  /** The reversal row that cancelled `previous`, if found — carries the correction
   *  reason in its own `notes` field and a timestamp in its own `date`/`createdAt`. */
  reversal: T | null;
}

export interface CorrectionGroup<T extends CorrectableRow> {
  /** The row to render as the list row — current effective state of this transaction. */
  head: T;
  /** True if `head` itself is 'reversed' with nothing correcting it — voided, no
   *  replacement was posted. */
  isVoid: boolean;
  /** The reversal row that voided `head`, when `isVoid` — carries the void reason in
   *  its own `notes` field. Null unless `isVoid`. */
  voidReversal: T | null;
  /** Oldest → newest. Empty for a transaction that's never been touched. */
  history: CorrectionStep<T>[];
}

export function groupCorrections<T extends CorrectableRow>(rows: T[]): CorrectionGroup<T>[] {
  const byId = new Map<number, T>(rows.map(r => [r.id, r]));
  // originalId -> the reversal row that cancelled it
  const reversalOf = new Map<number, T>();
  // originalId -> the row that corrected it (only ever set by a 'posted' or 'reversed'
  // row, never by a 'reversal' row — a reversal's correctsId is always null)
  const correctorOf = new Map<number, T>();
  for (const r of rows) {
    if (r.status === "reversal" && r.reversesId != null) reversalOf.set(r.reversesId, r);
    else if (r.correctsId != null) correctorOf.set(r.correctsId, r);
  }

  // Every 'posted' row is a valid head by construction: correcting a row always flips
  // it away from 'posted', so a 'posted' row can never itself be mid-chain history.
  // A 'reversed' row is only a head if it's a void — nothing ever corrected it.
  const heads = rows.filter(r =>
    r.status === "posted" || (r.status === "reversed" && !correctorOf.has(r.id))
  );

  return heads.map(head => {
    const history: CorrectionStep<T>[] = [];
    let current = head;
    while (current.correctsId != null) {
      const previous = byId.get(current.correctsId);
      if (!previous) break;
      history.unshift({ previous, reversal: reversalOf.get(previous.id) ?? null });
      current = previous;
    }
    const isVoid = head.status === "reversed";
    return { head, isVoid, voidReversal: isVoid ? reversalOf.get(head.id) ?? null : null, history };
  });
}
