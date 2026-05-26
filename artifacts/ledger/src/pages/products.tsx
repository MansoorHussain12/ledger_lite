import { useState } from "react";
import {
  useListProducts, getListProductsQueryKey,
  useCreateProduct, useUpdateProduct, useDeleteProduct,
  useGetProductRates, getGetProductRatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, History, X } from "lucide-react";

interface ProductForm {
  name: string;
  currentRate: string;
  costPrice: string;
}

export default function ProductsPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>({ name: "", currentRate: "", costPrice: "" });
  const [showHistory, setShowHistory] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useListProducts({ query: { queryKey: getListProductsQueryKey() } });
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const { data: rateHistory = [] } = useGetProductRates(showHistory ?? 0, {
    query: { enabled: !!showHistory, queryKey: getGetProductRatesQueryKey(showHistory ?? 0) }
  });

  const openEdit = (p: typeof products[0]) => {
    setEditId(p.id);
    setForm({ name: p.name, currentRate: String(p.currentRate), costPrice: p.costPrice != null ? String(p.costPrice) : "" });
    setShowForm(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", currentRate: "", costPrice: "" });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await updateMutation.mutateAsync({
          id: editId,
          data: {
            name: form.name,
            currentRate: parseFloat(form.currentRate),
            costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
          }
        });
        toast({ title: "Product updated" });
      } else {
        await createMutation.mutateAsync({
          data: {
            name: form.name,
            currentRate: parseFloat(form.currentRate),
            costPrice: form.costPrice ? parseFloat(form.costPrice) : undefined,
          }
        });
        toast({ title: "Product added" });
      }
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setShowForm(false);
    } catch {
      toast({ title: "Failed to save product", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete product "${name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      toast({ title: "Product deleted" });
    } catch {
      toast({ title: "Cannot delete product — it may have sales orders", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Cement brands & current rates</p>
        </div>
        <Button onClick={openNew}><Plus size={15} className="mr-1.5" /> Add Product</Button>
      </div>

      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Brand Name</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Sale Rate / Bag</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Cost Price / Bag</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Margin</th>
              <th className="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && products.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No products yet</td></tr>}
            {products.map(p => {
              const margin = p.costPrice != null ? p.currentRate - p.costPrice : null;
              return (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-semibold">{p.name}</td>
                  <td className="px-4 py-3 text-right font-semibold">Rs. {formatAmount(p.currentRate)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">
                    {p.costPrice != null ? `Rs. ${formatAmount(p.costPrice)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    {margin != null ? (
                      <span className={margin >= 0 ? "text-emerald-600" : "text-red-600"}>
                        Rs. {formatAmount(margin)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setShowHistory(p.id)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors" title="Rate history">
                        <History size={14} />
                      </button>
                      <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Brand Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ASK-GREEN" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sale Rate / Bag (Rs.) *</Label>
                <Input type="number" value={form.currentRate} onChange={e => setForm(f => ({ ...f, currentRate: e.target.value }))} placeholder="0" required min="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Cost Price / Bag (Rs.)</Label>
                <Input type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="0 (optional)" min="0" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                {editId ? "Update" : "Add"} Product
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rate History Dialog */}
      <Dialog open={!!showHistory} onOpenChange={() => setShowHistory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate History — {products.find(p => p.id === showHistory)?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {rateHistory.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">No history</p>}
            {rateHistory.map(r => (
              <div key={r.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{formatDate(r.effectiveDate)}</span>
                <span className="text-sm font-semibold">Rs. {formatAmount(r.rate)}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
