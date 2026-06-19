import { useState, useRef, useEffect } from "react";
import { Settings, Upload, X, Building2, Palette, Save, CheckCircle2, Phone, MapPin, Mail, ZoomIn, Tag, Ruler, Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CURRENCIES = ["Rs", "PKR", "USD", "$", "€", "£", "AED", "SAR"];

type LookupValue = { id: number; type: string; value: string; createdAt: string };

async function fetchLookups(type: "category" | "unit"): Promise<LookupValue[]> {
  const r = await fetch(`${BASE}/api/lookups/${type}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed");
  return r.json();
}

async function createLookup(type: string, value: string): Promise<LookupValue> {
  const r = await fetch(`${BASE}/api/lookups/${type}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
  return r.json();
}

async function updateLookup(type: string, id: number, value: string): Promise<LookupValue> {
  const r = await fetch(`${BASE}/api/lookups/${type}/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
  return r.json();
}

async function deleteLookup(type: string, id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/lookups/${type}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
}

function LookupList({ type, label, icon: Icon, isOwner }: {
  type: "category" | "unit";
  label: string;
  icon: React.ElementType;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addValue, setAddValue] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["lookups", type],
    queryFn: () => fetchLookups(type),
  });

  const createMutation = useMutation({
    mutationFn: (value: string) => createLookup(type, value),
    onSuccess: () => {
      toast({ title: `${label.slice(0, -1)} added` });
      qc.invalidateQueries({ queryKey: ["lookups", type] });
      setAddValue("");
    },
    onError: (e: Error) => toast({ title: "Failed to add", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) => updateLookup(type, id, value),
    onSuccess: () => {
      toast({ title: "Renamed" });
      qc.invalidateQueries({ queryKey: ["lookups", type] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditId(null);
    },
    onError: (e: Error) => toast({ title: "Failed to rename", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => deleteLookup(type, id),
    onSuccess: () => {
      toast({ title: "Deleted" });
      qc.invalidateQueries({ queryKey: ["lookups", type] });
    },
    onError: (e: Error) => toast({ title: "Cannot delete", description: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!addValue.trim()) return;
    createMutation.mutate(addValue.trim());
  };

  const handleRename = (id: number) => {
    if (!editValue.trim()) return;
    updateMutation.mutate({ id, value: editValue.trim() });
  };

  const startEdit = (item: LookupValue) => {
    setEditId(item.id);
    setEditValue(item.value);
  };

  const handleDelete = (item: LookupValue) => {
    if (!confirm(`Delete "${item.value}"? This will fail if products still use it.`)) return;
    deleteMutation.mutate({ id: item.id });
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-primary" />
        <h3 className="font-semibold text-sm">{label}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{items.length} items</span>
      </div>

      <div className="space-y-1 min-h-[80px]">
        {isLoading && <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>}
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-1 group">
            {editId === item.id ? (
              <>
                <Input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="h-7 text-xs flex-1"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") handleRename(item.id);
                    if (e.key === "Escape") setEditId(null);
                  }}
                />
                <button
                  onClick={() => handleRename(item.id)}
                  disabled={updateMutation.isPending}
                  className="p-1 text-emerald-500 hover:text-emerald-400 transition-colors"
                  title="Save"
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={() => setEditId(null)}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Cancel"
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm flex-1 px-1 py-0.5 truncate">{item.value}</span>
                {isOwner && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      title="Rename"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deleteMutation.isPending}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center">No {label.toLowerCase()} yet</p>
        )}
      </div>

      {isOwner && (
        <div className="flex gap-1.5 mt-3 pt-3 border-t border-border">
          <Input
            value={addValue}
            onChange={e => setAddValue(e.target.value)}
            placeholder={`New ${label.slice(0, -1).toLowerCase()}…`}
            className="h-7 text-xs flex-1"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          />
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={!addValue.trim() || createMutation.isPending} onClick={handleAdd}>
            <Plus size={13} />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, refresh } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();

  const [companyName, setCompanyName] = useState(settings.companyName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [businessType, setBusinessType] = useState(settings.businessType);
  const [currency, setCurrency] = useState(settings.currency);
  const [logoData, setLogoData] = useState<string | null>(settings.logoData);
  const [logoScale, setLogoScale] = useState(settings.logoScale);
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCompanyName(settings.companyName);
    setTagline(settings.tagline);
    setBusinessType(settings.businessType);
    setCurrency(settings.currency);
    setLogoData(settings.logoData);
    setLogoScale(settings.logoScale);
    setAddress(settings.address);
    setPhone(settings.phone);
    setEmail(settings.email);
  }, [settings.companyName]);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Logo too large", description: "Please use an image under 2 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setLogoData(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, tagline, businessType, currency, logoData, logoScale, address, phone, email }),
      });
      if (!r.ok) throw new Error("Failed");
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isOwner = user?.role === "owner";
  const logoMaxH = Math.round((logoScale / 100) * 40);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 bg-primary/10 rounded-lg">
          <Settings size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Company Settings</h1>
          <p className="text-muted-foreground text-sm">Customize how this software appears for your business</p>
        </div>
      </div>

      {!isOwner && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-sm text-amber-300 mb-6">
          Only the <strong>Owner</strong> role can edit company settings.
        </div>
      )}

      <div className="space-y-6">

        {/* Logo */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette size={15} className="text-primary" />
            <h2 className="font-semibold">Company Logo</h2>
          </div>

          <div className="flex items-start gap-5 mb-4">
            <div className="flex-shrink-0 w-36 h-20 bg-sidebar rounded-lg border border-border flex items-center justify-center overflow-hidden">
              {logoData ? (
                <img
                  src={logoData}
                  alt="Logo"
                  style={{ maxHeight: `${logoMaxH}px`, maxWidth: "128px", objectFit: "contain" }}
                />
              ) : (
                <div className="text-center">
                  <Building2 size={22} className="text-muted-foreground/30 mx-auto mb-1" />
                  <span className="text-xs text-muted-foreground/40">No logo</span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <p className="text-xs text-muted-foreground">PNG, JPG, or SVG, white or transparent background, under 2 MB. Wide format works best.</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" disabled={!isOwner} onClick={() => fileRef.current?.click()}>
                  <Upload size={13} className="mr-1.5" />
                  {logoData ? "Change Logo" : "Upload Logo"}
                </Button>
                {logoData && (
                  <Button variant="ghost" size="sm" disabled={!isOwner}
                    onClick={() => { setLogoData(null); if (fileRef.current) fileRef.current.value = ""; }}>
                    <X size={13} className="mr-1" /> Remove
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoFile} />
            </div>
          </div>

          {logoData && (
            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-1.5">
                  <ZoomIn size={13} className="text-muted-foreground" /> Logo Size
                </Label>
                <span className="text-xs text-muted-foreground font-mono">{logoScale}%</span>
              </div>
              <Slider
                value={[logoScale]}
                onValueChange={([v]) => setLogoScale(v)}
                min={30}
                max={300}
                step={5}
                disabled={!isOwner}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Smaller</span><span>Larger</span>
              </div>
            </div>
          )}
        </div>

        {/* Company profile */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={15} className="text-primary" />
            <h2 className="font-semibold">Company Profile</h2>
          </div>

          <div>
            <Label className="text-sm">Company / Business Name *</Label>
            <Input className="mt-1.5" value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. AL-RAHMAN TRADERS" disabled={!isOwner} />
            <p className="text-xs text-muted-foreground mt-1">Appears in sidebar, invoices, receipts & printed reports</p>
          </div>

          <div>
            <Label className="text-sm">Tagline</Label>
            <Input className="mt-1.5" value={tagline} onChange={e => setTagline(e.target.value)}
              placeholder="e.g. Building Materials Supplier" disabled={!isOwner} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Business Type</Label>
              <Input className="mt-1.5" value={businessType} onChange={e => setBusinessType(e.target.value)}
                placeholder="e.g. Building Materials" disabled={!isOwner} />
            </div>
            <div>
              <Label className="text-sm">Currency Symbol</Label>
              <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                <Input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="Rs" disabled={!isOwner} className="w-16" />
                {CURRENCIES.map(c => (
                  <button key={c} disabled={!isOwner} onClick={() => setCurrency(c)}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${currency === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone size={15} className="text-primary" />
            <h2 className="font-semibold">Contact Info <span className="text-xs text-muted-foreground font-normal ml-1">— shown on printed invoices & ledgers</span></h2>
          </div>

          <div>
            <Label className="text-sm flex items-center gap-1.5"><MapPin size={11} /> Address</Label>
            <Input className="mt-1.5" value={address} onChange={e => setAddress(e.target.value)}
              placeholder="e.g. G.T Road, Bhatar Mor, Wah Cantt" disabled={!isOwner} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm flex items-center gap-1.5"><Phone size={11} /> Phone</Label>
              <Input className="mt-1.5" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 051-1234567" disabled={!isOwner} />
            </div>
            <div>
              <Label className="text-sm flex items-center gap-1.5"><Mail size={11} /> Email</Label>
              <Input className="mt-1.5" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="e.g. info@company.com" disabled={!isOwner} />
            </div>
          </div>
        </div>

        {/* Categories & Units */}
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag size={15} className="text-primary" />
            <h2 className="font-semibold">Categories &amp; Units</h2>
            <span className="text-xs text-muted-foreground ml-1">— used in the Products catalogue</span>
          </div>
          {!isOwner && (
            <p className="text-xs text-muted-foreground mb-3">Only the Owner can add, rename, or delete categories and units.</p>
          )}
          <div className="flex gap-6">
            <LookupList type="category" label="Categories" icon={Tag} isOwner={isOwner} />
            <div className="w-px bg-border self-stretch" />
            <LookupList type="unit" label="Units" icon={Ruler} isOwner={isOwner} />
          </div>
        </div>

        {/* Live sidebar preview */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Sidebar Preview</h2>
          <div className="bg-sidebar rounded-lg p-4 w-52">
            {logoData ? (
              <img src={logoData} alt="Logo" style={{ maxHeight: `${logoMaxH}px`, maxWidth: "100%", objectFit: "contain" }} />
            ) : (
              <div className="text-sidebar-foreground font-bold text-sm leading-tight">{companyName || "Company Name"}</div>
            )}
            <div className="text-sidebar-foreground/40 text-xs mt-0.5">{tagline || "Tagline"}</div>
          </div>
        </div>

        {isOwner && (
          <Button className="w-full" size="lg" onClick={handleSave} disabled={saving || !companyName.trim()}>
            {saved ? (
              <><CheckCircle2 size={16} className="mr-2 text-emerald-400" /> Saved!</>
            ) : saving ? "Saving…" : (
              <><Save size={16} className="mr-2" /> Save Settings</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
