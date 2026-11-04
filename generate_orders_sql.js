import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const allOrders = [];

// Almanar main orders
if (db.tenantData && db.tenantData['almanar_main'] && Array.isArray(db.tenantData['almanar_main'].orders)) {
  db.tenantData['almanar_main'].orders.forEach(o => {
    allOrders.push({ ...o, tenant_id: 'almanar_main' });
  });
} else if (Array.isArray(db.orders)) {
  db.orders.forEach(o => {
    allOrders.push({ ...o, tenant_id: 'almanar_main' });
  });
}

// Other tenants
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.orders)) {
      t.orders.forEach(o => {
        allOrders.push({ ...o, tenant_id: tid });
      });
    }
  }
}

console.log('Total orders found across all tenants:', allOrders.length);

let sql = `-- ========================================================
-- سلة المنار: هيكل قاعدة بيانات الطلبات (Orders) في Supabase
-- يشمل: إدارة المعاملات المالية، تحديث المخزون، وعزل المنشآت RLS
-- ========================================================

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

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read orders" ON orders;
CREATE POLICY "Allow public read orders" ON orders
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow service_role full access orders" ON orders;
CREATE POLICY "Allow service_role full access orders" ON orders
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- دالة معالجة المخزون الآمنة (Atomic Stock Deduction)
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

-- إدراج جميع الطلبات الحالية (${allOrders.length} طلب) دون أي تكرار
`;

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

const outputPath = path.join(__dirname, 'supabase_orders_migration.sql');
fs.writeFileSync(outputPath, sql, 'utf8');
console.log('✅ Generated supabase_orders_migration.sql successfully!');
