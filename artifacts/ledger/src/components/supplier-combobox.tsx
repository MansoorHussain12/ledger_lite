import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";

interface SupplierLike {
  id: number;
  name: string;
}

interface SupplierComboboxProps {
  suppliers: SupplierLike[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  /** Pass a label (e.g. "All suppliers") to add a clear entry for filter-bar usage. Omit for a required form field. */
  clearLabel?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Single field that's both a search box and a select: type to filter the list
 * (plain substring match), click a result to select it.
 */
export function SupplierCombobox({ suppliers, value, onChange, clearLabel, placeholder = "Select supplier…", className }: SupplierComboboxProps) {
  return (
    <Combobox
      options={suppliers.map(s => ({ value: String(s.id), label: s.name }))}
      value={value != null ? String(value) : undefined}
      onChange={v => onChange(v ? parseInt(v, 10) : undefined)}
      clearLabel={clearLabel}
      placeholder={placeholder}
      searchPlaceholder="Search supplier…"
      emptyText="No suppliers found."
      className={cn(clearLabel ? "h-8 text-sm px-2.5" : "w-full", className)}
    />
  );
}
