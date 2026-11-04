-- ========================================================
-- سلة المنار: هيكل قاعدة بيانات الفئات (Categories) في Supabase
-- متعدد المنشآت (Multi-Tenant) مع RLS
-- ========================================================

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

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read categories" ON categories;
CREATE POLICY "Allow public read categories" ON categories
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow service_role full access categories" ON categories;
CREATE POLICY "Allow service_role full access categories" ON categories
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- إدراج جميع الفئات الحالية لكل المنشآت بدون تكرار
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-all', 'almanar_main', 'جميع المنتجات', '🛒', 'images/categories/food.jpg', 70)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-rice', 'almanar_main', 'الأرز والمواد الجافة', '🍚', 'images/products/rice.jpg', 10)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-oils', 'almanar_main', 'الزيوت المأكولة', '🫒', 'images/categories/oils.jpg', 8)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-sugar', 'almanar_main', 'السكر والمحليات', '🧂', 'images/products/sugar.jpg', 3)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-coffee', 'almanar_main', 'القهوة والشاي', '☕', 'images/products/coffee.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-dairy', 'almanar_main', 'الألبان والعصائر', '🥛', 'images/products/cheese.jpg', 6)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-canned', 'almanar_main', 'المعلبات', '🥫', 'images/categories/canned.jpg', 6)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-veg', 'almanar_main', 'الخضار والفواكه', '🍎', 'images/products/fruits.jpg', 8)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-bakery', 'almanar_main', 'المخبوزات', '🍞', 'images/products/bread.jpg', 3)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-sweets', 'almanar_main', 'الحلويات والشوكولاتة', '🍫', 'images/products/sweets_choc.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-spices', 'almanar_main', 'البهارات والتوابل', '🌶️', 'images/categories/spices.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-detergents', 'almanar_main', 'المنظفات وخادمات المنزل', '🧴', 'images/products/detergent.jpg', 6)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-paper', 'almanar_main', 'الحفائض والورقيات', '🧻', 'images/products/diapers.jpg', 5)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793279786589', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793279786589', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793279786589', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793279786598', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793279786598', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793279786598', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793283553474', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793283553474', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793283553474', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793283553478', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793283553478', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793283553478', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287504004', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287504004', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287504004', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287504008', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287504008', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287504008', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287700613', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287700613', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287700613', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793287700616', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793287700616', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793287700616', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793292509868', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793292509868', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793292509868', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793292509874', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793292509874', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793292509874', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793476926025', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793476926025', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793476926025', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793476926034', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793476926034', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793476926034', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793551506293', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793551506293', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793551506293', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-a', 'tenant_1793560037069', 'منتجات عامة', '📦', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-b', 'tenant_1793560037069', 'أطعمة ومشروبات', '🍎', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES ('cat-c', 'tenant_1793560037069', 'أدوات ومنظفات', '🧼', NULL, 0)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();
