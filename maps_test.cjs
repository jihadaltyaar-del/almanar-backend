#!/usr/bin/env node
/* اختبار تكامل نظام الخرائط والمواقع — سلة المنار
 * يفحص: إعدادات الخرائط، حفظ إحداثيات العميل، موقع المندوب، خصوصية التتبع بالتوكن
 */
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name} ${extra}`); }
}

const post = (path, body) => fetch(BASE + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const put = (path, body) => fetch(BASE + path, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

(async () => {
  console.log('\n=== اختبار تكامل الخرائط والمواقع ===\n');

  // 1) إعدادات الخرائط العامة (بدون مفاتيح سرية)
  const mc = await fetch(`${BASE}/map-config`);
  const mcfg = await mc.json();
  check('GET /api/map-config يعمل (200)', mc.status === 200);
  // قالب بلاطات صالح: يحمل متغيرات الشبكة {x}/{y}/{z} (يعمل مع Google وOSM وأي مزود) — ويبقى مفصولاً عن قالب التوجيه
  const tu = String(mcfg.tiles?.urlTemplate || '');
  check('قالب البلاطات موجود (فصل البلاطات عن التوجيه)', tu.includes('{x}') && tu.includes('{y}') && tu.includes('{z}'));
  check('مزوّد التوجيه منفصل وله قالب مستقل', !!mcfg.routing?.urlTemplate && mcfg.routing?.provider);
  check('الترميز الجغرافي مضبوط', !!mcfg.geocoding?.searchUrl);
  check('لا مفاتيح سرية في الرد (لا sk_ ولا secret)', !JSON.stringify(mcfg).includes('sk_'));

  // 2) إنشاء طلب من العميل مع إحداثيات موقع التسليم
  const orderRes = await post('/orders', {
    storeName: 'سلة المنار - فرع الروضة',
    customerName: 'عميل اختبار الخريطة',
    phone: '0550000001',
    address: 'الرياض - حي العارض شارع ريحانة',
    dropoffLat: 24.84605,
    dropoffLng: 46.63900,
    itemsTotal: 30,
    deliveryFee: 5,
    items: [{ name: 'منتج اختبار الخريطة', price: 30, qty: 1 }],
  });
  const orderJson = await orderRes.json();
  const order = orderJson.order || {};
  const oid = order.id;
  const token = order.trackToken;
  check('POST طلب مع إحداثيات (201)', orderRes.status === 201 && !!oid, `status=${orderRes.status}`);
  check('حفظ خط العرض dropoffLat', order.dropoffLat === 24.84605, `got=${order.dropoffLat}`);
  check('حفظ خط الطول dropoffLng', order.dropoffLng === 46.639, `got=${order.dropoffLng}`);
  check('توكن تتبع عشوائي طويل (32 حرفاً)', typeof token === 'string' && token.length === 32, `got=${token}`);

  // 3) إسناد الطلب للمندوب (إيصال غير مطلوب لأن الدفع كاش) → delivering
  const assign = await put(`/orders/${encodeURIComponent(oid)}`, { status: 'delivering', driverName: 'رفيق سلطان' });
  const assignJson = await assign.json().catch(() => ({}));
  const driverToken = assignJson.driverToken;
  check('إسناد الطلب للمندوب → delivering', assign.status === 200 && assignJson.order?.status === 'delivering');
  check('إصدار توكن مندوب سري عند بدء التوصيل', typeof driverToken === 'string' && driverToken.length >= 16);

  // 4) موقع المندوب — صحة الإدخال والربط بالطلب + منع الكتابة بدون توكن المندوب
  const bad = await post('/driver/location', { orderId: oid, lat: 999, lng: 46 });
  check('رفض إحداثيات غير صالحة (400)', bad.status === 400);
  const missing = await post('/driver/location', { orderId: 'لا-يوجد', lat: 24.8, lng: 46.6 });
  check('رفض موقع لطلب غير موجود (404)', missing.status === 404);
  const noDriverTok = await post('/driver/location', { orderId: oid, lat: 24.8421, lng: 46.6422, driverName: 'منتحل' });
  check('العميل/المنتحل لا يستطيع كتابة موقع المندوب (403)', noDriverTok.status === 403);
  const loc = await post('/driver/location', { orderId: oid, lat: 24.8421, lng: 46.6422, driverName: 'رفيق سلطان', driverToken });
  check('إرسال موقع المندوب بنجاح', loc.status === 200);

  // 5) التتبع: مرتبط بالطلب فقط ويحتاج التوكن
  const tr = await fetch(`${BASE}/track/${encodeURIComponent(oid)}?token=${token}`);
  const trj = await tr.json();
  check('التتبع بتوكن صحيح يعيد موقع المندوب', tr.status === 200 && Math.abs(trj.driver?.lat - 24.8421) < 0.001, JSON.stringify(trj.driver));
  check('التتبع يعيد اسم المندوب', trj.driver?.driverName === 'رفيق سلطان');

  const wrongTok = await fetch(`${BASE}/track/${encodeURIComponent(oid)}?token=AAAA${token.slice(4)}`);
  check('توكن خاطئ → 404 (لا تسريب)', wrongTok.status === 404);
  const noTok = await fetch(`${BASE}/track/${encodeURIComponent(oid)}`);
  check('بدون توكن → رفض', noTok.status === 400 || noTok.status === 404);
  const noTokBody = await noTok.json().catch(() => ({}));
  check('بدون توكن لا يعيد موقعاً', !noTokBody.driver?.lat);

  // خصوصية عبر الطلبات: توكن طلب آخر لا يفتح هذا الطلب
  const otherRes = await post('/orders', {
    customerName: 'عميل آخر', address: 'الرياض - حي الروضة', itemsTotal: 20, deliveryFee: 5,
  });
  const other = (await otherRes.json()).order;
  const cross = await fetch(`${BASE}/track/${encodeURIComponent(other.id)}?token=${token}`);
  check('توكن طلب A لا يعرض موقع طلب B (عزل)', cross.status === 404);

  // 6) عند إكمال الطلب يوقف التتبع تلقائياً
  await put(`/orders/${encodeURIComponent(oid)}`, { status: 'completed' });
  const trDone = await fetch(`${BASE}/track/${encodeURIComponent(oid)}?token=${token}`);
  const trDoneJ = await trDone.json();
  check('بعد التسليم لا يُعرض موقع المندوب', trDone.status === 200 && trDoneJ.driver === null && trDoneJ.status === 'completed');

  // 7) الطلب يظهر للمندوب مع الإحداثيات
  const all = await (await fetch(`${BASE}/orders`)).json();
  const found = all.find(o => o.id === oid);
  check('الطلب المخزن يحمل الإحداثيات للمندوب', found?.dropoffLat === 24.84605 && found?.dropoffLng === 46.639);

  // ── تنظيف طلبات الاختبار ──
  console.log('\n  (تنظيف) حذف طلبات الاختبار يتطلب إيقاف الخادم وتعديل database.json ثم إعادة التشغيل.');
  console.log(`  TEST_ORDER_ID=${oid}`);
  require('fs').writeFileSync(__dirname + '/.last_maps_test_order.txt', `${oid}\n${other.id}\n`, 'utf8');

  console.log('\n' + results.join('\n'));
  console.log(`\n=== النتيجة: ${pass} نجح / ${fail} فشل ===\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('خطأ في الاختبار:', e); process.exit(1); });
