-- ============================================================
-- AL-RAHMAN TRADERS — Comprehensive Seed Data
-- ============================================================
-- Prerequisite: the Drizzle-managed schema must already exist.
-- Run `pnpm run setup:local` (or `pnpm --filter @workspace/db run
-- push-force`) first — this script only inserts data, it does not
-- create the app's core tables.
--
-- Usage:
--   psql -d "$DATABASE_URL" -f scripts/seed.sql        (bash/PowerShell)
--   psql -d "%DATABASE_URL%" -f scripts/seed.sql        (cmd.exe)
-- (use -d explicitly — passing the connection string positionally has
-- been flaky with some local psql builds)
--
-- Safe to re-run: transactional/reference tables are wiped and
-- reloaded, while `users` and `company_settings` are only created
-- if missing (re-running won't invalidate an existing login or
-- reset company branding you've set via the UI).
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'Schema not found. Run "pnpm run setup:local" (or "pnpm --filter @workspace/db run push-force") before seeding.';
  END IF;
END $$;

-- ============================================================
-- 0a. company_settings — not part of the Drizzle schema (managed
--     via raw pool queries, see CLAUDE.md), so it's created here.
-- ============================================================
CREATE TABLE IF NOT EXISTS company_settings (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'My Company',
  tagline TEXT,
  business_type TEXT,
  currency TEXT NOT NULL DEFAULT 'Rs',
  logo_data TEXT,
  logo_scale INTEGER NOT NULL DEFAULT 100,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO company_settings (company_name, tagline, business_type, currency, address, phone, email)
SELECT 'AL-RAHMAN TRADERS', 'Cement, Steel & Building Materials', 'Building Materials Supplier', 'Rs',
       'G.T Road, Wah Cantt, Punjab', '051-2345678', 'info@alrahmantraders.pk'
WHERE NOT EXISTS (SELECT 1 FROM company_settings);

-- ============================================================
-- 0b. Admin login — idempotent, won't touch an existing account.
--     pgcrypto's blowfish hashes are readable by the bcryptjs
--     compare() call the app uses at login.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (name, username, password_hash, role)
VALUES ('Admin', 'admin', crypt('admin123', gen_salt('bf', 10)), 'owner')
ON CONFLICT (username) DO NOTHING;

-- ============================================================
-- 1. Wipe transactional/reference data (order respects FK constraints)
--    Deliberately excludes users, company_settings, user_sessions.
-- ============================================================
TRUNCATE TABLE
  installment_payments, installment_schedule, installment_plans,
  stock_adjustments, purchase_invoice_items, purchase_invoices,
  sale_order_items, sale_orders, payments,
  cashbook_entries, expenses, product_rates,
  suppliers, customers, products, lookup_values
RESTART IDENTITY CASCADE;

-- ============================================================
-- 2. LOOKUP VALUES — category/unit dropdown options
-- ============================================================
INSERT INTO lookup_values (type, value) VALUES
  ('category', 'Cement'),
  ('category', 'Lebar'),
  ('category', 'Bricks'),
  ('category', 'Sand & Aggregates'),
  ('unit', 'bag'),
  ('unit', 'bundle'),
  ('unit', 'thousand'),
  ('unit', 'trolley');

-- ============================================================
-- 3. PRODUCTS — 4 categories, all fields populated
-- ============================================================
INSERT INTO products (name, category, unit, current_rate, cost_price, opening_stock, min_stock) VALUES
  -- Cement
  ('Lucky Cement',       'Cement', 'bag',    1480, 1350, 2500, 500),
  ('Fauji Cement',       'Cement', 'bag',    1450, 1320, 1800, 400),
  ('Bestway Cement',     'Cement', 'bag',    1460, 1330, 1200, 300),
  ('Maple Leaf Cement',  'Cement', 'bag',    1440, 1310, 800,  200),
  -- Lebar (Deformed Steel Bars)
  ('Lebar 3/8" (10mm)',  'Lebar',  'bundle', 72000, 68000, 120, 30),
  ('Lebar 1/2" (12mm)',  'Lebar',  'bundle', 88000, 83000, 90,  20),
  ('Lebar 5/8" (16mm)',  'Lebar',  'bundle', 115000,109000, 60, 15),
  -- Bricks
  ('Red Brick (1st)',    'Bricks', 'thousand', 22000, 18000, 400, 100),
  ('Red Brick (2nd)',    'Bricks', 'thousand', 17000, 13500, 250, 80),
  ('Block Brick (4")',   'Bricks', 'thousand', 35000, 30000, 150, 50),
  -- Sand & Aggregates
  ('Crush (3/4")',       'Sand & Aggregates', 'trolley', 8500, 7200, 200, 50),
  ('Sand (Lawrencepur)', 'Sand & Aggregates', 'trolley', 5500, 4600, 180, 50);

-- Product rate history
INSERT INTO product_rates (product_id, rate, effective_date) VALUES
  (1, 1380, '2026-01-01'), (1, 1420, '2026-03-01'), (1, 1480, '2026-05-01'),
  (2, 1350, '2026-01-01'), (2, 1390, '2026-03-01'), (2, 1450, '2026-05-01'),
  (3, 1360, '2026-01-01'), (3, 1400, '2026-03-01'), (3, 1460, '2026-05-01'),
  (4, 1340, '2026-01-01'), (4, 1380, '2026-03-01'), (4, 1440, '2026-05-01'),
  (5, 68000,'2026-01-01'), (5, 70000,'2026-03-01'), (5, 72000,'2026-05-01'),
  (6, 84000,'2026-01-01'), (6, 86000,'2026-03-01'), (6, 88000,'2026-05-01'),
  (7,108000,'2026-01-01'), (7,112000,'2026-03-01'), (7,115000,'2026-05-01'),
  (8, 19000,'2026-01-01'), (8, 20500,'2026-03-01'), (8, 22000,'2026-05-01'),
  (9, 14000,'2026-01-01'), (9, 15500,'2026-03-01'), (9, 17000,'2026-05-01'),
  (10,30000,'2026-01-01'),(10,32000,'2026-03-01'),(10,35000,'2026-05-01'),
  (11, 7500,'2026-01-01'),(11, 8000,'2026-03-01'),(11, 8500,'2026-05-01'),
  (12, 4800,'2026-01-01'),(12, 5200,'2026-03-01'),(12, 5500,'2026-05-01');

-- ============================================================
-- 4. SUPPLIERS — 4 suppliers, all fields
-- ============================================================
INSERT INTO suppliers (name, contact, address, ntn, opening_balance, opening_balance_date) VALUES
  ('Lucky Cement Ltd.',         '051-2345678', 'Plot 12, Hattar Industrial Estate, KPK',      '1234567-8', 850000,  '2026-01-01'),
  ('Fauji Cement Company',      '051-3456789', 'Nizampur, District Nowshera, KPK',            '2345678-9', 620000,  '2026-01-01'),
  ('Wah Steel & Lebar Mills',   '051-4567890', 'G.T Road, Taxila, Rawalpindi',                '3456789-0', 475000,  '2026-01-01'),
  ('Rawalpindi Brick Kiln',     '0300-9876543','Chakbeli Road, Rawalpindi',                   '4567890-1', 220000,  '2026-01-01');

-- ============================================================
-- 5. CUSTOMERS — 8 customers, all fields
-- ============================================================
INSERT INTO customers (name, area, contact, address, ntn, credit_limit, opening_balance, opening_balance_date) VALUES
  ('M/s Ali Construction',       'Wah Cantt',    '0321-5551001', 'House 12, Sector A, Wah Cantt',          '5001234-5', 2000000, 180000,  '2026-01-01'),
  ('Hamid Brothers Builders',    'Taxila',        '0333-5552002', 'Near Taxila Museum, G.T Road, Taxila',   '5002345-6', 1500000, 95000,   '2026-01-01'),
  ('Shah & Sons Hardware',       'Rawalpindi',    '0312-5553003', 'Shop 7, Raja Bazar, Rawalpindi',         '5003456-7', 1000000, 65000,   '2026-01-01'),
  ('Babar Enterprises',          'Attock',        '0345-5554004', 'Attock City, near Sui Gas Office',       '5004567-8', 1200000, 120000,  '2026-01-01'),
  ('Tariq Contractors',          'Kamra',         '0300-5555005', 'Main Kamra Road, Dist. Attock',          '5005678-9', 800000,  45000,   '2026-01-01'),
  ('Kashif Building Materials',  'Hassan Abdal',  '0333-5556006', 'G.T Road, Hassan Abdal',                 '5006789-0', 1500000, 210000,  '2026-01-01'),
  ('Imran & Sons',               'Haripur',       '0321-5557007', 'Haripur City, Near Bus Stand, KPK',      '5007890-1', 600000,  30000,   '2026-01-01'),
  ('Royal Builders',             'Wah Cantt',     '0301-5558008', 'Cantt Bazar, Wah Cantt',                 '5008901-2', 2500000, 350000,  '2026-01-01');

-- ============================================================
-- 6. SALE ORDERS — total_amount always equals sum(sale_order_items),
--    matching how the app itself computes it (see saleOrders.ts).
--    SO #16 and #29 are referenced by installment plans below, so
--    their totals must stay 260000 and 560000 respectively.
-- ============================================================
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  -- Customer 1: M/s Ali Construction
  (1, '2026-01-08',  'LEA-3421', 'Muhammad Asif',   'BT-0101', 144400,  'Urgent — foundation work'),
  (1, '2026-02-14',  'RLY-7892', 'Shahid Khan',     'BT-0112', 221000,  'Ground floor slab'),
  (1, '2026-03-22',  'LEA-3421', 'Muhammad Asif',   'BT-0139', 182000,  'Pillar concrete'),
  (1, '2026-04-10',  'ATK-2234', 'Iftikhar Ahmed',  'BT-0155', 288000,  'Roof slab mix'),
  (1, '2026-05-18',  'RLY-7892', 'Shahid Khan',     'BT-0178', 132800,  'Finishing work'),
  (1, '2026-06-05',  'LEA-3421', 'Muhammad Asif',   'BT-0191', 234000,  'Block work'),
  -- Customer 2: Hamid Brothers Builders
  (2, '2026-01-15',  'RWP-5511', 'Riaz Ahmad',      'BT-0103', 206000,  'Commercial plaza, basement'),
  (2, '2026-02-20',  'RWP-5511', 'Riaz Ahmad',      'BT-0118', 193200,  '1st floor columns'),
  (2, '2026-04-05',  'TXL-1123', 'Gulzar Hussain',  'BT-0157', 331600,  'Full floor slab'),
  (2, '2026-05-28',  'RWP-5511', 'Riaz Ahmad',      'BT-0182', 87000,   'Block partition walls'),
  -- Customer 3: Shah & Sons Hardware
  (3, '2026-01-20',  'RWP-2290', 'Khurram Bashir',  'BT-0106', 87600,   'Resale stock'),
  (3, '2026-03-10',  'RWP-2290', 'Khurram Bashir',  'BT-0133', 92860,   'Resale stock — cement'),
  (3, '2026-05-05',  'ATK-8812', 'Pervez Shah',     'BT-0172', 156000,  'Lebar order for customer'),
  (3, '2026-06-12',  'RWP-2290', 'Khurram Bashir',  'BT-0194', 66500,   'Bricks delivery'),
  -- Customer 4: Babar Enterprises
  (4, '2026-01-25',  'ATK-4401', 'Naseer Ahmed',    'BT-0108', 178400,  'New house construction'),
  (4, '2026-03-15',  'ATK-4401', 'Naseer Ahmed',    'BT-0141', 260000,  'Roof beam work'),
  (4, '2026-05-10',  'ATK-6677', 'Waqar Ali',       'BT-0175', 199800,  'Second floor'),
  -- Customer 5: Tariq Contractors
  (5, '2026-02-08',  'ATK-7730', 'Tariq Mehmood',   'BT-0115', 114600,  'Road contractor project'),
  (5, '2026-04-18',  'ATK-7730', 'Tariq Mehmood',   'BT-0162', 140000,  'Culvert construction'),
  (5, '2026-06-01',  'KMR-3344', 'Hasan Raza',      'BT-0189', 88500,   'Boundary wall'),
  -- Customer 6: Kashif Building Materials
  (6, '2026-01-10',  'HSN-2210', 'Kashif Pervaiz',  'BT-0102', 431100,  'Bulk cement stock'),
  (6, '2026-02-25',  'HSN-2210', 'Kashif Pervaiz',  'BT-0121', 353000,  'Monthly stock replenishment'),
  (6, '2026-03-28',  'RLY-9900', 'Faisal Iqbal',    'BT-0145', 338000,  'Lebar stock'),
  (6, '2026-04-22',  'HSN-2210', 'Kashif Pervaiz',  'BT-0166', 404000,  'Cement + brick mix order'),
  (6, '2026-05-30',  'RLY-9900', 'Faisal Iqbal',    'BT-0185', 328400,  'Large monthly order'),
  -- Customer 7: Imran & Sons
  (7, '2026-02-12',  'KPK-4412', 'Imran Saeed',     'BT-0116', 71200,   'Small residential job'),
  (7, '2026-04-28',  'KPK-4412', 'Imran Saeed',     'BT-0169', 93200,   'Extension work'),
  (7, '2026-06-10',  'KPK-4412', 'Imran Saeed',     'BT-0195', 56000,   'Roof finishing'),
  -- Customer 8: Royal Builders
  (8, '2026-01-05',  'WAH-1100', 'Zubair Khan',     'BT-0100', 560000,  'Phase 1 — high-rise project'),
  (8, '2026-02-18',  'WAH-1100', 'Zubair Khan',     'BT-0119', 494000,  'Phase 1 — floor 2 & 3 slab'),
  (8, '2026-03-30',  'RLY-4455', 'Danish Mehmood',  'BT-0148', 424000,  'Lebar for upper floors'),
  (8, '2026-04-25',  'WAH-1100', 'Zubair Khan',     'BT-0168', 523000,  'Floor 4 & 5 slab + walls'),
  (8, '2026-05-22',  'WAH-1100', 'Zubair Khan',     'BT-0180', 442000,  'Finishing cement + brick'),
  (8, '2026-06-15',  'RLY-4455', 'Danish Mehmood',  'BT-0196', 308000,  'Final lebar & crush'),
  -- Customer 1: M/s Ali Construction — July order, appended last so it gets
  -- id 35 and every earlier order keeps its original id (see note in
  -- section 9 on why appends beat mid-list inserts under RESTART IDENTITY)
  (1, '2026-07-14',  'LEA-3421', 'Muhammad Asif',   'BT-0201', 88800,   'July restock');

-- ============================================================
-- 7. SALE ORDER ITEMS — each order's items sum exactly to its total_amount
-- ============================================================
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  -- SO 1 (C1, 144400)
  (1, 1, 80, 1380, 110400), (1, 5, 0.5, 68000, 34000),
  -- SO 2 (C1, 221000)
  (2, 2, 100, 1390, 139000), (2, 6, 1, 82000, 82000),
  -- SO 3 (C1, 182000)
  (3, 1, 100, 1420, 142000), (3, 11, 5, 8000, 40000),
  -- SO 4 (C1, 288000)
  (4, 3, 80, 1400, 112000), (4, 7, 1, 112000, 112000), (4, 11, 8, 8000, 64000),
  -- SO 5 (C1, 132800)
  (5, 1, 60, 1480, 88800), (5, 8, 2, 22000, 44000),
  -- SO 6 (C1, 234000)
  (6, 1, 100, 1480, 148000), (6, 6, 1, 86000, 86000),
  -- SO 7 (C2, 206000)
  (7, 1, 100, 1380, 138000), (7, 5, 1, 68000, 68000),
  -- SO 8 (C2, 193200)
  (8, 2, 80, 1390, 111200), (8, 6, 1, 82000, 82000),
  -- SO 9 (C2, 331600)
  (9, 1, 120, 1480, 177600), (9, 6, 1, 88000, 88000), (9, 8, 3, 22000, 66000),
  -- SO 10 (C2, 87000)
  (10, 2, 60, 1450, 87000),
  -- SO 11 (C3, 87600)
  (11, 1, 60, 1380, 82800), (11, 12, 1, 4800, 4800),
  -- SO 12 (C3, 92860)
  (12, 2, 40, 1390, 55600), (12, 4, 27, 1380, 37260),
  -- SO 13 (C3, 156000)
  (13, 5, 1, 70000, 70000), (13, 6, 1, 86000, 86000),
  -- SO 14 (C3, 66500)
  (14, 8, 2, 22000, 44000), (14, 9, 1, 17000, 17000), (14, 12, 1, 5500, 5500),
  -- SO 15 (C4, 178400)
  (15, 1, 80, 1380, 110400), (15, 5, 1, 68000, 68000),
  -- SO 16 (C4, 260000) — tied to installment plan #2, total must stay 260000
  (16, 2, 100, 1420, 142000), (16, 7, 1, 112000, 112000), (16, 11, 0.75, 8000, 6000),
  -- SO 17 (C4, 199800)
  (17, 3, 80, 1460, 116800), (17, 8, 3, 22000, 66000), (17, 11, 2, 8500, 17000),
  -- SO 18 (C5, 114600)
  (18, 1, 60, 1390, 83400), (18, 12, 6, 5200, 31200),
  -- SO 19 (C5, 140000)
  (19, 2, 80, 1450, 116000), (19, 11, 3, 8000, 24000),
  -- SO 20 (C5, 88500)
  (20, 8, 2, 22000, 44000), (20, 9, 1, 17000, 17000), (20, 12, 5, 5500, 27500),
  -- SO 21 (C6, 431100)
  (21, 1, 200, 1380, 276000), (21, 2, 100, 1350, 135000), (21, 4, 15, 1340, 20100),
  -- SO 22 (C6, 353000)
  (22, 1, 150, 1420, 213000), (22, 3, 100, 1400, 140000),
  -- SO 23 (C6, 338000)
  (23, 5, 2, 70000, 140000), (23, 6, 1, 86000, 86000), (23, 7, 1, 112000, 112000),
  -- SO 24 (C6, 404000)
  (24, 1, 150, 1480, 222000), (24, 2, 80, 1450, 116000), (24, 8, 3, 22000, 66000),
  -- SO 25 (C6, 328400)
  (25, 1, 120, 1480, 177600), (25, 3, 80, 1460, 116800), (25, 11, 4, 8500, 34000),
  -- SO 26 (C7, 71200)
  (26, 2, 40, 1390, 55600), (26, 12, 3, 5200, 15600),
  -- SO 27 (C7, 93200)
  (27, 1, 40, 1480, 59200), (27, 9, 2, 17000, 34000),
  -- SO 28 (C7, 56000)
  (28, 11, 4, 8500, 34000), (28, 12, 4, 5500, 22000),
  -- SO 29 (C8, 560000) — tied to installment plan #1, total must stay 560000
  (29, 1, 200, 1400, 280000), (29, 6, 2, 82000, 164000), (29, 7, 1, 112000, 112000), (29, 11, 0.5, 8000, 4000),
  -- SO 30 (C8, 494000)
  (30, 2, 200, 1390, 278000), (30, 7, 2, 108000, 216000),
  -- SO 31 (C8, 424000)
  (31, 5, 2, 70000, 140000), (31, 6, 2, 86000, 172000), (31, 7, 1, 112000, 112000),
  -- SO 32 (C8, 523000)
  (32, 1, 200, 1480, 296000), (32, 6, 2, 88000, 176000), (32, 11, 6, 8500, 51000),
  -- SO 33 (C8, 442000)
  (33, 1, 180, 1480, 266400), (33, 3, 60, 1460, 87600), (33, 8, 4, 22000, 88000),
  -- SO 34 (C8, 308000)
  (34, 6, 2, 88000, 176000), (34, 7, 1, 115000, 115000), (34, 11, 2, 8500, 17000),
  -- SO 35 (C1, 88800)
  (35, 1, 60, 1480, 88800);

-- ============================================================
-- 8. PAYMENTS — bank + cash, various dates
-- ============================================================
INSERT INTO payments (customer_id, date, type, amount, bank_account, cheque_no, notes) VALUES
  -- C1: Ali Construction
  (1, '2026-01-25', 'cash', 100000, NULL, NULL, 'Cash payment — Site visit'),
  (1, '2026-02-28', 'bank', 150000, 'HBL-1234', 'CHQ-78901', 'Cheque — Feb settlement'),
  (1, '2026-04-01', 'cash', 80000,  NULL, NULL, 'Part payment'),
  (1, '2026-05-05', 'bank', 200000, 'MCB-5678', 'CHQ-78945', 'Bank transfer — April dues'),
  (1, '2026-06-10', 'cash', 120000, NULL, NULL, 'Cash — June advance'),
  -- C2: Hamid Brothers
  (2, '2026-02-01', 'cash', 80000,  NULL, NULL, 'Cash received'),
  (2, '2026-03-10', 'bank', 200000, 'HBL-2233', 'CHQ-79010', 'Cheque — Feb+Mar dues'),
  (2, '2026-05-15', 'bank', 150000, 'UBL-4411', 'CHQ-79088', 'Transfer — April dues'),
  -- C3: Shah & Sons
  (3, '2026-02-10', 'cash', 50000,  NULL, NULL, 'Cash'),
  (3, '2026-04-05', 'bank', 80000,  'MCB-8899', 'CHQ-79020', 'Cheque'),
  (3, '2026-06-05', 'cash', 60000,  NULL, NULL, 'Part payment June'),
  -- C4: Babar Enterprises
  (4, '2026-02-15', 'bank', 100000, 'HBL-3344', 'CHQ-79030', 'Cheque Jan settlement'),
  (4, '2026-04-01', 'cash', 80000,  NULL, NULL, 'Cash March dues'),
  (4, '2026-06-01', 'bank', 120000, 'UBL-5566', 'CHQ-79100', 'Transfer May dues'),
  -- C5: Tariq Contractors
  (5, '2026-03-01', 'cash', 60000,  NULL, NULL, 'Cash payment Feb'),
  (5, '2026-05-10', 'bank', 100000, 'MCB-7788', 'CHQ-79055', 'Cheque April payment'),
  -- C6: Kashif (bulk, large payments)
  (6, '2026-02-05', 'bank', 300000, 'HBL-9900', 'CHQ-79011', 'Monthly bank transfer Jan'),
  (6, '2026-03-05', 'bank', 280000, 'HBL-9900', 'CHQ-79038', 'Monthly bank transfer Feb'),
  (6, '2026-04-07', 'bank', 320000, 'HBL-9900', 'CHQ-79062', 'Monthly bank transfer Mar'),
  (6, '2026-05-08', 'bank', 350000, 'HBL-9900', 'CHQ-79082', 'Monthly bank transfer Apr'),
  (6, '2026-06-08', 'bank', 300000, 'HBL-9900', 'CHQ-79110', 'Monthly bank transfer May'),
  -- C7: Imran & Sons
  (7, '2026-03-01', 'cash', 40000,  NULL, NULL, 'Cash payment'),
  (7, '2026-05-20', 'bank', 60000,  'UBL-1122', 'CHQ-79080', 'Bank transfer'),
  -- C8: Royal Builders (largest)
  (8, '2026-01-28', 'bank', 400000, 'HBL-0011', 'CHQ-79002', 'Advance payment Phase 1'),
  (8, '2026-03-01', 'bank', 350000, 'HBL-0011', 'CHQ-79040', 'Feb dues transfer'),
  (8, '2026-04-05', 'bank', 400000, 'MCB-0022', 'CHQ-79063', 'Mar dues transfer'),
  (8, '2026-05-10', 'bank', 380000, 'HBL-0011', 'CHQ-79085', 'Apr dues transfer'),
  (8, '2026-06-12', 'cash', 150000, NULL, NULL, 'Cash advance June'),
  -- C1: July receipt against SO #35
  (1, '2026-07-16', 'cash', 50000,  NULL, NULL, 'Partial receipt — July order');

-- ============================================================
-- 9. PURCHASE INVOICES — total_amount = sum(purchase_invoice_items),
--    matching how the app computes it (see suppliers.ts). Each
--    supplier only sells what they actually manufacture/stock.
--    payment_mode is mostly 'bank' — a wholesale trader settling
--    invoices in the hundreds of thousands to millions of rupees
--    would realistically wire/cheque those, not hand over cash;
--    only the two smallest invoices are 'cash'. This keeps the
--    cashbook's Cash-in-Hand figure realistic once payments/purchases
--    are mirrored into cashbook_entries in section 12.
-- ============================================================
INSERT INTO purchase_invoices (supplier_id, date, invoice_no, total_amount, paid_amount, payment_mode, notes) VALUES
  -- Lucky Cement (Supplier 1)
  (1, '2026-01-03', 'LCL-JAN-001', 810000,  810000, 'bank', 'Jan cement stock — 600 bags'),
  (1, '2026-02-04', 'LCL-FEB-002', 675000,  675000, 'bank', 'Feb cement stock — 500 bags'),
  (1, '2026-03-05', 'LCL-MAR-003', 665000,  465000, 'bank', 'Mar cement stock — 500 bags, partial payment'),
  (1, '2026-04-03', 'LCL-APR-004', 710000,  710000, 'bank', 'Apr cement stock — 500 bags'),
  (1, '2026-05-06', 'LCL-MAY-005', 1480000,1000000, 'bank', 'May cement stock — 1000 bags, partial payment'),
  -- Fauji Cement (Supplier 2)
  (2, '2026-01-05', 'FCC-JAN-001', 660000,  660000, 'bank', 'Jan stock — 500 bags'),
  (2, '2026-03-03', 'FCC-MAR-002', 695000,  695000, 'bank', 'Mar stock — 500 bags'),
  (2, '2026-05-04', 'FCC-MAY-003', 725000,  400000, 'bank', 'May stock — 500 bags, partial payment'),
  -- Wah Steel & Lebar Mills (Supplier 3)
  (3, '2026-01-08', 'WSM-JAN-001', 506000,  506000, 'cash', '5 bundles 3/8" + 2 bundles 1/2"'),
  (3, '2026-02-10', 'WSM-FEB-002', 479000,  479000, 'bank', 'Mixed lebar order'),
  (3, '2026-04-07', 'WSM-APR-003', 476000,  300000, 'bank', 'Upper floor lebar stock, partial payment'),
  (3, '2026-06-02', 'WSM-JUN-004', 376000,  376000, 'bank', 'Lebar replenishment'),
  -- Rawalpindi Brick Kiln (Supplier 4)
  (4, '2026-01-10', 'RBK-JAN-001', 238500,  238500, 'cash', '15 thousand red bricks (1st + 2nd)'),
  (4, '2026-03-08', 'RBK-MAR-002', 294000,  180000, 'bank', '13 thousand bricks + blocks, partial payment'),
  (4, '2026-05-07', 'RBK-MAY-003', 337500,  337500, 'bank', '20 thousand bricks (1st + 2nd)'),
  -- Lucky Cement (Supplier 1) — July restock, appended last so it gets id 16
  -- and every earlier invoice keeps its original id (RESTART IDENTITY gives
  -- ids in insertion order — inserting this mid-list would renumber the rest)
  (1, '2026-07-08', 'LCL-JUL-006', 444000,  444000, 'bank', 'Jul cement stock — 300 bags');

-- ============================================================
-- 10. PURCHASE INVOICE ITEMS
-- ============================================================
INSERT INTO purchase_invoice_items (purchase_invoice_id, product_id, qty, rate, amount) VALUES
  -- PI 1 (Lucky Jan, 810000)
  (1, 1, 600, 1350, 810000),
  -- PI 2 (Lucky Feb, 675000)
  (2, 1, 500, 1350, 675000),
  -- PI 3 (Lucky Mar, 665000)
  (3, 1, 500, 1330, 665000),
  -- PI 4 (Lucky Apr, 710000)
  (4, 1, 500, 1420, 710000),
  -- PI 5 (Lucky May, 1480000)
  (5, 1, 1000, 1480, 1480000),
  -- PI 6 (Fauji Jan, 660000)
  (6, 2, 500, 1320, 660000),
  -- PI 7 (Fauji Mar, 695000)
  (7, 2, 500, 1390, 695000),
  -- PI 8 (Fauji May, 725000)
  (8, 2, 500, 1450, 725000),
  -- PI 9 (Steel Jan, 506000)
  (9, 5, 5, 68000, 340000), (9, 6, 2, 83000, 166000),
  -- PI 10 (Steel Feb, 479000)
  (10, 5, 3, 68000, 204000), (10, 6, 2, 83000, 166000), (10, 7, 1, 109000, 109000),
  -- PI 11 (Steel Apr, 476000)
  (11, 6, 3, 86000, 258000), (11, 7, 2, 109000, 218000),
  -- PI 12 (Steel Jun, 376000)
  (12, 5, 3, 68000, 204000), (12, 6, 2, 86000, 172000),
  -- PI 13 (Bricks Jan, 238500)
  (13, 8, 8, 18000, 144000), (13, 9, 7, 13500, 94500),
  -- PI 14 (Bricks Mar, 294000)
  (14, 8, 8, 18000, 144000), (14, 10, 5, 30000, 150000),
  -- PI 15 (Bricks May, 337500)
  (15, 8, 15, 18000, 270000), (15, 9, 5, 13500, 67500),
  -- PI 16 (Lucky Jul, 444000)
  (16, 1, 300, 1480, 444000);

-- ============================================================
-- 11. EXPENSES — recorded through the Expenses module; each one
--     mirrors what the app itself auto-posts to cashbook_entries
--     (source='expense', reference_id -> expenses.id) in section 12.
-- ============================================================
INSERT INTO expenses (date, category, description, amount, payment_mode, notes) VALUES
  ('2026-01-05', 'Rent',          'Shop rent — January',                    25000, 'cash', 'Monthly shop rent G.T Road'),
  ('2026-01-15', 'Utilities',     'Electricity bill — January',             8500,  'cash', 'WAPDA bill Jan'),
  ('2026-01-18', 'Vehicle',       'Vehicle maintenance',                    12000, 'cash', 'Pickup truck repair'),
  ('2026-01-28', 'Labour',        'Loading/unloading labour',               9000,  'cash', 'Cement unloading 3 trucks'),
  ('2026-02-05', 'Rent',          'Shop rent — February',                   25000, 'cash', 'Monthly shop rent'),
  ('2026-02-15', 'Utilities',     'Electricity + gas bill — February',      11200, 'cash', 'Utility bills Feb'),
  ('2026-02-20', 'Office',        'Stationery & printing',                  3500,  'cash', 'Invoice books + stamps'),
  ('2026-03-05', 'Rent',          'Shop rent — March',                      25000, 'cash', 'Monthly shop rent'),
  ('2026-03-18', 'Vehicle',       'Vehicle fuel — March',                   18000, 'cash', 'Diesel 3 deliveries'),
  ('2026-03-25', 'Office',        'Miscellaneous office supplies',          5000,  'cash', 'Office supplies'),
  ('2026-04-05', 'Rent',          'Shop rent — April',                      25000, 'cash', 'Monthly shop rent'),
  ('2026-04-18', 'Utilities',     'Electricity bill — April',               9200,  'cash', 'WAPDA Apr'),
  ('2026-04-22', 'Labour',        'Loading/unloading labour',               11000, 'cash', 'Lebar unloading'),
  ('2026-04-28', 'Communication', 'Telephone & internet',                   4200,  'cash', 'Monthly internet + phone'),
  ('2026-05-05', 'Rent',          'Shop rent — May',                        25000, 'cash', 'Monthly shop rent'),
  ('2026-05-15', 'Vehicle',       'Vehicle maintenance',                    15000, 'cash', 'Delivery truck service'),
  ('2026-05-20', 'Utilities',     'Electricity bill — May',                 10500, 'cash', 'WAPDA May'),
  ('2026-05-25', 'Insurance',     'Annual vehicle insurance premium',       22000, 'cash', 'Annual vehicle insurance'),
  ('2026-06-05', 'Rent',          'Shop rent — June',                       25000, 'cash', 'Monthly shop rent'),
  ('2026-06-15', 'Utilities',     'Electricity bill — June',                9800,  'cash', 'WAPDA June'),
  ('2026-07-05', 'Rent',          'Shop rent — July',                       25000, 'cash', 'Monthly shop rent'),
  ('2026-07-12', 'Utilities',     'Electricity bill — July',                9500,  'cash', 'WAPDA July');

-- ============================================================
-- 12. CASHBOOK ENTRIES
--     - type is 'cash_in'/'cash_out' (matches cashbook.ts's entryTypes)
--     - one 'expense' row per expenses record above (reference_id
--       points at expenses.id — reliable because both tables were
--       just TRUNCATEd with RESTART IDENTITY, so IDs start at 1 in
--       insertion order)
--     - one 'payment' row per customer payment and one purchase-payment
--       row per purchase invoice, mirroring exactly what payments.ts
--       and suppliers.ts auto-post when you create these through the
--       app (source='payment'/'manual', matching payment_mode/amount).
--       Without these, cashbook_entries would only reflect manual
--       entries and the Cash-in-Hand/Bank Balance cards would be
--       badly wrong relative to what customers/suppliers pages show.
--     - salaries use source='salary' (an allowed manual-entry source,
--       see cashbook.ts's `sources`), not the expenses module
--     - cash sales / opening balances are plain manual entries. There
--       are two opening balances (cash till + bank account) because
--       purchase invoices are mostly paid by bank transfer (realistic
--       for invoices in the hundreds of thousands/millions) — the
--       bank opening balance covers that, same as a real business
--       would carry working capital in its bank account, not its till.
-- ============================================================
INSERT INTO cashbook_entries (date, type, source, reference_id, description, payment_mode, amount, notes)
SELECT date, 'cash_out', 'expense', id, description, payment_mode, amount, notes
FROM expenses
ORDER BY id;

-- Customer payments (mirrors payments.ts's auto-post on POST /payments)
INSERT INTO cashbook_entries (date, type, source, reference_id, description, payment_mode, amount, notes)
SELECT p.date, 'cash_in', 'payment', p.id, 'Receipt from ' || c.name, p.type, p.amount, p.notes
FROM payments p
JOIN customers c ON c.id = p.customer_id
ORDER BY p.id;

-- Purchase invoice payments (mirrors suppliers.ts's auto-post on POST
-- /purchases when paidAmount > 0 — true for every invoice seeded here)
INSERT INTO cashbook_entries (date, type, source, reference_id, description, payment_mode, amount, notes)
SELECT pi.date, 'cash_out', 'manual', pi.id,
       'Purchase payment to ' || s.name || COALESCE(' (Inv #' || pi.invoice_no || ')', ''),
       pi.payment_mode, pi.paid_amount, pi.notes
FROM purchase_invoices pi
JOIN suppliers s ON s.id = pi.supplier_id
WHERE pi.paid_amount > 0
ORDER BY pi.id;

-- Salaries (manual source, not an expenses-table module)
INSERT INTO cashbook_entries (date, type, source, description, payment_mode, amount, notes) VALUES
  ('2026-01-10', 'cash_out', 'salary', 'Staff salaries — January',  'cash', 85000, '3 staff + driver salaries'),
  ('2026-02-10', 'cash_out', 'salary', 'Staff salaries — February', 'cash', 85000, 'Monthly salaries'),
  ('2026-03-10', 'cash_out', 'salary', 'Staff salaries — March',    'cash', 90000, 'Salaries + Eid bonus'),
  ('2026-04-10', 'cash_out', 'salary', 'Staff salaries — April',    'cash', 85000, 'Monthly salaries'),
  ('2026-05-08', 'cash_out', 'salary', 'Staff salaries — May',      'cash', 85000, 'Monthly salaries'),
  ('2026-06-08', 'cash_out', 'salary', 'Staff salaries — June',     'cash', 85000, 'Monthly salaries'),
  ('2026-07-08', 'cash_out', 'salary', 'Staff salaries — July',     'cash', 85000, 'Monthly salaries');

-- Opening balances + cash sales / income (manual entries)
INSERT INTO cashbook_entries (date, type, source, description, payment_mode, amount, notes) VALUES
  ('2026-01-01', 'cash_in', 'opening_balance', 'Opening cash balance',        'cash', 800000,   'Cash in hand at year start'),
  ('2026-01-01', 'cash_in', 'opening_balance', 'Opening bank balance',        'bank', 3800000,  'Bank account balance at year start'),
  ('2026-01-20', 'cash_in', 'manual',          'Cash sale — walk-in',         'cash', 18000,    'Retail sale 12 bags cement'),
  ('2026-02-08', 'cash_in', 'manual',          'Freight recovery — customer', 'cash', 7500,     'Transport charges recovered'),
  ('2026-02-22', 'cash_in', 'manual',          'Cash sale — walk-in',         'cash', 29000,    'Retail sale 20 bags cement'),
  ('2026-03-12', 'cash_in', 'manual',          'Cash sale — walk-in',         'cash', 22500,    'Retail sale 15 bags + sand'),
  ('2026-04-15', 'cash_in', 'manual',          'Cash sale — walk-in',         'cash', 36000,    'Retail sale bricks + cement'),
  ('2026-05-12', 'cash_in', 'manual',          'Cash sale — walk-in',         'cash', 44000,    'Retail sale 30 bags + lebar'),
  ('2026-06-10', 'cash_in', 'manual',          'Cash sale — walk-in',         'cash', 27000,    'Retail sale cement + sand'),
  ('2026-07-10', 'cash_in', 'manual',          'Cash sale — walk-in',         'cash', 20000,    'Retail sale cement');

-- ============================================================
-- 13. INSTALLMENT PLANS — 2 customers with EMI
--     (total_amount here must match the tied sale order's total —
--     SO #29 = 560000, SO #16 = 260000, both reconciled in section 6/7)
-- ============================================================
INSERT INTO installment_plans (customer_id, sale_order_id, title, total_amount, down_payment, installments_count, frequency, start_date, notes) VALUES
  (8, 29, 'Royal Builders — Phase 1 Cement EMI', 560000, 100000, 6, 'monthly', '2026-02-01',
   'Down payment received in cash. Balance 460000 in 6 monthly installments.'),
  (4, 16, 'Babar Enterprises — Lebar+Cement Plan', 260000, 50000, 4, 'monthly', '2026-04-15',
   'Down payment paid. Balance 210000 in 4 monthly installments.');

-- Installment schedule for Plan 1 (6 x ~76667 ≈ 76665)
INSERT INTO installment_schedule (plan_id, installment_no, due_date, scheduled_amount) VALUES
  (1, 1, '2026-02-01', 76667),
  (1, 2, '2026-03-01', 76667),
  (1, 3, '2026-04-01', 76667),
  (1, 4, '2026-05-01', 76667),
  (1, 5, '2026-06-01', 76667),
  (1, 6, '2026-07-01', 76665);

-- Installment schedule for Plan 2 (4 x 52500)
INSERT INTO installment_schedule (plan_id, installment_no, due_date, scheduled_amount) VALUES
  (2, 1, '2026-04-15', 52500),
  (2, 2, '2026-05-15', 52500),
  (2, 3, '2026-06-15', 52500),
  (2, 4, '2026-07-15', 52500);

-- Installment payments (Plan 1: first 4 paid; Plan 2: first 2 paid)
INSERT INTO installment_payments (plan_id, schedule_id, date, amount, payment_mode, notes) VALUES
  (1, 1, '2026-02-01', 76667, 'bank', 'Bank transfer HBL'),
  (1, 2, '2026-03-03', 76667, 'bank', 'Bank transfer HBL — slight delay'),
  (1, 3, '2026-04-02', 76667, 'bank', 'Bank transfer HBL'),
  (1, 4, '2026-05-05', 76667, 'bank', 'Bank transfer HBL'),
  (2, 7, '2026-04-16', 52500, 'cash', 'Cash payment'),
  (2, 8, '2026-05-17', 52500, 'cash', 'Cash payment');

-- ============================================================
-- 14. STOCK ADJUSTMENTS — damage / shortage corrections
-- ============================================================
INSERT INTO stock_adjustments (product_id, date, qty, reason, notes) VALUES
  (1, '2026-01-20', -15,  'Damaged Stock',  'Bags torn during unloading — Lucky Cement'),
  (2, '2026-02-18', -8,   'Damaged Stock',  'Water damage in warehouse corner'),
  (5, '2026-03-10', -0.5, 'Damaged Stock',  'One bundle lebar rusted — written off'),
  (8, '2026-04-05', -2,   'Damaged Stock',  'Broken bricks — transit damage'),
  (1, '2026-05-15', 20,   'Stock Received', 'Bonus bags from Lucky Cement (supplier adjustment)'),
  (11,'2026-05-28', -1,   'Damaged Stock',  'Crush trolley short delivery');

-- ============================================================
-- Done
-- ============================================================
SELECT 'Seed complete' AS status,
  (SELECT count(*) FROM users)              AS users,
  (SELECT count(*) FROM company_settings)   AS company_settings,
  (SELECT count(*) FROM lookup_values)      AS lookup_values,
  (SELECT count(*) FROM products)           AS products,
  (SELECT count(*) FROM customers)          AS customers,
  (SELECT count(*) FROM suppliers)          AS suppliers,
  (SELECT count(*) FROM sale_orders)        AS sale_orders,
  (SELECT count(*) FROM sale_order_items)   AS sale_items,
  (SELECT count(*) FROM payments)           AS payments,
  (SELECT count(*) FROM purchase_invoices)  AS purchase_invoices,
  (SELECT count(*) FROM expenses)           AS expenses,
  (SELECT count(*) FROM cashbook_entries)   AS cashbook_entries,
  (SELECT count(*) FROM installment_plans)  AS installment_plans,
  (SELECT count(*) FROM stock_adjustments)  AS stock_adj;
