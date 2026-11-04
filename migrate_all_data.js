import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const dbPath = path.join(__dirname, 'database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

async function migrate() {
  console.log('🚀 بدء ترحيل كافة البيانات إلى Supabase...');

  // 1. Tenants
  console.log('\n🏢 1. ترحيل المنشآت (Tenants)...');
  const tenants = [
    { id: 'almanar_main', name: 'سلة المنار — الفرع الرئيسي', status: 'نشط' }
  ];
  if (db.tenantData) {
    for (const [id, t] of Object.entries(db.tenantData)) {
      if (id !== 'almanar_main') {
        tenants.push({ id, name: t.name || id, status: 'نشط' });
      }
    }
  }
  const { error: tErr } = await supabase.from('tenants').upsert(tenants, { onConflict: 'id' });
  if (tErr) console.error('خطأ المنشآت:', tErr.message);
  else console.log(`✅ تم ترحيل ${tenants.length} منشأة بنجاح.`);

  // 2. Categories
  console.log('\n📂 2. ترحيل الفئات (Categories)...');
  const categories = [];
  const catAllowed = ['id', 'tenant_id', 'name', 'icon', 'image', 'count'];
  
  const collectCats = (list, tid) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      const row = { tenant_id: tid };
      for (const k of catAllowed) {
        if (c[k] !== undefined) row[k] = c[k];
      }
      categories.push(row);
    }
  };

  collectCats(db.categories, 'almanar_main');
  if (db.tenantData) {
    for (const [tid, t] of Object.entries(db.tenantData)) {
      collectCats(t.categories, tid);
    }
  }

  // De-duplicate by id + tenant_id
  const catMap = new Map();
  categories.forEach(c => catMap.set(`${c.id}_${c.tenant_id}`, c));
  const uniqueCats = Array.from(catMap.values());

  const { error: cErr } = await supabase.from('categories').upsert(uniqueCats, { onConflict: 'id,tenant_id' });
  if (cErr) console.error('خطأ الفئات:', cErr.message);
  else console.log(`✅ تم ترحيل ${uniqueCats.length} فئة بنجاح.`);

  // 3. Products
  console.log('\n📦 3. ترحيل المنتجات (Products)...');
  const prodAllowed = ['id', 'tenant_id', 'name', 'category', 'price', 'oldPrice', 'unit', 'stock', 'rating', 'barcode', 'image', 'isOffer'];
  const products = [];

  const collectProds = (list, tid) => {
    if (!Array.isArray(list)) return;
    for (const p of list) {
      const row = { tenant_id: tid };
      for (const k of prodAllowed) {
        if (p[k] !== undefined) row[k] = p[k];
      }
      // sanitize numeric
      row.price = parseFloat(row.price) || 0;
      if (row.oldPrice !== undefined && row.oldPrice !== null) row.oldPrice = parseFloat(row.oldPrice) || null;
      row.stock = parseInt(row.stock, 10) || 0;
      row.rating = parseFloat(row.rating) || 5.0;
      row.isOffer = Boolean(row.isOffer);
      products.push(row);
    }
  };

  collectProds(db.products, 'almanar_main');
  if (db.tenantData) {
    for (const [tid, t] of Object.entries(db.tenantData)) {
      collectProds(t.products, tid);
    }
  }

  const prodMap = new Map();
  products.forEach(p => prodMap.set(p.id, p));
  const uniqueProds = Array.from(prodMap.values());

  // Upsert in batches of 30
  for (let i = 0; i < uniqueProds.length; i += 30) {
    const batch = uniqueProds.slice(i, i + 30);
    const { error: pErr } = await supabase.from('products').upsert(batch, { onConflict: 'id' });
    if (pErr) console.error(`خطأ دفعة منتجات ${i}:`, pErr.message);
  }
  console.log(`✅ تم ترحيل ${uniqueProds.length} منتج بنجاح.`);

  // 4. Orders
  console.log('\n📋 4. ترحيل الطلبات (Orders)...');
  const orderAllowed = [
    'id', 'tenant_id', 'customerName', 'phone', 'address', 'branch', 'city', 'date',
    'itemsTotal', 'deliveryFee', 'distanceKm', 'total', 'status', 'driverName',
    'paymentMethod', 'receiptUrl', 'receiptImage', 'receiptConfirmed', 'customerNote',
    'notes', 'dropoffLat', 'dropoffLng', 'trackToken', 'driverToken', 'driverGeo',
    'statusHistory', 'claimedByDriverId', 'claimedByName', 'acceptedAt', 'preparingAt',
    'readyAt', 'onTheWayAt', 'deliveredAt', 'completedAt', 'items'
  ];
  const orders = [];

  const collectOrders = (list, tid) => {
    if (!Array.isArray(list)) return;
    for (const o of list) {
      const row = { tenant_id: tid };
      for (const k of orderAllowed) {
        if (o[k] !== undefined) row[k] = o[k];
      }
      row.total = parseFloat(row.total) || 0;
      row.itemsTotal = parseFloat(row.itemsTotal) || 0;
      row.deliveryFee = parseFloat(row.deliveryFee) || 0;
      row.distanceKm = parseFloat(row.distanceKm) || 2.5;
      row.receiptConfirmed = Boolean(row.receiptConfirmed);
      if (!Array.isArray(row.items)) row.items = [];
      orders.push(row);
    }
  };

  collectOrders(db.orders, 'almanar_main');
  if (db.tenantData) {
    for (const [tid, t] of Object.entries(db.tenantData)) {
      collectOrders(t.orders, tid);
    }
  }

  const orderMap = new Map();
  orders.forEach(o => orderMap.set(`${o.id}_${o.tenant_id}`, o));
  const uniqueOrders = Array.from(orderMap.values());

  for (let i = 0; i < uniqueOrders.length; i += 25) {
    const batch = uniqueOrders.slice(i, i + 25);
    const { error: oErr } = await supabase.from('orders').upsert(batch, { onConflict: 'id,tenant_id' });
    if (oErr) console.error(`خطأ دفعة طلبات ${i}:`, oErr.message);
  }
  console.log(`✅ تم ترحيل ${uniqueOrders.length} طلب بنجاح.`);

  // 5. Customers
  console.log('\n👥 5. ترحيل العملاء (Customers)...');
  const custAllowed = ['id', 'tenant_id', 'name', 'phone', 'address', 'city', 'ordersCount', 'totalSpent'];
  const customers = [];

  const collectCusts = (list, tid) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      const row = { tenant_id: tid };
      for (const k of custAllowed) {
        if (c[k] !== undefined) row[k] = c[k];
      }
      row.ordersCount = parseInt(row.ordersCount, 10) || 0;
      row.totalSpent = parseFloat(row.totalSpent) || 0;
      customers.push(row);
    }
  };

  collectCusts(db.customers, 'almanar_main');
  if (db.tenantData) {
    for (const [tid, t] of Object.entries(db.tenantData)) {
      collectCusts(t.customers, tid);
    }
  }

  const custMap = new Map();
  customers.forEach(c => custMap.set(`${c.id}_${c.tenant_id}`, c));
  const uniqueCusts = Array.from(custMap.values());

  if (uniqueCusts.length > 0) {
    const { error: cuErr } = await supabase.from('customers').upsert(uniqueCusts, { onConflict: 'id,tenant_id' });
    if (cuErr) console.error('خطأ العملاء:', cuErr.message);
    else console.log(`✅ تم ترحيل ${uniqueCusts.length} عميل بنجاح.`);
  }

  // 6. Drivers
  console.log('\n🚗 6. ترحيل المناديب (Drivers)...');
  const drvAllowed = ['id', 'tenant_id', 'name', 'phone', 'vehicle', 'car', 'zone', 'city', 'pin', 'activeOrders', 'status', 'rating'];
  const drivers = [];

  const rawDrivers = db.drivers || (db.tenantData && db.tenantData.almanar_main && db.tenantData.almanar_main.drivers) || [];
  if (Array.isArray(rawDrivers)) {
    for (const d of rawDrivers) {
      const row = { tenant_id: 'almanar_main' };
      for (const k of drvAllowed) {
        if (d[k] !== undefined) row[k] = d[k];
      }
      row.activeOrders = parseInt(row.activeOrders, 10) || 0;
      row.rating = parseFloat(row.rating) || 5.0;
      drivers.push(row);
    }
  }

  const drvMap = new Map();
  drivers.forEach(d => drvMap.set(`${d.id}_${d.tenant_id}`, d));
  const uniqueDrvs = Array.from(drvMap.values());

  if (uniqueDrvs.length > 0) {
    const { error: dErr } = await supabase.from('drivers').upsert(uniqueDrvs, { onConflict: 'id,tenant_id' });
    if (dErr) console.error('خطأ المناديب:', dErr.message);
    else console.log(`✅ تم ترحيل ${uniqueDrvs.length} مندوب بنجاح.`);
  }

  console.log('\n🎉 اكتمل الترحيل الشامل إلى Supabase بنجاح تام!');
}

migrate();
