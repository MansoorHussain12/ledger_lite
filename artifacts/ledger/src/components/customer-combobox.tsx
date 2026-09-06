import { useState } from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

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
  const [open, setOpen] = useState(false);
  const selected = customers.find(c => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 text-sm text-left px-2.5 rounded-md border border-input bg-background flex items-center justify-between gap-2 text-foreground hover:border-ring transition-colors",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          <ChevronsUpDown size={13} className="shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
          <CommandInput placeholder="Search customer…" />
          <CommandList>
            <CommandEmpty>No customers found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => { onChange(undefined); setOpen(false); }}>
                <Users size={13} className="text-muted-foreground" />
                <span className="flex-1">All customers</span>
                {value == null && <Check size={13} />}
              </CommandItem>
              {customers.map(c => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  {value === c.id && <Check size={13} />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
