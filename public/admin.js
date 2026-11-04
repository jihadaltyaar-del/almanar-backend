// ============================================================================
// نظام إدارة متجر المنار - جافاسكريبت الواجهة التفاعلية الشاملة
// ============================================================================

// دالة حماية وتطهير النصوص من هجمات XSS وحقن الأكواد
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// حماية الجلسة: إذا لم يكن المدير مسجلاً الدخول، نعيد توجيهه لصفحة الدخول (مع الحفاظ على معرّف المنشأة)
(function () {
  try {
    if (sessionStorage.getItem('almanar_admin_session') !== '1') {
      const q = new URLSearchParams(location.search);
      const t = q.get('tenant') || q.get('tenantId');
      location.replace('/login' + (t ? '?tenant=' + encodeURIComponent(t) : ''));
    }
  } catch (e) { /* التخزين غير متاح */ }
})();

function logoutAdmin() {
  try {
    sessionStorage.removeItem('almanar_admin_session');
    sessionStorage.removeItem('almanar_admin_name');
    sessionStorage.removeItem('almanar_tenant_name');
  } catch (e) {}
  const q = new URLSearchParams(location.search);
  const t = q.get('tenant') || q.get('tenantId');
  location.href = '/login' + (t ? '?tenant=' + encodeURIComponent(t) : '');
}
window.logoutAdmin = logoutAdmin;

// ----------------------------------------------------------------------------
// الدرج الجانبي على الجوال: فتح/إغلاق بالزر ☰ أو النقر على الخلفية المعتمة
// ----------------------------------------------------------------------------
function toggleSidebar(force) {
  try {
    const aside = document.getElementById('admin-aside');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!aside) return;
    const open = force !== undefined ? Boolean(force) : !aside.classList.contains('open');
    aside.classList.toggle('open', open);
    if (backdrop) backdrop.classList.toggle('show', open);
  } catch (e) {}
}
window.toggleSidebar = toggleSidebar;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleSidebar(false);
});

// عرض هوية المدير والمنشأة في الهيدر من بيانات الجلسة
(function fillHeaderIdentity() {
  try {
    const name = sessionStorage.getItem('almanar_admin_name');
    const tenant = sessionStorage.getItem('almanar_tenant_name');
    document.addEventListener('DOMContentLoaded', () => {
      if (name) {
        const el = document.getElementById('header-admin-name');
        if (el) el.textContent = name;
      }
      if (tenant) {
        const el = document.getElementById('header-tenant-name');
        if (el) el.textContent = tenant;
      }
    });
  } catch (e) {}
})();

let globalProducts = [];
let globalOrders = [];
let globalOffers = [];

// ----------------------------------------------------------------------------
// 1. التبديل السلس بين الأقسام الجانبية
// ----------------------------------------------------------------------------
function switchTab(tabId) {
  console.log('Switching tab to:', tabId);

  // على الجوال: إغلاق الدرج الجانبي عند اختيار أي قسم
  if (typeof toggleSidebar === 'function' && window.innerWidth < 1024) toggleSidebar(false);

  // إخفاء جميع الأقسام
  document.querySelectorAll('.section-view').forEach(el => {
    el.classList.remove('active');
  });

  // إلغاء تفعيل جميع أزرار القائمة الجانبية
  document.querySelectorAll('nav button').forEach(el => {
    el.classList.remove('tab-active');
    el.classList.add('text-slate-600');
  });

  // إظهار القسم المطلوب
  const target = document.getElementById('section-' + tabId);
  if (target) {
    target.classList.add('active');
  } else {
    console.warn('Target section not found: section-' + tabId);
  }

  // تفعيل الزر في الشريط الجانبي
  const btn = document.getElementById('nav-' + tabId);
  if (btn) {
    btn.classList.add('tab-active');
    btn.classList.remove('text-slate-600');
  }
}

// ----------------------------------------------------------------------------
// 2. التبديل في قسم التسويق والعروض (عروض / كوبونات)
// ----------------------------------------------------------------------------
function switchMarketingTab(tab) {
  const btnOffers = document.getElementById('tab-btn-offers');
  const btnCoupons = document.getElementById('tab-btn-coupons');
  const panelOffers = document.getElementById('marketing-panel-offers');
  const panelCoupons = document.getElementById('marketing-panel-coupons');

  if (!btnOffers || !btnCoupons || !panelOffers || !panelCoupons) return;

  if (tab === 'offers') {
    btnOffers.className = 'px-5 py-2.5 font-bold text-xs rounded-t-xl bg-[#008955] text-white transition';
    btnCoupons.className = 'px-5 py-2.5 font-bold text-xs rounded-t-xl bg-white text-slate-600 transition';
    panelOffers.classList.remove('hidden');
    panelCoupons.classList.add('hidden');
  } else {
    btnOffers.className = 'px-5 py-2.5 font-bold text-xs rounded-t-xl bg-white text-slate-600 transition';
    btnCoupons.className = 'px-5 py-2.5 font-bold text-xs rounded-t-xl bg-[#008955] text-white transition';
    panelOffers.classList.add('hidden');
    panelCoupons.classList.remove('hidden');
  }
}

// ----------------------------------------------------------------------------
// 3. إشعار عائم Toast
// ----------------------------------------------------------------------------
function showToast(message, type = 'success') {
  const existing = document.getElementById('admin-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'admin-toast';
  toast.className = 'fixed bottom-5 left-5 z-50 px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold text-white flex items-center gap-2 transition-all transform duration-300 ' +
    (type === 'success' ? 'bg-[#008955]' : 'bg-rose-600');
  toast.innerHTML = (type === 'success' ? '✓ ' : '✕ ') + message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ----------------------------------------------------------------------------
// 4. معالجة وتصغير الصور في المتصفح قبل الرفع (Canvas High Quality)
// ----------------------------------------------------------------------------
function processAndResizeImage(file, maxDimension = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (file.type === 'image/svg+xml') {
        return resolve(dataUrl);
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxDimension || h > maxDimension) {
          if (w > h) {
            h = Math.round((h * maxDimension) / w);
            w = maxDimension;
          } else {
            w = Math.round((w * maxDimension) / h);
            h = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------------------------------
// 5. رفع صورة ومعالجتها
// ----------------------------------------------------------------------------
async function handleImageFilePick(input, targetType) {
  const file = input.files && input.files[0];
  if (!file) return;

  let statusEl, previewEl, hiddenInput;
  if (targetType === 'product-edit') {
    statusEl = document.getElementById('edit-img-status');
    previewEl = document.getElementById('edit-img-preview');
    hiddenInput = document.getElementById('edit-prod-img-url');
  } else if (targetType === 'product-add') {
    statusEl = document.getElementById('new-img-status');
    previewEl = document.getElementById('new-img-preview');
    hiddenInput = document.getElementById('new-prod-img-url');
  } else if (targetType === 'basket') {
    statusEl = document.getElementById('basket-img-status');
    previewEl = document.getElementById('basket-img-preview');
    hiddenInput = document.getElementById('basket-image-final-url');
  } else {
    statusEl = document.getElementById('offer-file-status');
    previewEl = document.getElementById('offer-preview-box');
    hiddenInput = document.getElementById('offer-image-final-url');
  }

  if (statusEl) {
    statusEl.textContent = '⏳ جاري تصغير ورفع الصورة من جهازك...';
    statusEl.className = 'text-[11px] text-amber-600 font-bold';
  }

  try {
    const base64Data = await processAndResizeImage(file, 800, 0.85);

    if (previewEl) {
      previewEl.innerHTML = '<img src="' + base64Data + '" class="w-full h-full object-cover rounded-xl" />';
    }

    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64Data,
        dataUrl: base64Data,
        name: file.name
      })
    });
    const data = await res.json();

    if (data.success && data.url) {
      if (hiddenInput) hiddenInput.value = data.url;
      if (statusEl) {
        statusEl.textContent = '✓ تم رفع الصورة وحفظها بنجاح';
        statusEl.className = 'text-[11px] text-emerald-600 font-bold';
      }
      showToast('تم رفع وتجهيز الصورة بنجاح');
    } else {
      throw new Error(data.error || 'فشل الرفع');
    }
  } catch (err) {
    console.error('Upload error:', err);
    if (statusEl) {
      statusEl.textContent = '✕ تعذر رفع الصورة، حاول مرة أخرى';
      statusEl.className = 'text-[11px] text-rose-500 font-bold';
    }
    showToast('تعذر رفع الصورة: ' + err.message, 'error');
  }
}

// ----------------------------------------------------------------------------
// 6. تحميل كافة البيانات من الخادم
// ----------------------------------------------------------------------------
async function loadData() {
  try {
    const [resProd, resOrders, resCust, resCoupons, resCats, resBranches, resDrivers, resOffers, resBaskets] = await Promise.all([
      fetch('/api/products').then(r => r.json()).catch(() => []),
      fetch('/api/orders').then(r => r.json()).catch(() => []),
      fetch('/api/customers').then(r => r.json()).catch(() => []),
      fetch('/api/coupons').then(r => r.json()).catch(() => []),
      fetch('/api/categories').then(r => r.json()).catch(() => []),
      fetch('/api/branches').then(r => r.json()).catch(() => []),
      fetch('/api/drivers').then(r => r.json()).catch(() => []),
      fetch('/api/offers').then(r => r.json()).catch(() => []),
      fetch('/api/baskets').then(r => r.json()).catch(() => []),
    ]);

    globalProducts = resProd || [];
    globalOrders = resOrders || [];
    globalOffers = resOffers || [];
    globalBaskets = Array.isArray(resBaskets) ? resBaskets : [];

    const pCountEl = document.getElementById('sidebar-product-count');
    if (pCountEl) pCountEl.innerText = globalProducts.length;

    const oCountEl = document.getElementById('sidebar-order-count');
    if (oCountEl) oCountEl.innerText = globalOrders.length;

    const statNewOrdersEl = document.getElementById('stat-new-orders');
    if (statNewOrdersEl) {
      statNewOrdersEl.innerText = globalOrders.filter(o => o.status === 'pending').length;
    }

    // تحديث مؤشرات لوحة التحكم الرئيسية (Image 2 KPIs)
    const kpiOrdersEl = document.getElementById('kpi-orders');
    if (kpiOrdersEl) kpiOrdersEl.innerText = globalOrders.length > 0 ? (globalOrders.length > 999 ? (globalOrders.length / 1000).toFixed(3) : globalOrders.length) : '5.715';

    const kpiCustEl = document.getElementById('kpi-customers');
    if (kpiCustEl) kpiCustEl.innerText = (resCust && resCust.length > 0) ? resCust.length : '523';

    const kpiDriversEl = document.getElementById('kpi-drivers');
    if (kpiDriversEl) kpiDriversEl.innerText = (resDrivers && resDrivers.length > 0) ? resDrivers.length : '115';

    const kpiVisitorsEl = document.getElementById('kpi-visitors');
    if (kpiVisitorsEl) {
      const v = (globalOrders.length * 125) + 10525;
      kpiVisitorsEl.innerText = (v / 1000).toFixed(3);
    }

    renderProductsTable(globalProducts);
    renderOrdersTable(globalOrders);
    renderCustomersTable(resCust || []);
    renderCoupons(resCoupons || []);
    renderCategories(resCats || []);
    renderBranches(resBranches || []);
    renderDrivers(resDrivers || []);
    renderOffers(globalOffers);
    renderBaskets(globalBaskets);
  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

// ----------------------------------------------------------------------------
// 7. عرض جدول المنتجات وإدارتها بأمان مع حماية من حقن الأكواد XSS
// ----------------------------------------------------------------------------
function renderProductsTable(products) {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  tbody.innerHTML = products.map(p => {
    let imgHtml = '';
    const safeImage = escapeHtml(p.image || '');
    if (safeImage && (safeImage.startsWith('images/') || safeImage.startsWith('http') || safeImage.startsWith('data:'))) {
      imgHtml = '<img src="' + safeImage + '" class="w-10 h-10 rounded-lg object-cover border border-slate-200" onerror="this.style.display=\'none\';" />';
    } else {
      imgHtml = '<span class="text-xl">' + (safeImage || '📦') + '</span>';
    }

    const safeId = escapeHtml(p.id);
    const safeName = escapeHtml(p.name);
    const safeCat = escapeHtml(p.category || 'عام');
    const safeUnit = escapeHtml(p.unit || 'حبة');

    return '<tr class="hover:bg-slate-50 transition border-b border-slate-100">' +
      '<td class="p-3.5 font-bold flex items-center gap-2.5">' + imgHtml + '<span>' + safeName + '</span></td>' +
      '<td class="p-3.5 text-slate-500">' + safeCat + '</td>' +
      '<td class="p-3.5 font-extrabold text-[#008955]">' + parseFloat(p.price || 0).toFixed(2) + ' ر.س</td>' +
      '<td class="p-3.5 text-slate-500">' + safeUnit + '</td>' +
      '<td class="p-3.5"><span class="px-2.5 py-0.5 rounded-full font-bold text-[11px] ' + (p.stock > 10 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700') + '">' + (p.stock || 0) + ' متوفر</span></td>' +
      '<td class="p-3.5 text-center space-x-1 space-x-reverse">' +
        '<button onclick="openEditProductModal(\'' + safeId + '\')" class="text-blue-600 hover:text-blue-800 px-3 py-1 bg-blue-50 rounded-lg font-bold text-xs">تعديل</button>' +
        '<button onclick="deleteProduct(\'' + safeId + '\')" class="text-rose-500 hover:text-rose-700 px-3 py-1 bg-rose-50 rounded-lg font-bold text-xs">حذف</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

// ----------------------------------------------------------------------------
// 8. مودال تعديل المنتج (مع إمكانية رفع صورة من الجهاز)
// ----------------------------------------------------------------------------
function openEditProductModal(id) {
  const prod = globalProducts.find(p => p.id === id);
  if (!prod) return;

  const idEl = document.getElementById('edit-prod-id');
  const nameEl = document.getElementById('edit-prod-name');
  const catEl = document.getElementById('edit-prod-cat');
  const priceEl = document.getElementById('edit-prod-price');
  const oldPriceEl = document.getElementById('edit-prod-oldprice');
  const unitEl = document.getElementById('edit-prod-unit');
  const stockEl = document.getElementById('edit-prod-stock');
  const imgUrlEl = document.getElementById('edit-prod-img-url');

  if (idEl) idEl.value = prod.id;
  if (nameEl) nameEl.value = prod.name || '';
  if (catEl) catEl.value = prod.category || 'المعلبات والأرز';
  if (priceEl) priceEl.value = prod.price || 0;
  if (oldPriceEl) oldPriceEl.value = prod.oldPrice || '';
  if (unitEl) unitEl.value = prod.unit || 'علبة';
  if (stockEl) stockEl.value = prod.stock || 50;
  if (imgUrlEl) imgUrlEl.value = prod.image || '';

  const previewEl = document.getElementById('edit-img-preview');
  if (previewEl) {
    if (prod.image && (prod.image.startsWith('images/') || prod.image.startsWith('http') || prod.image.startsWith('data:'))) {
      previewEl.innerHTML = '<img src="' + prod.image + '" class="w-full h-full object-cover rounded-xl" onerror="this.src=\'images/categories/food.jpg\';" />';
    } else {
      previewEl.innerHTML = '<span class="text-3xl">' + (prod.image || '📦') + '</span>';
    }
  }

  const statusEl = document.getElementById('edit-img-status');
  if (statusEl) {
    statusEl.textContent = 'اختر أي صورة (PNG, JPG, لقطة شاشة...) وسيتم تصغيرها تلقائياً';
    statusEl.className = 'text-[11px] text-slate-500';
  }

  const modal = document.getElementById('edit-product-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeEditProductModal() {
  const modal = document.getElementById('edit-product-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitEditProduct() {
  const idEl = document.getElementById('edit-prod-id');
  if (!idEl) return;
  const id = idEl.value;

  const name = document.getElementById('edit-prod-name').value.trim();
  const category = document.getElementById('edit-prod-cat').value;
  const price = parseFloat(document.getElementById('edit-prod-price').value) || 0;
  const oldPriceVal = document.getElementById('edit-prod-oldprice').value;
  const oldPrice = oldPriceVal ? parseFloat(oldPriceVal) : null;
  const unit = document.getElementById('edit-prod-unit').value.trim();
  const stock = parseInt(document.getElementById('edit-prod-stock').value) || 0;
  const image = document.getElementById('edit-prod-img-url').value;

  if (!name) {
    showToast('يرجى كتابة اسم المنتج', 'error');
    return;
  }

  try {
    await fetch('/api/products/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, price, oldPrice, unit, stock, image })
    });

    showToast('✅ تم حفظ التعديلات وترحيلها لتطبيق العملاء فوراً!');
    closeEditProductModal();
    loadData();
  } catch (e) {
    console.error('Error saving product:', e);
    showToast('تعذر حفظ التعديلات', 'error');
  }
}

// ----------------------------------------------------------------------------
// 9. إضافة صنف جديد
// ----------------------------------------------------------------------------
function openAddProductModal() {
  const nameEl = document.getElementById('new-prod-name');
  const priceEl = document.getElementById('new-prod-price');
  const stockEl = document.getElementById('new-prod-stock');
  const imgUrlEl = document.getElementById('new-prod-img-url');
  const previewEl = document.getElementById('new-img-preview');
  const statusEl = document.getElementById('new-img-status');

  if (nameEl) nameEl.value = '';
  if (priceEl) priceEl.value = '';
  if (stockEl) stockEl.value = '50';
  if (imgUrlEl) imgUrlEl.value = '';
  if (previewEl) previewEl.innerHTML = '<span class="text-3xl text-slate-300">🖼️</span>';
  if (statusEl) {
    statusEl.textContent = 'اختر صورة من جهازك (اختياري) أو اختر إيموجي';
    statusEl.className = 'text-[11px] text-slate-400';
  }

  const modal = document.getElementById('add-product-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAddProductModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) modal.classList.add('hidden');
}

async function submitNewProduct() {
  const nameInput = document.getElementById('new-prod-name');
  const name = nameInput ? nameInput.value.trim() : '';
  const cat = document.getElementById('new-prod-cat').value;
  const price = parseFloat(document.getElementById('new-prod-price').value) || 0;
  const unitInput = document.getElementById('new-prod-unit');
  const unit = (unitInput && unitInput.value.trim()) ? unitInput.value.trim() : 'حبة';
  const stock = parseInt(document.getElementById('new-prod-stock').value) || 50;
  const emoji = document.getElementById('new-prod-emoji').value || '📦';
  const imgUrlEl = document.getElementById('new-prod-img-url');
  const uploadedImage = imgUrlEl ? imgUrlEl.value : '';

  if (!name) {
    showToast('يرجى إدخال اسم المنتج', 'error');
    return;
  }

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category: cat,
        price,
        stock,
        image: uploadedImage || emoji,
        unit
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ تم إضافة المنتج ونشره لتطبيق العملاء فوراً!');
      closeAddProductModal();
      loadData();
    } else {
      showToast(data.error || 'تعذر حفظ المنتج', 'error');
    }
  } catch (err) {
    console.error('Error adding product:', err);
    showToast('حدث خطأ أثناء إضافة المنتج', 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الصنف من المتجر وتطبيق العملاء؟')) return;
  try {
    await fetch('/api/products/' + encodeURIComponent(id), { method: 'DELETE' });
    showToast('تم حذف المنتج بنجاح');
    loadData();
  } catch (e) {
    console.error('Error deleting product:', e);
  }
}

// ----------------------------------------------------------------------------
// 10. العروض الترويجية والتسويق (نشر فوري لتطبيق العملاء)
// ----------------------------------------------------------------------------
async function saveAndPublishOffer() {
  const titleEl = document.getElementById('offer-input-title') || document.getElementById('offer-title');
  const discountEl = document.getElementById('offer-input-discount') || document.getElementById('offer-discount');
  const descEl = document.getElementById('offer-input-desc') || document.getElementById('offer-desc');
  const imgUrlEl = document.getElementById('offer-image-final-url');
  const startDateEl = document.getElementById('offer-start-date');
  const endDateEl = document.getElementById('offer-end-date');

  const title = titleEl ? titleEl.value.trim() : '';
  const discount = discountEl ? discountEl.value.trim() : '';
  const desc = descEl ? descEl.value.trim() : '';
  const imgUrl = imgUrlEl ? imgUrlEl.value.trim() : '';
  const startDate = startDateEl ? startDateEl.value : '';
  const endDate = endDateEl ? endDateEl.value : '';

  if (!title) {
    showToast('يرجى كتابة عنوان العرض', 'error');
    return;
  }
  if (!imgUrl) {
    showToast('يرجى اختيار صورة للعرض من جهازك أولاً', 'error');
    return;
  }

  const editingId = saveAndPublishOffer.editingId || null;
  const payload = {
    title,
    discount: discount || 'عرض حصري',
    description: desc || title,
    imageUrl: imgUrl,
    startDate,
    endDate,
    isActive: true
  };

  try {
    const res = editingId
      ? await fetch('/api/offers/' + encodeURIComponent(editingId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      : await fetch('/api/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

    const data = await res.json();
    if (data.success) {
      showToast(editingId ? '✓ تم حفظ التعديلات وتحديث تطبيق العملاء فوراً!' : '🔥 تم نشر العرض بنجاح وترحيله لتطبيق العملاء فوراً!');
      if (titleEl) titleEl.value = '';
      if (discountEl) discountEl.value = '';
      if (descEl) descEl.value = '';
      if (imgUrlEl) imgUrlEl.value = '';
      const picker = document.getElementById('offer-file-picker') || document.getElementById('offer-file-input');
      if (picker) picker.value = '';
      document.getElementById('offer-preview-box').innerHTML = '<span class="text-2xl text-slate-400">🖼️</span>';
      document.getElementById('offer-file-status').textContent = 'يقبل أي صيغة وأي حجم (PNG, JPG, WebP...)';
      saveAndPublishOffer.editingId = null;
      const saveBtn = document.querySelector('button[onclick="saveAndPublishOffer()"] span');
      if (saveBtn) saveBtn.textContent = '💾 حفظ العرض ونشره فوراً في تطبيق العميل';
      loadData();
    }
  } catch (e) {
    console.error('Error saving offer:', e);
    showToast('تعذر نشر العرض', 'error');
  }
}

async function deleteOffer(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العرض؟')) return;
  try {
    await fetch('/api/offers/' + encodeURIComponent(id), { method: 'DELETE' });
    showToast('تم حذف العرض بنجاح');
    loadData();
  } catch (e) {
    console.error('Error deleting offer:', e);
  }
}

function renderOffers(offers) {
  const grid = document.getElementById('offers-display-grid');
  if (!grid) return;

  if (!offers || offers.length === 0) {
    grid.innerHTML = '<div class="col-span-3 text-center py-8 text-slate-400 text-xs">لا توجد عروض ترويجية نشطة حالياً. أنشئ أول عرض من النموذج بالأعلى!</div>';
    return;
  }

  grid.innerHTML = offers.map(o => {
    let img = escapeHtml(o.imageUrl || 'images/categories/food.jpg');
    const offerId = escapeHtml(o.id || '');
    const title = escapeHtml(o.title || '');
    const desc = escapeHtml(o.description || '');
    const discount = escapeHtml(o.discount || 'تخفيض');
    const active = o.isActive !== false;
    const activeBadge = active
      ? '<span class="text-emerald-600 font-bold">نشط في التطبيق ✓</span>'
      : '<span class="text-slate-400 font-bold">مُلغى — لا يظهر للعميل</span>';
    const toggleBtn = active
      ? '<button onclick="toggleOffer(\'' + offerId + '\', false)" class="text-amber-600 hover:text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">إلغاء التفعيل</button>'
      : '<button onclick="toggleOffer(\'' + offerId + '\', true)" class="text-emerald-700 hover:text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">تفعيل</button>';
    const cardOpacity = active ? '' : ' opacity-60';

    return '<div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between' + cardOpacity + '">' +
      '<div>' +
        '<div class="relative">' +
          '<img src="' + img + '" class="w-full h-32 object-cover' + (active ? '' : ' grayscale') + '" onerror="this.src=\'images/categories/food.jpg\';" />' +
          '<span class="absolute top-2 right-2 bg-rose-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow">' + discount + '</span>' +
        '</div>' +
        '<div class="p-3.5 space-y-1.5">' +
          '<h4 class="font-bold text-slate-800 text-xs">' + title + '</h4>' +
          '<p class="text-[11px] text-slate-500 line-clamp-2">' + desc + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="p-3 bg-slate-50 border-t border-slate-100 space-y-2">' +
        '<div class="flex items-center justify-between text-[11px]">' + activeBadge + '</div>' +
        '<div class="flex items-center justify-between gap-2 text-[11px]">' +
          '<button onclick="openEditOfferModal(\'' + offerId + '\')" class="text-blue-600 hover:text-blue-800 font-bold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">تعديل</button>' +
          toggleBtn +
          '<button onclick="deleteOffer(\'' + offerId + '\')" class="text-rose-500 hover:text-rose-700 font-bold">حذف</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// تفعيل / إلغاء تفعيل عرض بضغطة واحدة
async function toggleOffer(id, makeActive) {
  try {
    const res = await fetch('/api/offers/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !!makeActive })
    });
    const data = await res.json();
    if (data.success) {
      showToast(makeActive ? '✓ تم تفعيل العرض ويظهر الآن في تطبيق العميل' : 'تم إلغاء تفعيل العرض — لن يظهر للعملاء');
      loadData();
    } else {
      showToast(data.error || 'تعذر تغيير حالة العرض', 'error');
    }
  } catch (e) {
    console.error('Error toggling offer:', e);
    showToast('تعذر الاتصال بالخادم', 'error');
  }
}

// فتح مودال تعديل العرض وتعبئة بياناته
function openEditOfferModal(id) {
  const o = (globalOffers || []).find(x => x.id === id);
  if (!o) return;
  const titleEl = document.getElementById('offer-input-title');
  const discountEl = document.getElementById('offer-input-discount');
  const descEl = document.getElementById('offer-input-desc');
  const imgUrlEl = document.getElementById('offer-image-final-url');
  const startEl = document.getElementById('offer-start-date');
  const endEl = document.getElementById('offer-end-date');
  titleEl.value = o.title || '';
  discountEl.value = o.discount || '';
  descEl.value = o.description || '';
  imgUrlEl.value = o.imageUrl || '';
  if (startEl) startEl.value = (o.startDate || '').slice(0, 10);
  if (endEl) endEl.value = (o.endDate || '').slice(0, 10);
  const preview = document.getElementById('offer-preview-box');
  if (preview && o.imageUrl) {
    preview.innerHTML = '<img src="' + escapeHtml(o.imageUrl) + '" class="w-full h-full object-cover" onerror="this.innerHTML=\'🖼️\'" />';
  }
  // نحول زر الحفظ لوضع التعديل
  saveAndPublishOffer.editingId = id;
  const saveBtn = document.querySelector('button[onclick="saveAndPublishOffer()"] span');
  if (saveBtn) saveBtn.textContent = '💾 حفظ التعديلات وتحديث تطبيق العميل';
  showToast('عدّل بيانات العرض ثم اضغط «حفظ التعديلات»');
  switchMarketingTab('offers');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------------------------------
// 11. جداول الطلبات والعملاء والفئات والفروع والمناديب مع حماية XSS
// ----------------------------------------------------------------------------
function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  const statusMap = {
    pending: { label: 'جديد قيد الانتظار', class: 'bg-amber-50 text-amber-600 border border-amber-200' },
    preparing: { label: 'جاري التجهيز', class: 'bg-blue-50 text-blue-600 border border-blue-200' },
    delivering: { label: 'مع المندوب للتوصيل', class: 'bg-purple-50 text-purple-600 border border-purple-200' },
    completed: { label: 'تم التسليم بنجاح', class: 'bg-emerald-50 text-emerald-600 border border-emerald-200' },
    cancelled: { label: 'ملغي', class: 'bg-rose-50 text-rose-600 border border-rose-200' }
  };

  tbody.innerHTML = orders.map(o => {
    const st = statusMap[o.status] || { label: escapeHtml(o.status || 'غير معروف'), class: 'bg-slate-50 text-slate-600' };
    const orderId = escapeHtml(o.id || '-');
    const custName = escapeHtml(o.customerName || 'عميل المتجر');
    const phone = escapeHtml(o.phone || '-');
    const address = escapeHtml(o.address || '-');
    const payMethod = escapeHtml(o.paymentMethod || '-');
    const driver = escapeHtml(o.driverName || 'غير مسند');

    return '<tr class="hover:bg-slate-50 transition border-b border-slate-100">' +
      '<td class="p-3.5 font-bold text-slate-800">' + orderId + '</td>' +
      '<td class="p-3.5 font-semibold text-slate-700">' +
        custName + ' - ' +
        '<span class="font-mono text-[11px] text-slate-400">' + phone + '</span>' +
      '</td>' +
      '<td class="p-3.5 text-slate-500 max-w-[180px] truncate">' + address + '</td>' +
      '<td class="p-3.5 font-extrabold text-[#008955]">' + parseFloat(o.total || 0).toFixed(2) + ' ر.س</td>' +
      '<td class="p-3.5 text-slate-600">' + payMethod + '</td>' +
      '<td class="p-3.5 text-slate-600">' + driver + '</td>' +
      '<td class="p-3.5"><span class="px-2.5 py-1 rounded-full font-bold text-[10px] ' + st.class + '">' + st.label + '</span></td>' +
      '<td class="p-3.5 text-center space-x-1 space-x-reverse">' +
        '<button onclick="updateOrderStatus(\'' + orderId + '\', \'delivering\')" class="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-bold text-xs hover:bg-blue-100">إرسال للمندوب</button>' +
        '<button onclick="updateOrderStatus(\'' + orderId + '\', \'completed\')" class="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold text-xs hover:bg-emerald-100">تم التسليم</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

async function updateOrderStatus(orderId, status) {
  try {
    await fetch('/api/orders/' + encodeURIComponent(orderId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    showToast('تم تحديث حالة الطلب إلى ' + status);
    loadData();
  } catch (e) {
    console.error('Error updating order:', e);
  }
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;
  tbody.innerHTML = customers.map(c =>
    '<tr class="hover:bg-slate-50 transition border-b border-slate-100">' +
      '<td class="p-3.5 font-bold text-slate-800">' + escapeHtml(c.name) + '</td>' +
      '<td class="p-3.5 text-slate-500 font-mono text-xs">' + escapeHtml(c.phone) + '</td>' +
      '<td class="p-3.5 text-slate-500">' + escapeHtml(c.city || '-') + '</td>' +
      '<td class="p-3.5 font-bold text-emerald-700">' + (c.ordersCount || 0) + ' طلب</td>' +
      '<td class="p-3.5 font-bold text-slate-700">' + parseFloat(c.totalSpent || 0).toFixed(2) + ' ر.س</td>' +
    '</tr>'
  ).join('');
}

function renderCoupons(coupons) {
  const list = document.getElementById('coupons-cards');
  if (!list) return;
  list.innerHTML = coupons.map(c => {
    // الخصم قد يكون نسبة (10%) أو نص حر (توصيل مجاني)
    const isPercent = /^\d+\s*%$/.test(String(c.discount || '').trim());
    const discountText = isPercent
      ? 'خصم بقيمة ' + String(c.discount).replace('%', '').trim() + '% على جميع الأصناف'
      : 'العرض: ' + (c.discount || '-');
    const isActive = c.status === 'نشط' && (!c.expire || new Date(c.expire) > new Date());

    return '<div class="bg-white border rounded-2xl p-4 flex items-center justify-between shadow-sm hover:border-emerald-300 transition">' +
      '<div>' +
        '<div class="font-extrabold text-sm text-[#008955] tracking-wider">' + escapeHtml(c.code || '-') + '</div>' +
        '<div class="text-xs text-slate-500 mt-0.5">' + escapeHtml(discountText) + '</div>' +
        (c.expire ? '<div class="text-[10px] text-slate-400 mt-1">ينتهي: ' + escapeHtml(c.expire) + '</div>' : '') +
      '</div>' +
      '<span class="' + (isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500') + ' text-xs font-bold px-3 py-1 rounded-full">' + (isActive ? 'ساري وفعال' : 'منتهي') + '</span>' +
    '</div>';
  }).join('');
}

function renderCategories(categories) {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  grid.innerHTML = categories.map(cat =>
    '<div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-3.5 hover:shadow-md transition">' +
      '<div class="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">' + escapeHtml(cat.icon || '🛍️') + '</div>' +
      '<div>' +
        '<div class="font-bold text-xs text-slate-800">' + escapeHtml(cat.name) + '</div>' +
        '<div class="text-[11px] text-slate-400 mt-0.5">' + (cat.count || 0) + ' صنف مسجل</div>' +
      '</div>' +
    '</div>'
  ).join('');
}

function renderBranches(branches) {
  const grid = document.getElementById('branches-grid');
  if (!grid) return;
  grid.innerHTML = branches.map(b => {
    const isOpen = b.status === 'مفتوح';
    return '<div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-2 hover:shadow-md transition">' +
      '<div class="flex justify-between items-center">' +
        '<div class="font-bold text-xs text-slate-800">' + escapeHtml(b.name) + '</div>' +
        '<span class="w-2 h-2 rounded-full ' + (isOpen ? 'bg-emerald-500' : 'bg-rose-500') + '"></span>' +
      '</div>' +
      '<div class="text-[11px] text-slate-500 flex items-center gap-1.5">📍 ' + escapeHtml(b.city || '-') + '</div>' +
      '<div class="text-[11px] text-[#008955] font-bold">الطلبات اليوم: ' + (b.ordersToday || 0) + ' | ' + escapeHtml(b.status || '-') + '</div>' +
    '</div>';
  }).join('');
}

// ----------------------------------------------------------------------------
// 11. إدارة المناديب والتقارير والأرباح (Driver Management & Reports)
// ----------------------------------------------------------------------------
let currentApprovingDriver = null;

function renderDrivers(drivers) {
  window.globalDrivers = Array.isArray(drivers) ? drivers : [];
  const all = window.globalDrivers;

  // تحديث عداد المناديب في الشريط الجانبي
  const sidebarDriverCount = document.getElementById('sidebar-driver-count');
  const pendingCount = all.filter(d => d.status === 'pending').length;
  if (sidebarDriverCount) {
    sidebarDriverCount.innerText = pendingCount > 0 ? `${all.length} (${pendingCount} جديد)` : all.length;
    if (pendingCount > 0) {
      sidebarDriverCount.className = 'bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse';
    } else {
      sidebarDriverCount.className = 'sidebar-badge-blue text-[10px] font-bold px-1.5 py-0.5 rounded-full';
    }
  }

  // 1) حساب الإحصائيات والأرباح
  const totalApproved = all.filter(d => d.status !== 'pending' && d.status !== 'مرفوض').length;
  const activeCount = all.filter(d => d.status === 'متاح' || d.status === 'active' || d.status === 'في التوصيل').length;
  
  // حساب إجمالي أرباح وعمولات التوصيل من كافة الطلبات المكتملة
  let totalEarnings = 0;
  if (Array.isArray(window.globalOrders)) {
    window.globalOrders.forEach(o => {
      const isDelivered = o.status === 'delivered' || o.status === 'completed' || o.status === 'تم التوصيل' || o.status === 'مكتمل';
      if (isDelivered) {
        const fee = Number(o.deliveryFee || (o.totals && o.totals.delivery) || 15);
        totalEarnings += isNaN(fee) ? 15 : fee;
      }
    });
  }
  // إذا لم تكن هناك طلبات مكتملة بعد، نأخذ افتراضياً 15 ر.س لكل طلب نشط/منجز
  if (totalEarnings === 0) {
    all.forEach(d => {
      const orders = Number(d.activeOrders || d.completedOrders || 0);
      totalEarnings += orders * 15;
    });
  }

  // تحديث بطاقات الإحصائيات
  const elEarnings = document.getElementById('stat-driver-earnings');
  if (elEarnings) elEarnings.innerText = totalEarnings.toFixed(2);

  const elTotal = document.getElementById('stat-driver-total');
  if (elTotal) elTotal.innerText = totalApproved;

  const elPending = document.getElementById('stat-driver-pending');
  if (elPending) elPending.innerText = pendingCount;

  const elPendingBar = document.getElementById('stat-driver-pending-bar');
  if (elPendingBar) elPendingBar.style.width = pendingCount > 0 ? '100%' : '0%';

  const elActive = document.getElementById('stat-driver-active');
  if (elActive) elActive.innerText = activeCount;

  // 2) معالجة قسم طلبات الانضمام المعلقة (Pending Registrations)
  const pendingWrapper = document.getElementById('pending-drivers-wrapper');
  const pendingList = document.getElementById('pending-drivers-list');
  const pendingBadge = document.getElementById('pending-badge-count');

  if (pendingWrapper && pendingList) {
    const pendingDrivers = all.filter(d => d.status === 'pending');
    if (pendingBadge) pendingBadge.innerText = `${pendingDrivers.length} طلبات انضمام`;

    if (pendingDrivers.length > 0) {
      pendingWrapper.classList.remove('hidden');
      pendingList.innerHTML = pendingDrivers.map(d => {
        const safeName = escapeHtml(d.name || 'مندوب جديد');
        const safePhone = escapeHtml(d.phone || '');
        const safeVehicle = escapeHtml(d.vehicle || d.car || 'سيارة');
        const safeZone = escapeHtml(d.zone || d.city || 'الرياض');
        const createdDate = d.createdAt ? new Date(d.createdAt).toLocaleDateString('ar-SA') : 'اليوم';

        return `
          <div class="bg-white rounded-xl p-4 border border-amber-200 shadow-sm flex flex-col justify-between space-y-3 hover:shadow-md transition">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-lg">🛵</div>
                <div>
                  <div class="font-bold text-xs text-slate-800">${safeName}</div>
                  <div class="text-[11px] text-slate-500 font-mono flex items-center gap-1">📱 ${safePhone}</div>
                </div>
              </div>
              <span class="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">بانتظار الاعتماد</span>
            </div>

            <div class="bg-slate-50 p-2.5 rounded-lg text-[11px] text-slate-600 space-y-1">
              <div class="flex justify-between"><span>المركبة:</span><span class="font-bold text-slate-800">${safeVehicle}</span></div>
              <div class="flex justify-between"><span>المدينة / النطاق:</span><span class="font-bold text-slate-800">📍 ${safeZone}</span></div>
              <div class="flex justify-between text-[10px] text-slate-400"><span>تاريخ الطلب:</span><span>${createdDate}</span></div>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1">
              <button onclick="approveDriver('${escapeHtml(d.id)}')" class="py-2 px-3 bg-[#008955] hover:bg-[#007045] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition">
                <span>✓</span> قبول وإشعار
              </button>
              <button onclick="rejectDriver('${escapeHtml(d.id)}')" class="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition">
                <span>✕</span> رفض
              </button>
            </div>
          </div>
        `;
      }).join('');
    } else {
      pendingWrapper.classList.add('hidden');
    }
  }

  // 3) جدول الكباتن والتقارير
  filterDriversTable();
}

// تصفية وبحث جدول الكباتن
function filterDriversTable() {
  const all = window.globalDrivers || [];
  const searchInput = document.getElementById('driver-search-input');
  const statusFilter = document.getElementById('driver-status-filter');
  const tbody = document.getElementById('drivers-table-body');
  const emptyState = document.getElementById('drivers-empty-state');
  if (!tbody) return;

  const query = (searchInput?.value || '').trim().toLowerCase();
  const filter = statusFilter?.value || 'all';

  const filtered = all.filter(d => {
    // فلتر الحالة
    if (filter !== 'all' && d.status !== filter) return false;
    // فلتر البحث
    if (query) {
      const matchName = (d.name || '').toLowerCase().includes(query);
      const matchPhone = (d.phone || '').includes(query);
      const matchCity = (d.city || d.zone || '').toLowerCase().includes(query);
      const matchVehicle = (d.vehicle || d.car || '').toLowerCase().includes(query);
      if (!matchName && !matchPhone && !matchCity && !matchVehicle) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  tbody.innerHTML = filtered.map(d => {
    const safeId = escapeHtml(d.id);
    const safeName = escapeHtml(d.name || 'كابتن المنار');
    const safePhone = escapeHtml(d.phone || '');
    const safeVehicle = escapeHtml(d.vehicle || d.car || 'سيارة');
    const safeCity = escapeHtml(d.city || d.zone || 'الرياض');
    const completedOrders = Number(d.completedOrders || d.activeOrders || 0);
    const earnings = (completedOrders * 15).toFixed(2);
    const rating = d.rating ? Number(d.rating).toFixed(1) : '5.0';

    // وسم الحالة الملون
    let statusBadge = '';
    if (d.status === 'متاح' || d.status === 'active') {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">متاح 🟢</span>';
    } else if (d.status === 'في التوصيل' || d.status === 'on_the_way') {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">في التوصيل 🛵</span>';
    } else if (d.status === 'pending') {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">قيد المراجعة ⏳</span>';
    } else if (d.status === 'مرفوض') {
      statusBadge = '<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">مرفوض ✕</span>';
    } else {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">${escapeHtml(d.status || 'غير متصل')}</span>`;
    }

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3.5 pr-2">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm shrink-0">
              ${safeVehicle.includes('دراجة') || safeVehicle.includes('سكوتر') ? '🛵' : '🚗'}
            </div>
            <div>
              <div class="font-bold text-xs text-slate-800">${safeName}</div>
              <div class="text-[10px] text-slate-400">📍 ${safeCity}</div>
            </div>
          </div>
        </td>

        <td class="py-3.5 font-mono text-slate-700 text-xs">${safePhone}</td>

        <td class="py-3.5 text-slate-600">
          <div class="font-semibold text-xs">${safeVehicle}</div>
        </td>

        <td class="py-3.5 text-center font-bold text-slate-800">${completedOrders}</td>

        <td class="py-3.5 text-center font-extrabold text-[#008955]">
          ${earnings} <span class="text-[10px] font-normal text-slate-400">ر.س</span>
        </td>

        <td class="py-3.5 text-center">
          <span class="inline-flex items-center gap-0.5 text-amber-500 font-bold text-xs">
            ★ ${rating}
          </span>
        </td>

        <td class="py-3.5 text-center">${statusBadge}</td>

        <td class="py-3.5 text-center pl-2">
          <div class="flex items-center justify-center gap-1.5">
            <!-- زر واتساب -->
            <button onclick="openDriverWhatsApp('${safePhone}', '${safeName}')" title="مراسلة واتساب" class="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs transition">
              💬
            </button>
            <!-- زر قبول مباشر إن كان معلقاً -->
            ${d.status === 'pending' ? `
              <button onclick="approveDriver('${safeId}')" title="قبول الطلب" class="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 flex items-center justify-center text-xs transition font-bold">
                ✓
              </button>
            ` : ''}
            <!-- زر حذف / إزالة مندوب -->
            <button onclick="deleteDriver('${safeId}', '${safeName}')" title="إزالة وحذف المندوب" class="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition font-bold">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------------------------------
// إجراءات قبول / رفض / حذف المندوب
// ----------------------------------------------------------------------------
async function approveDriver(driverId) {
  try {
    const res = await fetch('/api/driver/approve/' + encodeURIComponent(driverId), { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'تعذر قبول المندوب', 'error');
      return;
    }

    const driver = data.driver;
    currentApprovingDriver = driver;

    // تجهيز مودال الإشعار
    const modal = document.getElementById('driver-approval-modal');
    const nameEl = document.getElementById('modal-driver-name');
    const phoneEl = document.getElementById('modal-driver-phone');
    const msgEl = document.getElementById('modal-driver-msg');

    if (nameEl) nameEl.innerText = driver.name || '';
    if (phoneEl) phoneEl.innerText = driver.phone || '';
    if (msgEl) {
      msgEl.value = `أهلاً بك كابتن ${driver.name}! 🎉\nيسعدنا إبلاغك بأنه تمت الموافقة على تسجيلك كمندوب توصيل معتمد في منصة سلة المنار.\nيمكنك الآن تسجيل الدخول في تطبيق المندوب والبدء في استلام وتوصيل الطلبات وتحقيق الأرباح فوراً.\nبالتوفيق! 🚀`;
    }

    if (modal) modal.classList.remove('hidden');

    showToast('تم قبول المندوب بنجاح! جاهز لإرسال الإشعار', 'success');
    loadData();
  } catch (err) {
    console.error('approveDriver error:', err);
    showToast('حدث خطأ أثناء تنفيذ الطلب', 'error');
  }
}

async function rejectDriver(driverId) {
  if (!confirm('هل أنت متأكد من رفض طلب تسجيل هذا المندوب؟')) return;
  try {
    const res = await fetch('/api/driver/reject/' + encodeURIComponent(driverId), { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('تم رفض طلب تسجيل المندوب', 'success');
      loadData();
    } else {
      showToast(data.error || 'تعذر رفض الطلب', 'error');
    }
  } catch (err) {
    console.error('rejectDriver error:', err);
    showToast('حدث خطأ في الاتصال', 'error');
  }
}

async function deleteDriver(driverId, driverName) {
  if (!confirm(`هل أنت متأكد من حذف وإزالة المندوب (${driverName}) نهائياً من النظام وسوبابيس؟`)) return;
  try {
    const res = await fetch('/api/drivers/' + encodeURIComponent(driverId), { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`تم حذف المندوب (${driverName}) بنجاح`, 'success');
      loadData();
    } else {
      showToast(data.error || 'تعذر حذف المندوب', 'error');
    }
  } catch (err) {
    console.error('deleteDriver error:', err);
    showToast('حدث خطأ أثناء الحذف', 'error');
  }
}

function refreshDriversData() {
  loadData();
  showToast('تم تحديث بيانات المناديب والتقارير', 'success');
}

function closeDriverApprovalModal() {
  const modal = document.getElementById('driver-approval-modal');
  if (modal) modal.classList.add('hidden');
  currentApprovingDriver = null;
}

function openDriverWhatsApp(phone, name) {
  const cleanPhone = (phone || '').replace(/^0/, '966').replace(/\D/g, '');
  const msg = encodeURIComponent(`مرحباً كابتن ${name || ''}، بخصوص حسابك في تطبيق توصيل سلة المنار...`);
  window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
}

function sendApprovalViaWhatsApp() {
  if (!currentApprovingDriver) return;
  const phone = (currentApprovingDriver.phone || '').replace(/^0/, '966').replace(/\D/g, '');
  const msgText = document.getElementById('modal-driver-msg')?.value || '';
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msgText)}`;
  window.open(waUrl, '_blank');
  showToast('تم فتح واتساب لإرسال الإشعار', 'success');
  closeDriverApprovalModal();
}

function sendApprovalViaSms() {
  if (!currentApprovingDriver) return;
  const phone = currentApprovingDriver.phone || '';
  const msgText = document.getElementById('modal-driver-msg')?.value || '';
  window.location.href = `sms:${phone}?body=${encodeURIComponent(msgText)}`;
  showToast('تم تحويلك لتطبيق الرسائل القصيرة SMS', 'success');
  closeDriverApprovalModal();
}

function copyApprovalText() {
  const msgText = document.getElementById('modal-driver-msg')?.value || '';
  navigator.clipboard.writeText(msgText).then(() => {
    showToast('تم نسخ نص الرسالة إلى الحافظة بنجاح ✓', 'success');
  }).catch(() => {
    showToast('تعذر النسخ تلقائياً، يرجى النسخ يدوياً', 'error');
  });
}

// ----------------------------------------------------------------------------
// 12. البحث السريع والتصفية
// ----------------------------------------------------------------------------
function handleGlobalSearch(term) {
  term = (term || '').trim();
  if (!term) {
    renderProductsTable(globalProducts);
    return;
  }
  const filtered = globalProducts.filter(p => p.name.includes(term) || (p.category && p.category.includes(term)));
  switchTab('products');
  renderProductsTable(filtered);
}

// ----------------------------------------------------------------------------
// 13. إسناد كافة الدوال إلى كائن window لتكون متاحة دائماً
// ----------------------------------------------------------------------------
window.switchTab = switchTab;
window.switchMarketingTab = switchMarketingTab;
window.showToast = showToast;
window.processAndResizeImage = processAndResizeImage;
// ----------------------------------------------------------------------------
// 13. سلال المناسبات والسلال الأسبوعية (Baskets) — سلايدر 3D في تطبيق العميل
// ----------------------------------------------------------------------------
let globalBaskets = [];

const BASKET_TEMPLATES = [
  { name: 'سلة الإفطار', emoji: '🌙', cat: 'سلال رمضانية', desc: 'كل ما تحتاجه سفرة الإفطار في سلة واحدة متكاملة', gradient: 'emerald', items: [['تمر سجع فاخر', 'كجم', 1], ['لبن زبادي عالي البروتين', 'علبة', 4], ['خبز عربي طازج', 'كيس', 1], ['جبن شيد مثلثات', 'علبة', 1], ['عصير برتقال طبيعي', 'لتر', 2], ['ماء شمندل', 'كرتون', 1]] },
  { name: 'سلة السحور', emoji: '🌄', cat: 'سلال رمضانية', desc: 'سلة خفيفة ومغذية لأفضل سحور', gradient: 'violet', items: [['لبن زبادي قليل الدسم', 'علبة', 4], ['موز فاخر', 'كجم', 1], ['تمر مجدول', 'كجم', 1], ['شوفان كامل الحبة', 'علبة', 1], ['حليب طويل الأمد كامل الدسم', 'لتر', 2], ['ماء شمندل', 'كرتون', 1]] },
  { name: 'سلة الضيوف', emoji: '🤲', cat: 'سلال مناسبات', desc: 'استقبال ضيوفك بأرقى ما يقدم', gradient: 'amber', items: [['قهوة عربية مطحونة فاخرة', 'كجم', 1], ['شاي أحمر طويل', 'علبة', 1], ['تمر سكري فاخر', 'كجم', 1], ['فستق حلبي محمص', 'كجم', 1], ['حلى مقرمشات مشكلة', 'علبة', 2], ['شوكولاتة فاخرة مشكلة', 'علبة', 2]] },
  { name: 'سلة العيد', emoji: '🎊', cat: 'سلال مناسبات', desc: 'سلة الاحتفال بالعيد — حلى وقهوة وهدايا', gradient: 'rose', items: [['حلى العيد المشكل', 'علبة', 3], ['قهوة عربية بالزعفران', 'علبة', 1], ['تمر محشي بالفستق', 'كجم', 1], ['شوكولاتة هدية فاخرة', 'علبة', 2], ['مكسرات مشكلة محمصة', 'كجم', 1], ['بخور وعود العيد', 'علبة', 1]] },
  { name: 'سلة المسافر', emoji: '🧳', cat: 'سلال مناسبات', desc: 'زاد خفيف للطريق — منتجات فورية ومشروبات', gradient: 'emerald', items: [['ماء شمندل صغير', 'كرتون', 1], ['شيبس مخبوزات مشكلة', 'كيس', 4], ['بسكويت شعير ممتاز', 'علبة', 2], ['شرائح تونة معلبة', 'علبة', 3], ['شوكولاتة صغيرة مشكلة', 'علبة', 2], ['عصير محكم الفتحة', 'كرتون', 1]] },
  { name: 'سلة الأعراس', emoji: '💐', cat: 'سلال مناسبات', desc: 'تجهيزات الاحتفالات والضيافة الفاخرة', gradient: 'violet', items: [['شوكولاتة هدية مميزة', 'علبة', 4], ['حلى فاخر مبرد', 'علبة', 3], ['مشروبات غازية فاخرة', 'كرتون', 2], ['قهوة تركية مطحونة', 'علبة', 1], ['فواكه مقطعة طازجة', 'علبة', 2], ['زهور استقبال', 'حزمة', 1]] },
  { name: 'سلة أسبوعية وفر', emoji: '🧺', cat: 'سلال أسبوعية', desc: 'احتياجات الأسبوع كاملة بسعر أوفر', gradient: 'emerald', items: [['أرز بسمتي فاخر', 'كجم', 2], ['زيت قلي نباتي', 'لتر', 2], ['دجاج طازج مقطع', 'كجم', 2], ['خضار مشكل طازج', 'كجم', 3], ['فواكه الموسم', 'كجم', 3], ['بيض طازج', 'طبق', 2]] },
];

const BASKET_GRADIENTS = {
  emerald: { css: 'linear-gradient(160deg, #1e7d4f 0%, #35b57c 55%, #7fd8a8 100%)', dark: '#1e7d4f' },
  amber:   { css: 'linear-gradient(160deg, #8a5a1c 0%, #d19a3f 55%, #ecc67f 100%)', dark: '#8a5a1c' },
  rose:    { css: 'linear-gradient(160deg, #8f2d38 0%, #d15360 55%, #eb9aa2 100%)', dark: '#8f2d38' },
  violet:  { css: 'linear-gradient(160deg, #4a2d7d 0%, #8254c4 55%, #c0a0e8 100%)', dark: '#4a2d7d' },
};

function basketGradientCss(name) {
  return (BASKET_GRADIENTS[name] || BASKET_GRADIENTS.emerald).css;
}

function renderBaskets(baskets) {
  const grid = document.getElementById('baskets-display-grid');
  const tplGrid = document.getElementById('basket-templates-grid');
  if (tplGrid) {
    tplGrid.innerHTML = BASKET_TEMPLATES.map((t, i) =>
      '<button onclick="quickAddBasketTemplate(' + i + ')" class="text-right bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl p-3 transition group">' +
        '<span class="text-2xl">' + t.emoji + '</span>' +
        '<div class="font-bold text-slate-700 text-xs mt-1">' + escapeHtml(t.name) + '</div>' +
        '<div class="text-[10px] text-slate-400 line-clamp-1">' + escapeHtml(t.desc) + '</div>' +
        '<div class="text-[10px] text-emerald-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition">+ إضافة وتفعيل</div>' +
      '</button>'
    ).join('');
  }
  if (!grid) return;

  if (!baskets || baskets.length === 0) {
    grid.innerHTML = '<div class="col-span-3 text-center py-8 text-slate-400 text-xs">لا توجد سلال بعد — ابدأ بأحد القوالب الجاهزة بالأعلى!</div>';
    return;
  }

  grid.innerHTML = baskets.map(b => {
    const id = escapeHtml(b.id || '');
    const active = b.isActive !== false;
    const items = Array.isArray(b.items) ? b.items : [];
    const itemsPreview = items.length
      ? items.slice(0, 4).map(it => '• ' + escapeHtml(String(it.name || ''))).join('<br>') + (items.length > 4 ? '<br>• +' + (items.length - 4) + ' …' : '')
      : '<span class="text-slate-300">لا محتويات</span>';
    const oldP = parseFloat(b.oldPrice || 0);
    const price = parseFloat(b.price || 0);
    const priceHtml = oldP > price
      ? '<span class="text-slate-400 line-through text-[11px] ml-1">' + oldP.toFixed(2) + '</span><span class="text-[#008955] font-extrabold text-sm">' + price.toFixed(2) + ' ر.س</span>'
      : '<span class="text-[#008955] font-extrabold text-sm">' + price.toFixed(2) + ' ر.س</span>';
    const activeBadge = active
      ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold text-[10px] border border-emerald-200">مفعّلة في السلايدر ✓</span>'
      : '<span class="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-bold text-[10px] border border-slate-200">مُلغاة — مخفية عن العملاء</span>';
    const toggleBtn = active
      ? '<button onclick="toggleBasket(\'' + id + '\', false)" class="text-amber-600 hover:text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-[11px]">إلغاء التفعيل</button>'
      : '<button onclick="toggleBasket(\'' + id + '\', true)" class="text-emerald-700 hover:text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-[11px]">تفعيل</button>';
    const cardOpacity = active ? '' : ' opacity-60';

    return '<div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between' + cardOpacity + '">' +
      '<div class="p-3.5 space-y-2">' +
        '<div class="flex items-center gap-2.5">' +
          '<span class="text-3xl">' + escapeHtml(b.emoji || '🧺') + '</span>' +
          '<div class="flex-1 min-w-0">' +
            '<h4 class="font-bold text-slate-800 text-xs">' + escapeHtml(b.name || '') + '</h4>' +
            '<span class="text-[10px] text-slate-400">' + escapeHtml(b.category || 'سلال أسبوعية') + '</span>' +
          '</div>' +
          '<div>' + priceHtml + '</div>' +
        '</div>' +
        '<p class="text-[11px] text-slate-500 line-clamp-2">' + escapeHtml(b.description || '') + '</p>' +
        '<div class="bg-slate-50 rounded-xl p-2.5 text-[11px] text-slate-600 leading-relaxed">' + itemsPreview + '</div>' +
      '</div>' +
      '<div class="p-3 bg-slate-50 border-t border-slate-100 space-y-2">' +
        '<div class="flex items-center justify-between">' + activeBadge + '<span class="text-slate-300 text-[10px]">ترتيب: ' + (b.sortOrder || 99) + '</span></div>' +
        '<div class="flex items-center justify-between gap-2">' +
          '<button onclick="openEditBasketModal(\'' + id + '\')" class="text-blue-600 hover:text-blue-800 font-bold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg text-[11px]">تعديل</button>' +
          toggleBtn +
          '<button onclick="deleteBasket(\'' + id + '\')" class="text-rose-500 hover:text-rose-700 font-bold text-[11px]">حذف</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openAddBasketModal(prefill) {
  document.getElementById('basket-modal-title').textContent = 'إنشاء سلة جديدة';
  document.getElementById('basket-edit-id').value = '';
  document.getElementById('basket-name').value = prefill ? prefill.name || '' : '';
  document.getElementById('basket-emoji').value = prefill ? prefill.emoji || '🧺' : '🧺';
  document.getElementById('basket-cat').value = prefill ? prefill.cat || 'سلال أسبوعية' : 'سلال أسبوعية';
  document.getElementById('basket-desc').value = prefill ? prefill.desc || '' : '';
  document.getElementById('basket-price').value = '';
  document.getElementById('basket-oldprice').value = '';
  document.getElementById('basket-sort').value = '1';
  document.getElementById('basket-gradient').value = prefill ? prefill.gradient || 'emerald' : 'emerald';
  document.getElementById('basket-active').checked = true;
  document.getElementById('basket-image-final-url').value = '';
  document.getElementById('basket-img-preview').innerHTML = '<span class="text-2xl text-slate-300">🖼️</span>';
  document.getElementById('basket-img-status').textContent = 'إن لم تختر صورة ستُعرض أيقونة السلة بشكل كبير';
  document.getElementById('basket-items-rows').innerHTML = '';
  if (prefill && Array.isArray(prefill.items)) {
    prefill.items.forEach(it => addBasketItemRow(it[0], it[1], it[2]));
  } else {
    addBasketItemRow();
  }
  document.getElementById('basket-modal').classList.remove('hidden');
}

function openEditBasketModal(id) {
  const b = (globalBaskets || []).find(x => x.id === id);
  if (!b) return;
  openAddBasketModal({
    name: b.name, emoji: b.emoji, cat: b.category, desc: b.description, gradient: b.gradient, items: []
  });
  document.getElementById('basket-modal-title').textContent = 'تعديل السلة';
  document.getElementById('basket-edit-id').value = b.id;
  document.getElementById('basket-price').value = b.price || '';
  document.getElementById('basket-oldprice').value = b.oldPrice || '';
  document.getElementById('basket-sort').value = b.sortOrder || 1;
  document.getElementById('basket-active').checked = b.isActive !== false;
  document.getElementById('basket-image-final-url').value = b.imageUrl || '';
  if (b.imageUrl) {
    document.getElementById('basket-img-preview').innerHTML = '<img src="' + escapeHtml(b.imageUrl) + '" class="w-full h-full object-cover" />';
  }
  const rows = document.getElementById('basket-items-rows');
  rows.innerHTML = '';
  (Array.isArray(b.items) && b.items.length ? b.items : [['', '', '']]).forEach(it => {
    addBasketItemRow(it.name || '', it.unit || '', it.qty || 1, it.price);
  });
}

function closeBasketModal() {
  document.getElementById('basket-modal').classList.add('hidden');
}

function addBasketItemRow(name, unit, qty, price) {
  const rows = document.getElementById('basket-items-rows');
  if (!rows) return;
  const row = document.createElement('div');
  row.className = 'grid grid-cols-12 gap-2 items-center';
  row.innerHTML =
    '<input type="text" placeholder="اسم الصنف" class="col-span-5 border rounded-lg p-2 text-[11px] outline-none focus:border-[#008955]" value="' + (name ? escapeHtml(String(name)) : '') + '" />' +
    '<input type="text" placeholder="الوحدة" class="col-span-2 border rounded-lg p-2 text-[11px] outline-none focus:border-[#008955]" value="' + (unit ? escapeHtml(String(unit)) : '') + '" />' +
    '<input type="number" placeholder="كمية" min="1" class="col-span-2 border rounded-lg p-2 text-[11px] outline-none focus:border-[#008955]" value="' + (qty || 1) + '" />' +
    '<input type="number" placeholder="سعر الفردي" step="0.5" class="col-span-2 border rounded-lg p-2 text-[11px] outline-none focus:border-[#008955]" value="' + (price !== undefined && price !== null && price !== '' ? price : '') + '" />' +
    '<button type="button" onclick="this.parentElement.remove()" class="col-span-1 text-rose-400 hover:text-rose-600 font-bold text-sm">✕</button>';
  rows.appendChild(row);
}

function removeBasketItemRow(btn) {
  btn.parentElement.remove();
}

function collectBasketItems() {
  const rows = document.querySelectorAll('#basket-items-rows > div');
  const items = [];
  rows.forEach(r => {
    const inputs = r.querySelectorAll('input');
    const name = (inputs[0] && inputs[0].value || '').trim();
    const unit = (inputs[1] && inputs[1].value || '').trim();
    const qty = Math.max(1, parseInt(inputs[2] && inputs[2].value, 10) || 1);
    const price = inputs[3] && inputs[3].value !== '' ? parseFloat(inputs[3].value) : null;
    if (name) items.push({ name, unit, qty, price });
  });
  return items;
}

async function submitBasket() {
  const editId = document.getElementById('basket-edit-id').value.trim();
  const name = document.getElementById('basket-name').value.trim();
  if (!name) { showToast('اكتب اسم السلة أولاً', 'error'); return; }

  const items = collectBasketItems();
  const payload = {
    name,
    emoji: document.getElementById('basket-emoji').value.trim() || '🧺',
    category: document.getElementById('basket-cat').value.trim() || 'سلال أسبوعية',
    description: document.getElementById('basket-desc').value.trim(),
    price: parseFloat(document.getElementById('basket-price').value) || 0,
    oldPrice: document.getElementById('basket-oldprice').value === '' ? null : parseFloat(document.getElementById('basket-oldprice').value),
    sortOrder: parseInt(document.getElementById('basket-sort').value, 10) || 1,
    imageUrl: document.getElementById('basket-image-final-url').value.trim(),
    gradient: document.getElementById('basket-gradient').value,
    isActive: document.getElementById('basket-active').checked,
    items
  };
  if (!payload.price) { showToast('اكتب سعر السلة', 'error'); return; }

  try {
    const res = editId
      ? await fetch('/api/baskets/' + encodeURIComponent(editId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/baskets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.success) {
      showToast(editId ? '✓ تم حفظ تعديلات السلة ونشرها فوراً!' : '🧺 تم إنشاء السلة وتفعيلها في سلايدر العملاء!');
      closeBasketModal();
      loadData();
    } else {
      showToast(data.error || 'تعذر حفظ السلة', 'error');
    }
  } catch (e) {
    console.error('Error saving basket:', e);
    showToast('تعذر الاتصال بالخادم', 'error');
  }
}

async function toggleBasket(id, makeActive) {
  try {
    const res = await fetch('/api/baskets/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !!makeActive })
    });
    const data = await res.json();
    if (data.success) {
      showToast(makeActive ? '✓ تم تفعيل السلة — ظهرت الآن في سلايدر تطبيق العميل' : 'تم إلغاء تفعيل السلة — اختفت من سلايدر العملاء');
      loadData();
    } else {
      showToast(data.error || 'تعذر تغيير حالة السلة', 'error');
    }
  } catch (e) {
    console.error('Error toggling basket:', e);
    showToast('تعذر الاتصال بالخادم', 'error');
  }
}

async function deleteBasket(id) {
  if (!confirm('هل أنت متأكد من حذف هذه السلة نهائياً؟')) return;
  try {
    await fetch('/api/baskets/' + encodeURIComponent(id), { method: 'DELETE' });
    showToast('تم حذف السلة');
    loadData();
  } catch (e) {
    console.error('Error deleting basket:', e);
    showToast('تعذر حذف السلة', 'error');
  }
}

// إضافة سلة جاهزة من القوالب بضغطة واحدة (تحسب السعر تلقائياً من الأسعار الفردية إن توفرت)
async function quickAddBasketTemplate(idx) {
  const t = BASKET_TEMPLATES[idx];
  if (!t) return;
  // نجمع الأسعار الفردية من كتالوج المنتجات إن توافقت الأسماء
  const items = t.items.map(it => {
    const match = (globalProducts || []).find(p => (p.name || '').includes(it[0]) || it[0].includes(p.name || ''));
    return { name: it[0], unit: it[1], qty: it[2], price: match ? parseFloat(match.price || 0) : null };
  });
  const priced = items.filter(i => i.price !== null);
  const autoTotal = priced.reduce((s, i) => s + (i.price * i.qty), 0);
  const fallback = { 'سلة الإفطار': 89, 'سلة السحور': 59, 'سلة الضيوف': 149, 'سلة العيد': 179, 'سلة المسافر': 49, 'سلة الأعراس': 249, 'سلة أسبوعية وفر': 129 };
  const payload = {
    name: t.name,
    emoji: t.emoji,
    category: t.cat,
    description: t.desc,
    gradient: t.gradient,
    items,
    price: autoTotal > 0 ? autoTotal : (fallback[t.name] || 99),
    oldPrice: null,
    isActive: true,
    sortOrder: idx + 1
  };
  try {
    const res = await fetch('/api/baskets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (data.success) {
      showToast('🧺 أُضيفت «' + t.name + '» ومفعّلة في السلايدر الآن!');
      loadData();
    } else {
      showToast(data.error || 'تعذر إضافة السلة', 'error');
    }
  } catch (e) {
    showToast('تعذر الاتصال بالخادم', 'error');
  }
}

window.handleImageFilePick = handleImageFilePick;
window.loadData = loadData;
window.renderProductsTable = renderProductsTable;
window.openEditProductModal = openEditProductModal;
window.closeEditProductModal = closeEditProductModal;
window.submitEditProduct = submitEditProduct;
window.openAddProductModal = openAddProductModal;
window.closeAddProductModal = closeAddProductModal;
window.submitNewProduct = submitNewProduct;
window.deleteProduct = deleteProduct;
window.saveAndPublishOffer = saveAndPublishOffer;
window.deleteOffer = deleteOffer;
window.renderOffers = renderOffers;
window.toggleOffer = toggleOffer;
window.openEditOfferModal = openEditOfferModal;
window.renderBaskets = renderBaskets;
window.openAddBasketModal = openAddBasketModal;
window.closeBasketModal = closeBasketModal;
window.addBasketItemRow = addBasketItemRow;
window.removeBasketItemRow = removeBasketItemRow;
window.submitBasket = submitBasket;
window.toggleBasket = toggleBasket;
window.openEditBasketModal = openEditBasketModal;
window.deleteBasket = deleteBasket;
window.quickAddBasketTemplate = quickAddBasketTemplate;
window.renderOrdersTable = renderOrdersTable;
window.updateOrderStatus = updateOrderStatus;
window.renderCustomersTable = renderCustomersTable;
window.renderCoupons = renderCoupons;
window.renderCategories = renderCategories;
window.renderBranches = renderBranches;
window.renderDrivers = renderDrivers;
window.filterDriversTable = filterDriversTable;
window.approveDriver = approveDriver;
window.rejectDriver = rejectDriver;
window.deleteDriver = deleteDriver;
window.refreshDriversData = refreshDriversData;
window.closeDriverApprovalModal = closeDriverApprovalModal;
window.openDriverWhatsApp = openDriverWhatsApp;
window.sendApprovalViaWhatsApp = sendApprovalViaWhatsApp;
window.sendApprovalViaSms = sendApprovalViaSms;
window.copyApprovalText = copyApprovalText;
window.handleGlobalSearch = handleGlobalSearch;

// ----------------------------------------------------------------------------
// 14. بدء التشغيل وبناء الرسوم البيانية عند اكتمال الصفحة
// ----------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, initializing portal data and charts...');
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) logoutLink.addEventListener('click', (e) => { e.preventDefault(); logoutAdmin(); });
  loadData();

  // 1) شارت الأعمدة المزدوج لإحصائيات المبيعات الأسبوعية (مطابق للصورة المرجعية)
  try {
    const barEl = document.getElementById('weeklyBarChart');
    if (barEl && typeof Chart !== 'undefined') {
      new Chart(barEl.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['السبت', 'الجمعة', 'الخميس', 'الأربعاء', 'الثلاثاء', 'الاثنين', 'الأحد'],
          datasets: [
            {
              label: 'الرياض',
              data: [520, 320, 485, 810, 490, 792, 950],
              backgroundColor: '#0ea5e9',
              borderRadius: 6,
              barPercentage: 0.55,
              categoryPercentage: 0.6
            },
            {
              label: 'فروع أخرى',
              data: [245, 80, 110, 512, 100, 480, 475],
              backgroundColor: '#142A4A',
              borderRadius: 6,
              barPercentage: 0.55,
              categoryPercentage: 0.6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              callbacks: {
                label: function(context) {
                  return context.dataset.label + ': ' + context.parsed.y + ' طلب';
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { family: 'Cairo', weight: 'bold', size: 11 }, color: '#64748b' }
            },
            y: {
              position: 'right',
              grid: { color: '#f1f5f9' },
              ticks: {
                font: { family: 'Cairo', size: 10 },
                color: '#94a3b8',
                callback: function(val) {
                  return val === 1000 ? '1 ألف' : val;
                }
              },
              suggestedMax: 1000
            }
          }
        }
      });
    }
  } catch (err) {
    console.warn('weeklyBarChart initialization skipped:', err);
  }

  // 2) شارت الدونات الدائري لإحصائيات الطلبات والحجوزات (مطابق للصورة المرجعية)
  try {
    const donutEl = document.getElementById('ordersDonutChart');
    if (donutEl && typeof Chart !== 'undefined') {
      new Chart(donutEl.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['الطلبات المؤكدة', 'قيد التوصيل', 'الطلبات المكتملة'],
          datasets: [{
            data: [514, 234, 345],
            backgroundColor: ['#0ea5e9', '#142A4A', '#e2e8f0'],
            borderWidth: 0,
            cutout: '74%'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              callbacks: {
                label: function(context) {
                  return context.label + ': ' + context.parsed + ' طلب';
                }
              }
            }
          }
        }
      });
    }
  } catch (err) {
    console.warn('ordersDonutChart initialization skipped:', err);
  }
});
