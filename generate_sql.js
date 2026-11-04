import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const allProducts = [];

// 1. Root / almanar_main products
if (Array.isArray(db.products)) {
  db.products.forEach(p => {
    allProducts.push({ ...p, tenant_id: 'almanar_main' });
  });
}

// 2. Tenant products
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.products)) {
      t.products.forEach(p => {
        allProducts.push({ ...p, tenant_id: tid });
      });
    }
  }
}

console.log('Total products found:', allProducts.length);

let sql = `-- ========================================================
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
`;

allProducts.forEach(p => {
  const esc = (s) => (s ? "'" + String(s).replace(/'/g, "''") + "'" : "NULL");
  const num = (n) => (n !== null && n !== undefined && !isNaN(n) ? Number(n) : "NULL");
  const bool = (b) => (b ? "TRUE" : "FALSE");

  sql += `INSERT INTO products (id, tenant_id, name, category, price, old_price, unit, stock, rating, barcode, image, is_offer)
VALUES (${esc(p.id)}, ${esc(p.tenant_id)}, ${esc(p.name)}, ${esc(p.category)}, ${num(p.price)}, ${num(p.oldPrice)}, ${esc(p.unit)}, ${num(p.stock) || 0}, ${num(p.rating) || 5.0}, ${esc(p.barcode)}, ${esc(p.image)}, ${bool(p.isOffer)})
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
    updated_at = NOW();\n`;
});

const outputPath = path.join(__dirname, 'supabase_products_migration.sql');
fs.writeFileSync(outputPath, sql, 'utf8');
console.log(`Successfully generated: ${outputPath}`);
