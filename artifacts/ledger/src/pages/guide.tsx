import { BookOpen, LayoutDashboard, BookMarked, Users, ShoppingCart, CreditCard, Truck, ShoppingBag, Monitor, Boxes, CalendarClock, BarChart3, Package, UserCog, ChevronRight, Info, AlertCircle, CheckCircle2, Lightbulb, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

const Section = ({ id, icon: Icon, title, color, children }: {
  id: string; icon: React.ElementType; title: string; color: string; children: React.ReactNode;
}) => (
  <section id={id} className="mb-12 scroll-mt-20">
    <div className={`flex items-center gap-3 mb-5 pb-3 border-b-2 ${color}`}>
      <div className={`p-2 rounded-lg ${color.replace("border-", "bg-").replace("-500", "-500/10")}`}>
        <Icon size={20} className={color.replace("border-", "text-")} />
      </div>
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
    {children}
  </section>
);

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div className="flex gap-3 mb-3">
    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">{n}</div>
    <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
  </div>
);

const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
    <Lightbulb size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
    <p className="text-xs text-amber-200 leading-relaxed">{children}</p>
  </div>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4">
    <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
    <p className="text-xs text-blue-200 leading-relaxed">{children}</p>
  </div>
);

const Warn = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
    <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
    <p className="text-xs text-red-200 leading-relaxed">{children}</p>
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card border rounded-lg p-4 mb-4">
    <h4 className="font-semibold text-sm mb-2 text-foreground">{title}</h4>
    {children}
  </div>
);

const FieldTable = ({ rows }: { rows: [string, string][] }) => (
  <table className="w-full text-xs mb-4 border-collapse">
    <thead>
      <tr className="bg-muted/30">
        <th className="text-left px-3 py-2 border border-border/50 font-semibold w-1/3">Field</th>
        <th className="text-left px-3 py-2 border border-border/50 font-semibold">Description</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(([f, d], i) => (
        <tr key={i} className="even:bg-muted/10">
          <td className="px-3 py-2 border border-border/50 font-mono text-primary/80">{f}</td>
          <td className="px-3 py-2 border border-border/50 text-muted-foreground">{d}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const TOC_ITEMS = [
  { id: "overview",     label: "Overview",            icon: BookOpen },
  { id: "login",        label: "Login & Roles",        icon: UserCog },
  { id: "dashboard",    label: "Dashboard",            icon: LayoutDashboard },
  { id: "cashbook",     label: "Cashbook",             icon: BookMarked },
  { id: "customers",    label: "Customers",            icon: Users },
  { id: "sales",        label: "Sales (Ledger)",       icon: ShoppingCart },
  { id: "payments",     label: "Payments",             icon: CreditCard },
  { id: "pos",          label: "POS Terminal",         icon: Monitor },
  { id: "suppliers",    label: "Suppliers",            icon: Truck },
  { id: "purchases",    label: "Purchases",            icon: ShoppingBag },
  { id: "inventory",    label: "Inventory",            icon: Boxes },
  { id: "installments", label: "Installments",         icon: CalendarClock },
  { id: "reports",      label: "Reports",              icon: BarChart3 },
  { id: "products",     label: "Products",             icon: Package },
  { id: "users",        label: "Users",                icon: UserCog },
];

export default function GuidePage() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/20 to-primary/5 border-b px-8 py-8 print:py-6">
        <div className="max-w-5xl mx-auto flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/20 rounded-xl">
              <BookOpen size={28} className="text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-0.5">AL-RAHMAN TRADERS</p>
              <h1 className="text-3xl font-bold">Software Guidebook</h1>
              <p className="text-muted-foreground text-sm mt-1">Complete reference for the ERP system — Cement Wholesale Edition</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer size={13} className="mr-1.5" /> Print / Save PDF
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 flex gap-8">
        {/* Table of Contents (sticky sidebar) */}
        <aside className="w-48 flex-shrink-0 hidden lg:block print:hidden">
          <div className="sticky top-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Contents</p>
            <nav className="space-y-0.5">
              {TOC_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => scrollTo(id)}
                  className="flex items-center gap-2 w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted/30 transition-colors"
                >
                  <Icon size={11} className="flex-shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">

          {/* ── OVERVIEW ─────────────────────────────────────────────── */}
          <Section id="overview" icon={BookOpen} title="Overview" color="border-primary text-primary">
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              AL-RAHMAN TRADERS ERP is a complete business management system built for cement wholesale operations.
              It tracks every rupee in and out, manages customer credit, handles supplier purchases, monitors
              stock levels, and gives you clear daily and monthly profit reports — all from one place.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {[
                { icon: BookMarked,   label: "Cashbook",        desc: "Cash & expenses ledger" },
                { icon: Users,        label: "Customers",       desc: "Credit & payment tracking" },
                { icon: ShoppingCart, label: "Sales",           desc: "Sale orders & invoices" },
                { icon: Monitor,      label: "POS Terminal",    desc: "Fast counter billing" },
                { icon: Truck,        label: "Suppliers",       desc: "Payable balances" },
                { icon: ShoppingBag,  label: "Purchases",       desc: "Stock buying & cost" },
                { icon: Boxes,        label: "Inventory",       desc: "Live stock levels" },
                { icon: CalendarClock,label: "Installments",    desc: "EMI / payment plans" },
                { icon: BarChart3,    label: "Reports",         desc: "Profit & activity" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-card border rounded-lg p-3 flex items-start gap-2.5">
                  <Icon size={16} className="text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold">{label}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <Note>This system is web-based and works on any device — desktop, tablet, or phone — using the browser.</Note>
          </Section>

          {/* ── LOGIN & ROLES ─────────────────────────────────────────── */}
          <Section id="login" icon={UserCog} title="Login & User Roles" color="border-slate-500 text-slate-400">
            <p className="text-sm text-muted-foreground mb-4">
              Open the app in any browser and enter your username and password. The system uses role-based access — each role sees only the modules they need.
            </p>

            <div className="grid md:grid-cols-3 gap-3 mb-4">
              {[
                { role: "Owner", color: "border-yellow-500/40 bg-yellow-500/5", desc: "Full access to all modules including reports, users, suppliers, purchases, and all financial data." },
                { role: "Cashier", color: "border-blue-500/40 bg-blue-500/5", desc: "Access to cashbook, customers, sales, payments, POS terminal, and installments." },
                { role: "Salesman", color: "border-green-500/40 bg-green-500/5", desc: "Access to customers, sale orders, products, and POS terminal only." },
              ].map(({ role, color, desc }) => (
                <div key={role} className={`border rounded-lg p-3 ${color}`}>
                  <div className="font-semibold text-sm mb-1.5">{role}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>

            <Card title="Default Admin Credentials">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Username:</span> <span className="font-mono font-bold">admin</span></div>
                <div><span className="text-muted-foreground">Password:</span> <span className="font-mono font-bold">admin123</span></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Create additional staff accounts via the <strong>Users</strong> module. Change the admin password from there as well.</p>
            </Card>
          </Section>

          {/* ── DASHBOARD ────────────────────────────────────────────── */}
          <Section id="dashboard" icon={LayoutDashboard} title="Dashboard" color="border-violet-500 text-violet-400">
            <p className="text-sm text-muted-foreground mb-4">
              The dashboard is the first thing you see after login. It gives a real-time summary of the business at a glance.
            </p>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              {[
                { title: "Total Receivable",    desc: "Sum of all outstanding customer balances — what customers owe you." },
                { title: "Today's Sales",       desc: "Total value of sale orders created today." },
                { title: "Today's Collections", desc: "Cash and bank payments received today." },
                { title: "Cash in Hand",        desc: "Running cashbook balance (cash_in minus cash_out)." },
                { title: "Top Debtors",         desc: "Customers with the highest outstanding balances." },
                { title: "Recent Activity",     desc: "Latest sales, payments, and purchases across all modules." },
              ].map(({ title, desc }) => (
                <div key={title} className="flex gap-2.5 bg-card border rounded-lg p-3">
                  <CheckCircle2 size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  <div><div className="text-sm font-medium">{title}</div><div className="text-xs text-muted-foreground mt-0.5">{desc}</div></div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── CASHBOOK ─────────────────────────────────────────────── */}
          <Section id="cashbook" icon={BookMarked} title="Cashbook" color="border-emerald-500 text-emerald-400">
            <p className="text-sm text-muted-foreground mb-4">
              The cashbook is your physical cash register in digital form. Every rupee that enters or leaves the business in cash is recorded here. It shows a running balance so you always know exactly how much cash is on hand.
            </p>

            <Card title="What the Cashbook Records">
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2"><ChevronRight size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span><strong>Cash In:</strong> Customer cash payments (auto-posted when you record a cash payment), any other cash received</span></li>
                <li className="flex items-start gap-2"><ChevronRight size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span><strong>Cash Out:</strong> Cash paid to suppliers for purchases, salaries, rent, electricity, labour, vehicle expenses</span></li>
                <li className="flex items-start gap-2"><ChevronRight size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span><strong>Running Balance:</strong> Automatically calculated after every entry — you always see the current cash position</span></li>
              </ul>
            </Card>

            <Card title="How to Add a Manual Entry">
              <Step n={1}>Click <strong>Cashbook</strong> in the sidebar.</Step>
              <Step n={2}>Click the <strong>+ Add Entry</strong> button at the top right.</Step>
              <Step n={3}>Select <strong>Cash In</strong> or <strong>Cash Out</strong>.</Step>
              <Step n={4}>Enter the Date, Description (e.g. "Staff Salary June"), and Amount.</Step>
              <Step n={5}>Click <strong>Save</strong>. The running balance updates immediately.</Step>
            </Card>

            <Card title="Filtering & Views">
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex gap-2"><ChevronRight size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span>Use the <strong>Date Range</strong> filter to view any period (today, this week, this month, custom).</span></li>
                <li className="flex gap-2"><ChevronRight size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span>Switch between <strong>All</strong>, <strong>Cash In</strong>, and <strong>Cash Out</strong> tabs to focus on inflows or outflows.</span></li>
                <li className="flex gap-2"><ChevronRight size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span>The <strong>Expenses</strong> tab shows only manual expense entries for cost tracking.</span></li>
                <li className="flex gap-2"><ChevronRight size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span>Filter by <strong>Payment Mode</strong> (Cash / Bank) to separate physical cash from bank transactions.</span></li>
              </ul>
            </Card>

            <Tip>You do NOT need to manually add cashbook entries for customer cash payments — the system posts them automatically when you record a payment in the Payments module.</Tip>
          </Section>

          {/* ── CUSTOMERS ────────────────────────────────────────────── */}
          <Section id="customers" icon={Users} title="Customers" color="border-blue-500 text-blue-400">
            <p className="text-sm text-muted-foreground mb-4">
              The customer module maintains a complete ledger for each customer — their purchase history, how much they owe, and every payment they have made.
            </p>

            <Card title="Adding a New Customer">
              <Step n={1}>Go to <strong>Customers</strong> → click <strong>+ Add Customer</strong>.</Step>
              <Step n={2}>Enter the customer's name, area/city, and contact number.</Step>
              <Step n={3}>Set an <strong>Opening Balance</strong> if they already owe money from before the system was set up, along with the opening balance date.</Step>
              <Step n={4}>Optionally set a <strong>Credit Limit</strong> — the maximum amount they can owe at any time.</Step>
              <Step n={5}>Click <strong>Save Customer</strong>.</Step>
            </Card>

            <Card title="Customer Ledger (Detail View)">
              <p className="text-xs text-muted-foreground mb-2">Click any customer row to open their full account ledger. You will see:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex gap-2"><ChevronRight size={12} className="text-blue-400 mt-0.5 flex-shrink-0" /><span><strong>Current Balance</strong> — total outstanding (opening balance + all sales − all payments)</span></li>
                <li className="flex gap-2"><ChevronRight size={12} className="text-blue-400 mt-0.5 flex-shrink-0" /><span><strong>Transaction History</strong> — chronological list of every sale and payment</span></li>
                <li className="flex gap-2"><ChevronRight size={12} className="text-blue-400 mt-0.5 flex-shrink-0" /><span><strong>Quick Record Payment</strong> button — to log a payment without leaving the ledger</span></li>
              </ul>
            </Card>

            <FieldTable rows={[
              ["Name", "Full trading name of the customer or business"],
              ["Area", "City or locality (e.g. Lahore, Faisalabad)"],
              ["Contact", "Phone number for reference"],
              ["Opening Balance", "Amount already owed before the system start date"],
              ["Credit Limit", "Maximum allowed outstanding balance (optional)"],
            ]} />
          </Section>

          {/* ── SALES ────────────────────────────────────────────────── */}
          <Section id="sales" icon={ShoppingCart} title="Sales (Ledger & Orders)" color="border-orange-500 text-orange-400">
            <p className="text-sm text-muted-foreground mb-4">
              Every sale creates a Sale Order — a dated invoice that records what was sold, to whom, at what rate, and in what quantity. Sale orders form the backbone of the customer ledger.
            </p>

            <Card title="Creating a Sale Order">
              <Step n={1}>Click <strong>Sales</strong> in the sidebar → click <strong>+ New Sale Order</strong>.</Step>
              <Step n={2}>Select the <strong>Customer</strong> from the dropdown.</Step>
              <Step n={3}>Set the <strong>Date</strong> of the sale (defaults to today).</Step>
              <Step n={4}>Optionally enter <strong>Vehicle No.</strong>, <strong>Driver Name</strong>, and <strong>Billty No.</strong> for delivery tracking.</Step>
              <Step n={5}>Click <strong>+ Add Item</strong>. Select the product, enter quantity (bags), and confirm the rate per bag.</Step>
              <Step n={6}>Add as many products as needed. The total is calculated automatically.</Step>
              <Step n={7}>Click <strong>Save Order</strong>. The order is added to the customer's balance immediately.</Step>
            </Card>

            <Tip>The rate field is pre-filled from the product's current rate but you can override it per order — useful for negotiated prices on bulk orders.</Tip>

            <Card title="Viewing & Printing Orders">
              <p className="text-xs text-muted-foreground">From the Sales list, click any order to view the full invoice. Use the browser's print function to print it as a delivery challan for the customer.</p>
            </Card>

            <Note>Deleting a sale order will remove it from the customer's balance but does NOT reverse any payments already recorded against it.</Note>
          </Section>

          {/* ── PAYMENTS ─────────────────────────────────────────────── */}
          <Section id="payments" icon={CreditCard} title="Payments (Customer Receipts)" color="border-teal-500 text-teal-400">
            <p className="text-sm text-muted-foreground mb-4">
              When a customer pays — in cash or by bank transfer — you record it here. Payments reduce the customer's outstanding balance.
            </p>

            <Card title="Recording a Payment">
              <Step n={1}>Click <strong>Payments</strong> in the sidebar → click <strong>+ Record Payment</strong>.</Step>
              <Step n={2}>Select the <strong>Customer</strong>.</Step>
              <Step n={3}>Enter the <strong>Date</strong> and <strong>Amount</strong>.</Step>
              <Step n={4}>Choose <strong>Payment Type</strong>: Cash or Bank Transfer.</Step>
              <Step n={5}>For bank: optionally enter <strong>Bank Account</strong> reference and <strong>Cheque No.</strong></Step>
              <Step n={6}>Click <strong>Save</strong>. The balance updates instantly.</Step>
            </Card>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                <div className="text-xs font-semibold text-emerald-400 mb-1">Cash Payment</div>
                <div className="text-xs text-muted-foreground">Automatically posted to the Cashbook as a Cash In entry. You will see it in the cashbook immediately.</div>
              </div>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-400 mb-1">Bank Payment</div>
                <div className="text-xs text-muted-foreground">Reduces the customer balance. Does NOT appear in the cashbook (bank entries are tracked separately).</div>
              </div>
            </div>

            <Tip>You can also record payments directly from the Customer Detail page — click on a customer, then use the "Record Payment" button.</Tip>
          </Section>

          {/* ── POS ──────────────────────────────────────────────────── */}
          <Section id="pos" icon={Monitor} title="POS Terminal (Point of Sale)" color="border-pink-500 text-pink-400">
            <p className="text-sm text-muted-foreground mb-4">
              The POS terminal is designed for fast, at-the-counter billing. Instead of going through the full sale order form, you can create a complete sale and record payment in one screen — ideal for walk-in customers or busy dispatch moments.
            </p>

            <Card title="Making a Sale on the POS">
              <Step n={1}>Click <strong>POS</strong> in the sidebar.</Step>
              <Step n={2}>Use the <strong>product search bar</strong> at the top of the left panel. Type the cement brand name and press Enter or click to add it to the cart.</Step>
              <Step n={3}>Adjust the <strong>quantity</strong> using the +/− buttons, or type the exact number. The rate is pre-filled; you can override it by clicking the rate field.</Step>
              <Step n={4}>Add more products if needed. The cart total updates live.</Step>
              <Step n={5}>On the right panel, <strong>select the Customer</strong> from the search dropdown. Their outstanding balance is shown.</Step>
              <Step n={6}>Optionally expand <strong>Vehicle / Driver details</strong> and enter the vehicle number, driver name, and billty number.</Step>
              <Step n={7}>Under <strong>Payment</strong>, choose Full, Partial, or Credit.</Step>
              <Step n={8}>Select payment mode (Cash / Bank / Cheque) and confirm the amount.</Step>
              <Step n={9}>Click <strong>Complete Sale</strong>. The system creates the sale order and records the payment simultaneously.</Step>
              <Step n={10}>A <strong>receipt</strong> appears — print it for the customer or click New Sale to reset for the next customer.</Step>
            </Card>

            <div className="grid md:grid-cols-3 gap-3 mb-4">
              <div className="bg-card border rounded-lg p-3">
                <div className="text-xs font-semibold mb-1">Full Payment</div>
                <div className="text-xs text-muted-foreground">Customer pays the entire invoice amount. Change is calculated automatically if they pay more.</div>
              </div>
              <div className="bg-card border rounded-lg p-3">
                <div className="text-xs font-semibold mb-1">Partial Payment</div>
                <div className="text-xs text-muted-foreground">Customer pays part of the bill. The remainder goes to their credit balance (they owe the rest).</div>
              </div>
              <div className="bg-card border rounded-lg p-3">
                <div className="text-xs font-semibold mb-1">Credit</div>
                <div className="text-xs text-muted-foreground">No payment is collected. The full amount is added to the customer's outstanding balance (credit sale).</div>
              </div>
            </div>

            <Tip>Products with zero stock are shown greyed out and cannot be added to the cart. Check the Inventory page to see which brands are running low.</Tip>
          </Section>

          {/* ── SUPPLIERS ────────────────────────────────────────────── */}
          <Section id="suppliers" icon={Truck} title="Suppliers" color="border-purple-500 text-purple-400">
            <p className="text-sm text-muted-foreground mb-4">
              The Suppliers module tracks all the cement factories and distributors you buy from, and shows how much you currently owe each of them.
            </p>

            <Card title="Adding a Supplier">
              <Step n={1}>Click <strong>Suppliers</strong> → click <strong>+ Add Supplier</strong>.</Step>
              <Step n={2}>Enter the supplier name, contact number, and address.</Step>
              <Step n={3}>If you already owed them money before using this system, enter an <strong>Opening Balance</strong>.</Step>
              <Step n={4}>Click <strong>Save</strong>.</Step>
            </Card>

            <Card title="Supplier Detail Page">
              <p className="text-xs text-muted-foreground mb-2">Clicking a supplier opens their full statement, showing:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex gap-2"><ChevronRight size={12} className="text-purple-400 mt-0.5 flex-shrink-0" /><span><strong>Current Payable Balance</strong> = Opening Balance + Total Purchases − Total Paid</span></li>
                <li className="flex gap-2"><ChevronRight size={12} className="text-purple-400 mt-0.5 flex-shrink-0" /><span>Full history of purchase invoices</span></li>
                <li className="flex gap-2"><ChevronRight size={12} className="text-purple-400 mt-0.5 flex-shrink-0" /><span>All payments made to the supplier</span></li>
              </ul>
            </Card>
          </Section>

          {/* ── PURCHASES ────────────────────────────────────────────── */}
          <Section id="purchases" icon={ShoppingBag} title="Purchases" color="border-rose-500 text-rose-400">
            <p className="text-sm text-muted-foreground mb-4">
              Every time you buy cement from a supplier, you record a Purchase Invoice here. This increases your stock and increases your payable balance with that supplier.
            </p>

            <Card title="Recording a Purchase">
              <Step n={1}>Click <strong>Purchases</strong> → click <strong>+ New Purchase</strong>.</Step>
              <Step n={2}>Select the <strong>Supplier</strong>.</Step>
              <Step n={3}>Enter the <strong>Invoice Number</strong> (from the supplier's bill) and the <strong>Date</strong>.</Step>
              <Step n={4}>Click <strong>+ Add Item</strong>. Select the cement product, enter quantity in bags, and enter the cost rate per bag.</Step>
              <Step n={5}>Add all products from that delivery.</Step>
              <Step n={6}>Under <strong>Payment</strong>, enter how much you paid now (Paid Amount) and choose Cash or Bank.</Step>
              <Step n={7}>Click <strong>Save Invoice</strong>.</Step>
            </Card>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              <div className="bg-card border rounded-lg p-3">
                <div className="text-xs font-semibold mb-1">Effect on Inventory</div>
                <div className="text-xs text-muted-foreground">Purchased bags are immediately added to the product's stock level. The product's cost price is also updated to the latest purchase rate.</div>
              </div>
              <div className="bg-card border rounded-lg p-3">
                <div className="text-xs font-semibold mb-1">Effect on Cashbook</div>
                <div className="text-xs text-muted-foreground">If you paid in cash, a Cash Out entry is automatically posted to the cashbook.</div>
              </div>
            </div>

            <Warn>Deleting a purchase invoice will remove the stock that was added by it. Be careful — this can cause the inventory to show incorrect figures.</Warn>
          </Section>

          {/* ── INVENTORY ────────────────────────────────────────────── */}
          <Section id="inventory" icon={Boxes} title="Inventory Management" color="border-cyan-500 text-cyan-400">
            <p className="text-sm text-muted-foreground mb-4">
              Inventory shows you real-time stock levels for every cement brand, identifies what is running low, and lets you make manual adjustments for breakage, samples, or counting corrections.
            </p>

            <Card title="How Stock is Calculated">
              <div className="bg-muted/20 rounded p-3 text-sm font-mono text-center mb-3">
                Current Stock = Opening Stock + Purchased Bags − Sold Bags ± Adjustments
              </div>
              <p className="text-xs text-muted-foreground">The system calculates this automatically from all your purchase invoices and sale orders. You never manually type a stock number — it flows from your transactions.</p>
            </Card>

            <Card title="Stock Adjustment">
              <Step n={1}>Go to <strong>Inventory</strong> and click on any product.</Step>
              <Step n={2}>Click <strong>Add Adjustment</strong>.</Step>
              <Step n={3}>Enter the quantity — positive to add stock (e.g. found extra bags), negative to remove (e.g. breakage, sample given).</Step>
              <Step n={4}>Enter a reason and save. The adjustment is logged with the date and reason.</Step>
            </Card>

            <Card title="What the Colour Indicators Mean">
              <ul className="text-xs text-muted-foreground space-y-1">
                <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 flex-shrink-0" /><span><strong>Green</strong> — stock is healthy (above minimum level)</span></li>
                <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-amber-400 mt-1 flex-shrink-0" /><span><strong>Yellow</strong> — stock is at or near the minimum level — time to reorder</span></li>
                <li className="flex gap-2"><span className="w-2 h-2 rounded-full bg-red-400 mt-1 flex-shrink-0" /><span><strong>Red</strong> — stock is zero or below minimum — urgent reorder needed</span></li>
              </ul>
            </Card>

            <Tip>Set a <strong>Minimum Stock</strong> level for each product (done in the Products module). The inventory page will then flag anything that drops below that threshold.</Tip>
          </Section>

          {/* ── INSTALLMENTS ─────────────────────────────────────────── */}
          <Section id="installments" icon={CalendarClock} title="Installments (EMI / Payment Plans)" color="border-amber-500 text-amber-400">
            <p className="text-sm text-muted-foreground mb-4">
              When a customer wants to pay a large bill in monthly instalments, you create an Installment Plan. The system generates a schedule and tracks every payment against the plan.
            </p>

            <Card title="Creating an Installment Plan">
              <Step n={1}>Click <strong>Installments</strong> → click <strong>+ New Plan</strong>.</Step>
              <Step n={2}>Select the <strong>Customer</strong>.</Step>
              <Step n={3}>Optionally link to an existing <strong>Sale Order</strong>.</Step>
              <Step n={4}>Enter the <strong>Total Amount</strong>, <strong>Down Payment</strong> (collected upfront), number of <strong>Instalments</strong>, and <strong>Frequency</strong> (monthly, weekly).</Step>
              <Step n={5}>Set the <strong>Start Date</strong> — the first instalment due date.</Step>
              <Step n={6}>Click <strong>Create Plan</strong>. The system automatically generates the full instalment schedule.</Step>
            </Card>

            <Card title="Recording an Instalment Payment">
              <Step n={1}>Open the plan from the Installments list.</Step>
              <Step n={2}>You will see each instalment with its due date, amount, and status (Pending / Paid / Overdue).</Step>
              <Step n={3}>Click <strong>Record Payment</strong> next to the due instalment.</Step>
              <Step n={4}>Confirm the amount and payment mode. Click <strong>Save</strong>.</Step>
              <Step n={5}>The instalment is marked Paid. The plan shows overall progress.</Step>
            </Card>

            <Note>Overdue instalments (past due date, not yet paid) are highlighted in red so you can chase customers easily.</Note>
          </Section>

          {/* ── REPORTS ──────────────────────────────────────────────── */}
          <Section id="reports" icon={BarChart3} title="Reports" color="border-indigo-500 text-indigo-400">
            <p className="text-sm text-muted-foreground mb-4">
              The Reports module gives you a daily and periodic summary of business performance — sales, collections, costs, and estimated profit.
            </p>

            <div className="grid md:grid-cols-2 gap-3 mb-4">
              {[
                { title: "Daily Profit Report", desc: "Sales revenue minus cost of goods sold for a single day. Shows gross profit per day and profit margin." },
                { title: "Monthly Summary", desc: "Aggregate of all sales, purchases, collections, and expenses for any selected month." },
                { title: "Sales Activity", desc: "Bar chart of daily sales volumes over a date range — good for spotting busy and slow periods." },
                { title: "Top Customers", desc: "Ranked list of customers by total purchase volume or outstanding balance." },
                { title: "Product-wise Sales", desc: "Which cement brands are selling the most bags and generating the most revenue." },
                { title: "Cash Flow", desc: "Total cash in vs. cash out over a period, showing net cash position." },
              ].map(({ title, desc }) => (
                <div key={title} className="flex gap-2.5 bg-card border rounded-lg p-3">
                  <BarChart3 size={13} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div><div className="text-xs font-medium">{title}</div><div className="text-xs text-muted-foreground mt-0.5">{desc}</div></div>
                </div>
              ))}
            </div>

            <Tip>Use the date range picker at the top of the Reports page to compare different periods — for example, this month vs. last month.</Tip>
          </Section>

          {/* ── PRODUCTS ─────────────────────────────────────────────── */}
          <Section id="products" icon={Package} title="Products (Catalogue)" color="border-lime-500 text-lime-400">
            <p className="text-sm text-muted-foreground mb-4">
              The Products module is your catalogue of cement brands. Rates set here are the defaults used in sale orders and the POS terminal.
            </p>

            <Card title="Adding a Product">
              <Step n={1}>Click <strong>Products</strong> → click <strong>+ Add Product</strong>.</Step>
              <Step n={2}>Enter the brand name (e.g. "Lucky Cement").</Step>
              <Step n={3}>Set the <strong>Current Rate</strong> — the selling price per 50 kg bag in Rupees.</Step>
              <Step n={4}>Set the <strong>Cost Price</strong> — what you pay per bag (used for profit calculation).</Step>
              <Step n={5}>Set <strong>Opening Stock</strong> — how many bags you currently have.</Step>
              <Step n={6}>Set <strong>Minimum Stock</strong> — the reorder threshold (e.g. 100 bags).</Step>
              <Step n={7}>Click <strong>Save</strong>.</Step>
            </Card>

            <Card title="Updating the Rate">
              <p className="text-xs text-muted-foreground">When the market price changes, click on the product and update the Current Rate. The new rate will be used for all future sale orders and POS bills. Existing orders are not affected.</p>
            </Card>

            <Note>The cost price is also automatically updated every time you record a purchase for that product — it takes the latest purchase rate as the new cost price.</Note>
          </Section>

          {/* ── USERS ────────────────────────────────────────────────── */}
          <Section id="users" icon={UserCog} title="Users (Staff Accounts)" color="border-slate-500 text-slate-400">
            <p className="text-sm text-muted-foreground mb-4">
              Create separate accounts for each staff member so they can log in with their own credentials and see only the modules relevant to their role.
            </p>

            <Card title="Creating a Staff Account">
              <Step n={1}>Click <strong>Users</strong> (Owner role only) → click <strong>+ Add User</strong>.</Step>
              <Step n={2}>Enter the staff member's name and a unique username.</Step>
              <Step n={3}>Set a password for them.</Step>
              <Step n={4}>Select their <strong>Role</strong>: Owner, Cashier, or Salesman.</Step>
              <Step n={5}>Click <strong>Save</strong>. They can now log in with those credentials.</Step>
            </Card>

            <FieldTable rows={[
              ["Owner",    "Full access to everything including financial reports, purchases, and user management"],
              ["Cashier",  "Cashbook, customers, sales, payments, POS, installments — no supplier or report access"],
              ["Salesman", "Customers, sale orders, products, and POS only — no financial data"],
            ]} />

            <Warn>Only the Owner role can add or edit users and see financial reports. Keep the admin password secure.</Warn>
          </Section>

          {/* ── COMMON WORKFLOWS ─────────────────────────────────────── */}
          <Section id="workflows" icon={CheckCircle2} title="Common Daily Workflows" color="border-green-500 text-green-400">
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="📦 Customer Comes to Buy">
                <Step n={1}>Go to POS terminal</Step>
                <Step n={2}>Search and add cement products to cart</Step>
                <Step n={3}>Select customer</Step>
                <Step n={4}>Choose payment type (full/partial/credit)</Step>
                <Step n={5}>Complete Sale → Print receipt</Step>
              </Card>

              <Card title="💰 Customer Pays Old Balance">
                <Step n={1}>Go to Payments → Record Payment</Step>
                <Step n={2}>Select the customer</Step>
                <Step n={3}>Enter amount and payment mode</Step>
                <Step n={4}>Save — balance reduces instantly</Step>
              </Card>

              <Card title="🚚 New Stock Arrives">
                <Step n={1}>Go to Purchases → New Purchase</Step>
                <Step n={2}>Select supplier, enter invoice number</Step>
                <Step n={3}>Add product items with quantity and rate</Step>
                <Step n={4}>Enter how much you paid now</Step>
                <Step n={5}>Save — stock increases automatically</Step>
              </Card>

              <Card title="📊 Check Today's Business">
                <Step n={1}>Go to Dashboard — see today's sales and collections</Step>
                <Step n={2}>Go to Reports → Daily Report for profit detail</Step>
                <Step n={3}>Go to Cashbook to verify cash on hand</Step>
              </Card>

              <Card title="📋 Month-End Review">
                <Step n={1}>Go to Reports → Monthly Summary</Step>
                <Step n={2}>Check top debtors on Dashboard</Step>
                <Step n={3}>Review Installments for overdue accounts</Step>
                <Step n={4}>Check Inventory for low-stock brands</Step>
              </Card>

              <Card title="🔄 Stock Count Correction">
                <Step n={1}>Go to Inventory</Step>
                <Step n={2}>Find the product with the discrepancy</Step>
                <Step n={3}>Click Add Adjustment</Step>
                <Step n={4}>Enter the difference (+ or −) and reason</Step>
              </Card>
            </div>
          </Section>

          {/* Footer */}
          <div className="border-t pt-8 mt-8 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-sm mb-1">AL-RAHMAN TRADERS ERP</p>
            <p>Cement Wholesale Management System · For internal use only</p>
          </div>

        </main>
      </div>

      <style>{`
        @media print {
          aside { display: none !important; }
          .print\\:hidden { display: none !important; }
          body { background: white; color: black; }
          section { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
