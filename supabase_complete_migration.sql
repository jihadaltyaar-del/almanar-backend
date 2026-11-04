-- ========================================================
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

-- 8. إدراج جميع الفئات (55 فئة)
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-all', 'almanar_main', 'جميع المنتجات', '🛒', 'images/categories/food.jpg', 70)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-rice', 'almanar_main', 'الأرز والمواد الجافة', '🍚', 'images/products/rice.jpg', 10)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-oils', 'almanar_main', 'الزيوت المأكولة', '🫒', 'images/categories/oils.jpg', 8)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-sugar', 'almanar_main', 'السكر والمحليات', '🧂', 'images/products/sugar.jpg', 3)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-coffee', 'almanar_main', 'القهوة والشاي', '☕', 'images/products/coffee.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-dairy', 'almanar_main', 'الألبان والعصائر', '🥛', 'images/products/cheese.jpg', 6)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-canned', 'almanar_main', 'المعلبات', '🥫', 'images/categories/canned.jpg', 6)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-veg', 'almanar_main', 'الخضار والفواكه', '🍎', 'images/products/fruits.jpg', 8)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-bakery', 'almanar_main', 'المخبوزات', '🍞', 'images/products/bread.jpg', 3)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-sweets', 'almanar_main', 'الحلويات والشوكولاتة', '🍫', 'images/products/sweets_choc.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-spices', 'almanar_main', 'البهارات والتوابل', '🌶️', 'images/categories/spices.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-detergents', 'almanar_main', 'المنظفات وخادمات المنزل', '🧴', 'images/products/detergent.jpg', 6)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-paper', 'almanar_main', 'الحفائض والورقيات', '🧻', 'images/products/diapers.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793279786589', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793279786589', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793279786589', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793279786598', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793279786598', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793279786598', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793283553474', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793283553474', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793283553474', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793283553478', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793283553478', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793283553478', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287504004', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287504004', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287504004', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287504008', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287504008', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287504008', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287700613', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287700613', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287700613', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287700616', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287700616', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287700616', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793292509868', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793292509868', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793292509868', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793292509874', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793292509874', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793292509874', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793476926025', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793476926025', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793476926025', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793476926034', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793476926034', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793476926034', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793551506293', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793551506293', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793551506293', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793560037069', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793560037069', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793560037069', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, image = EXCLUDED.image, count = EXCLUDED.count, updated_at = NOW();

-- 9. إدراج جميع المنتجات (71 منتج)
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-baja', 'almanar_main', 'باجة قهوة تركية سادة بدون هيل 200 جرام', 'القهوة والشاي', 14.95, 18, 'علبة', 55, 4.9, '628100201', 'images/products/coffee_sada_200.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alkhair', 'almanar_main', 'الخير قهوة سريعة التحضير بالزعفران 12 كيس', 'القهوة والشاي', 18, 22, 'علبة', 40, 4.8, '628100202', 'images/products/coffee_instant_zafran.png', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tea-ghamd', 'almanar_main', 'شاي غمدان شاي أخضر 100 كيس 200 جرام', 'القهوة والشاي', 26, NULL, 'علبة', 65, 4.9, '628100203', 'images/products/tea_green_ghamdan.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tea-anwar', 'almanar_main', 'شاي أنور علي شاي سيلاني درجة أولى 250 جرام', 'القهوة والشاي', 12.59, 15, 'كيس', 80, 4.8, '628100204', 'images/products/tea_ceylon_anwar.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-rice-shaalan', 'almanar_main', 'أرز بسمتي الشعلان عنبر 5 كغ', 'الأرز والمواد الجافة', 48, 56, 'كيس', 35, 4.9, '628100205', 'images/products/rice_shoulan_5kg.png', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-oil-jouf', 'almanar_main', 'زيت زيتون الجوف بكر ممتاز 500 مل', 'الزيوت المأكولة', 24.5, NULL, 'قارورة', 50, 4.7, '628100206', 'images/products/olive_aljouf_500.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-cheese-kiri', 'almanar_main', 'أجبان وقشطة كيري الأصلية 24 قطعة', 'الألبان والعصائر', 28, 34, 'علبة', 45, 5, '628100207', 'images/products/cheese_kiri_24.webp', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-diapers-pamp', 'almanar_main', 'حفائض ومناديل مبللة بامبرز مقاس 4 (52 حبة)', 'الحفائض والورقيات', 64, 75, 'كيس', 30, 4.9, '628100208', 'images/products/pampers_size4.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-clean-tide', 'almanar_main', 'مسحوق غسيل تايد مركز 5 كغ', 'المنظفات وخادمات المنزل', 49, 62, 'كيس', 40, 4.8, '628100209', 'images/products/tide_5kg.png', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-plastic-boxes', 'almanar_main', 'طقم علب تنظيم بلاستيك حفظ الطعام 6 قطع', 'المنظفات وخادمات المنزل', 22, NULL, 'طقم', 35, 4.7, '628100210', 'images/products/plastics.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pasta', 'almanar_main', 'مكرونة قواقع أبو كاس 400 جرام', 'الأرز والمواد الجافة', 20, 22, 'كيس', 90, 4.7, '628100211', 'images/products/pasta_abukas_shells.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-bread', 'almanar_main', 'خبز توست هارفست الكامل 400 جرام', 'الأرز والمواد الجافة', 10, 19, 'كيس', 60, 4.8, '628100212', 'images/products/toast_harvest_400.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sugar', 'almanar_main', 'سكر أبيض بلوري ناعم 2 كغ', 'السكر والمحليات', 8.5, 12, 'كيس', 100, 4.9, '628100213', 'images/products/sugar_white_2kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-fruits-mix', 'almanar_main', 'تشكيلة فواكه طازجة موسمية', 'الخضار والفواكه', 35, NULL, 'كيلو', 25, 4.6, '628100214', 'images/products/fruit_mix.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-veg-mix', 'almanar_main', 'خضراوات طازجة مشكلة', 'الخضار والفواكه', 18, NULL, 'كيلو', 30, 4.5, '628100215', 'images/products/veg_mix.png', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pickles', 'almanar_main', 'مخللات فارم فيرست مشكلة 950 جرام', 'المعلبات', 12, 15, 'قارورة', 45, 4.7, '628100216', 'images/products/pickles_farmfirst.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-choc', 'almanar_main', 'شوكولاتة كيتكات مستوردة 4 فنجر 45 جرام', 'الحلويات والشوكولاتة', 6.5, 9, 'حبة', 200, 5, '628100217', 'images/products/kitkat_4.jpeg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-aljouf_organic_oliveoil_4l', 'almanar_main', 'زيت زيتون الجوف عضوي بكر ممتاز 4 لتر', 'الزيوت المأكولة', 89, 119, 'جالون 4 لتر', 30, 4.9, '63065782685', 'images/products/aljouf_organic_oliveoil_4l.png', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-aljouf_organic_oliveoil_250', 'almanar_main', 'زيت زيتون الجوف عضوي بكر ممتاز 250 مل', 'الزيوت المأكولة', 17.5, 22, 'زجاجة 250 مل', 60, 4.8, '63027167178', 'images/products/aljouf_organic_oliveoil_250.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-nems_sunflower_1.8', 'almanar_main', 'زيت النيمس دوار الشمس النقي 1.8 لتر', 'الزيوت المأكولة', 21, 27, 'عبوة 1.8 لتر', 45, 4.7, '63081125176', 'images/products/nems_sunflower_1.8.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alaila_rice_5kg', 'almanar_main', 'أرز بسمتي العائلة هندي فاخر 5 كغ', 'الأرز والمواد الجافة', 57, 69, 'كيس 5 كغ', 40, 4.9, '63044129311', 'images/products/alaila_rice_5kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alaila_rice_10kg', 'almanar_main', 'أرز بسمتي العائلة هندي فاخر 10 كغ', 'الأرز والمواد الجافة', 109, 132, 'كيس 10 كغ', 25, 4.9, '63059889377', 'images/products/alaila_rice_10kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alosra_sugar_10kg', 'almanar_main', 'سكر ناعم الأوسرة 10 كغ', 'السكر والمحليات', 38.5, 45, 'كيس 10 كغ', 50, 4.8, '63076976407', 'images/products/alosra_sugar_10kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pasta_abukas_shells', 'almanar_main', 'مكرونة قواقع أبو كاس 400 جم', 'الأرز والمواد الجافة', 15, 22, 'كيس', 80, 4.5, '63071505401', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pasta_abukas_spaghetti', 'almanar_main', 'مكرونة سباغيتي أبو كاس 500 جرام', 'الأرز والمواد الجافة', 14, 19, 'كيس', 75, 4.5, '63034309221', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-vermicelli', 'almanar_main', 'شعيرية أبو كاس 400 جرام', 'الأرز والمواد الجافة', 5.5, 8, 'كيس', 90, 4.4, '63027356524', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-lentils_1kg', 'almanar_main', 'عدس مطحون / مجروش 1 كغ', 'الأرز والمواد الجافة', 9, 12, '1 كغ', 60, 4.4, '63001493943', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-beans_1kg', 'almanar_main', 'فاصوليا بيضاء 1 كغ', 'الأرز والمواد الجافة', 8.5, 11, '1 كغ', 55, 4.3, '63050075539', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-olive_jufolea_4l', 'almanar_main', 'زيت زيتون الجوفية 4 لتر', 'الزيوت المأكولة', 76, 95, 'جالون 4 لتر', 20, 4.8, '63059571374', 'images/products/olive_oil.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sunflower_baraka_1.8', 'almanar_main', 'زيت بركة دوار الشمس 1.8 لتر', 'الزيوت المأكولة', 19.5, 25, 'عبوة 1.8 لتر', 60, 4.6, '63054858917', 'images/products/olive_oil.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-corn_oil_1.8', 'almanar_main', 'زيت ذرة العربي 1.8 لتر', 'الزيوت المأكولة', 23, 29, 'عبوة 1.8 لتر', 50, 4.6, '63006606269', 'images/products/olive_oil.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-honey_1kg', 'almanar_main', 'عسل سدر طبيعي 1 كغ', 'الزيوت المأكولة', 120, 155, 'علبة 1 كغ', 12, 4.9, '63011224621', 'images/products/olive_oil.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sugar_cube_500', 'almanar_main', 'سكر محبب (مكعبات) 500 جم', 'السكر والمحليات', 5, 7, 'علبة', 70, 4.5, '63001507569', 'images/products/sugar.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-coffee_arabica_pound', 'almanar_main', 'قهوة عربية مطحونة بالهيل 500 جم', 'القهوة والشاي', 28, 35, 'علبة', 30, 4.8, '63009053135', 'images/products/coffee.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-milk_foremost_1l', 'almanar_main', 'حليب طويل الأجل كامل الدسم 1 لتر', 'الألبان والعصائر', 6.5, 8.5, '1 لتر', 65, 4.6, '63071747977', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-juice_orange_1.5', 'almanar_main', 'عصير برتقال طبيعي 1.5 لتر', 'الألبان والعصائر', 8, 11, 'حجم 1.5 لتر', 45, 4.4, '63055286361', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-water_10pk', 'almanar_main', 'مياه معدنية 10 × 250 مل', 'الألبان والعصائر', 8.5, 11, 'كرتون', 70, 4.5, '63019125759', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-juice_tetley_ice', 'almanar_main', 'مشروبات شاي بارد 3 × 340 مل', 'الألبان والعصائر', 12, 15, 'حزمة', 25, 4.3, '63085084227', 'images/products/cheese.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-juice_coconut', 'almanar_main', 'ماء جوز هند عطري 1 لتر', 'الألبان والعصائر', 10, 13, 'عبوة', 30, 4.4, '63013118288', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tuna_yazid_4', 'almanar_main', 'تونة المدمسة 4 × 185 جم', 'المعلبات', 17, 21, 'حزمة', 40, 4.6, '63077104713', 'images/categories/canned.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-corn_can', 'almanar_main', 'ذرة تجارية معلبة 340 جرام', 'المعلبات', 4.5, 6, 'علبة', 60, 4.5, '63092204713', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-fava_beans_can', 'almanar_main', 'فول مدمس معلب 400 جرام', 'المعلبات', 4, 5.5, 'علبة', 75, 4.5, '63006618299', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tomato_paste_bottle', 'almanar_main', 'صلصة طماطم مركزة 660 جرام', 'المعلبات', 9, 12, 'قنينة', 55, 4.5, '63099072348', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-soup_chicken', 'almanar_main', 'حساء دجاج كريمي 500 جرام', 'المعلبات', 6.5, 9, 'علبة', 45, 4.3, '63096333515', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-apples_red', 'almanar_main', 'تفاح أحمر أمريكي 1 كغ', 'الخضار والفواكه', 9.5, 13, '1 كغ', 45, 4.6, '63026921144', 'images/products/apples_red.png', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-oranges', 'almanar_main', 'برتقالي مصرحي 2 كغ', 'الخضار والفواكه', 11, 15, '2 كغ', 40, 4.6, '63043928667', 'images/products/oranges.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-potatoes', 'almanar_main', 'بطاطس طازجة 5 كغ', 'الخضار والفواكه', 16, 20, '5 كغ', 25, 4.5, '63047572246', 'images/products/potatoes.png', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tomatoes', 'almanar_main', 'طماطم بلدي طازجة 1 كغ', 'الخضار والفواكه', 4.5, 6.5, '1 كغ', 60, 4.5, '63087563870', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-onions', 'almanar_main', 'بصل حلو طازج 3 كغ', 'الخضار والفواكه', 12, 16, '3 كغ', 30, 4.5, '63017340763', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-dates_sukhari', 'almanar_main', 'تمر سكري من الانتقاء الفاخر 1 كغ', 'الخضار والفواكه', 29, 38, '1 كغ', 22, 4.9, '63034438759', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-arabic_bread', 'almanar_main', 'خبز عربي حجازي 10 قطع', 'المخبوزات', 3, 4.5, 'كيس', 95, 4.6, '63008584158', 'images/products/bread.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-croissant_nader', 'almanar_main', 'كرواسون طازج 30 جم', 'المخبوزات', 1.5, 2.5, 'قطعة', 120, 4.4, '63097833438', 'images/products/bread.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-cake_nuttela', 'almanar_main', 'كيك بالشوكولاتة 300 جرام', 'المخبوزات', 8, 11, 'علبة', 40, 4.4, '63083552135', 'images/products/bread.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-oreo_biscuits', 'almanar_main', 'بسكويت أوريو كلاسيك', 'الحلويات والشوكولاتة', 4, 6, 'علبة', 110, 4.7, '63003269566', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-bullfac_5_nuts', 'almanar_main', 'مكسرات مشكلة محمصة 30 جم', 'الحلويات والشوكولاتة', 2.5, 3.5, 'قطعة', 90, 4.5, '63050841025', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-biscuits_tea_lux', 'almanar_main', 'بسكويت الشاي 2 علبة', 'الحلويات والشوكولاتة', 7.5, 10, 'علبة', 80, 4.5, '63033699438', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-halawa_tahini', 'almanar_main', 'حلا طحينية بالفستا الحلبي 250 جم', 'الحلويات والشوكولاتة', 12, 16, 'علبة', 33, 4.6, '63001545284', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-salt_iodized_1kg', 'almanar_main', 'ملح يودي ناعم 1 كغ', 'البهارات والتوابل', 2, 3, 'كيس', 160, 4.6, '63079688436', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-black_pepper_200', 'almanar_main', 'فلفل أسود مطحون 200 جم', 'البهارات والتوابل', 9, 12, 'عبوة', 65, 4.6, '63063757292', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-turmeric_200', 'almanar_main', 'كركم مطحون 200 جم', 'البهارات والتوابل', 6.5, 9, 'عبوة', 70, 4.6, '63089863663', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-mixed_spices', 'almanar_main', 'بهارات مشكلة الحجاز 250 جم', 'البهارات والتوابل', 8, 11, 'عبوة', 60, 4.7, '63063808856', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sauce_pakistani', 'almanar_main', 'صوص شطة حارة 200 مل', 'البهارات والتوابل', 5.5, 7.5, 'قنينة', 75, 4.5, '63025678300', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-klorox_1l', 'almanar_main', 'مبيض ومعطر كلوروكس 1 لتر', 'المنظفات وخادمات المنزل', 7.5, 10, 'قنينة', 55, 4.6, '63071276799', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-dishwash_lime', 'almanar_main', 'سائل جلي بالليمون 750 مل', 'المنظفات وخادمات المنزل', 5.5, 8, 'قنينة', 70, 4.5, '63010129987', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-air_freshener', 'almanar_main', 'معطر جو فاخر 300 مل', 'المنظفات وخادمات المنزل', 9, 13, 'علبة', 50, 4.5, '63076759104', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-trash_bags', 'almanar_main', 'أكياس القمامة 20 كيس', 'المنظفات وخادمات المنزل', 6, 8, 'رول', 85, 4.4, '63045420046', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-facial_tissues', 'almanar_main', 'مناديل ورقية فاين 10 علبة', 'الحفائض والورقيات', 22, 28, 'كرتون', 35, 4.6, '63088610830', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-kitchen_towel', 'almanar_main', 'مناديل مطبخ برانة 6 لفات', 'الحفائض والورقيات', 17.5, 23, 'حزمة', 40, 4.5, '63023378475', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-aluminium_foil', 'almanar_main', 'ورق ألمنيوم 30 متر', 'الحفائض والورقيات', 8, 11, 'لفة', 60, 4.4, '63082374083', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-toilet_tissue', 'almanar_main', 'ورق تواليت 12 لفة', 'الحفائض والورقيات', 24, 32, 'حزمة', 45, 4.6, '63001170479', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-1793565718779', 'tenant_1793551506293', 'أرز بسمتي فاخر', 'منتجات عامة', 45, NULL, 'كيس 5 كجم', 20, 5, '65718779', '📦', FALSE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price, unit = EXCLUDED.unit, stock = EXCLUDED.stock, rating = EXCLUDED.rating, barcode = EXCLUDED.barcode, image = EXCLUDED.image, is_offer = EXCLUDED.is_offer, updated_at = NOW();

-- 10. إدراج جميع الطلبات (80 طلب)
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#64548056', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 20:06', 20, 5, 2.5, 25, 'ready_for_delivery', 'جهاد الطيار', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'N6gu7ZqvEWxhCjZZxpv2CQwH4RAryGWV', NULL, '[{"name":"سلة مشتريات العميل","qty":1,"price":20,"image":"🛒","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#23906502', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 20:06', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, 'vbat8877DRaQhqyNCYmEzpJSdDF5RHF4', 't96mh93NkQM6QNTQUMRn96jzFs5ybmSL', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#81738989', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 20:06', 20, 5, 2.5, 25, 'pending', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'w27x8zaCNutX9evDS2EYAnakexmn96cE', NULL, '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#83505268', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 20:06', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, '3svgkqc3Kk2JHcAjhkrqMaxNBVAE4PMv', 'DQwvnGjjtjEC2wbanhXupvd9yEVT2YpD', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#24459270', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:05', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'Pzxfw7TveYFsTDAgTxEMDcnUCvgtMMAQ', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#19602727', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:05', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'cQb82T6sqFnRgehwkaMmwfaSzk8dnfSz', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#15092704', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:04', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'FgSQS53UYhk8PQawdKPrcBEQgtETXEdb', 'QcqnbMXssRw2MMxJnQMzPJsxwMZwu5GC', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#67411618', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:04', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'XFuLUb3bPJursGjfbA8kpxUPCxrnf9eu', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#84902319', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:04', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'M8Ad2fx3SySNMPS5DtkfLzDnTFjEbnnq', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#28731722', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:03', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'ZFvWkdp6XPmWehzbdcGRpqewqxN7j6yu', 'VWgYX74DBYeVdtALzUjs3RP8kBbDyL8C', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#57619059', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:03', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'yTw33pdRzaJ2h4zyaYJsgM39WLDpmVzt', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#50623940', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:03', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'VFFBKG7XkkkrnV4A3cfpGm7Lp2um3YtL', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#32026677', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:01', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'p4qy2DqSsSNphRpHF2f4YbUmpDvpbdWL', 'uqAFXyGzk6fSqNuE3Sb6zfD3WHqmLW4J', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#91342981', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:01', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'vWhxWKdNf6KkcpzFusRv3ppbUGrnDUP9', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#56146495', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:01', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'QE5HWDBCHpJwNBzTSpjfm4Y9yJwfUykH', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#23387280', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:00', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'A4hPWH5C8TWPEAe2pDeJAP3YGZ24PKjA', 'KepGLKvZwEGdj58skjsgMRzaMjZtaSb6', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#87799522', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:00', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'kfmZfBHHST5WMxsTXfWKD8aChV2UhZ9C', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#77834100', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 20:00', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'bzgex3xF7kdR66f8ZmN9wxxTCzr2kxM3', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#15701350', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 19:59', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'fEYMU8ngXATAbrgvYYtSR7YBEtYdGaKx', 'AdbuM68ySkXBPTDRkbGhsgtQRddE2WKe', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#45382026', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-03 19:52', 193.59, 5, 2.5, 198.59, 'ready_for_delivery', 'جهاد الطيار', 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, 'jRSthr3PWNm2tgxjLzxQNbQRdcj5GG5E', NULL, '[{"name":"🌙 سلة الإفطار","qty":1,"price":89,"image":"🌙","prepared":true},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"images/products/rice_shoulan_5kg.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#30260604', 'almanar_main', 'عميل CITYTST', '0551112222', 'شارع اختبار', 'سلة المنار - فرع الروضة', '2026-11-03 15:46', 5, 5, 2.5, 10, 'preparing', 'جهاد الطيار', 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'q6sJ4htwsQxprV3EgHWqfZPBU8u27a4S', NULL, '[{"name":"خبز","qty":1,"price":5,"image":"📦","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#60913306', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 15:46', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'D7nuYWb4HK59n8R4gv9LRY5YJrZqyKZW', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#49021554', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 15:46', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'FnWKMYTGbwZDJrmT4uqGSDZek7ZvWMzU', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#83245170', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 15:45', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'ArJjju2xhJDhtpMRGjjy3sKDWFVENsU5', '2ayGzG3yXEPjBFrLzc5yFG2ukXDzSQZc', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#20662113', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 15:45', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'Jw8MChnGBfcyq8JTgPmURDQLCM2HAh2b', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#73261124', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 15:43', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'Hp4GYUXGCExSrkLRwVs7DY7dpqnP2bry', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#68803235', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 15:43', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, '42zXhZpXAc4U8VRcpMurfnVK4YWhHYge', 'rcthJF4Zm6eHydaBZwkGF7zALc4HCD8Z', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#93908033', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-03 15:28', 116.5, 5, 2.5, 121.5, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, '7XfJ7WBZCBtfwfXPj36BLABZWqykfMJL', NULL, '[{"name":"حفائض ومناديل مبللة بامبرز مقاس 4 (52 حبة)","qty":1,"price":64,"image":"images/products/pampers_size4.jpg"},{"name":"أجبان وقشطة كيري الأصلية 24 قطعة","qty":1,"price":28,"image":"images/products/cheese_kiri_24.webp"},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#17313721', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-03 15:19', 92, 5, 2.5, 97, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, 'FrpfaX7jhgjH4Gbdt7RDkDYpmGAuLxNx', NULL, '[{"name":"أجبان وقشطة كيري الأصلية 24 قطعة","qty":1,"price":28,"image":"images/products/cheese_kiri_24.webp"},{"name":"حفائض ومناديل مبللة بامبرز مقاس 4 (52 حبة)","qty":1,"price":64,"image":"images/products/pampers_size4.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#61794824', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-03 15:14', 164.5, 5, 2.5, 169.5, 'completed', 'جهاد الطيار', 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, 'HDjEEGV3s957wXxcTvchJMrF82svuXFR', '2rCT5BmewCzea3JbZRKr4QZyWxb3EPcA', '[{"name":"حفائض ومناديل مبللة بامبرز مقاس 4 (52 حبة)","qty":1,"price":64,"image":"images/products/pampers_size4.jpg","prepared":true},{"name":"أجبان وقشطة كيري الأصلية 24 قطعة","qty":1,"price":28,"image":"images/products/cheese_kiri_24.webp","prepared":true},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg","prepared":true},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"images/products/rice_shoulan_5kg.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#49591358', 'almanar_main', 'عميل اختبار واجهة المندوب', '0557000011', 'الرياض - حي المروج شارع 12', 'سلة المنار - فرع الروضة', '2026-11-03 14:15', 60, 5, 2.5, 65, 'delivering', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'W6rgCNNrtw6Vwy7eDB8BBCqsvEBAmgmV', 'DatvqQJ7xpaQvhcn4cSFvE7VtRCgmguY', '[{"name":"منتج واجهة 1","qty":2,"price":30,"image":"📦","prepared":true},{"name":"منتج واجهة 2","qty":1,"price":10,"image":"📦","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#47886809', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 13:57', 20, 5, 2.5, 25, 'delivering', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'A3cLgHx8rWp4PXku3t8dkaWUGNmms32S', 'uhUvnBprGZEcYjCa3eGA6hMy67rqbncq', '[{"name":"سلة مشتريات العميل","qty":1,"price":20,"image":"🛒","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#21946818', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 13:57', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, 'pdqqSbw6DrDNYXHKCcSj77G6HZQLy7Fe', 'Hrfw8jphmaNGYgxqknSh54MtzcZJ4VmR', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#57470583', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 13:56', 20, 5, 2.5, 25, 'completed', 'جهاد الطيار', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'RU5t2eQVFYxEaX4GXeSyJhDZSL3d3p38', 'zLPmCeJZ64t6yT7AcmFVJMWfzhvVj7vm', '[{"name":"سلة مشتريات العميل","qty":1,"price":20,"image":"🛒","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#93622704', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 13:56', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, 'bdAKKmCSr2s8CdqdxVFnmxPvSWhRX3gt', 'pXRWqBGuEbbLTBTZpk5p2Jv6rQz2PDKt', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#69650192', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 13:56', 20, 5, 2.5, 25, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'YfKnnTEYF8hJcg2QPC5vtTMn9KPNBfGA', NULL, '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#54349143', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 13:56', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, '38vWE62uRx3aPmmwNqLJSGd28JDWxE6H', 'CTnyn3GJKBnN3MRM54CkSp4AmjHGDU8t', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#80863882', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 20, 5, 2.5, 25, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'qptzmbUhJ4TbpTXZGLuDpv6xJLN2Yh4W', NULL, '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#45548246', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, 'xX8e8H75NRqSTg22xZQNcs2tDRWbecLj', 'pKsFkBsRZVm6pKWbKdPbVnMBTW6RGUjw', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#81442710', 'almanar_main', 'اختبار التتبع', '0550000000', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 50, 5, 2.5, 55, 'completed', 'مندوب الاختبار', 'الدفع عند الاستلام', NULL, NULL, FALSE, 'TEST_TRACKING_ORDER', 24.7035, 46.7545, 'hZE9QMw9qArReGv74yHXGDVaZrExBQWv', 'RUvPcMB8kWKffLnX8Lyc574tYcJ35nC2', '[{"name":"اختبار","price":50,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#82220098', 'almanar_main', 'اختبار التتبع', '0550000000', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 50, 5, 2.5, 55, 'completed', 'مندوب الاختبار', 'الدفع عند الاستلام', NULL, NULL, FALSE, 'TEST_TRACKING_ORDER', 24.7035, 46.7545, 'MaFaevQmUDPEJjq64hURD8h4pABbPhjz', '9HUwqsjWkEVhL5fAZJgNufGTQJGARzLy', '[{"name":"اختبار","price":50,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#87605218', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 20, 5, 2.5, 25, 'preparing', 'جهاد الطيار', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'EDGXrqunX8x38Snw9XTeY5f4SBxxAexF', NULL, '[{"name":"سلة مشتريات العميل","qty":1,"price":20,"image":"🛒","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#55149578', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, 'rHXa5rBe4nvwm3WeQj9cbSKyEv9aWLKk', 'sugUzZnDg6Ed6WXPkjcxemN5mA3V4yMd', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#55100957', 'almanar_main', 'اختبار التتبع', '0550000000', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 50, 5, 2.5, 55, 'completed', 'مندوب الاختبار', 'الدفع عند الاستلام', NULL, NULL, FALSE, 'TEST_TRACKING_ORDER', 24.7035, 46.7545, 'edLVAQNf4PTcdx7DMHw87f9RtEyuVknm', 'Bhz2h9HbqqTS8UMhyLbGWSy7s9mDngEZ', '[{"name":"اختبار","price":50,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#30078167', 'almanar_main', 'عميل آخر', '055xxxxxxx', 'الرياض - حي الروضة', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 20, 5, 2.5, 25, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'CLj6ktnvSC86CvbqgNUBQs5FsBzEuV5k', NULL, '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#75074726', 'almanar_main', 'عميل اختبار الخريطة', '0550000001', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 13:53', 30, 5, 2.5, 35, 'completed', 'رفيق سلطان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.84605, 46.639, 'AkKc8mxp6WCShy5LMNcDFftrtKMjWtGb', '3jeYGwdxHrAyFwzsmLshmah8Y9FAtZB3', '[{"name":"منتج اختبار الخريطة","price":30,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#98539704', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:52', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'sE4W4cjXaQ9Rzpj2EMSDhxDExXQqKkxR', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#45857634', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:52', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'KDe9Wc99LyDjSeMN5VAbFPcVbnasD6Ga', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#87863929', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:52', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'VbLzTQ4YCVxPuEPWvNGhU9V7RZpNKE9a', 'tpkfVTNbSDVFzkEYAyZf2A38AyBdcZS3', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#92885174', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:52', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'Urabgx2wAsS9eMUgpdtKrdnSwkzweqmF', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#40085965', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:52', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, '4S7bgUcrP2udbBxHukWxZhDszMQA6nsa', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#46444938', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:51', 70, 5, 2.5, 75, 'completed', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'YkpfEhLrzUdTVMsjBFYZkYjX528ywd5G', 'L2VxVv7fCmEwyZwyLLajmym6cySasGHT', '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#61707567', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:51', 70, 5, 2.5, 75, 'preparing', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'ptLvNWTw8FCawWRWxfLc2BW4DP7SJ6af', NULL, '[{"name":"منتج أ","price":30,"qty":2,"prepared":true},{"name":"منتج ب","price":10,"qty":1,"prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#22262106', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:50', 70, 5, 2.5, 75, 'pending', 'مندوب FLWTEST 1', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'sd3MfUsn7mCVUJmVX78Px9s83hJUYDMZ', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#96875601', 'almanar_main', 'عميل FLWTEST', '0551112222', 'الرياض - حي الروضة شارع 43', 'سلة المنار - فرع الروضة', '2026-11-03 13:49', 70, 5, 2.5, 75, 'completed', NULL, 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.7035, 46.7545, 'zm4SftVqScxya6XB2wggH5v5npH9Kv3d', NULL, '[{"name":"منتج أ","price":30,"qty":2},{"name":"منتج ب","price":10,"qty":1}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#61365441', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-03 13:41', 72.5, 5, 2.5, 77.5, 'delivering', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'gMdfyQ4g7YPaH6hch36XLgmv493cV2tC', 'xSnQRSreHVXrx98vHwhqPUshF4269jHV', '[{"name":"🌙 سلة الإفطار","qty":3,"price":16,"image":"🌙","prepared":true},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#36319821', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-03 13:06', 260.09, 5, 2.5, 265.09, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, 'kAFnYuktyvzgyG92pmvWSKC8XRLYp7K8', '5uzc8esqu9cH5hFqSw9GArq36JqJxdtd', '[{"name":"🤲 سلة الضيوف","qty":1,"price":149,"image":"🤲","prepared":true},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":true},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"images/products/rice_shoulan_5kg.png","prepared":true},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#75795587', 'almanar_main', '???? ????? ???????', '0559988776', '?????? - ?? ????????', '??? ?????? - ??? ??????', '2026-11-03 10:58', 29.9, 5, 2, 34.9, 'completed', NULL, '??? (Mada)', NULL, NULL, FALSE, NULL, 0, 0, 'WCXJvfDBhaBx4uMPhNu8xYUPMDLCYFdk', NULL, '[{"price":14.95,"name":"???? ???? ????? ???? ???? ??? 200 ????","qty":2,"image":"images/products/coffee_sada_200.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#27119802', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-02 17:01', 292.09, 5, 2.5, 297.09, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'VuGSDnyVCTnSJVB98A4hPLkL834DzYbz', NULL, '[{"name":"🎊 سلة العيد","qty":1,"price":179,"image":"🎊"},{"name":"أجبان وقشطة كيري الأصلية 24 قطعة","qty":1,"price":28,"image":"images/products/cheese_kiri_24.webp"},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg"},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"images/products/rice_shoulan_5kg.png"},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#10555940', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-02 15:28', 100.5, 5, 2.5, 105.5, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'bwzCWuq7YshLMVma3FUbYyaw2EgYAVVe', 'a63JyFzUd672xtFUeCp3XvwHzxH6JxMP', '[{"name":"أجبان وقشطة كيري الأصلية 24 قطعة","qty":1,"price":28,"image":"images/products/cheese_kiri_24.webp","prepared":true},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg","prepared":true},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"images/products/rice_shoulan_5kg.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#80646660', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-01 19:09', 58.95, 5, 2.5, 63.95, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, 'AJwABqBx8dbwZzdzhy2693ezhMUHPWsn', NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#90348683', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-01 16:56', 74.95, 5, 2.5, 79.95, 'completed', NULL, 'تحويل بنكي للحساب', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, '9UTtaHpf3gv6h49gu4ny5u5RvbWCRvTq', NULL, '[{"name":"🌙 سلة الإفطار","qty":1,"price":16,"image":"🌙"},{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg"},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png"},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#11176036', 'almanar_main', 'يوسف محمد', '0551234567', 'جبل ثهلان, بلدية المعذر, الرياض, محافظة الرياض, منطقة الرياض, 12313, السعودية', 'سلة المنار - فرع الروضة', '2026-10-31 22:21', 181.95, 5, 2.5, 186.95, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.692986450336917, 46.6738105455969, 'rxS43qr2yeVGHhH4a8akqHu8zgLntL9d', NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true},{"name":"🤲 سلة الضيوف","qty":1,"price":149,"image":"🤲","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#52931024', 'almanar_main', 'فحص التتبع الموثوق', '0551112233', 'الرياض - حي الياسمين', 'سلة المنار - فرع الروضة', '2026-10-31 22:01', 50, 5, 2.5, 55, 'completed', 'سلمان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.82, 46.64, '7bW8yhz753HbEmLCgXZPPmsd6xkeDwbg', 'a88BwaTRcqCZFFnzgTtbb3ZFstXEn79a', '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#11616463', 'almanar_main', 'تجربة خرائط', '0559998877', 'الرياض - حي النرجس شارع عثمان بن عفان', 'سلة المنار - فرع الروضة', '2026-10-31 22:00', 65, 10, 4.2, 75, 'completed', 'جهاد الطيار', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.81234, 46.65432, 'jMuzrUF6jLJLn4yzQFs67vXNaDyyKpr4', 'AKB8UcMV3PYzqU7ZdERPDyEtybEA2nDn', '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#97666593', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-29 20:48', 63.5, 5, 2.5, 68.5, 'completed', NULL, 'تحويل بنكي للحساب', NULL, NULL, FALSE, NULL, 0, 0, '2aZv4shnfPFMqgnewnyqcFKsXrCEfTm4', NULL, '[{"name":"ورق تواليت 12 لفة","qty":1,"price":24,"image":"images/products/diapers.jpg"},{"name":"مناديل مطبخ برانة 6 لفات","qty":1,"price":17.5,"image":"images/products/diapers.jpg"},{"name":"مناديل ورقية فاين 10 علبة","qty":1,"price":22,"image":"images/products/diapers.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#57558491', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-29 16:31', 32.95, 5, 2.5, 37.95, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, '2BPkWBkFPjawse2VamBCqvxuxPPfAuYJ', 'MYseswSCceJLZQyCrPnPs82vJe34nBBH', '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#57544842', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-28 15:48', 12.59, 10, 5, 22.59, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#43070394', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-28 15:47', 71.54, 10, 5, 81.54, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":false},{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":false},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":false},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#13208200', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-27 19:14', 45.54, 5, 2.5, 50.54, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#70970615', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-27 17:11', 18, 5, 2.5, 23, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#84753154', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-27 12:35', 40.95, 5, 2.5, 45.95, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":false},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#34597274', 'almanar_main', 'سارة خالد', '0554433221', 'الرياض - حي الياسمين', 'سلة المنار - فرع الروضة', '2026-10-27 10:12', 60.49, 5, 2.5, 65.49000000000001, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":2,"price":14.95,"image":"☕","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"☕","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"🍵","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#62099990', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-26 22:58', 58.13, 5, 2.5, 63.13, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"📦","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"📦","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":2,"price":12.59,"image":"📦","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#94612642', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-26 22:52', 105.45, 5, 2.5, 110.45, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"📦","prepared":false},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"📦","prepared":false},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"📦","prepared":false},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"📦","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#48802353', 'almanar_main', 'فهد العتيبي', '0558877665', 'حي الروضة شارع خالد بن الوليد', 'سلة المنار - فرع الروضة', '2026-10-26 22:49', 71.54, 10, 5, 81.54, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"قهوة تركية 200 جرام","qty":1,"price":14.95},{"name":"شاي غمدان أخضر","qty":1,"price":26}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#98918832', 'almanar_main', 'فهد العتيبي', '0558877665', 'حي الروضة شارع خالد بن الوليد', 'سلة المنار - فرع الروضة', '2026-10-26 22:44', 0, 0, 0, 76.54, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"قهوة تركية 200 جرام","qty":1,"price":14.95},{"name":"شاي غمدان أخضر","qty":1,"price":26}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#78159410', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-26 22:24', 0, 0, 0, 94.271, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('20241818', 'almanar_main', 'عمار محمد', '0551234567', 'الطائف - حي القيم شارع سليمان الراجحي', 'متاجر سلة المنار - الطائف', '08/02/2026', 0, 0, 0, 33, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#20241819', 'almanar_main', 'سارة علي', '0559876543', 'الطائف - الحلقة الغربية', 'متاجر سلة المنار - الطائف', '08/02/2026', 0, 0, 0, 48.75, 'completed', 'رفيق سلطان', 'Apple Pay', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();

-- 11. إدراج جميع العملاء (2 عميل)
INSERT INTO customers (id, tenant_id, name, phone, address, city, orders_count, total_spent)
VALUES ('cust-1', 'almanar_main', 'عمار محمد', '0551234567', 'الطائف - حي القيم', 'الطائف - حي القيم', 16, 1450)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    orders_count = EXCLUDED.orders_count,
    total_spent = EXCLUDED.total_spent,
    updated_at = NOW();
INSERT INTO customers (id, tenant_id, name, phone, address, city, orders_count, total_spent)
VALUES ('cust-2', 'almanar_main', 'سارة علي', '0559876543', 'الطائف - الحلقة الغربية', 'الطائف - الحلقة الغربية', 9, 780)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    orders_count = EXCLUDED.orders_count,
    total_spent = EXCLUDED.total_spent,
    updated_at = NOW();

-- 12. إدراج جميع المناديب (3 مندوب)
INSERT INTO drivers (id, tenant_id, name, phone, vehicle, car, zone, city, pin, active_orders, status, rating)
VALUES ('drv-1793042975745-641', 'almanar_main', 'جهاد الطيار', '+966 512 345 678', 'سكوتر توصيل - دباب', 'سكوتر توصيل - دباب', 'بوليفارد سيتي الرياض / المعيقلية', 'الرياض', '1234', 0, 'متاح', 4.9)
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
    updated_at = NOW();
INSERT INTO drivers (id, tenant_id, name, phone, vehicle, car, zone, city, pin, active_orders, status, rating)
VALUES ('drv-1793052579657-897', 'almanar_main', 'أحمد التوصيل السريع', '0559988776', 'كامري 2024 - أ ب ج 1234', 'كامري 2024 - أ ب ج 1234', 'شمال الرياض', 'الرياض', '7788', 0, 'متاح', 4.9)
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
    updated_at = NOW();
INSERT INTO drivers (id, tenant_id, name, phone, vehicle, car, zone, city, pin, active_orders, status, rating)
VALUES ('drv-1', 'almanar_main', 'رفيق سلطان', '0550001122', NULL, 'دباب توصيل سريع', NULL, 'الرياض', NULL, 2, 'متاح', 4.9)
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
    updated_at = NOW();
