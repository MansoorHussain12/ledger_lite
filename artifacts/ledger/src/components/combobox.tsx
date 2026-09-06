import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional secondary content shown after the label (e.g. unit, balance owed). */
  hint?: React.ReactNode;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Trigger text (muted) shown when nothing is selected and there's no `clearLabel`. */
  placeholder?: string;
  /**
   * Adds a "clear selection" entry at the top of the list and makes the trigger
   * display this label when nothing is selected — for filter-bar usage
   * (e.g. "All customers"). Omit for required record pickers in forms.
   */
  clearLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
}

/**
 * Single field that's both a search box and a select: type to filter the
 * options by plain substring match (not fuzzy), click one to select it.
 */
export function Combobox({
  options, value, onChange, placeholder = "Select…", clearLabel,
  searchPlaceholder = "Search…", emptyText = "No results found.",
  className, contentClassName, disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "h-9 text-sm text-left px-3 rounded-md border border-input bg-background flex items-center justify-between gap-2 transition-colors",
            disabled ? "opacity-50 cursor-not-allowed" : "hover:border-ring",
            !selected && !clearLabel && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : (clearLabel ?? placeholder)}</span>
          <ChevronsUpDown size={13} className="shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-64 p-0", contentClassName)} align="start">
        <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem value={`__clear__ ${clearLabel}`} onSelect={() => { onChange(undefined); setOpen(false); }}>
                  <span className="flex-1">{clearLabel}</span>
                  {value == null && <Check size={13} />}
                </CommandItem>
              )}
              {options.map(o => (
                <CommandItem key={o.value} value={o.label} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint}
                  {value === o.value && <Check size={13} className="shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
