import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import supabase helpers
const { upsertProduct, upsertCategory, supabase } = await import('./lib/supabase.js');

const DB_FILE = path.join(__dirname, 'database.json');
const productsRaw = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'parsed_products.json'), 'utf8'));

console.log(`Loaded ${productsRaw.length} products from Excel.`);

const catMap = {
  'أطعمة عضوية': { id: 'cat-organic', icon: '🥗' },
  'الحليب و اللبنة': { id: 'cat-milk-labneh', icon: '🥛' },
  'بسكويت وكوكيز': { id: 'cat-biscuits', icon: '🍪' },
  'توابل': { id: 'cat-spices-sa', icon: '🧂' },
  'جاهز للطبخ': { id: 'cat-ready-cook', icon: '🍳' },
  'جبن وزبدة': { id: 'cat-cheese-butter', icon: '🧀' },
  'خضروات وبقوليات': { id: 'cat-veg-legumes', icon: '🥕' },
  'رقائق البطاطس والمكسرات': { id: 'cat-chips-nuts', icon: '🥔' },
  'شوكولاتة': { id: 'cat-chocolate-sa', icon: '🍫' },
  'عصير': { id: 'cat-juice-sa', icon: '🧃' },
};

// Count items per category and find first image
const catCounts = {};
const catFirstImg = {};
productsRaw.forEach(p => {
  const cat = p.Category1_ar;
  catCounts[cat] = (catCounts[cat] || 0) + 1;
  if (!catFirstImg[cat] && p.ImageLink1) {
    catFirstImg[cat] = p.ImageLink1;
  }
});

const newCategories = Object.keys(catMap).map(name => ({
  id: catMap[name].id,
  tenant_id: 'almanar_main',
  name: name,
  icon: catMap[name].icon,
  image: catFirstImg[name] || '',
  count: catCounts[name] || 20,
}));

// Format products
const newProducts = productsRaw.map((p, index) => {
  const barcode = p.Barcodes ? String(p.Barcodes).trim() : '';
  const price = parseFloat(p['Price (SAR)']) || 0;
  return {
    id: `prod-sa-${index + 1}`,
    tenant_id: 'almanar_main',
    name: p.Name_ar.trim(),
    category: p.Category1_ar.trim(),
    price: price,
    oldPrice: null,
    unit: (p.Size_ar || 'حبة').trim(),
    stock: 50,
    rating: 4.8 + (index % 3) * 0.1,
    barcode: barcode,
    image: p.ImageLink1.trim(),
    isOffer: false
  };
});

console.log(`Formatted ${newProducts.length} products and ${newCategories.length} categories.`);

// 1. Update database.json
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Verify protected driver exists
const jihadDriver = (db.drivers || []).find(d => d.id === 'drv-1793718137683-629') ||
  (db.tenantData && db.tenantData.almanar_main && (db.tenantData.almanar_main.drivers || []).find(d => d.id === 'drv-1793718137683-629'));
console.log('Protected Driver check:', jihadDriver ? `Found: ${jihadDriver.name} (${jihadDriver.id})` : 'WARNING NOT FOUND');

// Update almanar_main categories
if (!db.tenantData) db.tenantData = {};
if (!db.tenantData.almanar_main) db.tenantData.almanar_main = {};

const existingTenantCats = db.tenantData.almanar_main.categories || [];
newCategories.forEach(newCat => {
  const idx = existingTenantCats.findIndex(c => c.name === newCat.name);
  if (idx !== -1) {
    existingTenantCats[idx] = { ...existingTenantCats[idx], ...newCat };
  } else {
    existingTenantCats.push(newCat);
  }
});
// Update 'cat-all' count
const allCat = existingTenantCats.find(c => c.id === 'cat-all');
if (allCat) {
  allCat.count = (db.tenantData.almanar_main.products?.length || 0) + newProducts.length;
}
db.tenantData.almanar_main.categories = existingTenantCats;

// Update global categories
const globalCats = db.categories || [];
newCategories.forEach(newCat => {
  const idx = globalCats.findIndex(c => c.name === newCat.name);
  if (idx !== -1) {
    globalCats[idx] = { ...globalCats[idx], ...newCat };
  } else {
    globalCats.push(newCat);
  }
});
db.categories = globalCats;

// Update almanar_main products
const existingTenantProds = db.tenantData.almanar_main.products || [];
const prodMap = new Map();
existingTenantProds.forEach(p => prodMap.set(p.name, p));
newProducts.forEach(p => prodMap.set(p.name, p)); // Add / update
db.tenantData.almanar_main.products = Array.from(prodMap.values());

// Update global products
const globalProdMap = new Map();
(db.products || []).forEach(p => globalProdMap.set(p.name, p));
newProducts.forEach(p => globalProdMap.set(p.name, p));
db.products = Array.from(globalProdMap.values());

if (allCat) {
  allCat.count = db.tenantData.almanar_main.products.length;
}

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
console.log(`Updated database.json successfully. Total tenant products now: ${db.tenantData.almanar_main.products.length}`);

// 2. Upsert into Supabase
if (supabase) {
  console.log('Upserting categories into Supabase...');
  for (const cat of newCategories) {
    await upsertCategory(cat);
  }
  console.log('Categories upserted to Supabase ✅');

  console.log('Upserting products into Supabase in batches of 25...');
  for (let i = 0; i < newProducts.length; i += 25) {
    const batch = newProducts.slice(i, i + 25).map(p => ({
      id: p.id,
      tenant_id: 'almanar_main',
      name: p.name,
      category: p.category,
      price: p.price,
      oldPrice: p.oldPrice,
      unit: p.unit,
      stock: p.stock,
      rating: p.rating,
      barcode: p.barcode,
      image: p.image,
      isOffer: p.isOffer,
    }));
    await upsertProduct(batch);
    process.stdout.write(`.`);
  }
  console.log('\nAll products upserted to Supabase ✅');
}

console.log('Seeding completed successfully!');
