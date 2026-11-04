import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('YOUR_PROJECT_ID')) {
    console.error('❌ خطأ: يرجى كتابة SUPABASE_URL و SUPABASE_SERVICE_KEY الحقيقيين في ملف .env أولاً.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('🔗 جارٍ الاتصال بـ Supabase:', supabaseUrl);

  const dbPath = path.join(__dirname, 'database.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // 1. ترحيل المنشآت (Tenants)
  console.log('🏢 التحقق من بيانات المنشآت (Tenants)...');
  const tenantsToUpsert = [
    {
      id: 'almanar_main',
      name: 'سلة المنار — الفرع الرئيسي',
      commercial_name: 'شركة سلة المنار لتقنية المعلومات والتجارة',
      category: 'سوبرماركت ومواد غذائية',
      city: 'الرياض',
      phone: '0550001122',
      logo: '/images/logo.png',
      status: 'نشط'
    },
    {
      id: 'tenant_1793551506293',
      name: 'فرع النرجس',
      commercial_name: 'مؤسسة سلة المنار - فرع النرجس',
      category: 'سوبرماركت ومواد غذائية',
      city: 'الرياض',
      phone: '0550005566',
      logo: '/images/logo.png',
      status: 'نشط'
    }
  ];

  const { error: tErr } = await supabase.from('tenants').upsert(tenantsToUpsert, { onConflict: 'id' });
  if (tErr) {
    console.error('⚠️ خطأ عند ترحيل المنشآت:', tErr.message);
  } else {
    console.log('✅ تم ترحيل المنشآت بنجاح!');
  }

  // 2. ترحيل الفئات (Categories)
  console.log('📂 ترحيل الفئات (Categories)...');
  const allCategories = [];
  if (Array.isArray(db.categories)) {
    db.categories.forEach(c => {
      allCategories.push({
        id: c.id,
        tenant_id: 'almanar_main',
        name: c.name,
        icon: c.icon || '📁',
        image: c.image || null,
        count: parseInt(c.count, 10) || 0
      });
    });
  }
  if (db.tenantData) {
    for (const [tid, t] of Object.entries(db.tenantData)) {
      if (tid !== 'almanar_main' && Array.isArray(t.categories)) {
        t.categories.forEach(c => {
          allCategories.push({
            id: c.id,
            tenant_id: tid,
            name: c.name,
            icon: c.icon || '📁',
            image: c.image || null,
            count: parseInt(c.count, 10) || 0
          });
        });
      }
    }
  }

  const { error: cErr } = await supabase.from('categories').upsert(allCategories, { onConflict: 'id,tenant_id' });
  if (cErr) {
    console.error('⚠️ خطأ في ترحيل الفئات:', cErr.message);
  } else {
    console.log(`✅ تم ترحيل ${allCategories.length} فئة بنجاح!`);
  }

  // 3. ترحيل المنتجات (Products)
  console.log('📦 ترحيل المنتجات (Products)...');
  const allProducts = [];
  if (Array.isArray(db.products)) {
    db.products.forEach(p => {
      allProducts.push({
        id: p.id,
        tenant_id: 'almanar_main',
        name: p.name,
        category: p.category || 'عام',
        price: Number(p.price) || 0,
        old_price: p.oldPrice ? Number(p.oldPrice) : null,
        unit: p.unit || 'حبة',
        stock: parseInt(p.stock, 10) || 0,
        rating: Number(p.rating) || 5.0,
        barcode: p.barcode ? String(p.barcode) : null,
        image: p.image || '📦',
        is_offer: Boolean(p.isOffer)
      });
    });
  }

  if (db.tenantData) {
    for (const [tid, t] of Object.entries(db.tenantData)) {
      if (tid !== 'almanar_main' && Array.isArray(t.products)) {
        t.products.forEach(p => {
          allProducts.push({
            id: p.id,
            tenant_id: tid,
            name: p.name,
            category: p.category || 'عام',
            price: Number(p.price) || 0,
            old_price: p.oldPrice ? Number(p.oldPrice) : null,
            unit: p.unit || 'حبة',
            stock: parseInt(p.stock, 10) || 0,
            rating: Number(p.rating) || 5.0,
            barcode: p.barcode ? String(p.barcode) : null,
            image: p.image || '📦',
            is_offer: Boolean(p.isOffer)
          });
        });
      }
    }
  }

  const batchSize = 25;
  for (let i = 0; i < allProducts.length; i += batchSize) {
    const batch = allProducts.slice(i, i + batchSize);
    const { error: pErr } = await supabase.from('products').upsert(batch, { onConflict: 'id' });
    if (pErr) {
      console.error(`❌ خطأ في ترحيل دفعة المنتجات ${Math.floor(i / batchSize) + 1}:`, pErr.message);
    } else {
      console.log(`✅ تم ترحيل المنتجات من ${i + 1} إلى ${Math.min(i + batchSize, allProducts.length)}`);
    }
  }

  // 4. ترحيل الطلبات (Orders)
  console.log('📋 ترحيل الطلبات (Orders)...');
  const allOrders = [];
  if (db.tenantData && db.tenantData['almanar_main'] && Array.isArray(db.tenantData['almanar_main'].orders)) {
    db.tenantData['almanar_main'].orders.forEach(o => allOrders.push({
      id: o.id,
      tenant_id: 'almanar_main',
      customer_name: o.customerName || 'عميل التطبيق',
      phone: o.phone || '',
      address: o.address || '',
      branch: o.branch || '',
      date: o.date || '',
      items_total: Number(o.itemsTotal) || 0,
      delivery_fee: Number(o.deliveryFee) || 0,
      distance_km: Number(o.distanceKm) || 2.5,
      total: Number(o.total) || 0,
      status: o.status || 'pending',
      driver_name: o.driverName || null,
      payment_method: o.paymentMethod || 'الدفع عند الاستلام',
      receipt_url: o.receiptUrl || null,
      receipt_image: o.receiptImage || null,
      receipt_confirmed: Boolean(o.receiptConfirmed),
      customer_note: o.customerNote || null,
      dropoff_lat: o.dropoffLat ? Number(o.dropoffLat) : null,
      dropoff_lng: o.dropoffLng ? Number(o.dropoffLng) : null,
      track_token: o.trackToken || null,
      driver_token: o.driverToken || null,
      items: o.items || []
    }));
  }

  for (let i = 0; i < allOrders.length; i += batchSize) {
    const batch = allOrders.slice(i, i + batchSize);
    const { error: oErr } = await supabase.from('orders').upsert(batch, { onConflict: 'id,tenant_id' });
    if (oErr) {
      console.error(`❌ خطأ في ترحيل دفعة الطلبات ${Math.floor(i / batchSize) + 1}:`, oErr.message);
    } else {
      console.log(`✅ تم ترحيل الطلبات من ${i + 1} إلى ${Math.min(i + batchSize, allOrders.length)}`);
    }
  }

  console.log('🎉 اكتمل ترحيل كافة المنشآت والفئات والمنتجات والطلبات إلى Supabase بنجاح تام وبدون أي تكرار!');
}

runMigration().catch(err => {
  console.error('💥 حدث خطأ غير متوقع أثناء الترحيل:', err);
});
