-- ============================================================
-- سلة المنار — مخطط Supabase المتطابق مع الخادم (server.js)
-- ⚠️ استخدِم هذا الملف بدل ملفات الـ migration القديمة:
--    الخادم يرسل أسماء الحقول camelCase (itemsTotal, dropoffLat...)
--    والأعمدة هنا مسماة بنفسها بين علامتي اقتباس "..." حتى يطابق الشكل
--    (PostgreSQL يميّز الأسماء المقتبسة حرفياً)
-- نفذ الملف كاملاً في: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ═══ 1. جدول المنشآت ═══
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'نشط',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO tenants (id, name)
VALUES ('almanar_main', 'سلة المنار — الفرع الرئيسي')
ON CONFLICT (id) DO NOTHING;

-- ═══ 2. جدول الطلبات (مطابق تماماً لحقول الخادم camelCase) ═══
CREATE TABLE IF NOT EXISTS orders (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "customerName" TEXT DEFAULT 'عميل التطبيق',
    "phone" TEXT,
    "address" TEXT,
    "branch" TEXT,
    "city" TEXT,
    "date" TEXT,
    "itemsTotal" NUMERIC(10,2) DEFAULT 0,
    "deliveryFee" NUMERIC(10,2) DEFAULT 0,
    "distanceKm" NUMERIC(5,2) DEFAULT 2.5,
    "total" NUMERIC(10,2) DEFAULT 0,
    "status" TEXT DEFAULT 'pending',
    "driverName" TEXT,
    "paymentMethod" TEXT,
    "receiptUrl" TEXT,
    "receiptImage" TEXT,
    "receiptConfirmed" BOOLEAN DEFAULT FALSE,
    "customerNote" TEXT,
    "notes" TEXT,
    "dropoffLat" DOUBLE PRECISION,
    "dropoffLng" DOUBLE PRECISION,
    "trackToken" TEXT,
    "driverToken" TEXT,
    "driverGeo" JSONB,
    "statusHistory" JSONB DEFAULT '[]'::jsonb,
    "claimedByDriverId" TEXT,
    "claimedByName" TEXT,
    "acceptedAt" TIMESTAMPTZ,
    "preparingAt" TIMESTAMPTZ,
    "readyAt" TIMESTAMPTZ,
    "onTheWayAt" TIMESTAMPTZ,
    "deliveredAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "items" JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders("status");
CREATE INDEX IF NOT EXISTS idx_orders_track ON orders("trackToken");

-- ═══ 3. جدول المندوبين ═══
CREATE TABLE IF NOT EXISTS drivers (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "vehicle" TEXT,
    "car" TEXT,
    "zone" TEXT,
    "city" TEXT,
    "photo" TEXT,                    -- صورة المندوب (base64) — text عادي
    "pin" TEXT,
    "activeOrders" INTEGER DEFAULT 0,
    "status" TEXT DEFAULT 'متاح',
    "rating" NUMERIC(3,2) DEFAULT 5.0,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_drivers_tenant ON drivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers("phone");

-- ═══ 4. جدول المنتجات ═══
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "category" TEXT DEFAULT 'عام',
    "price" NUMERIC(10,2) NOT NULL DEFAULT 0,
    "oldPrice" NUMERIC(10,2),
    "unit" TEXT DEFAULT 'حبة',
    "stock" INTEGER NOT NULL DEFAULT 0,
    "rating" NUMERIC(3,2) DEFAULT 5.0,
    "barcode" TEXT,
    "image" TEXT DEFAULT '📦',
    "isOffer" BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

-- ═══ 5. جدول الفئات ═══
CREATE TABLE IF NOT EXISTS categories (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "icon" TEXT DEFAULT '📁',
    "image" TEXT,
    "count" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);

-- ═══ 6. جدول العملاء ═══
CREATE TABLE IF NOT EXISTS customers (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "name" TEXT NOT NULL DEFAULT 'عميل سلة المنار',
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "ordersCount" INTEGER DEFAULT 0,
    "totalSpent" NUMERIC(10,2) DEFAULT 0,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers("phone");

-- ═══ 7. الأمان (RLS) ═══
-- التطبيقات لا تتصل بـ Supabase مباشرة أبداً — كل شيء يمر عبر خادمك (server.js)
-- بمفتاح service_role الذي يتجاوز RLS بطبيعته، لذلك نغلق الوصول المجهول كلياً:
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ملاحظة: لا نُنشئ أي سياسة للـ anon — أي جهاز بلا مفتاح الخادم يرى صفر بيانات

-- ═══ 8. اختبار ✅ ═══
-- بعد التنفيذ بزر Run، من Table Editor ستظهر الجداول الستة فارغة.
-- شغّل خادمك وأرسل طلباً من تطبيق العميل ثم حدّث جدول orders وسترى الطلب.
