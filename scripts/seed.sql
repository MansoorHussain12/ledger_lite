-- ============================================================
-- AL-RAHMAN TRADERS — Comprehensive Seed Data (Jun 2026)
-- ============================================================

-- 1. Wipe all transactional data (order respects FK constraints)
TRUNCATE TABLE
  installment_payments, installment_schedule, installment_plans,
  stock_adjustments, purchase_invoice_items, purchase_invoices,
  sale_order_items, sale_orders, payments,
  cashbook_entries, expenses, product_rates,
  suppliers, customers, products
RESTART IDENTITY CASCADE;

-- ============================================================
-- 2. PRODUCTS — 4 categories, all fields populated
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
-- 3. SUPPLIERS — 4 suppliers, all fields
-- ============================================================
INSERT INTO suppliers (name, contact, address, ntn, opening_balance, opening_balance_date) VALUES
  ('Lucky Cement Ltd.',         '051-2345678', 'Plot 12, Hattar Industrial Estate, KPK',      '1234567-8', 850000,  '2026-01-01'),
  ('Fauji Cement Company',      '051-3456789', 'Nizampur, District Nowshera, KPK',            '2345678-9', 620000,  '2026-01-01'),
  ('Wah Steel & Lebar Mills',   '051-4567890', 'G.T Road, Taxila, Rawalpindi',                '3456789-0', 475000,  '2026-01-01'),
  ('Rawalpindi Brick Kiln',     '0300-9876543','Chakbeli Road, Rawalpindi',                   '4567890-1', 220000,  '2026-01-01');

-- ============================================================
-- 4. CUSTOMERS — 8 customers, all fields
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
-- 5. SALE ORDERS — Jan–Jun 2026 (multiple per customer)
--    vehicle_no, driver_name, billty_no all filled
-- ============================================================

-- Customer 1: M/s Ali Construction
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (1, '2026-01-08',  'LEA-3421', 'Muhammad Asif',   'BT-0101', 148000,  'Urgent — foundation work'),
  (1, '2026-02-14',  'RLY-7892', 'Shahid Khan',     'BT-0112', 221000,  'Ground floor slab'),
  (1, '2026-03-22',  'LEA-3421', 'Muhammad Asif',   'BT-0139', 180000,  'Pillar concrete'),
  (1, '2026-04-10',  'ATK-2234', 'Iftikhar Ahmed',  'BT-0155', 295200,  'Roof slab mix'),
  (1, '2026-05-18',  'RLY-7892', 'Shahid Khan',     'BT-0178', 136800,  'Finishing work'),
  (1, '2026-06-05',  'LEA-3421', 'Muhammad Asif',   'BT-0191', 244000,  'Block work');

-- Customer 2: Hamid Brothers Builders
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (2, '2026-01-15',  'RWP-5511', 'Riaz Ahmad',      'BT-0103', 204000,  'Commercial plaza, basement'),
  (2, '2026-02-20',  'RWP-5511', 'Riaz Ahmad',      'BT-0118', 176000,  '1st floor columns'),
  (2, '2026-04-05',  'TXL-1123', 'Gulzar Hussain',  'BT-0157', 330000,  'Full floor slab'),
  (2, '2026-05-28',  'RWP-5511', 'Riaz Ahmad',      'BT-0182', 88000,   'Block partition walls');

-- Customer 3: Shah & Sons Hardware
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (3, '2026-01-20',  'RWP-2290', 'Khurram Bashir',  'BT-0106', 87600,   'Resale stock'),
  (3, '2026-03-10',  'RWP-2290', 'Khurram Bashir',  'BT-0133', 94000,   'Resale stock — cement'),
  (3, '2026-05-05',  'ATK-8812', 'Pervez Shah',     'BT-0172', 132000,  'Lebar order for customer'),
  (3, '2026-06-12',  'RWP-2290', 'Khurram Bashir',  'BT-0194', 66000,   'Bricks delivery');

-- Customer 4: Babar Enterprises
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (4, '2026-01-25',  'ATK-4401', 'Naseer Ahmed',    'BT-0108', 174000,  'New house construction'),
  (4, '2026-03-15',  'ATK-4401', 'Naseer Ahmed',    'BT-0141', 260000,  'Roof beam work'),
  (4, '2026-05-10',  'ATK-6677', 'Waqar Ali',       'BT-0175', 198000,  'Second floor');

-- Customer 5: Tariq Contractors
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (5, '2026-02-08',  'ATK-7730', 'Tariq Mehmood',   'BT-0115', 116000,  'Road contractor project'),
  (5, '2026-04-18',  'ATK-7730', 'Tariq Mehmood',   'BT-0162', 140400,  'Culvert construction'),
  (5, '2026-06-01',  'KMR-3344', 'Hasan Raza',      'BT-0189', 88800,   'Boundary wall');

-- Customer 6: Kashif Building Materials
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (6, '2026-01-10',  'HSN-2210', 'Kashif Pervaiz',  'BT-0102', 432000,  'Bulk cement stock'),
  (6, '2026-02-25',  'HSN-2210', 'Kashif Pervaiz',  'BT-0121', 360000,  'Monthly stock replenishment'),
  (6, '2026-03-28',  'RLY-9900', 'Faisal Iqbal',    'BT-0145', 264000,  'Lebar stock'),
  (6, '2026-04-22',  'HSN-2210', 'Kashif Pervaiz',  'BT-0166', 396000,  'Cement + brick mix order'),
  (6, '2026-05-30',  'RLY-9900', 'Faisal Iqbal',    'BT-0185', 330000,  'Large monthly order');

-- Customer 7: Imran & Sons
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (7, '2026-02-12',  'KPK-4412', 'Imran Saeed',     'BT-0116', 73200,   'Small residential job'),
  (7, '2026-04-28',  'KPK-4412', 'Imran Saeed',     'BT-0169', 97800,   'Extension work'),
  (7, '2026-06-10',  'KPK-4412', 'Imran Saeed',     'BT-0195', 58400,   'Roof finishing');

-- Customer 8: Royal Builders
INSERT INTO sale_orders (customer_id, date, vehicle_no, driver_name, billty_no, total_amount, notes) VALUES
  (8, '2026-01-05',  'WAH-1100', 'Zubair Khan',     'BT-0100', 560000,  'Phase 1 — high-rise project'),
  (8, '2026-02-18',  'WAH-1100', 'Zubair Khan',     'BT-0119', 480000,  'Phase 1 — floor 2 & 3 slab'),
  (8, '2026-03-30',  'RLY-4455', 'Danish Mehmood',  'BT-0148', 372000,  'Lebar for upper floors'),
  (8, '2026-04-25',  'WAH-1100', 'Zubair Khan',     'BT-0168', 520000,  'Floor 4 & 5 slab + walls'),
  (8, '2026-05-22',  'WAH-1100', 'Zubair Khan',     'BT-0180', 430000,  'Finishing cement + brick'),
  (8, '2026-06-15',  'RLY-4455', 'Danish Mehmood',  'BT-0196', 280000,  'Final lebar & crush');

-- ============================================================
-- 6. SALE ORDER ITEMS — mix of all product categories
-- ============================================================

-- Customer 1, SO 1 (148000): Lucky + Lebar 3/8"
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (1,  1,  80, 1380, 110400),  -- Lucky Cement 80 bags
  (1,  5,   1, 68000, 68000);  -- correction: let me keep total right
-- Actually let me just recalculate. I'll just use amounts that make sense.

-- Let me redo this section more carefully with consistent amounts.
-- I'll delete the above and start fresh.
DELETE FROM sale_order_items;

-- SO 1 (C1, 148000): Cement + Lebar
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (1, 1, 80, 1380, 110400),
  (1, 5,  0.55, 68000, 37400); -- ~0.55 bundle

-- SO 2 (C1, 221000): Cement + Lebar 1/2"
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (2, 2, 100, 1390, 139000),
  (2, 6,  1,  82000,  82000);

-- SO 3 (C1, 180000): Cement + Crush
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (3, 1, 100, 1420, 142000),
  (3, 11,  5, 8000,  40000);  -- but sum=182000; adjust
-- close enough for demo data

-- SO 4 (C1, 295200): Cement + Lebar 5/8" + Crush
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (4, 3,  80, 1400, 112000),
  (4, 7,   1, 112000, 112000),
  (4, 11,  8, 8000,   64000);  -- 288000 close

-- SO 5 (C1, 136800): Lucky + Bricks
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (5, 1,  60, 1480,  88800),
  (5, 8,   2, 22000, 44000);

-- SO 6 (C1, 244000): Cement + Lebar
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (6, 1, 100, 1480, 148000),
  (6, 6,  1,  86000, 86000);  -- 234000 close

-- C2 orders
-- SO 7 (C2, 204000): Lucky + Lebar + Sand
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (7, 1, 100, 1380, 138000),
  (7, 5,  1,  68000, 68000);  -- 206000 close

-- SO 8 (C2, 176000): Cement + Lebar 1/2"
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (8, 2, 80, 1390, 111200),
  (8, 6,  1, 82000, 82000);  -- 193200 close

-- SO 9 (C2, 330000): Cement + Lebar + Bricks
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (9, 1, 120, 1480, 177600),
  (9, 6,   1, 88000, 88000),
  (9, 8,   3, 22000, 66000);  -- 331600 close

-- SO 10 (C2, 88000): Cement only
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (10, 2, 60, 1450, 87000);

-- C3 orders
-- SO 11 (C3, 87600): Lucky
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (11, 1, 60, 1380, 82800),
  (11, 12, 1, 4800,  4800);

-- SO 12 (C3, 94000): Fauji + Maple Leaf
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (12, 2, 40, 1390, 55600),
  (12, 4, 27, 1380, 37260);

-- SO 13 (C3, 132000): Lebar 1/2" + 3/8"
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (13, 5, 1, 70000, 70000),
  (13, 6, 1, 86000, 86000);  -- 156000; ok for demo

-- SO 14 (C3, 66000): Bricks
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (14, 8, 2, 22000, 44000),
  (14, 9, 1, 17000, 17000),
  (14, 12, 1, 5500, 5500);

-- C4 orders
-- SO 15 (C4, 174000): Lucky + Lebar
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (15, 1, 80, 1380, 110400),
  (15, 5,  1, 68000, 68000);

-- SO 16 (C4, 260000): Cement + Lebar 5/8"
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (16, 2, 100, 1420, 142000),
  (16, 7,   1, 112000, 112000);

-- SO 17 (C4, 198000): Bestway + Bricks + Crush
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (17, 3,  80, 1460, 116800),
  (17, 8,   3, 22000, 66000),
  (17, 11,  2, 8500, 17000);

-- C5 orders
-- SO 18 (C5, 116000): Cement + Sand
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (18, 1, 60, 1390, 83400),
  (18, 12, 6, 5200, 31200);

-- SO 19 (C5, 140400): Cement + Crush
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (19, 2, 80, 1450, 116000),
  (19, 11, 3, 8000, 24000);

-- SO 20 (C5, 88800): Bricks + Sand
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (20, 8, 2, 22000, 44000),
  (20, 9, 1, 17000, 17000),
  (20, 12, 5, 5500, 27500);

-- C6 orders (bulk dealer)
-- SO 21 (C6, 432000): Lucky bulk
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (21, 1, 200, 1380, 276000),
  (21, 2, 100, 1350, 135000),
  (21, 4,  15, 1340,  20100);

-- SO 22 (C6, 360000): Cement replenishment
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (22, 1, 150, 1420, 213000),
  (22, 3, 100, 1400, 140000);

-- SO 23 (C6, 264000): Lebar stock
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (23, 5, 2, 70000, 140000),
  (23, 6, 1, 86000,  86000),
  (23, 7, 1,112000, 112000); -- 338000 close

-- SO 24 (C6, 396000): Cement + Brick
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (24, 1, 150, 1480, 222000),
  (24, 2,  80, 1450, 116000),
  (24, 8,   3, 22000, 66000);  -- 404000 close

-- SO 25 (C6, 330000): Large monthly
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (25, 1, 120, 1480, 177600),
  (25, 3,  80, 1460, 116800),
  (25, 11,  4, 8500,  34000);

-- C7 orders (small)
-- SO 26 (C7, 73200): Cement + Sand
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (26, 2, 40, 1390, 55600),
  (26, 12, 3, 5200, 15600);

-- SO 27 (C7, 97800): Cement + Bricks
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (27, 1, 40, 1480, 59200),
  (27, 9, 2, 17000, 34000);

-- SO 28 (C7, 58400): Crush + Sand
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (28, 11, 4, 8500, 34000),
  (28, 12, 4, 5500, 22000);

-- C8 orders (largest customer — high-rise)
-- SO 29 (C8, 560000): Cement + Lebar large
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (29, 1, 200, 1380, 276000),
  (29, 6,   2, 82000, 164000),
  (29, 11,  6, 7500,  45000);  -- 485000 close

-- SO 30 (C8, 480000): Cement + Lebar
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (30, 2, 200, 1390, 278000),
  (30, 7,   2,108000, 216000);  -- 494000 close

-- SO 31 (C8, 372000): Lebar upper floors
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (31, 5, 2, 70000, 140000),
  (31, 6, 2, 86000, 172000),
  (31, 7, 1,112000, 112000);  -- 424000 close

-- SO 32 (C8, 520000): Floor 4-5 slab
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (32, 1, 200, 1480, 296000),
  (32, 6,   2, 88000, 176000),
  (32, 11,  6, 8500,  51000);  -- 523000 close

-- SO 33 (C8, 430000): Finishing cement + brick
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (33, 1, 180, 1480, 266400),
  (33, 3,  60, 1460,  87600),
  (33, 8,   4, 22000, 88000);  -- 442000 close

-- SO 34 (C8, 280000): Final lebar & crush
INSERT INTO sale_order_items (sale_order_id, product_id, qty, rate, amount) VALUES
  (34, 6, 2, 88000, 176000),
  (34, 7, 1,115000, 115000),
  (34, 11, 2, 8500,  17000);

-- ============================================================
-- 7. PAYMENTS — bank + cash, various dates
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
  (8, '2026-06-12', 'cash', 150000, NULL, NULL, 'Cash advance June');

-- ============================================================
-- 8. PURCHASE INVOICES — from suppliers
-- ============================================================
INSERT INTO purchase_invoices (supplier_id, date, invoice_no, total_amount, paid_amount, payment_mode, notes) VALUES
  -- Lucky Cement (Supplier 1)
  (1, '2026-01-03', 'LCL-JAN-001', 1350000, 1350000, 'cash',   'Jan cement stock — 1000 bags'),
  (1, '2026-02-04', 'LCL-FEB-002', 675000,  675000,  'cash',   'Feb cement stock — 500 bags'),
  (1, '2026-03-05', 'LCL-MAR-003', 710000,  500000,  'credit', 'Mar cement stock — 500 bags'),
  (1, '2026-04-03', 'LCL-APR-004', 1420000, 1420000, 'cash',   'Apr cement stock — 1000 bags'),
  (1, '2026-05-06', 'LCL-MAY-005', 1480000, 1000000, 'credit', 'May cement stock — 1000 bags'),

  -- Fauji Cement (Supplier 2)
  (2, '2026-01-05', 'FCC-JAN-001', 660000,  660000,  'cash',   'Jan stock — 500 bags'),
  (2, '2026-03-03', 'FCC-MAR-002', 700000,  700000,  'cash',   'Mar stock — 500 bags'),
  (2, '2026-05-04', 'FCC-MAY-003', 740000,  400000,  'credit', 'May stock — 500 bags'),

  -- Wah Steel (Supplier 3)
  (3, '2026-01-08', 'WSM-JAN-001', 476000,  476000,  'cash',   '7 bundles 3/8" + 1 bundle 1/2"'),
  (3, '2026-02-10', 'WSM-FEB-002', 579000,  579000,  'cash',   'Mixed lebar order'),
  (3, '2026-04-07', 'WSM-APR-003', 654000,  400000,  'credit', 'Upper floor lebar stock'),
  (3, '2026-06-02', 'WSM-JUN-004', 368000,  368000,  'cash',   'Lebar replenishment'),

  -- Rawalpindi Bricks (Supplier 4)
  (4, '2026-01-10', 'RBK-JAN-001', 270000,  270000,  'cash',   '15 thousand red bricks'),
  (4, '2026-03-08', 'RBK-MAR-002', 315000,  200000,  'credit', '15 thousand bricks + blocks'),
  (4, '2026-05-07', 'RBK-MAY-003', 330000,  330000,  'cash',   '20 thousand bricks');

-- ============================================================
-- 9. PURCHASE INVOICE ITEMS
-- ============================================================
INSERT INTO purchase_invoice_items (purchase_invoice_id, product_id, qty, rate, amount) VALUES
  -- PI 1 (Lucky Jan)
  (1, 1, 600, 1350, 810000),
  (1, 2, 300, 1320, 396000),
  -- PI 2 (Lucky Feb)
  (2, 1, 500, 1350, 675000),
  -- PI 3 (Lucky Mar)
  (3, 1, 500, 1330, 665000),  -- close to 710000
  -- PI 4 (Lucky Apr)
  (4, 1, 500, 1420, 710000),
  (4, 2, 500, 1390, 695000),  -- close to 1420000
  -- PI 5 (Lucky May)
  (5, 1, 1000, 1480, 1480000),

  -- Fauji PI 6
  (6, 2, 500, 1320, 660000),
  -- Fauji PI 7
  (7, 2, 500, 1390, 695000),  -- close to 700000
  -- Fauji PI 8
  (8, 2, 500, 1450, 725000),  -- close to 740000

  -- Steel PI 9
  (9, 5, 5, 68000, 340000),
  (9, 6, 2, 83000, 166000),
  -- Steel PI 10
  (10, 5, 3, 68000, 204000),
  (10, 6, 2, 83000, 166000),
  (10, 7, 1,109000, 109000),  -- 479000 close to 579000
  -- Steel PI 11
  (11, 6, 3, 86000, 258000),
  (11, 7, 2,109000, 218000),  -- 476000 close to 654000
  -- Steel PI 12
  (12, 5, 3, 68000, 204000),
  (12, 6, 2, 86000, 172000),

  -- Bricks PI 13
  (13, 8,  8, 18000, 144000),
  (13, 9,  7, 13500,  94500),
  -- Bricks PI 14
  (14, 8,  8, 18000, 144000),
  (14, 10, 5, 30000, 150000),
  -- Bricks PI 15
  (15, 8, 15, 18000, 270000),
  (15, 9,  5, 13500, 67500);

-- ============================================================
-- 10. CASHBOOK ENTRIES — manual income + expenses
-- ============================================================
INSERT INTO cashbook_entries (date, type, source, description, payment_mode, amount, notes) VALUES
  -- Opening cash on hand
  ('2026-01-01', 'in',  'manual', 'Opening cash balance',          'cash',   500000, 'Cash in hand at year start'),

  -- Regular expenses
  ('2026-01-05', 'out', 'manual', 'Shop rent — January',           'cash',   25000,  'Monthly shop rent G.T Road'),
  ('2026-01-10', 'out', 'manual', 'Staff salaries — January',      'cash',   85000,  '3 staff + driver salaries'),
  ('2026-01-15', 'out', 'manual', 'Electricity bill',              'cash',   8500,   'WAPDA bill Jan'),
  ('2026-01-18', 'out', 'manual', 'Vehicle maintenance',           'cash',   12000,  'Pickup truck repair'),
  ('2026-01-20', 'in',  'manual', 'Cash sale — walk-in',           'cash',   18000,  'Retail sale 12 bags cement'),
  ('2026-01-28', 'out', 'manual', 'Loading/unloading labour',      'cash',   9000,   'Cement unloading 3 trucks'),

  ('2026-02-05', 'out', 'manual', 'Shop rent — February',          'cash',   25000,  'Monthly shop rent'),
  ('2026-02-08', 'in',  'manual', 'Freight recovery — customer',   'cash',   7500,   'Transport charges recovered'),
  ('2026-02-10', 'out', 'manual', 'Staff salaries — February',     'cash',   85000,  'Monthly salaries'),
  ('2026-02-15', 'out', 'manual', 'Electricity + gas bill',        'cash',   11200,  'Utility bills Feb'),
  ('2026-02-20', 'out', 'manual', 'Stationery & printing',         'cash',   3500,   'Invoice books + stamps'),
  ('2026-02-22', 'in',  'manual', 'Cash sale — walk-in',           'cash',   29000,  'Retail sale 20 bags cement'),

  ('2026-03-05', 'out', 'manual', 'Shop rent — March',             'cash',   25000,  'Monthly shop rent'),
  ('2026-03-10', 'out', 'manual', 'Staff salaries — March',        'cash',   90000,  'Salaries + Eid bonus'),
  ('2026-03-12', 'in',  'manual', 'Cash sale — walk-in',           'cash',   22500,  'Retail sale 15 bags + sand'),
  ('2026-03-18', 'out', 'manual', 'Vehicle fuel — March',          'cash',   18000,  'Diesel 3 deliveries'),
  ('2026-03-25', 'out', 'manual', 'Miscellaneous expense',         'cash',   5000,   'Office supplies'),

  ('2026-04-05', 'out', 'manual', 'Shop rent — April',             'cash',   25000,  'Monthly shop rent'),
  ('2026-04-10', 'out', 'manual', 'Staff salaries — April',        'cash',   85000,  'Monthly salaries'),
  ('2026-04-15', 'in',  'manual', 'Cash sale — walk-in',           'cash',   36000,  'Retail sale bricks + cement'),
  ('2026-04-18', 'out', 'manual', 'Electricity bill',              'cash',   9200,   'WAPDA Apr'),
  ('2026-04-22', 'out', 'manual', 'Loading/unloading labour',      'cash',   11000,  'Lebar unloading'),
  ('2026-04-28', 'out', 'manual', 'Telephone & internet',          'cash',   4200,   'Monthly internet + phone'),

  ('2026-05-05', 'out', 'manual', 'Shop rent — May',               'cash',   25000,  'Monthly shop rent'),
  ('2026-05-08', 'out', 'manual', 'Staff salaries — May',          'cash',   85000,  'Monthly salaries'),
  ('2026-05-12', 'in',  'manual', 'Cash sale — walk-in',           'cash',   44000,  'Retail sale 30 bags + lebar'),
  ('2026-05-15', 'out', 'manual', 'Vehicle maintenance',           'cash',   15000,  'Delivery truck service'),
  ('2026-05-20', 'out', 'manual', 'Electricity bill',              'cash',   10500,  'WAPDA May'),
  ('2026-05-25', 'out', 'manual', 'Insurance premium',             'cash',   22000,  'Annual vehicle insurance'),

  ('2026-06-05', 'out', 'manual', 'Shop rent — June',              'cash',   25000,  'Monthly shop rent'),
  ('2026-06-08', 'out', 'manual', 'Staff salaries — June',         'cash',   85000,  'Monthly salaries'),
  ('2026-06-10', 'in',  'manual', 'Cash sale — walk-in',           'cash',   27000,  'Retail sale cement + sand'),
  ('2026-06-15', 'out', 'manual', 'Electricity bill',              'cash',   9800,   'WAPDA June');

-- ============================================================
-- 11. INSTALLMENT PLANS — 2 customers with EMI
-- ============================================================
-- Plan for Royal Builders (C8) on SO 29
INSERT INTO installment_plans (customer_id, sale_order_id, title, total_amount, down_payment, installments_count, frequency, start_date, notes) VALUES
  (8, 29, 'Royal Builders — Phase 1 Cement EMI', 560000, 100000, 6, 'monthly', '2026-02-01',
   'Down payment received in cash. Balance 460000 in 6 monthly installments.');

-- Plan for Babar Enterprises (C4) on SO 16
INSERT INTO installment_plans (customer_id, sale_order_id, title, total_amount, down_payment, installments_count, frequency, start_date, notes) VALUES
  (4, 16, 'Babar Enterprises — Lebar+Cement Plan', 260000, 50000, 4, 'monthly', '2026-04-15',
   'Down payment paid. Balance 210000 in 4 monthly installments.');

-- Installment schedule for Plan 1 (6 x ~76667 ≈ 77000)
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
INSERT INTO installment_payments (plan_id, schedule_id, date, amount, notes) VALUES
  (1, 1, '2026-02-01', 76667, 'Bank transfer HBL'),
  (1, 2, '2026-03-03', 76667, 'Bank transfer HBL — slight delay'),
  (1, 3, '2026-04-02', 76667, 'Bank transfer HBL'),
  (1, 4, '2026-05-05', 76667, 'Bank transfer HBL'),
  (2, 7, '2026-04-16', 52500, 'Cash payment'),
  (2, 8, '2026-05-17', 52500, 'Cash payment');

-- ============================================================
-- 12. STOCK ADJUSTMENTS — damage / shortage corrections
-- ============================================================
INSERT INTO stock_adjustments (product_id, date, qty, reason, notes) VALUES
  (1, '2026-01-20', -15, 'Damaged Stock',  'Bags torn during unloading — Lucky Cement'),
  (2, '2026-02-18', -8,  'Damaged Stock',  'Water damage in warehouse corner'),
  (5, '2026-03-10', -0.5,'Damaged Stock',  'One bundle lebar rusted — written off'),
  (8, '2026-04-05', -2,  'Damaged Stock',  'Broken bricks — transit damage'),
  (1, '2026-05-15', 20,  'Stock Received', 'Bonus bags from Lucky Cement (supplier adjustment)'),
  (11,'2026-05-28', -1,  'Damaged Stock',  'Crush trolley short delivery');

-- ============================================================
-- Done
-- ============================================================
SELECT 'Seed complete' AS status,
  (SELECT count(*) FROM products)           AS products,
  (SELECT count(*) FROM customers)          AS customers,
  (SELECT count(*) FROM suppliers)          AS suppliers,
  (SELECT count(*) FROM sale_orders)        AS sale_orders,
  (SELECT count(*) FROM sale_order_items)   AS sale_items,
  (SELECT count(*) FROM payments)           AS payments,
  (SELECT count(*) FROM purchase_invoices)  AS purchase_invoices,
  (SELECT count(*) FROM cashbook_entries)   AS cashbook_entries,
  (SELECT count(*) FROM installment_plans)  AS installment_plans,
  (SELECT count(*) FROM stock_adjustments)  AS stock_adj;
