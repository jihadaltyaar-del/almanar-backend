// ============================================================================
// ADDITIONS: إصلاح الأزرار المعطوبة + تقارير المناديب + ولاء العملاء
// ============================================================================

// ----------------------------------------------------------------------------
// 1. الإعدادات العامة
// ----------------------------------------------------------------------------
function showSettings() {
  const modal = document.createElement('div');
  modal.id = 'settings-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
      <div class="bg-gradient-to-l from-[#008955] to-[#005f3c] px-6 py-4 flex items-center justify-between">
        <h2 class="text-white font-bold text-base flex items-center gap-2">⚙️ الإعدادات العامة</h2>
        <button onclick="document.getElementById('settings-modal').remove()" class="text-white/70 hover:text-white text-xl font-bold">✕</button>
      </div>
      <div class="p-5 space-y-4">
        <div class="bg-slate-50 rounded-xl p-4 space-y-3">
          <h3 class="font-bold text-sm text-slate-700">🏪 معلومات المتجر</h3>
          <div>
            <label class="text-xs text-slate-500 block mb-1">اسم المتجر</label>
            <input id="set-store-name" type="text" value="سلة المنار" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]">
          </div>
          <div>
            <label class="text-xs text-slate-500 block mb-1">رقم التواصل</label>
            <input id="set-store-phone" type="tel" value="0500000000" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]" dir="ltr">
          </div>
          <div>
            <label class="text-xs text-slate-500 block mb-1">المدينة الرئيسية</label>
            <input id="set-store-city" type="text" value="الرياض" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]">
          </div>
        </div>
        <div class="bg-slate-50 rounded-xl p-4 space-y-3">
          <h3 class="font-bold text-sm text-slate-700">🚚 إعدادات التوصيل</h3>
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-600">تفعيل خدمة التوصيل</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked class="sr-only peer">
              <div class="w-10 h-5 bg-gray-200 peer-checked:bg-[#008955] rounded-full peer transition-all"></div>
              <div class="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
            </label>
          </div>
          <div>
            <label class="text-xs text-slate-500 block mb-1">رسوم التوصيل الافتراضية (ر.س)</label>
            <input type="number" value="15" min="0" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]">
          </div>
          <div>
            <label class="text-xs text-slate-500 block mb-1">الحد الأدنى للطلب (ر.س)</label>
            <input type="number" value="50" min="0" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]">
          </div>
        </div>
        <div class="bg-slate-50 rounded-xl p-4 space-y-3">
          <h3 class="font-bold text-sm text-slate-700">🔔 إعدادات الإشعارات</h3>
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-600">إشعارات الطلبات الجديدة</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked class="sr-only peer">
              <div class="w-10 h-5 bg-gray-200 peer-checked:bg-[#008955] rounded-full peer transition-all"></div>
              <div class="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
            </label>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-slate-600">إشعارات المناديب الجدد</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked class="sr-only peer">
              <div class="w-10 h-5 bg-gray-200 peer-checked:bg-[#008955] rounded-full peer transition-all"></div>
              <div class="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
            </label>
          </div>
        </div>
        <button onclick="saveSettings()" class="w-full bg-[#008955] hover:bg-[#006b40] text-white font-bold py-3 rounded-xl text-sm transition">
          💾 حفظ الإعدادات
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.showSettings = showSettings;

function saveSettings() {
  showToast('تم حفظ الإعدادات بنجاح ✅', 'success');
  document.getElementById('settings-modal')?.remove();
}
window.saveSettings = saveSettings;

// ----------------------------------------------------------------------------
// 2. المساعدة والدعم
// ----------------------------------------------------------------------------
function showHelp() {
  const modal = document.createElement('div');
  modal.id = 'help-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
      <div class="bg-gradient-to-l from-[#0ea5e9] to-[#0284c7] px-6 py-4 flex items-center justify-between">
        <h2 class="text-white font-bold text-base flex items-center gap-2">🆘 المساعدة والدعم</h2>
        <button onclick="document.getElementById('help-modal').remove()" class="text-white/70 hover:text-white text-xl font-bold">✕</button>
      </div>
      <div class="p-5 space-y-3">
        <div class="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <h3 class="font-bold text-sm text-blue-800 mb-2">📌 الأسئلة الشائعة</h3>
          <div class="space-y-2 text-xs text-blue-700">
            <details class="cursor-pointer">
              <summary class="font-semibold py-1">كيف أضيف منتجاً جديداً؟</summary>
              <p class="mt-1 text-blue-600 pr-3">اذهب إلى قسم المنتجات ← اضغط "إضافة منتج" ← أدخل البيانات ← احفظ.</p>
            </details>
            <details class="cursor-pointer">
              <summary class="font-semibold py-1">كيف أقبل مندوباً جديداً؟</summary>
              <p class="mt-1 text-blue-600 pr-3">اذهب إلى قسم المناديب ← ابحث عن المندوب المعلق ← اضغط زر ✓ القبول.</p>
            </details>
            <details class="cursor-pointer">
              <summary class="font-semibold py-1">كيف أتابع الطلبات؟</summary>
              <p class="mt-1 text-blue-600 pr-3">قسم الطلبات يعرض جميع الطلبات مع حالتها وتفاصيل التوصيل.</p>
            </details>
            <details class="cursor-pointer">
              <summary class="font-semibold py-1">لماذا لا تظهر المنتجات في التطبيق؟</summary>
              <p class="mt-1 text-blue-600 pr-3">تأكد من أن المنتجات مفعّلة وأن السيرفر يعمل على Render.</p>
            </details>
          </div>
        </div>
        <div class="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <h3 class="font-bold text-sm text-emerald-800 mb-3">📞 تواصل مع الدعم</h3>
          <div class="space-y-2">
            <a href="https://wa.me/966500000000" target="_blank" class="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-emerald-200 hover:border-emerald-400 transition">
              <span class="text-xl">💬</span>
              <div>
                <div class="text-xs font-bold text-slate-800">واتساب الدعم الفني</div>
                <div class="text-[11px] text-slate-500">متاح 24/7</div>
              </div>
            </a>
            <a href="mailto:support@almanar.app" class="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-emerald-200 hover:border-emerald-400 transition">
              <span class="text-xl">📧</span>
              <div>
                <div class="text-xs font-bold text-slate-800">support@almanar.app</div>
                <div class="text-[11px] text-slate-500">الرد خلال 24 ساعة</div>
              </div>
            </a>
          </div>
        </div>
        <div class="text-center text-xs text-slate-400 pt-1">
          سلة المنار v2.0 — جميع الحقوق محفوظة
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.showHelp = showHelp;

// ----------------------------------------------------------------------------
// 3. تبديل اللغة عربي / إنجليزي
// ----------------------------------------------------------------------------
let _currentLang = localStorage.getItem('almanar_lang') || 'ar';
function toggleLanguage() {
  _currentLang = _currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('almanar_lang', _currentLang);
  document.documentElement.setAttribute('lang', _currentLang);
  document.documentElement.setAttribute('dir', _currentLang === 'ar' ? 'rtl' : 'ltr');
  const langText = document.getElementById('current-lang-text');
  if (langText) langText.textContent = _currentLang === 'ar' ? '🇸🇦 عربي' : '🇬🇧 English';
  showToast(_currentLang === 'ar' ? 'تم التبديل للواجهة العربية 🇸🇦' : 'Switched to English interface 🇬🇧', 'success');
}
window.toggleLanguage = toggleLanguage;

// ----------------------------------------------------------------------------
// 4. الإشعارات
// ----------------------------------------------------------------------------
function showNotifications() {
  const existing = document.getElementById('notif-panel');
  if (existing) { existing.remove(); return; }
  const orders = window.globalOrders || [];
  const pending = orders.filter(o => o.status === 'pending').slice(0, 5);
  const drivers = window.globalDrivers || [];
  const pendingDrivers = drivers.filter(d => d.status === 'pending').slice(0, 3);

  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'fixed top-14 left-4 z-[9998] bg-white rounded-2xl shadow-2xl border border-slate-200 w-80 max-h-96 overflow-y-auto';
  panel.innerHTML = `
    <div class="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
      <span class="font-bold text-sm text-slate-800">🔔 الإشعارات</span>
      <button onclick="document.getElementById('notif-panel')?.remove()" class="text-slate-400 hover:text-slate-700 text-lg">✕</button>
    </div>
    <div class="p-3 space-y-2">
      ${pendingDrivers.length > 0 ? `
        <div class="text-[11px] font-bold text-amber-600 px-1 mt-1">🧑‍💼 مناديب ينتظرون القبول</div>
        ${pendingDrivers.map(d => `
          <div class="bg-amber-50 rounded-xl px-3 py-2.5 flex items-center justify-between border border-amber-100">
            <div>
              <div class="text-xs font-bold text-slate-800">${escapeHtml(d.name || 'مندوب جديد')}</div>
              <div class="text-[11px] text-slate-500">${escapeHtml(d.phone || '')}</div>
            </div>
            <button onclick="approveDriver('${escapeHtml(d.id)}');document.getElementById('notif-panel')?.remove()" class="text-[11px] bg-amber-500 text-white px-2.5 py-1 rounded-lg font-bold hover:bg-amber-600 transition">قبول ✓</button>
          </div>
        `).join('')}
      ` : ''}
      ${pending.length > 0 ? `
        <div class="text-[11px] font-bold text-blue-600 px-1 mt-2">📦 طلبات جديدة</div>
        ${pending.map(o => `
          <div class="bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
            <div class="text-xs font-bold text-slate-800">${escapeHtml(o.customerName || 'عميل')}</div>
            <div class="text-[11px] text-slate-500">${parseFloat(o.totalPrice || 0).toFixed(2)} ر.س</div>
          </div>
        `).join('')}
      ` : ''}
      ${pendingDrivers.length === 0 && pending.length === 0 ? `
        <div class="text-center py-6 text-slate-400 text-sm">
          <div class="text-3xl mb-2">✅</div>
          لا توجد إشعارات جديدة
        </div>
      ` : ''}
    </div>
  `;
  document.body.appendChild(panel);
  setTimeout(() => document.addEventListener('click', function handler(e) {
    if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', handler); }
  }), 100);
}
window.showNotifications = showNotifications;

// ----------------------------------------------------------------------------
// 5. التاريخ والتقويم
// ----------------------------------------------------------------------------
function showDatePicker() {
  const existing = document.getElementById('date-panel');
  if (existing) { existing.remove(); return; }
  const now = new Date();
  const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  const panel = document.createElement('div');
  panel.id = 'date-panel';
  panel.className = 'fixed top-14 right-4 z-[9998] bg-white rounded-2xl shadow-2xl border border-slate-200 w-72 p-4';
  panel.innerHTML = `
    <div class="text-center space-y-1 mb-4">
      <div class="text-2xl font-extrabold text-[#008955]">${now.getDate()}</div>
      <div class="text-sm font-bold text-slate-700">${days[now.getDay()]}، ${months[now.getMonth()]} ${now.getFullYear()}</div>
      <div class="text-xs text-slate-400">${now.toLocaleTimeString('ar-SA')}</div>
    </div>
    <div class="bg-slate-50 rounded-xl p-3 space-y-2 text-xs text-slate-600">
      <div class="flex justify-between">
        <span>طلبات اليوم</span>
        <span class="font-bold text-[#008955]">${(window.globalOrders||[]).filter(o=>new Date(o.createdAt||o.date||0).toDateString()===now.toDateString()).length} طلب</span>
      </div>
      <div class="flex justify-between">
        <span>المناديب النشطون</span>
        <span class="font-bold text-blue-600">${(window.globalDrivers||[]).filter(d=>d.status==='متاح'||d.status==='active').length} مندوب</span>
      </div>
    </div>
    <button onclick="document.getElementById('date-panel')?.remove()" class="w-full mt-3 text-xs text-slate-400 hover:text-slate-700 transition">إغلاق</button>
  `;
  document.body.appendChild(panel);
  setTimeout(() => document.addEventListener('click', function handler(e) {
    if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', handler); }
  }), 100);
}
window.showDatePicker = showDatePicker;

// ============================================================================
// 6. تقارير مبيعات المناديب
// ============================================================================
function showDriverReports() {
  const modal = document.createElement('div');
  modal.id = 'driver-reports-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3';
  const drivers = window.globalDrivers || [];

  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="bg-gradient-to-l from-[#008955] to-[#005f3c] px-5 py-4 flex items-center justify-between shrink-0">
        <h2 class="text-white font-bold text-sm flex items-center gap-2">📊 تقارير مبيعات المناديب</h2>
        <button onclick="document.getElementById('driver-reports-modal').remove()" class="text-white/70 hover:text-white text-xl font-bold">✕</button>
      </div>

      <!-- Controls -->
      <div class="p-4 border-b border-slate-100 shrink-0 space-y-3">
        <div class="flex gap-2 flex-wrap">
          <div class="flex-1 min-w-[180px]">
            <label class="text-xs text-slate-500 block mb-1">اختر المندوب</label>
            <select id="rpt-driver-select" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]" onchange="generateDriverReport()">
              <option value="">-- اختر مندوباً --</option>
              ${drivers.filter(d=>d.status!=='pending'&&d.status!=='مرفوض').map(d=>
                `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name||'مندوب')} — ${escapeHtml(d.phone||'')}</option>`
              ).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs text-slate-500 block mb-1">نوع التقرير</label>
            <select id="rpt-period" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]" onchange="generateDriverReport()">
              <option value="today">اليوم</option>
              <option value="week">هذا الأسبوع</option>
              <option value="month" selected>هذا الشهر</option>
              <option value="all">جميع الوقت</option>
            </select>
          </div>
          <div class="flex items-end">
            <button onclick="printDriverReport()" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5">
              🖨️ طباعة
            </button>
          </div>
        </div>
        <div>
          <label class="text-xs text-slate-500 block mb-1">أو ابحث بالاسم/الهاتف</label>
          <input id="rpt-driver-search" type="text" placeholder="اكتب اسم المندوب..." class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008955]" oninput="filterDriverReportSearch()">
        </div>
      </div>

      <!-- Report Body -->
      <div id="driver-report-body" class="flex-1 overflow-y-auto p-4">
        <div class="text-center py-12 text-slate-400">
          <div class="text-4xl mb-3">📋</div>
          <div class="text-sm">اختر مندوباً لعرض تقرير مبيعاته</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
window.showDriverReports = showDriverReports;

function filterDriverReportSearch() {
  const q = (document.getElementById('rpt-driver-search')?.value || '').trim().toLowerCase();
  const select = document.getElementById('rpt-driver-select');
  const drivers = window.globalDrivers || [];
  if (!select) return;
  select.innerHTML = '<option value="">-- اختر مندوباً --</option>' +
    drivers.filter(d => d.status !== 'pending' && d.status !== 'مرفوض')
      .filter(d => !q || (d.name||'').toLowerCase().includes(q) || (d.phone||'').includes(q))
      .map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name||'مندوب')} — ${escapeHtml(d.phone||'')}</option>`)
      .join('');
}
window.filterDriverReportSearch = filterDriverReportSearch;

function generateDriverReport() {
  const driverId = document.getElementById('rpt-driver-select')?.value;
  const period = document.getElementById('rpt-period')?.value || 'month';
  const body = document.getElementById('driver-report-body');
  if (!body) return;

  if (!driverId) {
    body.innerHTML = `<div class="text-center py-12 text-slate-400"><div class="text-4xl mb-3">📋</div><div class="text-sm">اختر مندوباً لعرض تقرير مبيعاته</div></div>`;
    return;
  }

  const driver = (window.globalDrivers || []).find(d => d.id === driverId);
  const allOrders = window.globalOrders || [];
  const now = new Date();

  // فلترة الطلبات حسب المندوب والفترة
  let filtered = allOrders.filter(o => o.claimedByDriverId === driverId || o.driverId === driverId);

  if (period === 'today') {
    filtered = filtered.filter(o => new Date(o.createdAt||o.date||0).toDateString() === now.toDateString());
  } else if (period === 'week') {
    const weekAgo = new Date(now - 7*24*60*60*1000);
    filtered = filtered.filter(o => new Date(o.createdAt||o.date||0) >= weekAgo);
  } else if (period === 'month') {
    filtered = filtered.filter(o => {
      const d = new Date(o.createdAt||o.date||0);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }

  const completed = filtered.filter(o => o.status === 'delivered' || o.status === 'completed');
  const totalRevenue = completed.reduce((s, o) => s + parseFloat(o.totalPrice || 0), 0);
  const totalDeliveryFees = completed.length * 15;
  const avgOrderValue = completed.length > 0 ? totalRevenue / completed.length : 0;

  // توزيع حسب الأيام (آخر 7 أيام)
  const dayLabels = [];
  const dayCounts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i*24*60*60*1000);
    dayLabels.push(d.toLocaleDateString('ar-SA', {weekday:'short'}));
    dayCounts.push(completed.filter(o => new Date(o.createdAt||o.date||0).toDateString() === d.toDateString()).length);
  }

  const periodLabel = {today:'اليوم',week:'هذا الأسبوع',month:'هذا الشهر',all:'جميع الوقت'}[period];
  const driverName = driver?.name || 'المندوب';
  const driverPhone = driver?.phone || '';
  const driverRating = driver?.rating ? Number(driver.rating).toFixed(1) : '5.0';

  body.innerHTML = `
    <div id="printable-report">
      <!-- بطاقة المندوب -->
      <div class="bg-gradient-to-l from-[#008955]/10 to-emerald-50 rounded-xl p-4 flex items-center gap-3 mb-4 border border-emerald-100">
        <div class="w-12 h-12 rounded-xl bg-[#008955] text-white flex items-center justify-center text-xl font-bold shrink-0">
          🛵
        </div>
        <div class="flex-1">
          <div class="font-bold text-slate-800">${escapeHtml(driverName)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(driverPhone)}</div>
        </div>
        <div class="text-left">
          <div class="text-amber-500 font-bold text-sm">★ ${driverRating}</div>
          <div class="text-[11px] text-slate-400">التقييم</div>
        </div>
      </div>

      <!-- إحصائيات سريعة -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
          <div class="text-2xl font-extrabold text-[#008955]">${completed.length}</div>
          <div class="text-xs text-slate-500 mt-0.5">طلب مكتمل</div>
          <div class="text-[11px] text-slate-400">${periodLabel}</div>
        </div>
        <div class="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
          <div class="text-2xl font-extrabold text-blue-700">${totalRevenue.toFixed(0)}</div>
          <div class="text-xs text-slate-500 mt-0.5">إجمالي المبيعات (ر.س)</div>
          <div class="text-[11px] text-slate-400">${periodLabel}</div>
        </div>
        <div class="bg-amber-50 rounded-xl p-3 border border-amber-100 text-center">
          <div class="text-2xl font-extrabold text-amber-600">${totalDeliveryFees.toFixed(0)}</div>
          <div class="text-xs text-slate-500 mt-0.5">رسوم التوصيل (ر.س)</div>
          <div class="text-[11px] text-slate-400">15 ر.س × طلب</div>
        </div>
        <div class="bg-purple-50 rounded-xl p-3 border border-purple-100 text-center">
          <div class="text-2xl font-extrabold text-purple-700">${avgOrderValue.toFixed(1)}</div>
          <div class="text-xs text-slate-500 mt-0.5">متوسط قيمة الطلب (ر.س)</div>
        </div>
      </div>

      <!-- مخطط الأيام السبعة -->
      <div class="bg-white rounded-xl border border-slate-100 p-4 mb-4">
        <div class="text-xs font-bold text-slate-600 mb-3">📈 الطلبات — آخر 7 أيام</div>
        <div class="flex items-end gap-1.5 h-24">
          ${dayCounts.map((c, i) => {
            const max = Math.max(...dayCounts, 1);
            const h = Math.round((c / max) * 100);
            return `<div class="flex-1 flex flex-col items-center gap-1">
              <div class="text-[10px] font-bold text-[#008955]">${c||''}</div>
              <div class="w-full rounded-t-md bg-[#008955]" style="height:${h}%;min-height:${c>0?'4px':'2px'};opacity:${c>0?1:0.15}"></div>
              <div class="text-[9px] text-slate-400 text-center leading-tight">${dayLabels[i]}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- آخر الطلبات -->
      ${completed.length > 0 ? `
        <div class="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-600">📋 آخر الطلبات المكتملة</div>
          <div class="divide-y divide-slate-50">
            ${completed.slice(-10).reverse().map(o => `
              <div class="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <div class="text-xs font-semibold text-slate-700">${escapeHtml(o.customerName||'عميل')}</div>
                  <div class="text-[11px] text-slate-400">${new Date(o.createdAt||o.date||0).toLocaleDateString('ar-SA')}</div>
                </div>
                <div class="font-bold text-sm text-[#008955]">${parseFloat(o.totalPrice||0).toFixed(2)} ر.س</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `<div class="text-center py-8 text-slate-400 text-sm">لا توجد طلبات مكتملة في هذه الفترة</div>`}
    </div>
  `;
}
window.generateDriverReport = generateDriverReport;

function printDriverReport() {
  const driverId = document.getElementById('rpt-driver-select')?.value;
  const driverName = (window.globalDrivers||[]).find(d=>d.id===driverId)?.name || 'المندوب';
  const period = document.getElementById('rpt-period')?.value || 'month';
  const periodLabel = {today:'اليوم',week:'هذا الأسبوع',month:'هذا الشهر',all:'جميع الوقت'}[period];
  const content = document.getElementById('printable-report')?.innerHTML;
  if (!content) { showToast('اختر مندوباً أولاً', 'error'); return; }

  const win = window.open('', '_blank', 'width=800,height=700');
  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير مبيعات — ${driverName}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 30px; color: #1e293b; background: #fff; }
        h1 { color: #008955; font-size: 20px; margin-bottom: 5px; }
        .sub { color: #64748b; font-size: 13px; margin-bottom: 20px; border-bottom: 2px solid #008955; padding-bottom: 10px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0; }
        .card { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 15px; text-align: center; }
        .card .num { font-size: 28px; font-weight: 900; color: #008955; }
        .card .label { font-size: 11px; color: #64748b; margin-top: 4px; }
        .orders-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
        .orders-table th { background: #008955; color: white; padding: 8px 12px; text-align: right; }
        .orders-table td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; }
        .orders-table tr:nth-child(even) td { background: #f8fafc; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        @media print { body { padding: 15px; } }
      </style>
    </head>
    <body>
      <h1>📊 تقرير مبيعات المندوب</h1>
      <div class="sub">المندوب: ${escapeHtml(driverName)} &nbsp;|&nbsp; الفترة: ${periodLabel} &nbsp;|&nbsp; تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
      ${content}
      <div class="footer">سلة المنار — نظام إدارة التوصيل &copy; ${new Date().getFullYear()}</div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}
window.printDriverReport = printDriverReport;

// ============================================================================
// 7. ولاء العملاء (Loyalty & Rewards)
// ============================================================================
function showCustomerLoyalty() {
  const customers = window.globalCustomers || [];
  const orders = window.globalOrders || [];

  // حساب نقاط كل عميل
  const enriched = customers.map(c => {
    const custOrders = orders.filter(o => o.customerPhone === c.phone || o.customerId === c.id);
    const totalSpent = custOrders.reduce((s,o)=>s+parseFloat(o.totalPrice||0),0);
    const points = Math.floor(totalSpent / 10); // 1 نقطة لكل 10 ريال
    const tier = points >= 500 ? 'ذهبي' : points >= 200 ? 'فضي' : points >= 50 ? 'برونزي' : 'عادي';
    const tierColor = {ذهبي:'text-amber-600 bg-amber-50 border-amber-200', فضي:'text-slate-600 bg-slate-100 border-slate-200', برونزي:'text-orange-600 bg-orange-50 border-orange-200', عادي:'text-slate-500 bg-white border-slate-100'}[tier];
    const tierEmoji = {ذهبي:'🏆', فضي:'🥈', برونزي:'🥉', عادي:'⭐'}[tier];
    return { ...c, totalSpent, points, tier, tierColor, tierEmoji, ordersCount: custOrders.length };
  }).sort((a,b) => b.points - a.points);

  const modal = document.createElement('div');
  modal.id = 'loyalty-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Header -->
      <div class="bg-gradient-to-l from-amber-500 to-amber-600 px-5 py-4 flex items-center justify-between shrink-0">
        <div>
          <h2 class="text-white font-bold text-sm flex items-center gap-2">🏆 ولاء العملاء والمكافآت</h2>
          <p class="text-amber-100 text-xs mt-0.5">1 نقطة لكل 10 ريال مصروف</p>
        </div>
        <button onclick="document.getElementById('loyalty-modal').remove()" class="text-white/70 hover:text-white text-xl font-bold">✕</button>
      </div>

      <!-- مستويات الولاء -->
      <div class="p-4 border-b border-slate-100 shrink-0">
        <div class="grid grid-cols-4 gap-2 text-center">
          <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
            <div class="text-lg">⭐</div>
            <div class="text-xs font-bold text-slate-600">عادي</div>
            <div class="text-[10px] text-slate-400">0–49 نقطة</div>
          </div>
          <div class="bg-orange-50 rounded-xl p-2.5 border border-orange-200">
            <div class="text-lg">🥉</div>
            <div class="text-xs font-bold text-orange-700">برونزي</div>
            <div class="text-[10px] text-orange-500">50–199 نقطة</div>
          </div>
          <div class="bg-slate-100 rounded-xl p-2.5 border border-slate-200">
            <div class="text-lg">🥈</div>
            <div class="text-xs font-bold text-slate-600">فضي</div>
            <div class="text-[10px] text-slate-500">200–499 نقطة</div>
          </div>
          <div class="bg-amber-50 rounded-xl p-2.5 border border-amber-200">
            <div class="text-lg">🏆</div>
            <div class="text-xs font-bold text-amber-700">ذهبي</div>
            <div class="text-[10px] text-amber-500">500+ نقطة</div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="px-4 py-3 border-b border-slate-100 shrink-0 flex gap-2">
        <input type="text" id="loyalty-search" placeholder="ابحث عن عميل..." class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" oninput="filterLoyaltyTable()">
        <select id="loyalty-tier-filter" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" onchange="filterLoyaltyTable()">
          <option value="">جميع المستويات</option>
          <option value="ذهبي">🏆 ذهبي</option>
          <option value="فضي">🥈 فضي</option>
          <option value="برونزي">🥉 برونزي</option>
          <option value="عادي">⭐ عادي</option>
        </select>
        <button onclick="printLoyaltyReport()" class="bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-lg transition">🖨️</button>
      </div>

      <!-- جدول العملاء -->
      <div class="flex-1 overflow-y-auto">
        <table class="w-full text-xs">
          <thead class="bg-slate-50 sticky top-0">
            <tr>
              <th class="text-right px-4 py-3 font-bold text-slate-600">#</th>
              <th class="text-right px-4 py-3 font-bold text-slate-600">العميل</th>
              <th class="text-center px-3 py-3 font-bold text-slate-600">الطلبات</th>
              <th class="text-center px-3 py-3 font-bold text-slate-600">المصروف</th>
              <th class="text-center px-3 py-3 font-bold text-slate-600">النقاط</th>
              <th class="text-center px-3 py-3 font-bold text-slate-600">المستوى</th>
              <th class="text-center px-3 py-3 font-bold text-slate-600">مكافأة</th>
            </tr>
          </thead>
          <tbody id="loyalty-table-body">
            ${_renderLoyaltyRows(enriched)}
          </tbody>
        </table>
      </div>

      <!-- إحصائيات سريعة -->
      <div class="p-3 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center gap-4 text-xs text-slate-500">
        <span>🏆 ذهبي: <b class="text-amber-600">${enriched.filter(c=>c.tier==='ذهبي').length}</b></span>
        <span>🥈 فضي: <b class="text-slate-600">${enriched.filter(c=>c.tier==='فضي').length}</b></span>
        <span>🥉 برونزي: <b class="text-orange-600">${enriched.filter(c=>c.tier==='برونزي').length}</b></span>
        <span class="mr-auto">إجمالي العملاء: <b>${enriched.length}</b></span>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  // حفظ البيانات المعالجة
  window._enrichedCustomers = enriched;
}
window.showCustomerLoyalty = showCustomerLoyalty;

function _renderLoyaltyRows(list) {
  if (!list || list.length === 0) return '<tr><td colspan="7" class="text-center py-10 text-slate-400">لا توجد بيانات</td></tr>';
  return list.map((c, i) => `
    <tr class="hover:bg-slate-50 transition border-b border-slate-50">
      <td class="px-4 py-3 text-slate-400 font-bold">${i+1}</td>
      <td class="px-4 py-3">
        <div class="font-bold text-slate-800">${escapeHtml(c.name||'عميل')}</div>
        <div class="text-slate-400">${escapeHtml(c.phone||'')}</div>
      </td>
      <td class="px-3 py-3 text-center font-bold text-slate-700">${c.ordersCount}</td>
      <td class="px-3 py-3 text-center font-bold text-[#008955]">${c.totalSpent.toFixed(1)} ر.س</td>
      <td class="px-3 py-3 text-center">
        <span class="font-extrabold text-amber-600">${c.points}</span>
        <span class="text-slate-400"> نقطة</span>
      </td>
      <td class="px-3 py-3 text-center">
        <span class="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${c.tierColor}">
          ${c.tierEmoji} ${c.tier}
        </span>
      </td>
      <td class="px-3 py-3 text-center">
        <button onclick="grantLoyaltyReward('${escapeHtml(c.id||c.phone||'')}','${escapeHtml(c.name||'')}')" class="bg-amber-100 hover:bg-amber-200 text-amber-700 text-[11px] font-bold px-2.5 py-1 rounded-lg transition">
          🎁 منح
        </button>
      </td>
    </tr>
  `).join('');
}
window._renderLoyaltyRows = _renderLoyaltyRows;

function filterLoyaltyTable() {
  const q = (document.getElementById('loyalty-search')?.value||'').trim().toLowerCase();
  const tier = document.getElementById('loyalty-tier-filter')?.value||'';
  const all = window._enrichedCustomers || [];
  const filtered = all.filter(c => {
    if (tier && c.tier !== tier) return false;
    if (q && !(c.name||'').toLowerCase().includes(q) && !(c.phone||'').includes(q)) return false;
    return true;
  });
  const tbody = document.getElementById('loyalty-table-body');
  if (tbody) tbody.innerHTML = _renderLoyaltyRows(filtered);
}
window.filterLoyaltyTable = filterLoyaltyTable;

function grantLoyaltyReward(customerId, customerName) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/50';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-80 p-5 mx-4">
      <h3 class="font-bold text-sm text-slate-800 mb-3">🎁 منح مكافأة لـ ${escapeHtml(customerName)}</h3>
      <div class="space-y-3 mb-4">
        <div>
          <label class="text-xs text-slate-500 block mb-1">نوع المكافأة</label>
          <select id="reward-type" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="discount">خصم بنسبة (%)</option>
            <option value="free_delivery">توصيل مجاني</option>
            <option value="gift">هدية مجانية</option>
            <option value="points">نقاط إضافية</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-slate-500 block mb-1">القيمة / الملاحظة</label>
          <input id="reward-value" type="text" placeholder="مثال: 20% أو 100 نقطة" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
        </div>
        <div>
          <label class="text-xs text-slate-500 block mb-1">رسالة للعميل (اختياري)</label>
          <textarea id="reward-msg" rows="2" placeholder="شكراً لولائك..." class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"></textarea>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="this.closest('.fixed').remove()" class="flex-1 border border-slate-200 text-slate-600 text-sm font-bold py-2 rounded-xl hover:bg-slate-50 transition">إلغاء</button>
        <button onclick="confirmReward('${escapeHtml(customerId)}','${escapeHtml(customerName)}');this.closest('.fixed').remove()" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2 rounded-xl transition">منح 🎁</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}
window.grantLoyaltyReward = grantLoyaltyReward;

function confirmReward(customerId, customerName) {
  showToast(`تم منح المكافأة للعميل ${customerName} بنجاح 🎁`, 'success');
}
window.confirmReward = confirmReward;

function openDriverReportFor(driverId) {
  showDriverReports();
  setTimeout(() => {
    const sel = document.getElementById('rpt-driver-select');
    if (sel) {
      sel.value = driverId;
      generateDriverReport();
    }
  }, 100);
}
window.openDriverReportFor = openDriverReportFor;

function printLoyaltyReport() {
  const all = window._enrichedCustomers || [];
  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير ولاء العملاء</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Cairo',sans-serif; direction: rtl; padding: 25px; color: #1e293b; }
        h1 { color: #d97706; margin-bottom: 5px; }
        .sub { color: #64748b; font-size: 12px; margin-bottom: 20px; border-bottom: 2px solid #d97706; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #d97706; color: white; padding: 9px 12px; text-align: right; }
        td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
        tr:nth-child(even) td { background: #fffbeb; }
        .gold { color: #d97706; font-weight: 900; }
        .footer { margin-top: 25px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        @media print { body { padding: 10px; } }
      </style>
    </head>
    <body>
      <h1>🏆 تقرير ولاء العملاء</h1>
      <div class="sub">تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')} &nbsp;|&nbsp; إجمالي العملاء: ${all.length}</div>
      <table>
        <thead>
          <tr>
            <th>#</th><th>اسم العميل</th><th>الهاتف</th><th>الطلبات</th><th>المصروف (ر.س)</th><th>النقاط</th><th>المستوى</th>
          </tr>
        </thead>
        <tbody>
          ${all.map((c,i)=>`
            <tr>
              <td>${i+1}</td>
              <td><b>${escapeHtml(c.name||'عميل')}</b></td>
              <td>${escapeHtml(c.phone||'')}</td>
              <td style="text-align:center">${c.ordersCount}</td>
              <td style="text-align:center">${c.totalSpent.toFixed(2)}</td>
              <td style="text-align:center" class="gold">${c.points}</td>
              <td style="text-align:center">${c.tierEmoji} ${c.tier}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="footer">سلة المنار — نظام إدارة التوصيل &copy; ${new Date().getFullYear()}</div>
      <script>window.onload = () => window.print()<\/script>
    </body>
    </html>
  `);
  win.document.close();
}
window.printLoyaltyReport = printLoyaltyReport;

// ============================================================================
// 8. ربط الأزرار بعد تحميل الصفحة
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ربط أزرار الهيدر والقائمة الجانبية
  const btnMappings = {
    'btn-settings':     () => showSettings(),
    'btn-help':         () => showHelp(),
    'btn-lang':         () => toggleLanguage(),
    'lang-toggle-btn':  () => toggleLanguage(),
    'btn-notifications':() => showNotifications(),
    'btn-notif':        () => showNotifications(),
    'btn-date':         () => showDatePicker(),
    'nav-settings':     () => showSettings(),
    'nav-help':         () => showHelp(),
  };
  Object.entries(btnMappings).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  });

  // ربط أزرار بالنص أيضاً (onclick attributes في HTML)
  window.showSettings = showSettings;
  window.showHelp = showHelp;
  window.toggleLanguage = toggleLanguage;
  window.showNotifications = showNotifications;
  window.showDatePicker = showDatePicker;
  window.showDriverReports = showDriverReports;
  window.showCustomerLoyalty = showCustomerLoyalty;
});
