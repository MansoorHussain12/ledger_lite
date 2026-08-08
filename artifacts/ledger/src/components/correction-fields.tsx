import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

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
