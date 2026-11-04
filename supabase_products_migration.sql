-- ========================================================
-- سلة المنار: هيكل قاعدة بيانات Supabase (PostgreSQL) الاحترافي
-- متعدد المنشآت (Multi-Tenant Architecture) + Row-Level Security (RLS)
-- ========================================================

-- تفعيل الملحقات الضرورية
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

-- إدراج المنشآت الحالية
INSERT INTO tenants (id, name, commercial_name, category, city, phone, logo, status)
VALUES 
  ('almanar_main', 'سلة المنار — الفرع الرئيسي', 'شركة سلة المنار لتقنية المعلومات والتجارة', 'سوبرماركت ومواد غذائية', 'الرياض', '0550001122', '/images/logo.png', 'نشط'),
  ('tenant_1793551506293', 'فرع النرجس', 'مؤسسة سلة المنار - فرع النرجس', 'سوبرماركت ومواد غذائية', 'الرياض', '0550005566', '/images/logo.png', 'نشط')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. جدول المنتجات (Products) مع الحفاظ على كافة الحقول
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

-- إنشاء الفهارس للبحث السريع وعزل المنشآت
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- 3. تفعيل الأمان وسياسات العزل (Row Level Security - RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- قراءة المنتجات مسموحة للكل (تطبيق العملاء)
DROP POLICY IF EXISTS "Allow public read products" ON products;
CREATE POLICY "Allow public read products" ON products
    FOR SELECT
    USING (true);

-- التعديل والإضافة والحذف عبر الـ Service Role أو المشرفين
DROP POLICY IF EXISTS "Allow service_role full access" ON products;
CREATE POLICY "Allow service_role full access" ON products
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- 4. إدراج جميع المنتجات الحالية (بدون أي تكرار أو حذف للبيانات السابقة)
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-baja', 'almanar_main', 'باجة قهوة تركية سادة بدون هيل 200 جرام', 'القهوة والشاي', 14.95, 18, 'علبة', 55, 4.9, '628100201', 'images/products/coffee_sada_200.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alkhair', 'almanar_main', 'الخير قهوة سريعة التحضير بالزعفران 12 كيس', 'القهوة والشاي', 18, 22, 'علبة', 40, 4.8, '628100202', 'images/products/coffee_instant_zafran.png', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tea-ghamd', 'almanar_main', 'شاي غمدان شاي أخضر 100 كيس 200 جرام', 'القهوة والشاي', 26, NULL, 'علبة', 65, 4.9, '628100203', 'images/products/tea_green_ghamdan.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tea-anwar', 'almanar_main', 'شاي أنور علي شاي سيلاني درجة أولى 250 جرام', 'القهوة والشاي', 12.59, 15, 'كيس', 80, 4.8, '628100204', 'images/products/tea_ceylon_anwar.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-rice-shaalan', 'almanar_main', 'أرز بسمتي الشعلان عنبر 5 كغ', 'الأرز والمواد الجافة', 48, 56, 'كيس', 35, 4.9, '628100205', 'images/products/rice_shoulan_5kg.png', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-oil-jouf', 'almanar_main', 'زيت زيتون الجوف بكر ممتاز 500 مل', 'الزيوت المأكولة', 24.5, NULL, 'قارورة', 50, 4.7, '628100206', 'images/products/olive_aljouf_500.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-cheese-kiri', 'almanar_main', 'أجبان وقشطة كيري الأصلية 24 قطعة', 'الألبان والعصائر', 28, 34, 'علبة', 45, 5, '628100207', 'images/products/cheese_kiri_24.webp', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-diapers-pamp', 'almanar_main', 'حفائض ومناديل مبللة بامبرز مقاس 4 (52 حبة)', 'الحفائض والورقيات', 64, 75, 'كيس', 30, 4.9, '628100208', 'images/products/pampers_size4.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-clean-tide', 'almanar_main', 'مسحوق غسيل تايد مركز 5 كغ', 'المنظفات وخادمات المنزل', 49, 62, 'كيس', 40, 4.8, '628100209', 'images/products/tide_5kg.png', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-plastic-boxes', 'almanar_main', 'طقم علب تنظيم بلاستيك حفظ الطعام 6 قطع', 'المنظفات وخادمات المنزل', 22, NULL, 'طقم', 35, 4.7, '628100210', 'images/products/plastics.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pasta', 'almanar_main', 'مكرونة قواقع أبو كاس 400 جرام', 'الأرز والمواد الجافة', 20, 22, 'كيس', 90, 4.7, '628100211', 'images/products/pasta_abukas_shells.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-bread', 'almanar_main', 'خبز توست هارفست الكامل 400 جرام', 'الأرز والمواد الجافة', 10, 19, 'كيس', 60, 4.8, '628100212', 'images/products/toast_harvest_400.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sugar', 'almanar_main', 'سكر أبيض بلوري ناعم 2 كغ', 'السكر والمحليات', 8.5, 12, 'كيس', 100, 4.9, '628100213', 'images/products/sugar_white_2kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-fruits-mix', 'almanar_main', 'تشكيلة فواكه طازجة موسمية', 'الخضار والفواكه', 35, NULL, 'كيلو', 25, 4.6, '628100214', 'images/products/fruit_mix.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-veg-mix', 'almanar_main', 'خضراوات طازجة مشكلة', 'الخضار والفواكه', 18, NULL, 'كيلو', 30, 4.5, '628100215', 'images/products/veg_mix.png', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pickles', 'almanar_main', 'مخللات فارم فيرست مشكلة 950 جرام', 'المعلبات', 12, 15, 'قارورة', 45, 4.7, '628100216', 'images/products/pickles_farmfirst.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-choc', 'almanar_main', 'شوكولاتة كيتكات مستوردة 4 فنجر 45 جرام', 'الحلويات والشوكولاتة', 6.5, 9, 'حبة', 200, 5, '628100217', 'images/products/kitkat_4.jpeg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-aljouf_organic_oliveoil_4l', 'almanar_main', 'زيت زيتون الجوف عضوي بكر ممتاز 4 لتر', 'الزيوت المأكولة', 89, 119, 'جالون 4 لتر', 30, 4.9, '63065782685', 'images/products/aljouf_organic_oliveoil_4l.png', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-aljouf_organic_oliveoil_250', 'almanar_main', 'زيت زيتون الجوف عضوي بكر ممتاز 250 مل', 'الزيوت المأكولة', 17.5, 22, 'زجاجة 250 مل', 60, 4.8, '63027167178', 'images/products/aljouf_organic_oliveoil_250.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-nems_sunflower_1.8', 'almanar_main', 'زيت النيمس دوار الشمس النقي 1.8 لتر', 'الزيوت المأكولة', 21, 27, 'عبوة 1.8 لتر', 45, 4.7, '63081125176', 'images/products/nems_sunflower_1.8.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alaila_rice_5kg', 'almanar_main', 'أرز بسمتي العائلة هندي فاخر 5 كغ', 'الأرز والمواد الجافة', 57, 69, 'كيس 5 كغ', 40, 4.9, '63044129311', 'images/products/alaila_rice_5kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alaila_rice_10kg', 'almanar_main', 'أرز بسمتي العائلة هندي فاخر 10 كغ', 'الأرز والمواد الجافة', 109, 132, 'كيس 10 كغ', 25, 4.9, '63059889377', 'images/products/alaila_rice_10kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-alosra_sugar_10kg', 'almanar_main', 'سكر ناعم الأوسرة 10 كغ', 'السكر والمحليات', 38.5, 45, 'كيس 10 كغ', 50, 4.8, '63076976407', 'images/products/alosra_sugar_10kg.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pasta_abukas_shells', 'almanar_main', 'مكرونة قواقع أبو كاس 400 جم', 'الأرز والمواد الجافة', 15, 22, 'كيس', 80, 4.5, '63071505401', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-pasta_abukas_spaghetti', 'almanar_main', 'مكرونة سباغيتي أبو كاس 500 جرام', 'الأرز والمواد الجافة', 14, 19, 'كيس', 75, 4.5, '63034309221', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-vermicelli', 'almanar_main', 'شعيرية أبو كاس 400 جرام', 'الأرز والمواد الجافة', 5.5, 8, 'كيس', 90, 4.4, '63027356524', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-lentils_1kg', 'almanar_main', 'عدس مطحون / مجروش 1 كغ', 'الأرز والمواد الجافة', 9, 12, '1 كغ', 60, 4.4, '63001493943', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-beans_1kg', 'almanar_main', 'فاصوليا بيضاء 1 كغ', 'الأرز والمواد الجافة', 8.5, 11, '1 كغ', 55, 4.3, '63050075539', 'images/products/rice.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-olive_jufolea_4l', 'almanar_main', 'زيت زيتون الجوفية 4 لتر', 'الزيوت المأكولة', 76, 95, 'جالون 4 لتر', 20, 4.8, '63059571374', 'images/products/olive_oil.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sunflower_baraka_1.8', 'almanar_main', 'زيت بركة دوار الشمس 1.8 لتر', 'الزيوت المأكولة', 19.5, 25, 'عبوة 1.8 لتر', 60, 4.6, '63054858917', 'images/products/olive_oil.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-corn_oil_1.8', 'almanar_main', 'زيت ذرة العربي 1.8 لتر', 'الزيوت المأكولة', 23, 29, 'عبوة 1.8 لتر', 50, 4.6, '63006606269', 'images/products/olive_oil.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-honey_1kg', 'almanar_main', 'عسل سدر طبيعي 1 كغ', 'الزيوت المأكولة', 120, 155, 'علبة 1 كغ', 12, 4.9, '63011224621', 'images/products/olive_oil.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sugar_cube_500', 'almanar_main', 'سكر محبب (مكعبات) 500 جم', 'السكر والمحليات', 5, 7, 'علبة', 70, 4.5, '63001507569', 'images/products/sugar.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-coffee_arabica_pound', 'almanar_main', 'قهوة عربية مطحونة بالهيل 500 جم', 'القهوة والشاي', 28, 35, 'علبة', 30, 4.8, '63009053135', 'images/products/coffee.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-milk_foremost_1l', 'almanar_main', 'حليب طويل الأجل كامل الدسم 1 لتر', 'الألبان والعصائر', 6.5, 8.5, '1 لتر', 65, 4.6, '63071747977', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-juice_orange_1.5', 'almanar_main', 'عصير برتقال طبيعي 1.5 لتر', 'الألبان والعصائر', 8, 11, 'حجم 1.5 لتر', 45, 4.4, '63055286361', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-water_10pk', 'almanar_main', 'مياه معدنية 10 × 250 مل', 'الألبان والعصائر', 8.5, 11, 'كرتون', 70, 4.5, '63019125759', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-juice_tetley_ice', 'almanar_main', 'مشروبات شاي بارد 3 × 340 مل', 'الألبان والعصائر', 12, 15, 'حزمة', 25, 4.3, '63085084227', 'images/products/cheese.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-juice_coconut', 'almanar_main', 'ماء جوز هند عطري 1 لتر', 'الألبان والعصائر', 10, 13, 'عبوة', 30, 4.4, '63013118288', 'images/products/cheese.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tuna_yazid_4', 'almanar_main', 'تونة المدمسة 4 × 185 جم', 'المعلبات', 17, 21, 'حزمة', 40, 4.6, '63077104713', 'images/categories/canned.jpg', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-corn_can', 'almanar_main', 'ذرة تجارية معلبة 340 جرام', 'المعلبات', 4.5, 6, 'علبة', 60, 4.5, '63092204713', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-fava_beans_can', 'almanar_main', 'فول مدمس معلب 400 جرام', 'المعلبات', 4, 5.5, 'علبة', 75, 4.5, '63006618299', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tomato_paste_bottle', 'almanar_main', 'صلصة طماطم مركزة 660 جرام', 'المعلبات', 9, 12, 'قنينة', 55, 4.5, '63099072348', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-soup_chicken', 'almanar_main', 'حساء دجاج كريمي 500 جرام', 'المعلبات', 6.5, 9, 'علبة', 45, 4.3, '63096333515', 'images/categories/canned.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-apples_red', 'almanar_main', 'تفاح أحمر أمريكي 1 كغ', 'الخضار والفواكه', 9.5, 13, '1 كغ', 45, 4.6, '63026921144', 'images/products/apples_red.png', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-oranges', 'almanar_main', 'برتقالي مصرحي 2 كغ', 'الخضار والفواكه', 11, 15, '2 كغ', 40, 4.6, '63043928667', 'images/products/oranges.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-potatoes', 'almanar_main', 'بطاطس طازجة 5 كغ', 'الخضار والفواكه', 16, 20, '5 كغ', 25, 4.5, '63047572246', 'images/products/potatoes.png', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-tomatoes', 'almanar_main', 'طماطم بلدي طازجة 1 كغ', 'الخضار والفواكه', 4.5, 6.5, '1 كغ', 60, 4.5, '63087563870', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-onions', 'almanar_main', 'بصل حلو طازج 3 كغ', 'الخضار والفواكه', 12, 16, '3 كغ', 30, 4.5, '63017340763', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-dates_sukhari', 'almanar_main', 'تمر سكري من الانتقاء الفاخر 1 كغ', 'الخضار والفواكه', 29, 38, '1 كغ', 22, 4.9, '63034438759', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-arabic_bread', 'almanar_main', 'خبز عربي حجازي 10 قطع', 'المخبوزات', 3, 4.5, 'كيس', 95, 4.6, '63008584158', 'images/products/bread.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-croissant_nader', 'almanar_main', 'كرواسون طازج 30 جم', 'المخبوزات', 1.5, 2.5, 'قطعة', 120, 4.4, '63097833438', 'images/products/bread.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-cake_nuttela', 'almanar_main', 'كيك بالشوكولاتة 300 جرام', 'المخبوزات', 8, 11, 'علبة', 40, 4.4, '63083552135', 'images/products/bread.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-oreo_biscuits', 'almanar_main', 'بسكويت أوريو كلاسيك', 'الحلويات والشوكولاتة', 4, 6, 'علبة', 110, 4.7, '63003269566', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-bullfac_5_nuts', 'almanar_main', 'مكسرات مشكلة محمصة 30 جم', 'الحلويات والشوكولاتة', 2.5, 3.5, 'قطعة', 90, 4.5, '63050841025', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-biscuits_tea_lux', 'almanar_main', 'بسكويت الشاي 2 علبة', 'الحلويات والشوكولاتة', 7.5, 10, 'علبة', 80, 4.5, '63033699438', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-halawa_tahini', 'almanar_main', 'حلا طحينية بالفستا الحلبي 250 جم', 'الحلويات والشوكولاتة', 12, 16, 'علبة', 33, 4.6, '63001545284', 'images/products/sweets_choc.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-salt_iodized_1kg', 'almanar_main', 'ملح يودي ناعم 1 كغ', 'البهارات والتوابل', 2, 3, 'كيس', 160, 4.6, '63079688436', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-black_pepper_200', 'almanar_main', 'فلفل أسود مطحون 200 جم', 'البهارات والتوابل', 9, 12, 'عبوة', 65, 4.6, '63063757292', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-turmeric_200', 'almanar_main', 'كركم مطحون 200 جم', 'البهارات والتوابل', 6.5, 9, 'عبوة', 70, 4.6, '63089863663', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-mixed_spices', 'almanar_main', 'بهارات مشكلة الحجاز 250 جم', 'البهارات والتوابل', 8, 11, 'عبوة', 60, 4.7, '63063808856', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-sauce_pakistani', 'almanar_main', 'صوص شطة حارة 200 مل', 'البهارات والتوابل', 5.5, 7.5, 'قنينة', 75, 4.5, '63025678300', 'images/products/fruits.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-klorox_1l', 'almanar_main', 'مبيض ومعطر كلوروكس 1 لتر', 'المنظفات وخادمات المنزل', 7.5, 10, 'قنينة', 55, 4.6, '63071276799', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-dishwash_lime', 'almanar_main', 'سائل جلي بالليمون 750 مل', 'المنظفات وخادمات المنزل', 5.5, 8, 'قنينة', 70, 4.5, '63010129987', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-air_freshener', 'almanar_main', 'معطر جو فاخر 300 مل', 'المنظفات وخادمات المنزل', 9, 13, 'علبة', 50, 4.5, '63076759104', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-trash_bags', 'almanar_main', 'أكياس القمامة 20 كيس', 'المنظفات وخادمات المنزل', 6, 8, 'رول', 85, 4.4, '63045420046', 'images/products/detergent.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-facial_tissues', 'almanar_main', 'مناديل ورقية فاين 10 علبة', 'الحفائض والورقيات', 22, 28, 'كرتون', 35, 4.6, '63088610830', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-kitchen_towel', 'almanar_main', 'مناديل مطبخ برانة 6 لفات', 'الحفائض والورقيات', 17.5, 23, 'حزمة', 40, 4.5, '63023378475', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-aluminium_foil', 'almanar_main', 'ورق ألمنيوم 30 متر', 'الحفائض والورقيات', 8, 11, 'لفة', 60, 4.4, '63082374083', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-toilet_tissue', 'almanar_main', 'ورق تواليت 12 لفة', 'الحفائض والورقيات', 24, 32, 'حزمة', 45, 4.6, '63001170479', 'images/products/diapers.jpg', TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES ('prod-1793565718779', 'tenant_1793551506293', 'أرز بسمتي فاخر', 'منتجات عامة', 45, NULL, 'كيس 5 كجم', 20, 5, '65718779', '📦', FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    price = EXCLUDED.price,
    old_price = EXCLUDED.old_price,
    unit = EXCLUDED.unit,
    stock = EXCLUDED.stock,
    rating = EXCLUDED.rating,
    barcode = EXCLUDED.barcode,
    image = EXCLUDED.image,
    is_offer = EXCLUDED.is_offer,
    updated_at = NOW();
