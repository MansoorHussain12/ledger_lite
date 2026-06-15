import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CustomersPage from "@/pages/customers";
import CustomerDetailPage from "@/pages/customer-detail";
import SaleOrdersPage from "@/pages/sale-orders";
import SaleOrderNewPage from "@/pages/sale-order-new";
import SaleOrderDetailPage from "@/pages/sale-order-detail";
import PaymentsPage from "@/pages/payments";
import CashbookPage from "@/pages/cashbook";
import SuppliersPage from "@/pages/suppliers";
import SupplierDetailPage from "@/pages/supplier-detail";
import PurchasesPage from "@/pages/purchases";
import PurchaseNewPage from "@/pages/purchase-new";
import InventoryPage from "@/pages/inventory";
import ProductsPage from "@/pages/products";
import ReportsPage from "@/pages/reports";
import UsersPage from "@/pages/users";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar">
        <div className="text-sidebar-foreground/50 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/customers/:id" component={CustomerDetailPage} />
        <Route path="/sale-orders" component={SaleOrdersPage} />
        <Route path="/sale-orders/new" component={SaleOrderNewPage} />
        <Route path="/sale-orders/:id" component={SaleOrderDetailPage} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/payments/new" component={PaymentsPage} />
        <Route path="/cashbook" component={CashbookPage} />
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/suppliers/:id" component={SupplierDetailPage} />
        <Route path="/purchases/new" component={PurchaseNewPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/users" component={UsersPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
