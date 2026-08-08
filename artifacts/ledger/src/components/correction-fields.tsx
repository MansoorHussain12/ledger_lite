import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared by the Sale Orders and Payments "Correct" dialogs — the one truly common piece
// across both: the reversal never edits/deletes a posted transaction in place, so a
// correction is always "reverse the original, then optionally post a replacement."
// This is the "optionally" part — check it to skip posting a replacement entirely
// (a pure duplicate/mistake that shouldn't have been posted at all).
export function VoidToggle({
  isVoid, onVoidChange, reason, onReasonChange,
}: {
  isVoid: boolean;
  onVoidChange: (v: boolean) => void;
  reason: string;
  onReasonChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <Checkbox checked={isVoid} onCheckedChange={(v) => onVoidChange(v === true)} className="mt-0.5" />
        <span className="text-sm">
          <span className="font-medium flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-500" />
            Void — this shouldn't have been posted at all
          </span>
          <span className="text-muted-foreground text-xs block mt-0.5">
            Reverses the original with no replacement, instead of correcting a field below.
          </span>
        </span>
      </label>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Reason (optional, kept with the audit trail)</Label>
        <Textarea
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
          placeholder={isVoid ? "e.g. duplicate entry" : "e.g. was posted as bank, should have been cash"}
          className="text-sm min-h-[3rem]"
        />
      </div>
    </div>
  );
}

// Shared list-row indicator for a correction-workflow entity (see `groupCorrections` in
// `@/lib/correction-chain`). Renders nothing for a transaction that's never been touched —
// deliberately low-key (secondary badge, no red) since a correction is a routine edit, not
// something that needs the user's attention. Click toggles the caller's expand-in-place
// history row.
export function CorrectionBadge({
  isVoid, historyCount, expanded, onToggle,
}: {
  isVoid: boolean;
  historyCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!isVoid && historyCount === 0) return null;
  const label = isVoid ? "Voided" : `Corrected${historyCount > 1 ? ` ×${historyCount}` : ""}`;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium hover:bg-secondary/70 transition-colors"
    >
      {label}
      <ChevronDown size={11} className={cn("transition-transform", expanded && "rotate-180")} />
    </button>
  );
}
