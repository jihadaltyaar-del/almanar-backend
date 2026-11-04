import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const allProducts = [];
const allCategories = [];
const allOrders = [];
const allCustomers = [];
const allDrivers = [];

// Drivers
const rawDrivers = db.drivers || (db.tenantData && db.tenantData.almanar_main && db.tenantData.almanar_main.drivers) || [];
if (Array.isArray(rawDrivers)) {
  rawDrivers.forEach(d => allDrivers.push({ ...d, tenant_id: 'almanar_main' }));
}
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.drivers)) {
      t.drivers.forEach(d => allDrivers.push({ ...d, tenant_id: tid }));
    }
  }
}

// Products
if (Array.isArray(db.products)) {
  db.products.forEach(p => allProducts.push({ ...p, tenant_id: 'almanar_main' }));
}
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.products)) {
      t.products.forEach(p => allProducts.push({ ...p, tenant_id: tid }));
    }
  }
}

// Categories
if (Array.isArray(db.categories)) {
  db.categories.forEach(c => allCategories.push({ ...c, tenant_id: 'almanar_main' }));
}
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.categories)) {
      t.categories.forEach(c => allCategories.push({ ...c, tenant_id: tid }));
    }
  }
}

// Orders
if (db.tenantData && db.tenantData['almanar_main'] && Array.isArray(db.tenantData['almanar_main'].orders)) {
  db.tenantData['almanar_main'].orders.forEach(o => allOrders.push({ ...o, tenant_id: 'almanar_main' }));
} else if (Array.isArray(db.orders)) {
  db.orders.forEach(o => allOrders.push({ ...o, tenant_id: 'almanar_main' }));
}
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.orders)) {
      t.orders.forEach(o => allOrders.push({ ...o, tenant_id: tid }));
    }
  }
}

// Customers
if (db.tenantData && db.tenantData['almanar_main'] && Array.isArray(db.tenantData['almanar_main'].customers)) {
  db.tenantData['almanar_main'].customers.forEach(c => allCustomers.push({ ...c, tenant_id: 'almanar_main' }));
} else if (Array.isArray(db.customers)) {
  db.customers.forEach(c => allCustomers.push({ ...c, tenant_id: 'almanar_main' }));
}
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.customers)) {
      t.customers.forEach(c => allCustomers.push({ ...c, tenant_id: tid }));
    }
  }
}

let sql = `-- ========================================================
-- سلة المنار: المخطط الشامل لقاعدة بيانات Supabase (PostgreSQL)
-- يشمل: المنشآت + الفئات + المنتجات + الطلبات + العملاء + المخزون
-- عزل تام للمنشآت (Multi-Tenant Architecture) + Row-Level Security (RLS)
-- ========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. جدول المنشآت (Tenants)
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    commercial_name TEXT,
    category TEXT,
    city TEXT DEFAULT 'الرياض',
    phone TEXT,
    logo TEXT,
    status TEXT DEFAULT 'نشط',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tenants (id, name, commercial_name, category, city, phone, logo, status)
VALUES 
  ('almanar_main', 'سلة المنار — الفرع الرئيسي', 'شركة سلة المنار لتقنية المعلومات والتجارة', 'سوبرماركت ومواد غذائية', 'الرياض', '0550001122', '/images/logo.png', 'نشط'),
  ('tenant_1793551506293', 'فرع النرجس', 'مؤسسة سلة المنار - فرع النرجس', 'سوبرماركت ومواد غذائية', 'الرياض', '0550005566', '/images/logo.png', 'نشط')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. جدول الفئات (Categories)
CREATE TABLE IF NOT EXISTS categories (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📁',
    image TEXT,
    count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- 3. جدول المنتجات (Products)
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'عام',
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    old_price NUMERIC(10, 2),
    unit TEXT DEFAULT 'حبة',
    stock INTEGER NOT NULL DEFAULT 0,
    rating NUMERIC(3, 2) DEFAULT 5.0,
    barcode TEXT,
    image TEXT DEFAULT '📦',
    is_offer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- 4. جدول الطلبات (Orders)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL DEFAULT 'عميل التطبيق',
    phone TEXT,
    address TEXT,
    branch TEXT,
    date TEXT,
    items_total NUMERIC(10, 2) DEFAULT 0.00,
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
    distance_km NUMERIC(5, 2) DEFAULT 2.5,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending',
    driver_name TEXT,
    payment_method TEXT DEFAULT 'الدفع عند الاستلام',
    receipt_url TEXT,
    receipt_image TEXT,
    receipt_confirmed BOOLEAN DEFAULT FALSE,
    customer_note TEXT,
    dropoff_lat DOUBLE PRECISION,
    dropoff_lng DOUBLE PRECISION,
    track_token TEXT,
    driver_token TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_track_token ON orders(track_token);

-- 6. جدول العملاء (Customers)
CREATE TABLE IF NOT EXISTS customers (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'عميل سلة المنار',
    phone TEXT,
    address TEXT DEFAULT 'الرياض',
    city TEXT DEFAULT 'الرياض',
    orders_count INTEGER DEFAULT 0,
    total_spent NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- 7. جدول المناديب (Drivers)
CREATE TABLE IF NOT EXISTS drivers (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    vehicle TEXT,
    car TEXT,
    zone TEXT,
    city TEXT DEFAULT 'الرياض',
    pin TEXT,
    active_orders INTEGER DEFAULT 0,
    status TEXT DEFAULT 'متاح',
    rating NUMERIC(3, 2) DEFAULT 5.0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_drivers_tenant ON drivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone);

-- 8. تفعيل الأمان (RLS) لكافة الجداول
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة العامة
DROP POLICY IF EXISTS "Allow public read categories" ON categories;
CREATE POLICY "Allow public read categories" ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read products" ON products;
CREATE POLICY "Allow public read products" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read orders" ON orders;
CREATE POLICY "Allow public read orders" ON orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read customers" ON customers;
CREATE POLICY "Allow public read customers" ON customers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read drivers" ON drivers;
CREATE POLICY "Allow public read drivers" ON drivers FOR SELECT USING (true);

-- سياسات التعديل والإدارة للمشرفين
DROP POLICY IF EXISTS "Allow service_role full access categories" ON categories;
CREATE POLICY "Allow service_role full access categories" ON categories FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access products" ON products;
CREATE POLICY "Allow service_role full access products" ON products FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access orders" ON orders;
CREATE POLICY "Allow service_role full access orders" ON orders FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access customers" ON customers;
CREATE POLICY "Allow service_role full access customers" ON customers FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service_role full access drivers" ON drivers;
CREATE POLICY "Allow service_role full access drivers" ON drivers FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 7. زناد المعاملات لتحديث المخزون تلقائياً عند إنشاء الطلب (Atomic Stock Deduction)
CREATE OR REPLACE FUNCTION process_order_inventory_deduction()
RETURNS TRIGGER AS $$
DECLARE
    item JSONB;
    p_id TEXT;
    p_name TEXT;
    p_qty INTEGER;
BEGIN
    IF NEW.items IS NOT NULL AND jsonb_array_length(NEW.items) > 0 THEN
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            p_id := item->>'id';
            p_name := item->>'name';
            p_qty := COALESCE((item->>'qty')::INTEGER, 1);

            IF p_id IS NOT NULL AND p_id <> '' THEN
                UPDATE products 
                SET stock = GREATEST(0, stock - p_qty), updated_at = NOW()
                WHERE id = p_id AND tenant_id = NEW.tenant_id;
            ELSIF p_name IS NOT NULL AND p_name <> '' THEN
                UPDATE products 
                SET stock = GREATEST(0, stock - p_qty), updated_at = NOW()
                WHERE name = p_name AND tenant_id = NEW.tenant_id;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_order_stock_deduction ON orders;
CREATE TRIGGER trigger_order_stock_deduction
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION process_order_inventory_deduction();

-- 8. إدراج جميع الفئات (${allCategories.length} فئة)
`;

allCategories.forEach(c => {
  const esc = (s) => (s ? "'" + String(s).replace(/'/g, "''") + "'" : "NULL");
  const num = (n) => (n !== null && n !== undefined && !isNaN(n) ? Number(n) : "0");

  sql += `INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES (${esc(c.id)}, ${esc(c.tenant_id)}, ${esc(c.name)}, ${esc(c.icon)}, ${esc(c.image)}, ${num(c.count)})
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();\n`;
});

sql += `\n-- 9. إدراج جميع المنتجات (${allProducts.length} منتج)\n`;

allProducts.forEach(p => {
  const esc = (s) => (s ? "'" + String(s).replace(/'/g, "''") + "'" : "NULL");
  const num = (n) => (n !== null && n !== undefined && !isNaN(n) ? Number(n) : "NULL");
  const bool = (b) => (b ? "TRUE" : "FALSE");

  sql += `INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES (${esc(p.id)}, ${esc(p.tenant_id)}, ${esc(p.name)}, ${esc(p.category)}, ${num(p.price)}, ${num(p.oldPrice)}, ${esc(p.unit)}, ${num(p.stock) || 0}, ${num(p.rating) || 5.0}, ${esc(p.barcode)}, ${esc(p.image)}, ${bool(p.isOffer)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();\n`;
});

sql += `\n-- 10. إدراج جميع الطلبات (${allOrders.length} طلب)\n`;

allOrders.forEach(o => {
  const esc = (s) => (s ? "'" + String(s).replace(/'/g, "''") + "'" : "NULL");
  const num = (n) => (n !== null && n !== undefined && !isNaN(n) ? Number(n) : "0");
  const bool = (b) => (b ? "TRUE" : "FALSE");
  const jsonStr = (arr) => (arr ? "'" + JSON.stringify(arr).replace(/'/g, "''") + "'::jsonb" : "'[]'::jsonb");

  sql += `INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES (${esc(o.id)}, ${esc(o.tenant_id)}, ${esc(o.customerName)}, ${esc(o.phone)}, ${esc(o.address)}, ${esc(o.branch)}, ${esc(o.date)}, ${num(o.itemsTotal)}, ${num(o.deliveryFee)}, ${num(o.distanceKm)}, ${num(o.total)}, ${esc(o.status || 'pending')}, ${esc(o.driverName)}, ${esc(o.paymentMethod)}, ${esc(o.receiptUrl)}, ${esc(o.receiptImage)}, ${bool(o.receiptConfirmed)}, ${esc(o.customerNote)}, ${num(o.dropoffLat)}, ${num(o.dropoffLng)}, ${esc(o.trackToken)}, ${esc(o.driverToken)}, ${jsonStr(o.items)})
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();\n`;
});

sql += `\n-- 11. إدراج جميع العملاء (${allCustomers.length} عميل)\n`;

allCustomers.forEach(c => {
  const esc = (s) => (s ? "'" + String(s).replace(/'/g, "''") + "'" : "NULL");
  const num = (n) => (n !== null && n !== undefined && !isNaN(n) ? Number(n) : "0");

  sql += `INSERT INTO customers (id, tenant_id, name, phone, address, city, orders_count, total_spent)
VALUES (${esc(c.id)}, ${esc(c.tenant_id)}, ${esc(c.name)}, ${esc(c.phone)}, ${esc(c.address || c.city)}, ${esc(c.city)}, ${num(c.ordersCount)}, ${num(c.totalSpent)})
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    orders_count = EXCLUDED.orders_count,
    total_spent = EXCLUDED.total_spent,
    updated_at = NOW();\n`;
});

sql += `\n-- 12. إدراج جميع المناديب (${allDrivers.length} مندوب)\n`;

allDrivers.forEach(d => {
  const esc = (s) => (s ? "'" + String(s).replace(/'/g, "''") + "'" : "NULL");
  const num = (n) => (n !== null && n !== undefined && !isNaN(n) ? Number(n) : "0");

  sql += `INSERT INTO drivers (id, tenant_id, name, phone, vehicle, car, zone, city, pin, active_orders, status, rating)
VALUES (${esc(d.id)}, ${esc(d.tenant_id)}, ${esc(d.name)}, ${esc(d.phone)}, ${esc(d.vehicle)}, ${esc(d.car)}, ${esc(d.zone)}, ${esc(d.city || 'الرياض')}, ${esc(d.pin)}, ${num(d.activeOrders)}, ${esc(d.status || 'متاح')}, ${num(d.rating) || 5.0})
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    vehicle = EXCLUDED.vehicle,
    car = EXCLUDED.car,
    zone = EXCLUDED.zone,
    city = EXCLUDED.city,
    active_orders = EXCLUDED.active_orders,
    status = EXCLUDED.status,
    rating = EXCLUDED.rating,
    updated_at = NOW();\n`;
});

const outputPath = path.join(__dirname, 'supabase_complete_migration.sql');
fs.writeFileSync(outputPath, sql, 'utf8');
console.log(`✅ Generated supabase_complete_migration.sql with Tenants, Categories (${allCategories.length}), Products (${allProducts.length}), Orders (${allOrders.length}), Customers (${allCustomers.length}), and Drivers (${allDrivers.length})!`);
