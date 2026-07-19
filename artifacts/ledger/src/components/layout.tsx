import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company";
import {
  LayoutDashboard, Users, ShoppingCart, CreditCard,
  Package, BarChart3, UserCog, LogOut, Menu, X, BookOpen, Truck, ShoppingBag, Boxes, CalendarClock, Monitor, HelpCircle, Settings, History
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["owner", "salesman", "cashier"] },
  { href: "/customers", label: "Customers", icon: Users, roles: ["owner", "salesman", "cashier"] },
  { href: "/sale-orders", label: "Sale Orders", icon: ShoppingCart, roles: ["owner", "salesman"] },
  { href: "/payments", label: "Payments", icon: CreditCard, roles: ["owner", "cashier"] },
  { href: "/cashbook", label: "Cashbook", icon: BookOpen, roles: ["owner", "cashier"] },
  { href: "/suppliers", label: "Suppliers", icon: Truck, roles: ["owner"] },
  { href: "/purchases", label: "Purchases", icon: ShoppingBag, roles: ["owner"] },
  { href: "/pos", label: "POS", icon: Monitor, roles: ["owner", "cashier", "salesman"] },
  { href: "/installments", label: "Installments", icon: CalendarClock, roles: ["owner", "cashier"] },
  { href: "/inventory", label: "Inventory", icon: Boxes, roles: ["owner"] },
  { href: "/products", label: "Products", icon: Package, roles: ["owner", "salesman"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["owner"] },
  { href: "/users", label: "Users", icon: UserCog, roles: ["owner"] },
  { href: "/audit-log", label: "Audit Log", icon: History, roles: ["owner"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["owner"] },
  { href: "/guide", label: "Guide", icon: HelpCircle, roles: ["owner", "cashier", "salesman"] },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { settings } = useCompany();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = navItems.filter(item =>
    user && item.roles.includes(user.role)
  );

  const roleColors: Record<string, string> = {
    owner: "bg-blue-500/20 text-blue-300",
    salesman: "bg-emerald-500/20 text-emerald-300",
    cashier: "bg-amber-500/20 text-amber-300",
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden no-print"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 w-60 bg-sidebar flex flex-col transition-transform duration-200 lg:relative lg:translate-x-0 no-print",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo / Company name */}
        <div className="px-5 py-4 border-b border-sidebar-border">
          {settings.logoData ? (
            <div>
              <img
                src={settings.logoData}
                alt={settings.companyName}
                style={{ maxHeight: `${Math.round((settings.logoScale / 100) * 40)}px`, maxWidth: "100%", objectFit: "contain" }}
              />
              {settings.tagline && (
                <div className="text-sidebar-foreground/40 text-xs mt-1">{settings.tagline}</div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-sidebar-foreground font-bold text-sm leading-tight">
                {settings.companyName}
              </div>
              <div className="text-sidebar-foreground/40 text-xs mt-0.5">{settings.tagline}</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href || (href !== "/" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <div
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon size={16} />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary/30 flex items-center justify-center text-sidebar-primary-foreground text-sm font-semibold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sidebar-foreground text-sm font-medium truncate">{user?.name}</div>
              <span className={cn("text-xs px-1.5 py-0.5 rounded capitalize", roleColors[user?.role ?? ""] ?? "")}>
                {user?.role}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center px-4 py-3 border-b bg-card no-print">
          <button onClick={() => setMobileOpen(true)} className="p-1 mr-3">
            <Menu size={20} />
          </button>
          {settings.logoData ? (
            <img src={settings.logoData} alt={settings.companyName} style={{ maxHeight: `${Math.round((settings.logoScale / 100) * 28)}px`, objectFit: "contain" }} />
          ) : (
            <span className="font-semibold text-sm">{settings.companyName}</span>
          )}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
