// ═══ اختبار ميزة التوصيل حسب المدينة ═══
// المندوب المسجل في بيشة يرى طلبات بيشة فقط، ومندوب الرياض يرى طلبات الرياض فقط،
// والطلبات/المندوبون القدم بلا مدينة يرون كل شيء (توافق رجعي)
const fs = require('fs');
const API = 'http://localhost:3000/api';
const DB = 'E:/تطبيق المنار/apps/admin_portal/database.json';
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS:', label); } else { fail++; console.log('FAIL:', label, extra); } };
const j = async (r) => { try { return await r.json(); } catch (_) { return {}; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const orderInDb = async (id) => {
  await sleep(1200);
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  return db.tenantData.almanar_main.orders.find(o => String(o.id).replace('#', '') === String(id).replace('#', ''));
};
const post = async (path, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const getOrdersFor = async (driverId) => (await (await fetch(`${API}/orders?forDriver=${encodeURIComponent(driverId)}`)).json());

(async () => {
  const tag = 'CITYTST';
  // 1) تسجيل مندوبين حاملين مدينتين مختلفتين صراحةً
  const regDriver = async (name, city) => {
    const res = await post('/driver/register', {
      name, phone: `05${Date.now() % 1000000000}${Math.floor(Math.random() * 9)}`.slice(0, 10), pin: '7777', city,
    });
    const b = await j(res);
    return b.driver || null;
  };
  const A = await regDriver(`مندوب بيشة ${tag}`, 'بيشة');
  const B = await regDriver(`مندوب الرياض ${tag}`, 'الرياض');
  ok(!!A && A.city === 'بيشة', 'تسجيل مندوب بيشة: المدينة محفوظة في الباك اند', JSON.stringify(A && A.city));
  ok(!!B && B.city === 'الرياض', 'تسجيل مندوب الرياض: المدينة محفوظة في الباك اند', JSON.stringify(B && B.city));

  // 2) إنشاء طلبات بمدينة صريحة وبلا مدينة
  const items = [{ name: 'خبز', qty: 1, price: 5, prodId: 'prod-1' }];
  const createOrder = async (city) => {
    const res = await post('/orders', {
      customerName: `عميل ${tag}`, phone: '0551112222', address: 'شارع اختبار',
      itemsTotal: 5, deliveryFee: 5, paymentMethod: 'كاش عند الاستلام',
      items, ...(city !== undefined ? { city } : {}),
    });
    const b = await j(res);
    return b.order || null;
  };
  const OB = await createOrder('بيشة');    // طلب بيشة
  const OR = await createOrder('الرياض');  // طلب الرياض
  const ON = await createOrder();          // طلب قديم النمط بلا مدينة
  ok(OB && OB.city === 'بيشة', 'طلب بيشة: المدينة محفوظة', JSON.stringify(OB && OB.city));
  ok(OR && OR.city === 'الرياض', 'طلب الرياض: المدينة محفوظة', JSON.stringify(OR && OR.city));

  const inDbB = await orderInDb(OB.id);
  ok(inDbB && inDbB.city === 'بيشة', 'مدينة الطلب محفوظة فعلياً في قاعدة البيانات');

  // 3) الفلترة: مندوب بيشة يرى طلب بيشة + طلب بلا مدينة، ولا يرى طلب الرياض
  const listA = await getOrdersFor(A.id);
  const listB = await getOrdersFor(B.id);
  ok(listA.some(o => o.id === OB.id), 'مندوب بيشة يرى طلب بيشة');
  ok(!listA.some(o => o.id === OR.id), 'مندوب بيشة لا يرى طلب الرياض (مدينة مختلفة)');
  ok(listA.some(o => o.id === ON.id), 'مندوب بيشة يرى الطلبات القديمة بلا مدينة (توافق رجعي)');
  ok(listB.some(o => o.id === OR.id), 'مندوب الرياض يرى طلب الرياض');
  ok(!listB.some(o => o.id === OB.id), 'مندوب الرياض لا يرى طلب بيشة (مدينة مختلفة)');

  // 4) تحديث الملف الشخصي بالمدينة (تدفّق تطبيق المندوب عند الحفظ)
  const prof = await post('/driver/profile', { id: A.id, name: A.name, phone: A.phone, city: 'بيشة', vehicle: 'دباب' });
  const profB = await j(prof);
  ok(profB.success && profB.driver.city === 'بيشة', 'حفظ الملف الشخصي مع المدينة');
  // تحديث بدون إرسال المدينة: يجب ألا تُلغي المدينة المحفوظة
  const prof2 = await post('/driver/profile', { id: A.id, name: A.name, phone: A.phone, vehicle: 'دباب' });
  const prof2B = await j(prof2);
  ok(prof2B.success && prof2B.driver.city === 'بيشة', 'عدم إرسال المدينة في الملف لا يلغيها');

  // 5) مندوب قديم بلا مدينة (رفيق سلطان) يبقى يرى كل الطلبات المتاحة
  const oldDrv = JSON.parse(fs.readFileSync(DB, 'utf8')).tenantData.almanar_main.drivers.find(d => !d.city && d.name && !d.id.startsWith('drv-1793720'));
  if (oldDrv) {
    const listOld = await getOrdersFor(oldDrv.id);
    ok(listOld.some(o => o.id === OB.id) && listOld.some(o => o.id === OR.id), 'مندوب قديم بلا مدينة يرى كل الطلبات (توافق رجعي)');
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  console.log('CITY_DRIVERS=' + [A, B].filter(Boolean).map(d => d.id).join(','));
  console.log('CITY_ORDERS=' + [OB, OR].filter(Boolean).map(o => o.id).join(','));
  process.exit(fail ? 1 : 0);
})();
