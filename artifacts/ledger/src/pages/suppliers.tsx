import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Truck, Plus, Search, Phone, MapPin, Edit2, Trash2, ChevronRight, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number) {
  return new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2 }).format(n);
}

type Supplier = {
  id: number; name: string; contact: string | null; address: string | null;
  ntn: string | null; openingBalance: number; payableBalance: number; createdAt: string;
};

async function fetchSuppliers(): Promise<Supplier[]> {
  const r = await fetch(`${BASE}/api/suppliers`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

type SupplierForm = {
  name: string; contact: string; address: string; ntn: string;
  openingBalance: string; openingBalanceDate: string;
};

const blank: SupplierForm = { name: "", contact: "", address: "", ntn: "", openingBalance: "", openingBalanceDate: "" };

function SupplierDialog({
  open, onClose, initial, editId,
}: { open: boolean; onClose: () => void; initial?: SupplierForm; editId?: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<SupplierForm>(initial ?? blank);
  const isEdit = editId != null;

  const mut = useMutation({
    mutationFn: async (f: SupplierForm) => {
      const url = isEdit ? `${BASE}/api/suppliers/${editId}` : `${BASE}/api/suppliers`;
      const method = isEdit ? "PATCH" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          contact: f.contact || undefined,
          address: f.address || undefined,
          ntn: f.ntn || undefined,
          openingBalance: f.openingBalance ? parseFloat(f.openingBalance) : 0,
          openingBalanceDate: f.openingBalanceDate || undefined,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: isEdit ? "Supplier updated" : "Supplier added" });
      onClose();
      setForm(blank);
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: keyof SupplierForm, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setForm(initial ?? blank); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Supplier Name <span className="text-red-400">*</span></Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Company or person name" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Contact / Phone</Label>
              <Input value={form.contact} onChange={e => set("contact", e.target.value)} placeholder="03xx-xxxxxxx" className="mt-1" />
            </div>
            <div>
              <Label>NTN</Label>
              <Input value={form.ntn} onChange={e => set("ntn", e.target.value)} placeholder="National Tax No" className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="City / area" className="mt-1" />
          </div>
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4 pt-1 border-t">
              <div>
                <Label>Opening Balance (Rs)</Label>
                <Input type="number" min="0" step="0.01" value={form.openingBalance} onChange={e => set("openingBalance", e.target.value)} placeholder="0.00" className="mt-1" />
              </div>
              <div>
                <Label>As of Date</Label>
                <Input type="date" value={form.openingBalanceDate} onChange={e => set("openingBalanceDate", e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setForm(initial ?? blank); }}>Cancel</Button>
          <Button onClick={() => mut.mutate(form)} disabled={mut.isPending || !form.name}>
            {mut.isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/suppliers/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast({ title: "Supplier deleted" }); setDeleteId(null); },
    onError: (e) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact ?? "").includes(search)
  );

  const totalPayable = suppliers.reduce((s, x) => s + x.payableBalance, 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Truck size={20} className="text-primary" /> Suppliers
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage suppliers and purchase payables</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} className="mr-1" /> Add Supplier
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-muted-foreground text-xs mb-1">Total Suppliers</div>
          <div className="text-2xl font-bold">{suppliers.length}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-muted-foreground text-xs mb-1">Total Payables</div>
          <div className="text-2xl font-bold text-red-400">Rs {fmt(totalPayable)}</div>
        </div>
        <div className="bg-card border rounded-lg p-4 hidden md:block">
          <div className="text-muted-foreground text-xs mb-1">Overdue Suppliers</div>
          <div className="text-2xl font-bold text-amber-400">
            {suppliers.filter(s => s.payableBalance > 0).length}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search suppliers…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supplier</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Contact</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Opening Bal</th>
              <th className="text-right px-4 py-3 font-medium text-red-400">Balance Due</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-8">Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <Truck size={32} className="mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">{search ? "No suppliers match" : "No suppliers yet"}</p>
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/suppliers/${s.id}`}>
                    <div className="font-medium text-foreground hover:text-primary cursor-pointer">{s.name}</div>
                  </Link>
                  {s.address && <div className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5"><MapPin size={10} />{s.address}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                  {s.contact ? <span className="flex items-center gap-1"><Phone size={11} />{s.contact}</span> : "—"}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">Rs {fmt(s.openingBalance)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={cn("font-semibold", s.payableBalance > 0 ? "text-red-400" : "text-emerald-400")}>
                    Rs {fmt(s.payableBalance)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => setEditSupplier(s)}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteId(s.id)}
                      className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                    <Link href={`/suppliers/${s.id}`}>
                      <button className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
                        <ChevronRight size={14} />
                      </button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SupplierDialog open={showAdd} onClose={() => setShowAdd(false)} />
      {editSupplier && (
        <SupplierDialog
          open={!!editSupplier}
          onClose={() => setEditSupplier(null)}
          initial={{ name: editSupplier.name, contact: editSupplier.contact ?? "", address: editSupplier.address ?? "", ntn: editSupplier.ntn ?? "", openingBalance: String(editSupplier.openingBalance), openingBalanceDate: "" }}
          editId={editSupplier.id}
        />
      )}

      <AlertDialog open={deleteId != null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>This will delete the supplier record. Purchase invoices linked to this supplier cannot be deleted unless you remove them first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId != null && deleteMut.mutate(deleteId)} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
