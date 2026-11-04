// اختبار دورة إدارة الطلبات للمندوبين: الحجز الذري + دورة الحالات + الملكية + منع التكرار
const fs = require('fs');
const API = 'http://localhost:3000/api';
const DB = 'E:/تطبيق المنار/apps/admin_portal/database.json';
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS:', label); } else { fail++; console.log('FAIL:', label, extra); } };
const j = async (r) => { try { return await r.json(); } catch (_) { return {}; } };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// saveDb يعمل بجدولة (setImmediate) — ننتظر حتى تُكتب الكتابة في الملف فعلياً
const orderInDb = async (id) => {
  await sleep(1200);
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  return db.tenantData.almanar_main.orders.find(o => String(o.id).replace('#', '') === String(id).replace('#', ''));
};

const post = async (path, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const put = async (path, body) => fetch(API + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const getOrdersFor = async (driverId) => (await (await fetch(`${API}/orders?forDriver=${encodeURIComponent(driverId)}`)).json());

(async () => {
  const tag = 'FLWTEST';

  // ── 0) تجهيز: ثلاثة مندوبين + طلب حقيقي في الدور ──
  const drivers = [];
  for (let i = 1; i <= 3; i++) {
    const res = await post('/driver/register', {
      name: `مندوب ${tag} ${i}`, phone: `05${tag.replace('FLWTEST', '').padEnd ? '0000' : '0000'}0${i}${Date.now() % 100000}`, pin: `${i}00${i}`,
    });
    const body = await j(res);
    if (body.driver) drivers.push(body.driver);
  }
  if (drivers.length < 3) {
    // جرّب الهواتف الفريدة إذا أصطدم التسجيل
    for (let i = 1; i <= 3 && drivers.length < 3; i++) {
      const res = await post('/driver/register', { name: `مندوب ${tag} ب${i}`, phone: `0559${Date.now()}${i}`.slice(0, 12), pin: `${i}${i}00` });
      const body = await j(res);
      if (body.driver) drivers.push(body.driver);
    }
  }
  ok(drivers.length >= 3, 'إنشاء/توفر ثلاثة مندوبين للاختبار', `got=${drivers.length}`);
  const [D1, D2, D3] = drivers;

  const createOrder = async (items, payMethod = 'الدفع عند الاستلام') => {
    const res = await post('/orders', {
      customerName: `عميل ${tag}`, phone: '0551112222', address: 'الرياض - حي الروضة شارع 43',
      itemsTotal: items.reduce((s, it) => s + it.price * it.qty, 0), deliveryFee: 5,
      paymentMethod: payMethod,
      dropoffLat: 24.7035, dropoffLng: 46.7545,
      items,
    });
    return (await j(res)).order;
  };
  const items = [{ name: 'منتج أ', price: 30, qty: 2 }, { name: 'منتج ب', price: 10, qty: 1 }];

  const O1 = await createOrder(items);
  const orderView = (list) => list.find(o => o.id === O1.id);

  // ── 1) الطلب يظهر لثلاثة مندوبين ──
  ok((await getOrdersFor(D1.id)).some(o => o.id === O1.id), 'الطلب الجديد يظهر لدى المندوب الأول');
  ok((await getOrdersFor(D2.id)).some(o => o.id === O1.id), 'الطلب الجديد يظهر لدى المندوب الثاني');
  ok((await getOrdersFor(D3.id)).some(o => o.id === O1.id), 'الطلب الجديد يظهر لدى المندوب الثالث');
  ok((await orderInDb(O1.id)).status === 'pending' && !(await orderInDb(O1.id)).claimedByDriverId, 'الطلب في الحالة: قيد الانتظار غير محجوز');

  // ── 2) القبول من المندوب الأول ──
  const claim1 = await j(await post('/driver/order-action', { orderId: O1.id, driverId: D1.id, action: 'claim', items }));
  ok(claim1.success === true && claim1.status === 'accepted', 'قبول المندوب الأول للطلب (العذر: الحالة accepted)', JSON.stringify(claim1).slice(0, 120));
  ok((await orderInDb(O1.id)).claimedByDriverId === D1.id, 'الطلب مرتبط بمعرف المندوب في قاعدة البيانات');
  ok((await orderInDb(O1.id)).driverName === D1.name, 'اسم المندوب على الطلب من مصدر الخادم');

  // ── 3) اختفاء الطلب من قوائم الانتظار لدى الآخرين ──
  ok(!(await getOrdersFor(D2.id)).some(o => o.id === O1.id), 'الطلب اختفى من قائمة المندوب الثاني');
  ok(!(await getOrdersFor(D3.id)).some(o => o.id === O1.id), 'الطلب اختفى من قائمة المندوب الثالث');
  ok((await getOrdersFor(D1.id)).some(o => o.id === O1.id), 'الطلب يظهر لدى المندوب الذي قبله فقط');

  // ── 4) محاولة مندوب آخر القبول → رفض برسالة واضحة ──
  const claim2res = await post('/driver/order-action', { orderId: O1.id, driverId: D2.id, action: 'claim' });
  const claim2 = await j(claim2res);
  ok(claim2res.status === 409, 'رفض القبول من المندوب الثاني (409)');
  ok(claim2.error === 'عذرًا، تم استلام هذا الطلب بواسطة مندوب آخر', 'الرسالة: عذرًا، تم استلام هذا الطلب بواسطة مندوب آخر', JSON.stringify(claim2.error));
  ok((await orderInDb(O1.id)).claimedByDriverId === D1.id, 'الحجز لم يتغير بعد المحاولة الثانية');

  // ── 5) التجهيز: قبول → تجهيز → جاهز (بما فيها منع الجاهزية قبل اكتمال الأصناف) ──
  const owner = (driverId, action, extra = {}) => post('/driver/order-action', { orderId: O1.id, driverId, action, ...extra });
  const noOwnerAction = await post('/driver/order-action', { orderId: O1.id, driverId: D2.id, action: 'prepare' });
  ok(noOwnerAction.status === 403, 'رفض تعديل الطلب من مندوب غير مسند إليه (403)');

  const prep = await j(await owner(D1.id, 'prepare', { items: items.map(it => ({ ...it, prepared: false })) }));
  ok(prep.success && prep.status === 'preparing', 'الحالة: جاري التجهيز (accepted → preparing)');
  const earlyReady = await post('/driver/order-action', { orderId: O1.id, driverId: D1.id, action: 'ready' });
  ok(earlyReady.status === 409, 'منع الجاهزية قبل تجهيز كل الأصناف (409)');
  const prepped = await j(await owner(D1.id, 'prepare', { items: items.map(it => ({ ...it, prepared: true })) }));
  ok(prepped.success, 'تجهيز كل الأصناف وحفظها داخل الطلب');
  ok((await orderInDb(O1.id)).items.every(it => it.prepared === true), 'أعلام التجهيز محفوظة في قاعدة البيانات');
  const ready = await j(await owner(D1.id, 'ready'));
  ok(ready.success && ready.status === 'ready_for_delivery', 'الحالة: جاهز للتوصيل (preparing → ready_for_delivery)');

  // ── 6) منع القفز العشوائي بين الحالات ──
  const jump = await post('/driver/order-action', { orderId: O1.id, driverId: D1.id, action: 'prepare' });
  ok(jump.status === 409, 'منع الرجوع العكسي في دورة الحالة (409)');
  const cancelPeer = await post('/driver/order-action', { orderId: O1.id, driverId: D2.id, action: 'start_delivery' });
  ok(cancelPeer.status === 403, 'منع بدء التوصيل من مندوب الآخر');

  // ── 7) بدء التوصيل → on_the_way ──
  const start = await j(await owner(D1.id, 'start_delivery'));
  ok(start.success && start.status === 'on_the_way', 'الحالة: جاري التوصيل (on_the_way)');
  const inDb1 = await orderInDb(O1.id);
  ok(!!inDb1.trackToken && !!inDb1.driverToken, 'توكن التتبع وتوكن المندوب أُصدرا عند بدء التوصيل');
  ok(inDb1.onTheWayAt, 'وقت بدء التوصيل محفوظ');

  // موقع المندوب يعمل مع الحالة on_the_way (توافق على الاسمين)
  const locTry = await fetch(`${API}/driver/location`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: O1.id, lat: 24.71, lng: 46.72, driverToken: inDb1.driverToken }) });
  ok(locTry.status === 200, 'مشاركة الموقع تعمل في حالة on_the_way (توافق delivering)');

  // ── 8) التسليم → delivered ثم completed مع تاريخ التسليم ──
  const delivered = await j(await owner(D1.id, 'delivered'));
  ok(delivered.success && delivered.status === 'completed', 'الحالة النهائية: مكتمل (delivered ثم completed)');
  const inDb2 = await orderInDb(O1.id);
  ok(!!inDb2.deliveredAt && !!inDb2.completedAt, 'حفظ تاريخ/وقت التسليم واكتمال الطلب');
  ok(inDb2.claimedByDriverId === D1.id && Array.isArray(inDb2.statusHistory) &&
      ['accepted', 'preparing', 'ready_for_delivery', 'on_the_way', 'delivered', 'completed'].every(s => inDb2.statusHistory.some(h => h.status === s)),
    'سجل تاريخ الحالات كامل ودقيق', JSON.stringify(inDb2.statusHistory || []));

  // ── 9) منع الإكمال المكرر ──
  const again = await post('/driver/order-action', { orderId: O1.id, driverId: D1.id, action: 'delivered' });
  ok(again.status === 409, 'منع إكمال الطلب أكثر من مرة (409)');
  ok(!((await getOrdersFor(D1.id))).some(o => o.id === O1.id && o.status !== 'completed'), 'الطلب في المكتملة فقط وليس في قوائم النشطة');
  const d1Completed = (await getOrdersFor(D1.id)).filter(o => o.status === 'completed').map(o => o.id);
  ok(d1Completed.includes(O1.id), 'الطلب انتقل إلى تبويب المكتملة لدى مندوبه');

  // ── 10) حجز متزامن من جهازين/مندوبين في اللحظة نفسها ──
  const O2 = await createOrder(items);
  const c1 = post('/driver/order-action', { orderId: O2.id, driverId: D1.id, action: 'claim' });
  const c2 = post('/driver/order-action', { orderId: O2.id, driverId: D2.id, action: 'claim' });
  const c3 = post('/driver/order-action', { orderId: O2.id, driverId: D3.id, action: 'claim' });
  const rs = await Promise.all([c1, c2, c3]);
  const winners = [];
  for (const r of rs) { const b = await j(r); if (b.success && r.status === 200) winners.push(b); }
  ok(rs.filter(r => r.status === 200).length === 1, 'من جهازين/مندوبين في اللحظة نفسها: فاز single واحد فقط', `winners=${rs.map(r => r.status).join(',')}`);
  const O2db = await orderInDb(O2.id);
  ok(O2db.claimedByDriverId !== undefined, 'الفائز مرتبط بمعرف مندوب واحد في القاعدة');
  // إثبات نجاح مطالبات متزامنة حقيقية النتائج
  console.log('   simultaneous statuses:', rs.map(r => r.status).join('/'), '| claimed by:', O2db.claimedByName);

  // تنظيف: إغلاق الطلب الثاني إلى المكتملة حتى لا يبقى معلقاً
  await put(`/orders/${encodeURIComponent(O2.id)}`, { status: 'completed' });

  // ── 11) انقطاع الإنترنت/إعادة المحاولة: نفس المندوب يعيد claim/prepare فيبقى أمراً آمناً (idempotent) ──
  const retryClaim = await j(await post('/driver/order-action', { orderId: O2.id, driverId: O2db.claimedByDriverId, action: 'claim' }));
  ok(retryClaim.success === true, 'إعادة المحاولة نفسها لا تكرر العملية (آمن لأعطال الشبكة)', JSON.stringify(retryClaim.status));
  const hist = (await orderInDb(O2.id)).statusHistory;
  const acceptedCount = hist.filter(h => h.status === 'accepted').length;
  ok(acceptedCount === 1, 'سجل الحالة لا يُسجل القبول مرتين', `accepted=${acceptedCount}`);

  // ── 12) بقاء الحائل: عدم القبول من حالة مكتملة ──
  const O3 = await createOrder(items);
  await put(`/orders/${encodeURIComponent(O3.id)}`, { status: 'completed' });
  const lateClaim = await post('/driver/order-action', { orderId: O3.id, driverId: D1.id, action: 'claim' });
  ok(lateClaim.status === 409, 'رفض حجز طلب في حالة مكتملة (409)');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  console.log('TEST_DRIVERS=' + drivers.map(d => d.id).join(','));
  console.log('TEST_ORDERS=' + [O1.id, O2.id, O3.id].join(','));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
