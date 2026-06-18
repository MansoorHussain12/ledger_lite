import { useState, useRef, useEffect } from "react";
import { Settings, Upload, X, Building2, Palette, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company";
import { useAuth } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CURRENCIES = ["Rs", "PKR", "USD", "$", "€", "£", "AED", "SAR"];

export default function SettingsPage() {
  const { settings, refresh } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();

  const [companyName, setCompanyName] = useState(settings.companyName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [businessType, setBusinessType] = useState(settings.businessType);
  const [currency, setCurrency] = useState(settings.currency);
  const [logoData, setLogoData] = useState<string | null>(settings.logoData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync when settings load
  useEffect(() => {
    setCompanyName(settings.companyName);
    setTagline(settings.tagline);
    setBusinessType(settings.businessType);
    setCurrency(settings.currency);
    setLogoData(settings.logoData);
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
        body: JSON.stringify({ companyName, tagline, businessType, currency, logoData }),
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

          <div className="flex items-start gap-5">
            {/* Preview */}
            <div className="flex-shrink-0 w-32 h-20 bg-sidebar rounded-lg border border-border flex items-center justify-center overflow-hidden">
              {logoData ? (
                <img src={logoData} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
              ) : (
                <div className="text-center">
                  <Building2 size={24} className="text-muted-foreground/30 mx-auto mb-1" />
                  <span className="text-xs text-muted-foreground/40">No logo</span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <p className="text-xs text-muted-foreground">Upload a PNG, JPG, or SVG. Recommended: wide logo, white or transparent background, under 2 MB.</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!isOwner}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={13} className="mr-1.5" />
                  {logoData ? "Change Logo" : "Upload Logo"}
                </Button>
                {logoData && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!isOwner}
                    onClick={() => { setLogoData(null); if (fileRef.current) fileRef.current.value = ""; }}
                  >
                    <X size={13} className="mr-1" /> Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoFile}
              />
            </div>
          </div>
        </div>

        {/* Company profile */}
        <div className="bg-card border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={15} className="text-primary" />
            <h2 className="font-semibold">Company Profile</h2>
          </div>

          <div>
            <Label className="text-sm">Company / Business Name *</Label>
            <Input
              className="mt-1.5"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. AL-RAHMAN TRADERS"
              disabled={!isOwner}
            />
            <p className="text-xs text-muted-foreground mt-1">Appears in the sidebar, receipts, and printed documents</p>
          </div>

          <div>
            <Label className="text-sm">Tagline</Label>
            <Input
              className="mt-1.5"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="e.g. Building Materials Supplier"
              disabled={!isOwner}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Business Type</Label>
              <Input
                className="mt-1.5"
                value={businessType}
                onChange={e => setBusinessType(e.target.value)}
                placeholder="e.g. Building Materials"
                disabled={!isOwner}
              />
            </div>

            <div>
              <Label className="text-sm">Currency Symbol</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  placeholder="Rs"
                  disabled={!isOwner}
                  className="w-20"
                />
                <div className="flex gap-1 flex-wrap">
                  {CURRENCIES.map(c => (
                    <button
                      key={c}
                      disabled={!isOwner}
                      onClick={() => setCurrency(c)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${
                        currency === c
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-card border rounded-xl p-5">
          <h2 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Sidebar Preview</h2>
          <div className="bg-sidebar rounded-lg p-4 w-48">
            {logoData ? (
              <img src={logoData} alt="Logo" className="max-h-10 max-w-full object-contain mb-1" />
            ) : (
              <div className="text-sidebar-foreground font-bold text-sm leading-tight">{companyName || "Company Name"}</div>
            )}
            <div className="text-sidebar-foreground/40 text-xs mt-0.5">{tagline || "Tagline"}</div>
          </div>
        </div>

        {isOwner && (
          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={saving || !companyName.trim()}
          >
            {saved ? (
              <><CheckCircle2 size={16} className="mr-2 text-emerald-400" /> Saved!</>
            ) : saving ? (
              "Saving…"
            ) : (
              <><Save size={16} className="mr-2" /> Save Settings</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
