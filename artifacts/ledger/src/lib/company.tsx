import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type CompanySettings = {
  companyName: string;
  tagline: string;
  businessType: string;
  currency: string;
  logoData: string | null;
};

const DEFAULT: CompanySettings = {
  companyName: "My Company",
  tagline: "Building Materials Supplier",
  businessType: "Building Materials",
  currency: "Rs",
  logoData: null,
};

type CompanyCtx = {
  settings: CompanySettings;
  refresh: () => Promise<void>;
};

const CompanyContext = createContext<CompanyCtx>({ settings: DEFAULT, refresh: async () => {} });

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/settings`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setSettings(data);
        document.title = data.companyName;
      }
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <CompanyContext.Provider value={{ settings, refresh }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
