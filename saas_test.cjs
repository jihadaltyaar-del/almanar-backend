// ============================================================================
// اختبار حي شامل لنظام SaaS متعدد المنشآت — سلة المنار
// يختبر: التسجيل، الدخول، عزل البيانات، إيصال التحويل، حسابات العملاء والمناديب
// ============================================================================
const BASE = 'http://localhost:3000';

function headers(cookie) {
  const h = { 'Content-Type': 'application/json' };
  if (cookie) h['Cookie'] = cookie;
  return h;
}

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✔ ' + name); }
  else { failed++; console.log('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}

async function req(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: headers(cookie),
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, data, setCookie };
}

(async () => {
  console.log('═'.repeat(56));
  console.log('1) المنشآت ورفض الافتراضيات القديمة');
  const t = await req('GET', '/api/tenants');
  check('GET /api/tenants → 200 وقائمة منشآت', t.status === 200 && Array.isArray(t.data) && t.data.length >= 3);

  const oldLogin = await req('POST', '/api/login', { pin: '1234' });
  check('الرمز الافتراضي 1234 مرفوض (401)', oldLogin.status === 401, 'status=' + oldLogin.status);
  check('رسالة تسجيل عند عدم وجود حساب (أو رفض رمز غير مطابق)', oldLogin.status === 401 && (oldLogin.data.needsRegister === true || oldLogin.data.error));

  const oldEmail = await req('POST', '/api/login', { email: 'admin@almanar.sa', password: 'admin123' });
  check('بيانات admin123 القديمة مرفوضة (401)', oldEmail.status === 401);

  console.log('2) تسجيل منشأتين جديدتين (حسابات مدير حقيقية فقط)');
  const rA = await req('POST', '/api/register', {
    storeName: 'سوبرماركت النور', name: 'مدير النور', email: 'noor@test.sa',
    password: 'noorPass1', pin: '5678', city: 'جدة', category: 'سوبرماركت'
  });
  check('تسجيل منشأة A → 201', rA.status === 201 && rA.data.success, JSON.stringify(rA.data));
  const tenantA = rA.data && rA.data.tenantId;

  const rB = await req('POST', '/api/register', {
    storeName: 'مخبز الياسمين', name: 'مدير الياسمين', password: 'yasPass1',
    pin: '4321', city: 'الرياض', category: 'مخبوزات'
  });
  check('تسجيل منشأة B → 201', rB.status === 201 && rB.data.success);
  const tenantB = rB.data && rB.data.tenantId;

  const rDup = await req('POST', '/api/register', {
    tenant: tenantA, name: 'آخر', password: 'xxxx1', pin: '1111'
  });
  check('منع تسجيل مدير ثانٍ لنفس المنشأة (409)', rDup.status === 409);

  console.log('3) الدخول حسب المنشأة + الكوكي');
  const lA = await req('POST', '/api/login', { pin: '5678', tenant: tenantA });
  check('دخول منشأة A بالـ PIN → 200', lA.status === 200 && lA.data.success, JSON.stringify(lA.data));
  check('كوكي المنشأة مضبوط', lA.setCookie.includes('almanar_tenant=' + encodeURIComponent(tenantA)));
  const cookieA = lA.setCookie.split(';')[0];

  const lB = await req('POST', '/api/login', { pin: '4321', tenant: tenantB });
  const cookieB = lB.setCookie.split(';')[0];
  check('دخول منشأة B → 200', lB.status === 200);

  const wrongPin = await req('POST', '/api/login', { pin: '5678', tenant: tenantB });
  check('رمز A لا يعمل في B (401)', wrongPin.status === 401);

  const badPin = await req('POST', '/api/login', { pin: '0000', tenant: tenantA });
  check('رمز خاطئ في A (401)', badPin.status === 401);

  console.log('4) عزل البيانات بين المنشآت');
  const prodsA = await req('GET', '/api/products?tenant=' + tenantA);
  const prodsB = await req('GET', '/api/products?tenant=' + tenantB);
  check('منشأة A ورثت الكتالوج (70+ منتج)', prodsA.status === 200 && prodsA.data.length >= 70, 'count=' + (prodsA.data || []).length);
  check('منشأة B لها كتالوج مستقل (70+ منتج)', prodsB.data.length >= 70);

  // كتالوجان مستقلان: تعديل منتج في A لا يظهر في B
  const p0 = prodsA.data[0];
  const upd = await req('PUT', '/api/products/' + p0.id + '?tenant=' + tenantA, { name: p0.name + ' (معدل)' });
  const prodsB2 = await req('GET', '/api/products?tenant=' + tenantB);
  const bHas = prodsB2.data.some(p => p.id === p0.id && p.name.includes('(معدل)'));
  check('تعديل منتج في A لا ينعكس على B', upd.status === 200 && !bHas);

  const orderA = await req('POST', '/api/orders?tenant=' + tenantA, {
    customerName: 'عميل تجريبي', phone: '0551112233', address: 'جدة - حي الروضة',
    items: [{ name: 'منتج', qty: 2, price: 10 }], paymentMethod: 'الدفع عند الاستلام'
  });
  check('إنشاء طلب في A → 201', orderA.status === 201);
  const orderIdA = orderA.data && orderA.data.order && orderA.data.order.id;

  const ordersA = await req('GET', '/api/orders?tenant=' + tenantA);
  const ordersB = await req('GET', '/api/orders?tenant=' + tenantB);
  check('A ترى طلبها', ordersA.data.some(o => o.id === orderIdA));
  check('B لا ترى طلبات A (صفر طلبات)', ordersB.status === 200 && ordersB.data.length === 0, 'count=' + (ordersB.data || []).length);

  const statsB = await req('GET', '/api/stats?tenant=' + tenantB);
  check('إحصائيات B = صفر طلبات', statsB.data.ordersCount === 0);

  console.log('5) تدفق التحويل البنكي + إيصال الصورة');
  const trOrder = await req('POST', '/api/orders?tenant=' + tenantA, {
    customerName: 'عميل تحويل', phone: '0559998877', items: [{ name: 'منتج', qty: 1, price: 50 }],
    paymentMethod: 'تحويل بنكي'
  });
  const trId = trOrder.data.order.id;
  check('طلب التحويل يبدأ بحالة بانتظار الإيصال', trOrder.data.order.status === 'awaiting_receipt', trOrder.data.order.status);

  const earlyDeliver = await req('PUT', '/api/orders/' + encodeURIComponent(trId) + '?tenant=' + tenantA, { status: 'delivering' });
  check('منع التوصيل قبل الإيصال (409)', earlyDeliver.status === 409);

  // رفع صورة إيصال صغيرة (PNG 1x1)
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await fetch(BASE + '/api/upload-image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: tinyPng })
  });
  const upData = await up.json();
  check('رفع صورة الإيصال → 200', up.status === 200 && upData.success, JSON.stringify(upData));

  const putReceipt = await req('PUT', '/api/orders/' + encodeURIComponent(trId) + '?tenant=' + tenantA, { receiptUrl: upData.url });
  check('حفظ رابط الإيصال على الطلب', putReceipt.status === 200 && putReceipt.data.order.receiptUrl === upData.url);

  const confirmR = await req('PUT', '/api/orders/' + encodeURIComponent(trId) + '?tenant=' + tenantA, { receiptConfirmed: true });
  check('تأكيد الإيصال ينقل الطلب للتوصيل', confirmR.status === 200 && confirmR.data.order.status === 'delivering', confirmR.data.order.status);

  const done = await req('PUT', '/api/orders/' + encodeURIComponent(trId) + '?tenant=' + tenantA, { status: 'completed' });
  check('إنهاء الطلب → completed', done.status === 200 && done.data.order.status === 'completed');

  console.log('6) حسابات العملاء (معزولة لكل منشأة)');
  const cReg = await req('POST', '/api/customer/register?tenant=' + tenantA, { name: 'نورة', phone: '0501234567', pin: '1122', address: 'جدة' });
  check('تسجيل عميل في A → 201', cReg.status === 201, JSON.stringify(cReg.data));

  const cWrong = await req('POST', '/api/customer/login?tenant=' + tenantA, { phone: '0501234567', pin: '0000' });
  check('رمز عميل خاطئ (401)', cWrong.status === 401);

  const cOk = await req('POST', '/api/customer/login?tenant=' + tenantA, { phone: '0501234567', pin: '1122' });
  check('دخول العميل صحيحاً → 200', cOk.status === 200 && cOk.data.customer.name === 'نورة');

  const cB = await req('POST', '/api/customer/login?tenant=' + tenantB, { phone: '0501234567', pin: '1122' });
  check('نفس العميل غير موجود في منشأة B (401)', cB.status === 401);

  console.log('7) المناديب (تسجيل + دخول + عزل)');
  const dReg = await req('POST', '/api/driver/register?tenant=' + tenantA, { name: 'ماجد', phone: '0541112233', pin: '7788', vehicle: 'موتور' });
  check('تسجيل مندوب في A → 201', dReg.status === 201, JSON.stringify(dReg.data));

  const dWrong = await req('POST', '/api/driver/login?tenant=' + tenantA, { phone: '0541112233', pin: '1234' });
  check('الرمز 1234 لا يفتح حساب مندوب (401)', dWrong.status === 401);

  const dOk = await req('POST', '/api/driver/login?tenant=' + tenantA, { phone: '0541112233', pin: '7788' });
  check('دخول المندوب صحيحاً → 200', dOk.status === 200 && dOk.data.registered === true);

  const dB = await req('POST', '/api/driver/login?tenant=' + tenantB, { phone: '0541112233', pin: '7788' });
  check('مندوب A غير مسجل في B (401)', dB.status === 401);

  const dNew = await req('POST', '/api/driver/login?tenant=' + tenantB, { phone: '0540000000', pin: '1234' });
  check('مندوب جديد بلا تسجيل → needsRegister', dNew.status === 401 && dNew.data.needsRegister === true);

  const dProf = await req('POST', '/api/driver/profile?tenant=' + tenantA, { name: 'بلا رمز', phone: '0549999999' });
  check('إنشاء ملف مندوب بلا PIN مرفوض (400)', dProf.status === 400);

  console.log('8) صفحات الويب');
  const loginPage = await fetch(BASE + '/login?tenant=' + tenantA);
  const loginHtml = await loginPage.text();
  check('صفحة الدخول تعرض اسم المنشأة', loginPage.status === 200 && loginHtml.includes('منشأة: سوبرماركت النور'));
  check('بلا تلميح كلمة مرور افتراضية', !loginHtml.includes('admin123') && !loginHtml.includes('admin@almanar.sa'));
  check('شعار سلة المنار موجود', loginHtml.includes('/images/logo.png'));

  const regPage = await fetch(BASE + '/register');
  const regHtml = await regPage.text();
  check('صفحة التسجيل تعمل (200 + شعار)', regPage.status === 200 && regHtml.includes('/images/logo.png'));
  check('صفحة التسجيل زجاجية', regHtml.includes('backdrop-filter'));

  const logoRes = await fetch(BASE + '/images/logo.png');
  check('صورة الشعار تُخدَّم (200)', logoRes.status === 200);

  const mainPage = await fetch(BASE + '/');
  const mainHtml = await mainPage.text();
  check('لوحة الإدارة تعرض الشعار', mainHtml.includes('/images/logo.png'));
  check('بلا علامة شهد', !mainHtml.includes('شهد'));

  console.log('9) تسجيل دخول المدير عبر الكوكي فقط (بدون ?tenant=)');
  const cookieOnly = await req('GET', '/api/orders', null, cookieA);
  check('كوكي A يعيد طلبات A', cookieOnly.data.some(o => o.id === orderIdA));
  const cookieOnlyB = await req('GET', '/api/orders', null, cookieB);
  check('كوكي B لا يرى طلبات A', !cookieOnlyB.data.some(o => o.id === orderIdA));

  console.log('═'.repeat(56));
  console.log('النتيجة: ' + passed + ' ناجح، ' + failed + ' فاشل');
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('خطأ في الاختبار:', e); process.exit(2); });
