import { useState } from "react";
import {
  useListAuditLogs, getListAuditLogsQueryKey, useListUsers, getListUsersQueryKey,
} from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const actionColors: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
};

export default function AuditLogPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterUserId, setFilterUserId] = useState<number | undefined>();
  const [filterAction, setFilterAction] = useState<"create" | "update" | "delete" | undefined>();

  const params = {
    from: fromDate || undefined,
    to: toDate || undefined,
    userId: filterUserId,
    action: filterAction,
  };

  const { data: logs = [], isLoading } = useListAuditLogs(params, { query: { queryKey: getListAuditLogsQueryKey(params) } });
  const { data: users = [] } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Who did what, and when</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-card-border rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Filter size={14} className="text-muted-foreground mt-6" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">User</label>
          <select className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background" value={filterUserId ?? ""} onChange={e => setFilterUserId(e.target.value ? parseInt(e.target.value) : undefined)}>
            <option value="">All</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Action</label>
          <select className="block text-sm border border-border rounded-md px-2 py-1.5 bg-background" value={filterAction ?? ""} onChange={e => setFilterAction((e.target.value as "create" | "update" | "delete") || undefined)}>
            <option value="">All</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="text-sm h-8 w-36" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="text-sm h-8 w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); setFilterUserId(undefined); setFilterAction(undefined); }}>Clear</Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-xl shadow-xs overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date/Time</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Entity</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && logs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No audit log entries found</td></tr>}
            {logs.map(row => (
              <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3 font-medium">{row.userName ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs px-2 py-0.5 rounded capitalize font-medium", actionColors[row.action] ?? "")}>
                    {row.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell capitalize">
                  {row.entityType}{row.entityId != null ? ` #${row.entityId}` : ""}
                </td>
                <td className="px-4 py-3">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
