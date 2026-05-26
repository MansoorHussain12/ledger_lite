import { useState } from "react";
import {
  useListUsers, getListUsersQueryKey, useCreateUser, useUpdateUser, useDeleteUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const roleColors: Record<string, string> = {
  owner: "bg-blue-100 text-blue-700",
  salesman: "bg-emerald-100 text-emerald-700",
  cashier: "bg-amber-100 text-amber-700",
};

export default function UsersPage() {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "salesman" as "owner" | "salesman" | "cashier" });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const openEdit = (u: typeof users[0]) => {
    setEditId(u.id);
    setForm({ name: u.name, username: u.username, password: "", role: u.role });
    setShowForm(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", username: "", password: "", role: "salesman" });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        const data: { name?: string; password?: string; role?: "owner" | "salesman" | "cashier" } = { name: form.name, role: form.role };
        if (form.password) data.password = form.password;
        await updateMutation.mutateAsync({ id: editId, data });
        toast({ title: "User updated" });
      } else {
        await createMutation.mutateAsync({ data: { name: form.name, username: form.username, password: form.password, role: form.role } });
        toast({ title: "User created" });
      }
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setShowForm(false);
    } catch {
      toast({ title: "Failed to save user", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete user "${name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage access and roles</p>
        </div>
        <Button onClick={openNew}><Plus size={15} className="mr-1.5" /> Add User</Button>
      </div>

      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Created</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No users</td></tr>}
            {users.map(u => (
              <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs px-2 py-0.5 rounded capitalize font-medium", roleColors[u.role] ?? "")}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(u)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(u.id, u.name)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" required />
            </div>
            {!editId && (
              <div className="space-y-1.5">
                <Label>Username *</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="Login username" required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{editId ? "New Password (leave blank to keep current)" : "Password *"}</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Password" required={!editId} />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["owner", "salesman", "cashier"] as const).map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, role }))}
                    className={cn("py-2 text-sm rounded-md border transition-colors capitalize", form.role === role ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}
                  >
                    {role}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Owner: full access · Salesman: orders only · Cashier: payments only</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                {editId ? "Update" : "Add"} User
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
