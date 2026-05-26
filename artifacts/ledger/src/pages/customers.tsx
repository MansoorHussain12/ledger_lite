import { useState } from "react";
import { Link } from "wouter";
import {
  useListCustomers, getListCustomersQueryKey, useCreateCustomer, useDeleteCustomer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, AlertTriangle, ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerFormData {
  name: string;
  area: string;
  contact: string;
  creditLimit: string;
  openingBalance: string;
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CustomerFormData>({ name: "", area: "", contact: "", creditLimit: "", openingBalance: "" });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useListCustomers(
    { search: search || undefined },
    { query: { queryKey: getListCustomersQueryKey({ search: search || undefined }) } }
  );

  const createMutation = useCreateCustomer();
  const deleteMutation = useDeleteCustomer();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        data: {
          name: form.name,
          area: form.area || undefined,
          contact: form.contact || undefined,
          creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
          openingBalance: form.openingBalance ? parseFloat(form.openingBalance) : undefined,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setShowForm(false);
      setForm({ name: "", area: "", contact: "", creditLimit: "", openingBalance: "" });
      toast({ title: "Customer added successfully" });
    } catch {
      toast({ title: "Failed to add customer", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      toast({ title: "Customer deleted" });
    } catch {
      toast({ title: "Cannot delete customer", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{customers.length} customers</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={15} className="mr-1.5" /> Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name or area..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Contact</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Balance</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Credit Limit</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && customers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No customers found</td></tr>
            )}
            {customers.map(c => {
              const overLimit = c.creditLimit != null && c.balance > c.creditLimit;
              return (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`}>
                      <div className="cursor-pointer">
                        <div className="font-medium text-foreground flex items-center gap-2">
                          {c.name}
                          {overLimit && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              <AlertTriangle size={10} /> Over limit
                            </span>
                          )}
                        </div>
                        {c.area && <div className="text-xs text-muted-foreground">{c.area}</div>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{c.contact ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-semibold", c.balance > 0 ? "text-red-600" : "text-emerald-600")}>
                      Rs. {formatAmount(c.balance)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                    {c.creditLimit != null ? `Rs. ${formatAmount(c.creditLimit)}` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      <Link href={`/customers/${c.id}`}>
                        <button className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                          <ChevronRight size={14} />
                        </button>
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Area</Label>
                <Input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="City / Area" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Phone number" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Credit Limit (Rs.)</Label>
                <Input type="number" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance (Rs.)</Label>
                <Input type="number" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Customer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
