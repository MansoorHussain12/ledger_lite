import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";

interface CustomerLike {
  id: number;
  name: string;
}

interface CustomerComboboxProps {
  customers: CustomerLike[];
  value: number | undefined;
  onChange: (id: number | undefined) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Single field that's both a search box and a select: type to filter the list
 * (plain substring match), click a result to filter the page down to just that
 * customer, or pick "All customers" to clear the selection.
 */
export function CustomerCombobox({ customers, value, onChange, placeholder = "All customers", className }: CustomerComboboxProps) {
  return (
    <Combobox
      options={customers.map(c => ({ value: String(c.id), label: c.name }))}
      value={value != null ? String(value) : undefined}
      onChange={v => onChange(v ? parseInt(v, 10) : undefined)}
      clearLabel={placeholder}
      searchPlaceholder="Search customer…"
      emptyText="No customers found."
      className={cn("h-8 text-sm px-2.5", className)}
    />
  );
}
