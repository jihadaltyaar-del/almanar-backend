import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const allCategories = [];

// 1. Root / almanar_main
if (Array.isArray(db.categories)) {
  db.categories.forEach(c => {
    allCategories.push({ ...c, tenant_id: 'almanar_main' });
  });
}

// 2. Tenants
if (db.tenantData) {
  for (const [tid, t] of Object.entries(db.tenantData)) {
    if (tid !== 'almanar_main' && Array.isArray(t.categories)) {
      t.categories.forEach(c => {
        allCategories.push({ ...c, tenant_id: tid });
      });
    }
  }
}

console.log('Total categories across all tenants:', allCategories.length);

let sql = `-- ========================================================
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
`;

allCategories.forEach(c => {
  const esc = (s) => (s ? "'" + String(s).replace(/'/g, "''") + "'" : "NULL");
  const num = (n) => (n !== null && n !== undefined && !isNaN(n) ? Number(n) : "0");

  sql += `INSERT INTO categories (id, tenant_id, name, icon, image, count)
VALUES (${esc(c.id)}, ${esc(c.tenant_id)}, ${esc(c.name)}, ${esc(c.icon)}, ${esc(c.image)}, ${num(c.count)})
ON CONFLICT (id, tenant_id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    image = EXCLUDED.image,
    count = EXCLUDED.count,
    updated_at = NOW();\n`;
});

const outputPath = path.join(__dirname, 'supabase_categories_migration.sql');
fs.writeFileSync(outputPath, sql, 'utf8');
console.log('✅ Generated supabase_categories_migration.sql successfully!');
