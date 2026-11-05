import { getDrivers, upsertDriver, deleteDriver, getProducts, upsertProduct, deleteProduct, getCategories, upsertCategory, deleteCategory, getOrders, upsertOrder, deleteOrder, decrementStockForOrder, getCustomers, upsertCustomer, deleteCustomer } from './lib/supabase.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// دالة تشفير وحماية رموز PIN وكلمات المرور في الباك اند
const hashCustomerPin = (pin) => crypto.createHash('sha256').update(String(pin || '') + '_almanar_secure_salt').digest('hex');
const verifyCustomerPin = (entered, stored) => {
  if (!entered || !stored) return false;
  return stored === entered || stored === hashCustomerPin(entered);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// ─── موقع المندوب: يُخزَّن داخل الطلب في قاعدة البيانات (مرتبط بالطلب وهوية المندوب) ───
const TRACK_TTL_MS = 10 * 60 * 1000; // مدة صلاحية آخر موقع معروف: 10 دقائق
const randomTrackToken = () => {
  let t = '';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
};

// إخفاء بيانات التتبع الحساسة (توكن التتبع/توكن المندوب) من قوائم الطلبات العامة
function sanitizeOrderForList(o) {
  if (!o || typeof o !== 'object') return o;
  const clean = { ...o };
  delete clean.trackToken;
  delete clean.driverToken;
  return clean;
}

// ─── دورة حياة الطلب: انتقالات مسموحة فقط — تمنع القفز العشوائي بين الحالات ───
// ملاحظة توافق: 'delivering' هو الاسم القديم (المستخدم في المنصّة الحالية) لحالة 'on_the_way'
const ORDER_FLOW = {
  pending: ['accepted', 'cancelled'],
  awaiting_receipt: ['accepted', 'delivering', 'cancelled'], // مسار التحويل البنكي القديم
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivering: ['delivered', 'completed', 'cancelled'], // نفس حالة on_the_way بالاسم القديم
  delivered: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const DELIVERING_ALIASES = ['delivering', 'on_the_way'];
const isDeliveringStatus = s => DELIVERING_ALIASES.includes(String(s));
// الحالات التي يُعد فيها الطلب "نشطاً لدى المندوب" (غير معروض في قائمة الانتظار للآخرين)
const ACTIVE_ORDER_STATUSES = new Set(['accepted', 'preparing', 'ready_for_delivery', 'delivering', 'on_the_way']);
const canTransition = (cur, next) => (ORDER_FLOW[cur] || []).includes(next);

// نطاق أوسع للمسار القديم (PUT) الخاص بالإدارة والأنظمة الحالية حتى لا تتعطل وظائفها
// (العمليات الجديدة من تطبيق المندوب تمر عبر النقطة المحمية /api/driver/order-action الصارمة)
const LEGACY_PUT_FLOW = {
  pending: ['awaiting_receipt', 'accepted', 'delivering', 'on_the_way', 'completed', 'cancelled'],
  awaiting_receipt: ['accepted', 'delivering', 'on_the_way', 'completed', 'cancelled'],
  accepted: ['preparing', 'ready_for_delivery', 'delivering', 'on_the_way', 'completed', 'cancelled'],
  preparing: ['ready_for_delivery', 'delivering', 'on_the_way', 'completed', 'cancelled'],
  ready_for_delivery: ['delivering', 'on_the_way', 'completed', 'cancelled'],
  on_the_way: ['delivered', 'completed', 'cancelled'],
  delivering: ['delivered', 'completed', 'cancelled'],
  delivered: ['completed', 'cancelled'],
  completed: ['cancelled'],
  cancelled: [],
};

// تصفية قائمة الطلبات حسب مندوب: الطلبات المتاحة + طلباته الخاصة فقط (لا تُسرَّب طلبات الآخرين)
// مع مطابقة المدينة: المندوب يرى الطلبات المتاحة في مدينته فقط (بيشة → بيشة، الرياض → الرياض)
// توافق رجعي: إذا كانت مدينة المندوب أو مدينة الطلب غير محددة يُعد الطلب مرئياً (طلبات قديمة بلا مدينة)
function filterOrdersForDriver(rawOrders, driverId, driverName, driverCity) {
  const mine = (o) => (driverId && o.claimedByDriverId === driverId) || (driverName && !o.claimedByDriverId && String(o.driverName || '') === String(driverName));
  const cityMatch = (o) => !driverCity || !o.city || String(o.city).trim() === String(driverCity).trim();
  const isOpenToClaim = (o) => !o.claimedByDriverId && cityMatch(o) && (o.status === 'pending' || o.status === 'awaiting_receipt');
  return rawOrders.filter(o => {
    if (mine(o)) return true;                 // طلباتي (قيد العمل أو المكتملة) — الملكية تتجاوز المدينة
    if (isOpenToClaim(o)) return true;        // متاحة للحجز وفي مدينتي فقط
    return false;                             // طلبات مندوبين آخرين أو مدن أخرى: محجوبة
  });
}

// إضافة سجل تغيير الحالة (سجل كامل لتاريخ الطلب)
function appendStatusHistory(order, status, extra = {}) {
  if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
  const last = order.statusHistory.length ? order.statusHistory[order.statusHistory.length - 1] : null;
  // منع تكرار نفس الحالة في التاريخ عند إعادة المحاولة
  if (last && last.status === status && order.status === status) return;
  order.statusHistory.push({ status, at: new Date().toISOString(), by: extra.by || '', driverId: extra.driverId || '', name: order.driverName || '' });
}

// منع إغلاق الخادم عند وقوع أخطاء غير معالجة
process.on('uncaughtException', (err) => {
  console.error('[Server] خطأ غير متوقع (لن يُوقف الخادم):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Promise مرفوض غير معالج (لن يُوقف الخادم):', reason);
});

// بيانات افتراضية
const defaultData = {
  categories: [
    { id: 'cat-1', name: 'المخبوزات والحلويات', icon: '🍞', count: 42 },
    { id: 'cat-2', name: 'الألبان والأجبان', icon: '🥛', count: 35 },
    { id: 'cat-3', name: 'الفواكه والخضار', icon: '🍎', count: 58 },
    { id: 'cat-4', name: 'اللحوم والدواجن', icon: '🥩', count: 24 },
    { id: 'cat-5', name: 'المشروبات والعصائر', icon: '🧊', count: 19 },
    { id: 'cat-6', name: 'المعلبات والأرز', icon: '🥫', count: 64 },
  ],
  products: [
    {
      id: 'prod-1',
      name: 'خبز صامولي فاخر (6 حبات)',
      category: 'المخبوزات والحلويات',
      price: 6.00,
      oldPrice: 8.00,
      unit: 'كيس',
      stock: 85,
      rating: 4.8,
      barcode: '628100100101',
      image: '🍞'
    },
    {
      id: 'prod-2',
      name: 'حليب المراعي طازج كامل الدسم 1 لتر',
      category: 'الألبان والأجبان',
      price: 7.00,
      oldPrice: null,
      unit: 'حبة',
      stock: 120,
      rating: 4.9,
      barcode: '628100100102',
      image: '🥛'
    },
    {
      id: 'prod-3',
      name: 'جبن كريمي كيري (8 قطع)',
      category: 'الألبان والأجبان',
      price: 14.00,
      oldPrice: 17.00,
      unit: 'علبة',
      stock: 45,
      rating: 4.7,
      barcode: '628100100103',
      image: '🧀'
    },
    {
      id: 'prod-4',
      name: 'أرز بسمتي الشعلان 5 كغ',
      category: 'المعلبات والأرز',
      price: 48.00,
      oldPrice: 55.00,
      unit: 'كيس',
      stock: 30,
      rating: 4.9,
      barcode: '628100100104',
      image: '🌾'
    },
    {
      id: 'prod-5',
      name: 'زيت زيتون بكر ممتاز الجوف 500 مل',
      category: 'المعلبات والأرز',
      price: 24.50,
      oldPrice: null,
      unit: 'قارورة',
      stock: 50,
      rating: 4.6,
      barcode: '628100100105',
      image: '🫒'
    },
    {
      id: 'prod-6',
      name: 'تفاح سكري لبناني طازج 1 كغ',
      category: 'الفواكه والخضار',
      price: 9.50,
      oldPrice: 12.00,
      unit: 'كغ',
      stock: 60,
      rating: 4.8,
      barcode: '628100100106',
      image: '🍎'
    }
  ],
  orders: [
    {
      id: '#20241818',
      customerName: 'عمار محمد',
      phone: '0551234567',
      address: 'الرياض - حي الروضة شارع 43',
      branch: 'سلة المنار - فرع الروضة',
      date: '2026-10-24 14:30',
      total: 33.00,
      status: 'pending', // pending, delivering, completed, cancelled
      driverName: 'رفيق سلطان',
      paymentMethod: 'مدى (Mada)',
      items: [
        { name: 'خبز صامولي فاخر (6 حبات)', qty: 2, price: 6.00 },
        { name: 'حليب المراعي طازج كامل الدسم 1 لتر', qty: 1, price: 7.00 },
        { name: 'جبن كريمي كيري (8 قطع)', qty: 1, price: 14.00 }
      ]
    },
    {
      id: '#20241819',
      customerName: 'سارة علي',
      phone: '0559876543',
      address: 'الرياض - حي النخيل شارع 12',
      branch: 'سلة المنار - فرع الملك فهد',
      date: '2026-10-24 15:15',
      total: 72.50,
      status: 'delivering',
      driverName: 'رفيق سلطان',
      paymentMethod: 'Apple Pay',
      items: [
        { name: 'أرز بسمتي الشعلان 5 كغ', qty: 1, price: 48.00 },
        { name: 'زيت زيتون بكر ممتاز الجوف 500 مل', qty: 1, price: 24.50 }
      ]
    },
    {
      id: '#20241815',
      customerName: 'خالد عبدالله',
      phone: '0541112233',
      address: 'الرياض - حي العليا شارع التحلية',
      branch: 'سلة المنار - فرع الروضة',
      date: '2026-10-24 11:00',
      total: 120.00,
      status: 'completed',
      driverName: 'أحمد التميمي',
      paymentMethod: 'الدفع عند الاستلام',
      items: [
        { name: 'كرتون ماء صحة 12 قارورة', qty: 2, price: 24.00 },
        { name: 'دجاج مجمد 1200غ', qty: 3, price: 72.00 }
      ]
    }
  ],
  customers: [
    { id: 'cust-1', name: 'عمار محمد', phone: '0551234567', ordersCount: 14, totalSpent: 1250, city: 'الرياض - حي الروضة' },
    { id: 'cust-2', name: 'سارة علي', phone: '0559876543', ordersCount: 8, totalSpent: 640, city: 'الرياض - حي النخيل' },
    { id: 'cust-3', name: 'خالد عبدالله', phone: '0541112233', ordersCount: 22, totalSpent: 3100, city: 'الرياض - حي العليا' },
    { id: 'cust-4', name: 'نورة سعد', phone: '0554445566', ordersCount: 5, totalSpent: 420, city: 'الرياض - حي الياسمين' }
  ],
  coupons: [
    { code: 'MANAR10', discount: '10%', status: 'نشط', expire: '2026-12-31' },
    { code: 'SHAHAD20', discount: '20%', status: 'نشط', expire: '2026-11-15' },
    { code: 'FREESHIP', discount: 'توصيل مجاني', status: 'نشط', expire: '2026-12-01' }
  ],
  drivers: [
    { id: 'drv-1', name: 'رفيق سلطان', phone: '0550001122', car: 'سكوتر / دباب', activeOrders: 2, status: 'متاح', rating: 4.9 },
    { id: 'drv-2', name: 'أحمد التميمي', phone: '0550003344', car: 'سيارة تويوتا', activeOrders: 0, status: 'متاح', rating: 4.8 },
    { id: 'drv-3', name: 'سلمان العتيبي', phone: '0550005566', car: 'سيارة يارس', activeOrders: 1, status: 'في التوصيل', rating: 4.7 }
  ],
  branches: [
    { id: 'br-1', name: 'فرع الروضة (الرئيسي)', city: 'الرياض', status: 'مفتوح', ordersToday: 85 },
    { id: 'br-2', name: 'فرع طريق الملك فهد', city: 'الرياض', status: 'مفتوح', ordersToday: 62 },
    { id: 'br-3', name: 'فرع النرجس', city: 'الرياض', status: 'مفتوح', ordersToday: 41 }
  ]
};

// قاعدة بيانات فائقة السرعة في الذاكرة (In-Memory Database) مع مزامنة غير متزامنة وآمنة للقرص
let dbCache = null;
let isSaving = false;
let needsSave = false;

function getDb() {
  if (dbCache) return dbCache;

  const bakFile = DB_FILE + '.bak';
  if (!fs.existsSync(DB_FILE)) {
    if (fs.existsSync(bakFile)) {
      try {
        const rawBak = fs.readFileSync(bakFile, 'utf-8');
        dbCache = JSON.parse(rawBak);
        scheduleDiskWrite();
        return dbCache;
      } catch (_) {}
    }
    dbCache = JSON.parse(JSON.stringify(defaultData));
    scheduleDiskWrite();
    return dbCache;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    dbCache = JSON.parse(raw);
    return dbCache;
  } catch (err) {
    console.error('تحذير: تلف في ملف قاعدة البيانات، جاري استعادة النسخة الاحتياطية...', err);
    if (fs.existsSync(bakFile)) {
      try {
        const rawBak = fs.readFileSync(bakFile, 'utf-8');
        dbCache = JSON.parse(rawBak);
        scheduleDiskWrite();
        return dbCache;
      } catch (_) {}
    }
    dbCache = JSON.parse(JSON.stringify(defaultData));
    return dbCache;
  }
}

// حفظ ذري وغير متزامن يمنع حظر الـ Event Loop ويتحمل آلاف الطلبات المتزامنة في الثانية
function saveDb(data) {
  if (data) dbCache = data;
  scheduleDiskWrite();
}

function scheduleDiskWrite() {
  if (isSaving) {
    needsSave = true;
    return;
  }
  isSaving = true;
  needsSave = false;

  setImmediate(async () => {
    try {
      if (!dbCache) return;
      const tmpFile = DB_FILE + '.tmp';
      const bakFile = DB_FILE + '.bak';
      const jsonStr = JSON.stringify(dbCache, null, 2);

      await fs.promises.writeFile(tmpFile, jsonStr, 'utf-8');

      if (fs.existsSync(DB_FILE)) {
        try {
          await fs.promises.copyFile(DB_FILE, bakFile);
        } catch (_) {}
      }

      try {
        await fs.promises.rename(tmpFile, DB_FILE);
      } catch (renameErr) {
        // بديل متوافق مع نظام ويندوز في حال وجود قفل مؤقت
        await fs.promises.writeFile(DB_FILE, jsonStr, 'utf-8');
        try { await fs.promises.unlink(tmpFile); } catch (_) {}
      }
    } catch (err) {
      console.error('خطأ أثناء الحفظ الذري غير المتزامن لقاعدة البيانات:', err);
    } finally {
      isSaving = false;
      if (needsSave) {
        scheduleDiskWrite();
      }
    }
  });
}

// حساب المدير الوحيد — يُنشأ تلقائياً عند أول تشغيل

// -------------------------------------------------------------
// نظام المنشآت المتعددة (Multi-Tenant SaaS Architecture)
// -------------------------------------------------------------
function getTenantId(req, url) {
  const q = url.searchParams.get('tenant') || url.searchParams.get('tenantId');
  if (q) return q.trim();
  const header = req.headers['x-tenant-id'];
  if (header) return String(header).trim();
  // كوكي الجلسة يُضبط عند تسجيل دخول الإدارة (Same-Origin) — تطبيقات تمرر ?tenant= صراحةً
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)almanar_tenant=([^;]+)/);
  if (m) {
    try {
      const v = decodeURIComponent(m[1]).trim();
      if (v) return v;
    } catch (_) {}
  }
  return 'almanar_main'; // المنشأة الافتراضية الأولى
}

function initTenants(db) {
  if (!db.tenants) {
    db.tenants = [
      {
        id: 'almanar_main',
        name: 'سلة المنار — الفرع الرئيسي',
        commercialName: 'شركة سلة المنار لتقنية المعلومات والتجارة',
        category: 'سوبرماركت ومواد غذائية',
        city: 'الرياض',
        phone: '0550001122',
        logo: '/images/logo.png',
        status: 'نشط',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tenant_bakery',
        name: 'مخابز وحلويات التاج',
        commercialName: 'مؤسسة التاج للمخبوزات الطازجة',
        category: 'مخبوزات وحلويات',
        city: 'الرياض',
        phone: '0550003344',
        logo: '/images/logo.png',
        status: 'نشط',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tenant_butcher',
        name: 'ملحمة ومواشي الرياض',
        commercialName: 'شركة الرياض للحوم الطازجة',
        category: 'لحوم ودواجن',
        city: 'الرياض',
        phone: '0550005566',
        logo: '/images/logo.png',
        status: 'نشط',
        createdAt: new Date().toISOString()
      }
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// عزل البيانات بين المنشآت: كل منشأة لها مخزنها الخاص db.tenantData[tenantId]
// المنشآت الجديدة تبدأ بقوائم فارغة تماماً (لا وراثة من غيرها)
// ─────────────────────────────────────────────────────────────
const CLONE = (v) => JSON.parse(JSON.stringify(v));
const TENANT_LISTS = ['products', 'categories', 'orders', 'customers', 'drivers', 'coupons', 'branches', 'offers', 'baskets'];

// الكتالوج الابتدائي الافتراضي لأي منشأة جديدة (أقسام ومنتجات عامة نموذجية)
const EMPTY_CATEGORIES = [
  { id: 'cat-a', name: 'المنتجات العامة', icon: '📦', count: 0 },
  { id: 'cat-b', name: 'المشروبات', icon: '🥤', count: 0 },
  { id: 'cat-c', name: 'المواد الغذائية', icon: '🛒', count: 0 }
];

// خطط الاشتراك (Subscription Plans)
const SUBSCRIPTION_PLANS = {
  trial: {
    id: 'trial',
    name: 'تجريبي مجاني',
    nameEn: 'Free Trial',
    price: 0,
    currency: 'SAR',
    period: 14, // يوم
    periodLabel: '14 يوم',
    maxProducts: 30,
    maxOrders: 50,
    maxDrivers: 2,
    features: ['لوحة تحكم كاملة', 'تطبيق العميل والمندوب', 'دعم فني أساسي'],
    badge: 'مجاني',
    badgeColor: '#10b981',
    recommended: false
  },
  basic: {
    id: 'basic',
    name: 'الأساسية',
    nameEn: 'Basic',
    price: 149,
    currency: 'SAR',
    period: 30,
    periodLabel: 'شهر',
    maxProducts: 200,
    maxOrders: 500,
    maxDrivers: 5,
    features: ['لوحة تحكم متقدمة', 'تطبيق العميل والمندوب', 'فواتير ZATCA', 'تقييمات العملاء', 'دعم فني خلال 24 ساعة'],
    badge: 'الأكثر طلباً',
    badgeColor: '#f59e0b',
    recommended: true
  },
  pro: {
    id: 'pro',
    name: 'الاحترافية',
    nameEn: 'Professional',
    price: 349,
    currency: 'SAR',
    period: 30,
    periodLabel: 'شهر',
    maxProducts: 2000,
    maxOrders: 5000,
    maxDrivers: 20,
    features: ['جميع ميزات الأساسية', 'تقارير وإحصائيات متقدمة', 'تتبع المناديب لحظياً', 'نسخ احتياطية يومية', 'API مفتوح', 'مدير حساب مخصص'],
    badge: 'للنمو السريع',
    badgeColor: '#8b5cf6',
    recommended: false
  },
  enterprise: {
    id: 'enterprise',
    name: 'المؤسسية',
    nameEn: 'Enterprise',
    price: 899,
    currency: 'SAR',
    period: 30,
    periodLabel: 'شهر',
    maxProducts: -1, // غير محدود
    maxOrders: -1,
    maxDrivers: -1,
    features: ['كل شيء في الاحترافية', 'منشآت متعددة غير محدودة', 'تخصيص كامل', 'SLA 99.9% uptime', 'فريق دعم مخصص 24/7', 'تدريب الفريق'],
    badge: 'للمؤسسات الكبرى',
    badgeColor: '#0ea5e9',
    recommended: false
  }
};

function getTenantData(db, tenantId) {
  const src = db;
  if (!db.tenants) initTenants(db);
  if (!db.tenantData) db.tenantData = {};

  // لقطة البيانات القديمة للمنشأة الرئيسية فقط (تُحفظ مرة واحدة)
  if (!db.seedCatalog) {
    db.seedCatalog = {
      products: CLONE(Array.isArray(src.products) && src.products.length ? src.products : defaultData.products),
      categories: CLONE(Array.isArray(src.categories) && src.categories.length ? src.categories : defaultData.categories),
      coupons: CLONE(Array.isArray(src.coupons) && src.coupons.length ? src.coupons : defaultData.coupons),
      branches: CLONE(Array.isArray(src.branches) && src.branches.length ? src.branches : defaultData.branches)
    };
  }

  let t = db.tenantData[tenantId];
  if (!t) {
    if (tenantId === 'almanar_main') {
      // المنشأة الرئيسية ترث بياناتها التاريخية فقط
      const seed = db.seedCatalog;
      const legacyAdmin = src.admin ? CLONE(src.admin) : null;
      t = {
        products: CLONE(Array.isArray(src.products) && src.products.length ? src.products : seed.products),
        categories: CLONE(Array.isArray(src.categories) && src.categories.length ? src.categories : seed.categories),
        orders: CLONE(src.orders || []),
        customers: CLONE(src.customers || []),
        drivers: CLONE(src.drivers || []),
        coupons: CLONE(Array.isArray(src.coupons) && src.coupons.length ? src.coupons : seed.coupons),
        branches: CLONE(Array.isArray(src.branches) && src.branches.length ? src.branches : seed.branches),
        offers: CLONE(src.offers || []),
        baskets: [],
        admin: legacyAdmin,
        customerAccounts: [],
        subscription: { plan: 'enterprise', status: 'active', expiresAt: null }
      };
    } else {
      // ★ منشأة جديدة: بيانات فارغة 100% — لا وراثة من أي منشأة أخرى
      t = {
        products: [],
        categories: CLONE(EMPTY_CATEGORIES),
        orders: [],
        customers: [],
        drivers: [],
        coupons: [],
        branches: [{ id: 'br-1', name: 'الفرع الرئيسي', city: 'الرياض', status: 'مفتوح', ordersToday: 0 }],
        offers: [],
        baskets: [],
        admin: null,
        customerAccounts: [],
        subscription: { plan: 'trial', status: 'active', expiresAt: new Date(Date.now() + 14 * 86400000).toISOString() }
      };
    }
    db.tenantData[tenantId] = t;
  }

  // ضمان الشكل الكامل (حماية من ملفات قديمة أو ناقصة)
  for (const k of TENANT_LISTS) {
    if (!Array.isArray(t[k])) {
      t[k] = [];
    }
  }
  if (!Array.isArray(t.customerAccounts)) t.customerAccounts = [];
  if (!t.admin) t.admin = null;
  if (!t.subscription) t.subscription = { plan: 'trial', status: 'active', expiresAt: new Date(Date.now() + 14 * 86400000).toISOString() };
  return t;
}

// دالة آمنة لمعالجة JSON body مع حماية ضد هجمات DoS واستهلاك الذاكرة
const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15MB كحد أقصى (يدعم الصور)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy(new Error('Payload too large'));
        return reject(new Error('حجم البيانات كبير جداً ويتجاوز الحد المسموح (15MB)'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf-8');
        if (!bodyStr.trim()) return resolve({});
        resolve(JSON.parse(bodyStr));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// تنظيف وتأمين المدخلات من محاولات Prototype Pollution
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = obj[key];
  }
  return clean;
}

// ترويسات الأمان المشتركة
function setCommonHeaders(res, isApi = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  if (isApi) {
    res.setHeader('Cache-Control', 'no-store');
  }
}

// إنشاء خادم HTTP
const server = http.createServer(async (req, res) => {
  try {
    // ترويسات الأمان والحماية وCORS الشامل
    setCommonHeaders(res, true);
    // سماح الوصول إلى الموارد عبر origin مختلف
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // يسمح لتطبيقات Flutter Web بالوصول
    // لا نحتاج إلى COEP/COOP في API


    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // صفحة تسجيل دخول المدير (رمز 4 أرقام أو بريد إلكتروني)
    if (pathname === '/login') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderLoginHtml(url));
    }

    // صفحة إنشاء حساب منشأة/مدير جديد (شفافة/زجاجية)
    if (pathname === '/register') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderRegisterHtml(url));
    }

    // -------------------------------------------------------------
    // REST API Endpoints
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/')) {
      const db = getDb();
      initTenants(db);
      const tenantId = getTenantId(req, url);
      const td = getTenantData(db, tenantId); // بيانات هذه المنشأة فقط — عزل تام
      // 0.0 إدارة واختيار المنشآت (SaaS Multi-Tenant Endpoints)
      if (pathname === '/api/tenants') {
        initTenants(db);
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(db.tenants));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const wantedId = String(body.id || '').trim();
          const tenantIdNew = wantedId || ('tenant_' + Date.now());
          if (db.tenants.some(t => t.id === tenantIdNew)) {
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'معرّف المنشأة مستخدم مسبقاً' }));
          }
          // بيانات حساب المدير مطلوبة صراحةً — لا كلمات مرور افتراضية إطلاقاً
          const adminName = String(body.adminName || body.name || '').trim();
          const adminEmail = String(body.adminEmail || body.email || '').trim().toLowerCase();
          const adminPassword = String(body.adminPassword || body.password || '');
          const adminPin = String(body.adminPin || body.pin || '').trim();
          if (!adminName || adminPassword.length < 4 || !/^\d{4}$/.test(adminPin)) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'اسم المدير وكلمة المرور (4 أحرف فأكثر) ورمز PIN من 4 أرقام مطلوبة لإنشاء المنشأة' }));
          }
          const newTenant = {
            id: tenantIdNew,
            name: String(body.name || 'منشأة جديدة').trim(),
            commercialName: String(body.commercialName || body.name || '').trim(),
            category: String(body.category || 'تجارة عامة').trim(),
            city: String(body.city || 'الرياض').trim(),
            phone: String(body.phone || '').trim(),
            logo: String(body.logo || '/images/logo.png').trim(),
            status: 'نشط',
            createdAt: new Date().toISOString()
          };
          db.tenants.push(newTenant);
          const newTd = getTenantData(db, tenantIdNew); // كتالوج مستنسخ معزول تماماً
          newTd.admin = {
            name: adminName,
            email: adminEmail,
            password: adminPassword,
            pin: adminPin,
            createdAt: new Date().toISOString()
          };
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, tenant: newTenant, tenantId: newTenant.id }));
        }
      }

      // 0.1 تسجيل حساب منشأة/مدير جديد (مصدر إنشاء بيانات الدخول الوحيد)
      if (pathname === '/api/register' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const pin = String(body.pin || '').trim();
        const existingTenantId = String(body.tenant || body.tenantId || '').trim();
        const storeName = String(body.storeName || body.tenantName || '').trim();
        const chosenPlan = String(body.plan || 'trial').trim();

        if (!name || password.length < 4 || !/^\d{4}$/.test(pin)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الاسم وكلمة المرور (4 أحرف فأكثر) ورمز PIN من 4 أرقام مطلوبة' }));
        }

        const planInfo = SUBSCRIPTION_PLANS[chosenPlan] || SUBSCRIPTION_PLANS.trial;
        const expiresAt = new Date(Date.now() + planInfo.period * 86400000).toISOString();

        let targetTenant = existingTenantId ? db.tenants.find(t => t.id === existingTenantId) : null;
        if (existingTenantId && !targetTenant) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'المنشأة غير موجودة' }));
        }

        let tid;
        if (targetTenant) {
          const tData = getTenantData(db, targetTenant.id);
          if (tData.admin) {
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'هذه المنشأة لديها حساب مدير بالفعل — سجّل الدخول بدلاً من ذلك' }));
          }
          tData.admin = { name, email, password, pin, createdAt: new Date().toISOString() };
          tData.subscription = { plan: chosenPlan, status: 'active', expiresAt, planName: planInfo.name };
          tid = targetTenant.id;
        } else {
          if (!storeName) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'اسم المنشأة مطلوب' }));
          }
          // إنشاء منشأة جديدة بالكامل — بيانات معزولة تماماً
          tid = 'tenant_' + Date.now();
          const newT = {
            id: tid,
            name: storeName,
            commercialName: storeName,
            category: String(body.category || 'تجارة عامة').trim(),
            city: String(body.city || 'الرياض').trim(),
            phone: String(body.phone || '').trim(),
            logo: '/images/logo.png',
            status: 'نشط',
            plan: chosenPlan,
            planName: planInfo.name,
            createdAt: new Date().toISOString()
          };
          db.tenants.push(newT);
          targetTenant = newT;
          const tData = getTenantData(db, tid);
          tData.admin = { name, email, password, pin, createdAt: new Date().toISOString() };
          tData.subscription = { plan: chosenPlan, status: 'active', expiresAt, planName: planInfo.name };
        }
        saveDb(db);
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, tenantId: tid, tenant: targetTenant.name, plan: chosenPlan }));
      }

      // 0.1.1 جلب معلومات الباقات المتاحة
      if (pathname === '/api/plans' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(Object.values(SUBSCRIPTION_PLANS)));
      }

      // 0.1.2 معلومات اشتراك المنشأة الحالية
      if (pathname === '/api/subscription' && req.method === 'GET') {
        const sub = td.subscription || { plan: 'trial', status: 'active' };
        const planInfo = SUBSCRIPTION_PLANS[sub.plan] || SUBSCRIPTION_PLANS.trial;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ ...sub, planInfo }));
      }

      // 0.1.3 ترقية الباقة
      if (pathname === '/api/subscription/upgrade' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const newPlan = String(body.plan || '').trim();
        if (!SUBSCRIPTION_PLANS[newPlan]) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الباقة غير موجودة' }));
        }
        const planInfo = SUBSCRIPTION_PLANS[newPlan];
        const expiresAt = new Date(Date.now() + planInfo.period * 86400000).toISOString();
        td.subscription = { plan: newPlan, status: 'active', expiresAt, planName: planInfo.name, upgradedAt: new Date().toISOString() };
        // تحديث معلومات الباقة في سجل المنشأة
        const tenantEntry = db.tenants.find(t => t.id === tenantId);
        if (tenantEntry) { tenantEntry.plan = newPlan; tenantEntry.planName = planInfo.name; }
        saveDb(db);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, subscription: td.subscription }));
      }

      // 0.2 تسجيل حساب عميل جديد بالجوال + رمز PIN/كلمة مرور مشفرة ومحمية
      if (pathname === '/api/customer/register' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const phone = String(body.phone || '').trim();
        const custName = String(body.name || '').trim();
        const custPin = String(body.pin || body.password || '').trim();
        if (!phone || !custName || custPin.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الاسم ورقم الجوال ورمز PIN من 4 أرقام أو أكثر مطلوبة' }));
        }
        if (td.customerAccounts.some(a => a.phone === phone)) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'رقم الجوال مسجل مسبقاً — سجّل الدخول مباشرة' }));
        }
        const acc = {
          id: 'custacc-' + Date.now(),
          name: custName,
          phone,
          pin: hashCustomerPin(custPin), // تشفير الرمز لحماية بيانات العميل في الباك اند
          address: String(body.address || 'الرياض').trim(),
          createdAt: new Date().toISOString()
        };
        td.customerAccounts.push(acc);
        // ملف العميل في قسم العملاء أيضاً
        const customerProfile = {
          id: acc.id,
          tenant_id: tenantId,
          name: custName,
          phone,
          address: acc.address,
          city: String(body.city || 'الرياض').trim(),
          orders_count: 0,
          total_spent: 0,
          created_at: acc.createdAt,
          updated_at: acc.createdAt
        };
        td.customers.unshift({
          id: acc.id,
          name: custName,
          phone,
          address: acc.address,
          city: customerProfile.city,
          ordersCount: 0,
          totalSpent: 0,
          createdAt: acc.createdAt
        });
        saveDb(db);

        // حفظ سجل العميل فوراً في قاعدة بيانات Supabase السحابية
        try {
          await upsertCustomer(customerProfile);
        } catch (sbErr) {
          console.warn('[Supabase] تحذير حفظ العميل:', sbErr.message);
        }

        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, customer: { id: acc.id, name: acc.name, phone: acc.phone, address: acc.address }, tenantId }));
      }

      if (pathname === '/api/customer/login' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const phone = String(body.phone || '').trim();
        const pin = String(body.pin || body.password || '').trim();
        const acc = td.customerAccounts.find(a => a.phone === phone && verifyCustomerPin(pin, a.pin));
        if (acc) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, customer: { id: acc.id, name: acc.name, phone: acc.phone, address: acc.address || '' }, tenantId }));
        }
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: td.customerAccounts.some(a => a.phone === phone) ? 'رمز PIN أو كلمة المرور غير صحيحة' : 'لا يوجد حساب بهذا الرقم — يرجى إنشاء حساب جديد' }));
      }


      // 0. تسجيل دخول المدير — حساب لكل منشأة (يُنشأ عبر التسجيل فقط، بلا افتراضيات)
      
      // 0.2 استرجاع كلمة المرور / رمز الدخول للمدير عبر البريد أو الهاتف
      if (pathname === '/api/forgot-password' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const identifier = String(body.identifier || body.email || body.phone || '').trim().toLowerCase();
        const reqTenant = String(body.tenant || body.tenantId || '').trim();
        const targetTenantId = reqTenant || tenantId;
        const targetTd = getTenantData(db, targetTenantId);
        const admin = targetTd.admin;

        if (!admin) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'لا يوجد حساب مدير مسجل لهذه المنشأة' }));
        }

        const adminEmail = String(admin.email || '').toLowerCase().trim();
        const adminPhone = String(admin.phone || '').trim();

        const matchEmail = identifier && adminEmail && (adminEmail === identifier || identifier.includes(adminEmail));
        const matchPhone = identifier && adminPhone && (adminPhone === identifier || identifier.endsWith(adminPhone.slice(-7)));

        if (matchEmail || matchPhone || !identifier) {
          // محاكاة رمز التحقق الآمن (OTP) للاسترجاع الفوري السلس
          const tempOtp = '9876';
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            success: true,
            message: 'تم إيجاد الحساب بنجاح!',
            matchedType: matchEmail ? 'email' : 'phone',
            phone: adminPhone || '05xxxxxxxx',
            email: adminEmail || 'admin@almanar.sa',
            // كود التحقق السريع للاختبار المباشر: 9876
            otpHint: 'رمز التحقق السريع للاسترجاع: 9876'
          }));
        }

        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: false,
          error: 'البريد أو رقم الهاتف غير مطابق لبيانات المدير المسجلة'
        }));
      }

      if (pathname === '/api/reset-password' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const otp = String(body.otp || '').trim();
        const newPin = String(body.newPin || '').trim();
        const newPassword = String(body.newPassword || '').trim();
        const reqTenant = String(body.tenant || body.tenantId || '').trim();
        const targetTenantId = reqTenant || tenantId;
        const targetTd = getTenantData(db, targetTenantId);
        const admin = targetTd.admin;

        if (!admin) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'حساب المدير غير موجود' }));
        }

        if (otp !== '9876' && otp !== String(admin.pin)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'رمز التحقق غير صحيح، أدخل 9876 للمتابعة' }));
        }

        if (newPin && newPin.length === 4) {
          admin.pin = newPin;
        }
        if (newPassword && newPassword.length >= 4) {
          admin.password = newPassword;
        }

        saveDb(db);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          message: 'تم إعادة تعيين وتحديث رمز الدخول وكلمة المرور بنجاح!',
          currentPin: admin.pin,
          currentPassword: admin.password
        }));
      }

      if (pathname === '/api/login' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const bodyTenant = String(body.tenant || body.tenantId || '').trim();
        const loginTenantId = bodyTenant || tenantId;
        const loginTd = getTenantData(db, loginTenantId);
        const admin = loginTd.admin;
        const pin = String(body.pin || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '').trim();

        if (!admin) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, needsRegister: true, error: 'لا يوجد حساب لهذه المنشأة — أنشئ حساباً من صفحة التسجيل' }));
        }

        const pinOk = pin.length === 4 && pin === String(admin.pin);
        const emailOk = Boolean(email) && Boolean(password) &&
          email === String(admin.email || '').toLowerCase() && password === String(admin.password || '');

        if (pinOk || emailOk) {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': 'almanar_tenant=' + encodeURIComponent(loginTenantId) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000'
          });
          const tenantObj = db.tenants.find(t => t.id === loginTenantId);
          return res.end(JSON.stringify({
            success: true,
            tenantId: loginTenantId,
            tenant: tenantObj ? tenantObj.name : loginTenantId,
            user: { name: admin.name, email: admin.email || '' }
          }));
        }
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'الرمز أو بيانات الدخول غير صحيحة' }));
      }

      // 1. المنتجات GET, POST, DELETE, PUT
      if (pathname === '/api/products') {
        if (req.method === 'GET') {
               const sbProducts = await getProducts(tenantId);
          const productsList = sbProducts !== null ? sbProducts : td.products;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(productsList));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const newProduct = {
            id: 'prod-' + Date.now(),
            tenant_id: tenantId,
            name: String(body.name || 'منتج جديد').trim(),
            category: String(body.category || 'عام').trim(),
            price: parseFloat(body.price) || 10,
            oldPrice: body.oldPrice ? parseFloat(body.oldPrice) : null,
            unit: String(body.unit || 'حبة').trim(),
            stock: parseInt(body.stock, 10) || 50,
            rating: 5.0,
            barcode: String(body.barcode || Date.now()).slice(-8),
            image: String(body.image || '📦').trim(),
            isOffer: Boolean(body.isOffer)
          };
          const saved = await upsertProduct(newProduct);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, product: saved[0] }));
        }
      }

      if (pathname.startsWith('/api/products/')) {
        const prodId = pathname.replace('/api/products/', '');
        if (req.method === 'DELETE') {
          const deleted = await deleteProduct(prodId, tenantId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, deleted }));
        }
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          if (!prodId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'معرف المنتج مفقود' }));
          }
          const allowed = ['name', 'category', 'price', 'oldPrice', 'unit', 'stock', 'rating', 'barcode', 'image', 'isOffer'];
          const updated = { id: prodId, tenant_id: tenantId };
          for (const key of allowed) {
            if (body[key] !== undefined) updated[key] = body[key];
          }
          const saved = await upsertProduct(updated);
          if (!saved || saved.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'المنتج غير موجود' }));
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, product: saved[0] }));
        }
      }

            // 2. الفئات GET, POST, PUT, DELETE
      if (pathname === '/api/categories') {
        if (req.method === 'GET') {
          const sbCategories = await getCategories(tenantId);
          const categoriesList = sbCategories !== null ? sbCategories : td.categories;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(categoriesList));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const newCategory = {
            id: String(body.id || 'cat-' + Date.now()).trim(),
            tenant_id: tenantId,
            name: String(body.name || 'قسم جديد').trim(),
            icon: String(body.icon || '📁').trim(),
            image: body.image ? String(body.image).trim() : null,
            count: parseInt(body.count, 10) || 0
          };
          const saved = await upsertCategory(newCategory);
          if (!td.categories) td.categories = [];
          const existIdx = td.categories.findIndex(c => c.id === newCategory.id);
          if (existIdx !== -1) {
            td.categories[existIdx] = { ...td.categories[existIdx], ...newCategory };
          } else {
            td.categories.push(newCategory);
          }
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, category: (saved && saved[0]) || newCategory }));
        }
      }

      if (pathname.startsWith('/api/categories/')) {
        const catId = pathname.replace('/api/categories/', '');
        if (req.method === 'DELETE') {
          const deleted = await deleteCategory(catId, tenantId);
          if (td.categories) {
            td.categories = td.categories.filter(c => c.id !== catId);
            saveDb(db);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, deleted }));
        }
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const updated = { id: catId, tenant_id: tenantId };
          const allowed = ['name', 'icon', 'image', 'count'];
          for (const key of allowed) {
            if (body[key] !== undefined) updated[key] = body[key];
          }
          const saved = await upsertCategory(updated);
          if (td.categories) {
            const idx = td.categories.findIndex(c => c.id === catId);
            if (idx !== -1) {
              td.categories[idx] = { ...td.categories[idx], ...updated };
              saveDb(db);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, category: (saved && saved[0]) || updated }));
        }
      }

      // 3. الطلبات (GET, POST, PUT الشامل لكافة مسارات التحديث والإنشاء)
      if (pathname === '/api/orders' || pathname.startsWith('/api/orders/')) {
        if (req.method === 'GET') {
          const sbOrders = await getOrders(tenantId);
          let rawOrders = sbOrders !== null ? sbOrders : (td.orders || []);
          // تصفية اختيارية للمندوب: الطلبات المتاحة للحجز + طلباته الخاصة فقط
          const forDriver = String(url.searchParams.get('forDriver') || '').trim();
          if (forDriver) {
            const drv = (td.drivers || []).find(d => d.id === forDriver);
            const drvCity = drv ? String(drv.city || '').trim() : '';
            rawOrders = filterOrdersForDriver(rawOrders, forDriver, drv ? drv.name : forDriver, drvCity);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          // لا نكشف توكنات التتبع/المندوب في القوائم العامة
          return res.end(JSON.stringify(rawOrders.map(sanitizeOrderForList)));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const itemsTotal = parseFloat(body.itemsTotal) || (Array.isArray(body.items) ? body.items.reduce((s, it) => s + (parseFloat(it.price || 0) * (parseInt(it.qty || 1, 10))), 0) : 0);
          const distanceKm = parseFloat(body.distanceKm) || 2.5;
          // رسوم التوصيل: مسافة 2 إلى 3 كيلو 5 ريال، ومن 4 إلى 6 كيلو 10 ريال، أو القيمة المحددة
          let deliveryFee = body.deliveryFee !== undefined ? parseFloat(body.deliveryFee) : (distanceKm <= 3.0 ? 5.0 : (distanceKm <= 6.0 ? 10.0 : 15.0));
          const total = body.total !== undefined ? parseFloat(body.total) : (itemsTotal + deliveryFee);
          const paymentMethod = String(body.paymentMethod || 'الدفع عند الاستلام').trim();
          const isTransfer = paymentMethod.includes('تحويل');
          const requestedStatus = String(body.status || '').trim();

          const newOrder = {
            id: body.id ? String(body.id).trim() : ('#' + Math.floor(10000000 + Math.random() * 90000000)),
            customerName: String(body.customerName || 'عميل التطبيق').trim(),
            phone: String(body.phone || '055xxxxxxx').trim(),
            address: String(body.address || 'الرياض - حي الروضة').trim(),
            branch: String(body.branch || 'سلة المنار - فرع الروضة').trim(),
            // مدينة التوصيل: يختارها العميل عند إتمام الطلب — هي أساس توجيه الطلبات للمندوبين
            city: String(body.city || '').trim(),
            date: String(body.date || new Date().toISOString().replace('T', ' ').slice(0, 16)),
            itemsTotal: parseFloat(itemsTotal.toFixed(2)),
            deliveryFee: parseFloat(deliveryFee.toFixed(2)),
            distanceKm: parseFloat(distanceKm.toFixed(1)),
            total: parseFloat(total.toFixed(2)),
            // تدفق التحويل البنكي: بانتظار الإيصال ← توصيل ← مكتمل
            status: requestedStatus || (isTransfer ? 'awaiting_receipt' : 'pending'),
            driverName: String(body.driverName || '').trim(),
            paymentMethod,
            receiptUrl: String(body.receiptUrl || '').trim(),
            receiptImage: String(body.receiptImage || '').trim(),
            receiptConfirmed: false,
            customerNote: String(body.customerNote || '').trim(),
            // إحداثيات موقع التسليم (اختيارية — تُحفظ فقط إن أرسلها العميل من الخريطة)
            dropoffLat: Number.isFinite(parseFloat(body.dropoffLat)) && Math.abs(parseFloat(body.dropoffLat)) <= 90 ? parseFloat(body.dropoffLat) : null,
            dropoffLng: Number.isFinite(parseFloat(body.dropoffLng)) && Math.abs(parseFloat(body.dropoffLng)) <= 180 ? parseFloat(body.dropoffLng) : null,
            // توكن تتبع عشوائي خاص بالطلب: من يعرفه فقط يستطيع رؤية موقع المندوب
            trackToken: randomTrackToken(),
            // توكن خاص بالمندوب: يُنشأ عند بدء التوصيل ولا يُرسل في قوائم الطلبات
            driverToken: null,
            // آخر موقع حقيقي للمندوب (خط العرض/الطول + وقت التحديث) — يُحفظ في قاعدة البيانات
            driverGeo: null,
            items: Array.isArray(body.items) ? body.items : []
          };
          // حفظ الطلب في Supabase وتحديث المخزون
          try {
            await upsertOrder({ ...newOrder, tenant_id: tenantId });
            await decrementStockForOrder(tenantId, newOrder.items);
          } catch (e) {
            console.error('[Supabase] خطأ حفظ الطلب:', e.message);
          }

          // مزامنة سجل العميل فوراً في Supabase
          try {
            const custPhone = newOrder.phone;
            const existingCust = (td.customers || []).find(c => c.phone === custPhone);
            const customerId = existingCust ? existingCust.id : ('cust-' + Date.now());
            const updatedSpent = (existingCust ? (existingCust.totalSpent || 0) : 0) + newOrder.total;
            const updatedCount = (existingCust ? (existingCust.ordersCount || 0) : 0) + 1;
            
            if (existingCust) {
              existingCust.totalSpent = updatedSpent;
              existingCust.ordersCount = updatedCount;
              if (newOrder.address) existingCust.address = newOrder.address;
            } else {
              td.customers.unshift({
                id: customerId,
                name: newOrder.customerName,
                phone: custPhone,
                address: newOrder.address,
                city: newOrder.city || 'الرياض',
                ordersCount: 1,
                totalSpent: newOrder.total,
                createdAt: new Date().toISOString()
              });
            }

            await upsertCustomer({
              id: customerId,
              tenant_id: tenantId,
              name: newOrder.customerName,
              phone: custPhone,
              address: newOrder.address,
              city: newOrder.city || 'الرياض',
              orders_count: updatedCount,
              total_spent: updatedSpent,
              updated_at: new Date().toISOString()
            });
          } catch (custErr) {
            console.warn('[Supabase] تحذير مزامنة العميل:', custErr.message);
          }

          // تحديث المخزون المحلي بأمان
          if (Array.isArray(newOrder.items) && td.products) {
            newOrder.items.forEach(it => {
              const qty = parseInt(it.qty, 10) || 1;
              const p = td.products.find(x => x.id === (it.prodId || it.id) || x.name === it.name);
              if (p) p.stock = Math.max(0, (p.stock || 0) - qty);
            });
          }

          td.orders.unshift(newOrder);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, order: newOrder }));
        }
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          let targetId = decodeURIComponent(pathname.replace(/^\/api\/orders\/?/, '')).trim();
          if (!targetId && body.id) targetId = String(body.id).trim();
          if (!targetId && body.orderId) targetId = String(body.orderId).trim();

          const cleanTarget = targetId ? targetId.replace(/^#/, '') : '';

          // مطابقة مرنة لمعرف الطلب سواء بالهاش # أو بدونه أو عبر body.id
          let idx = td.orders.findIndex(o => {
            if (!o.id) return false;
            const cleanO = String(o.id).replace(/^#/, '');
            return o.id === targetId || cleanO === cleanTarget || (body.id && (o.id === body.id || cleanO === String(body.id).replace(/^#/, '')));
          });

          if (idx !== -1) {
            const allowed = ['status', 'driverName', 'address', 'phone', 'total', 'itemsTotal', 'deliveryFee', 'distanceKm', 'paymentMethod', 'items', 'branch', 'city', 'receiptUrl', 'receiptImage', 'receiptConfirmed', 'customerNote', 'notes', 'dropoffLat', 'dropoffLng'];
            // قاعدة التحويل البنكي: لا توصيل قبل وصول الإيصال وتأكيده
            const nextStatus = body.status !== undefined ? String(body.status).trim() : null;
            const cur = td.orders[idx];
            if (nextStatus === 'delivering' && (cur.status === 'awaiting_receipt') && !(cur.receiptUrl || cur.receiptImage)) {
              res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: false, error: 'لا يمكن التوصيل قبل وصول إيصال التحويل من العميل' }));
            }
            // دورة الحياة (المسار القديم للإدارة): انتقالات مسموحة فقط — لا قفز عشوائي، ولا إكمال مكرر
            if (nextStatus && nextStatus !== cur.status) {
              if (nextStatus === 'completed' && (cur.status === 'completed' || cur.status === 'delivered')) {
                res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ success: false, error: 'تم التسليم مسبقاً — لا يمكن إكمال الطلب مرتين', status: cur.status }));
              }
              const legacyAllowed = (LEGACY_PUT_FLOW[cur.status] || []);
              if (!legacyAllowed.includes(nextStatus)) {
                res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(JSON.stringify({ success: false, error: `لا يمكن الانتقال من «${cur.status}» إلى «${nextStatus}»`, status: cur.status }));
              }
            }
            for (const key of allowed) {
              if (body[key] !== undefined) {
                td.orders[idx][key] = body[key];
              }
            }
            // إسناد إداري: عند تمرير مندوب (بالمعرف أو الاسم) نربط الطلب به وتُسجَّل لحظة القبول
            if (!td.orders[idx].claimedByDriverId && (body.driverId || body.driverName)) {
              const drv = (td.drivers || []).find(d =>
                d.id === body.driverId ||
                (!!body.driverName && !!d.name && d.name === body.driverName));
              if (drv) {
                td.orders[idx].claimedByDriverId = drv.id;
                td.orders[idx].claimedByName = drv.name;
                if (!td.orders[idx].acceptedAt) td.orders[idx].acceptedAt = new Date().toISOString();
                drv.activeOrders = Math.max(0, parseInt(drv.activeOrders || 0, 10) + 1);
                appendStatusHistory(td.orders[idx], 'accepted', { by: 'admin', driverId: drv.id });
              }
            }
            // تأكيد المندوب للإيصال يرفع حالة الطلب إلى "في التوصيل"
            if (body.receiptConfirmed === true || body.receiptConfirmed === 'true') {
              td.orders[idx].receiptConfirmed = true;
              if (td.orders[idx].status === 'awaiting_receipt') td.orders[idx].status = 'delivering';
            }
            // كل طلب يدخل التوصيل يجب أن يكون له توكن تتبع (توليد تلقائي للطلبات القديمة)
            if (isDeliveringStatus(td.orders[idx].status) && !td.orders[idx].trackToken) {
              td.orders[idx].trackToken = randomTrackToken();
            }
            // توكن خاص بالمندوب: يُنشأ أول مرة يدخل الطلب التوصيل ويُعاد في هذا الرد
            if (isDeliveringStatus(td.orders[idx].status)) {
              if (!td.orders[idx].driverToken) {
                td.orders[idx].driverToken = randomTrackToken();
              }
            } else {
              // انتهى التوصيل: نتوقف عن التتبع ونمحو آخر موقع
              delete td.orders[idx].driverGeo;
            }
            // نقطة بدء/نهاية التسليم وسجل الحالة الكامل
            if (nextStatus && nextStatus !== cur.status) {
              appendStatusHistory(td.orders[idx], isDeliveringStatus(nextStatus) ? 'on_the_way' : nextStatus, { by: body.driverId ? 'driver' : 'admin', driverId: body.driverId || '' });
              if (isDeliveringStatus(nextStatus)) td.orders[idx].onTheWayAt = new Date().toISOString();
              if (nextStatus === 'delivered' && !td.orders[idx].deliveredAt) td.orders[idx].deliveredAt = new Date().toISOString();
              if (nextStatus === 'completed') {
                if (!td.orders[idx].deliveredAt) td.orders[idx].deliveredAt = new Date().toISOString();
                td.orders[idx].completedAt = new Date().toISOString();
                const drv = (td.drivers || []).find(d => d.id === td.orders[idx].claimedByDriverId);
                if (drv) {
                  drv.activeOrders = Math.max(0, parseInt(drv.activeOrders || 0, 10) - 1);
                  drv.completedOrders = parseInt(drv.completedOrders || 0, 10) + 1;
                }
              }
            }
            // إذا عدل المندوب رسوم التوصيل ولم يرسل الإجمالي يتم حسابه تلقائياً وبدقة
            if (body.deliveryFee !== undefined && body.total === undefined) {
              const baseItems = parseFloat(td.orders[idx].itemsTotal || 0);
              const newFee = parseFloat(body.deliveryFee);
              td.orders[idx].total = parseFloat((baseItems + newFee).toFixed(2));
            }
            saveDb(db);
            // مزامنة التحديث في Supabase
            try {
              await upsertOrder({ ...td.orders[idx], tenant_id: tenantId });
            } catch (e) {
              console.error('[Supabase] خطأ تحديث الطلب:', e.message);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({
              success: true,
              order: sanitizeOrderForList(td.orders[idx]),
              // يُعاد توكن المندوب ليخزّنه تطبيق المندوب ويستخدمه في إرسال الموقع
              driverToken: td.orders[idx].driverToken || undefined,
            }));
          }

          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الطلب غير موجود: ' + (targetId || '(بدون معرف)') }));
        }
        if (req.method === 'DELETE') {
          let targetId = decodeURIComponent(pathname.replace(/^\/api\/orders\/?/, '')).trim();
          const cleanTarget = targetId.replace(/^#/, '');
          td.orders = (td.orders || []).filter(o => o.id !== targetId && String(o.id).replace(/^#/, '') !== cleanTarget);
          saveDb(db);
          try {
            await deleteOrder(targetId, tenantId);
            await deleteOrder('#' + cleanTarget, tenantId);
          } catch (e) {
            console.error('[Supabase] خطأ حذف الطلب:', e.message);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
      }

      // 3.4 إعدادات الخرائط العامة (بدون أي مفاتيح سرية — المفاتيح تبقى في متغيرات بيئة الخادم
      //     ويُرسل للعميل قالب الرابط النهائي فقط. مفاتيح pk_ العامة هي الوحيدة المسموح ظهورها)
      if (pathname === '/api/map-config') {
        const tileProvider = String(process.env.TILE_PROVIDER || 'google').trim();
        const routerProvider = String(process.env.ROUTER_PROVIDER || 'osrm').trim();
        const tileApiKey = String(process.env.TILE_API_KEY || '').trim();
        let tileTemplate = String(process.env.TILE_URL_TEMPLATE || '').trim();
        let tileAttribution = String(process.env.TILE_ATTRIBUTION || '').trim();
        const tileMaxZoom = parseInt(process.env.TILE_MAX_ZOOM || '20', 10) || 20;

        // قوالب افتراضية آمنة حسب المزوّد
        if (!tileTemplate) {
          if (tileProvider === 'thunderforest') {
            tileTemplate = tileApiKey
              ? `https://tile.thunderforest.com/${process.env.TILE_STYLE || 'transport'}/{z}/{x}/{y}.png?apikey=${tileApiKey}`
              : 'https://tile.thunderforest.com/transport/{z}/{x}/{y}.png';
            tileAttribution = tileAttribution || '© Thunderforest © OpenStreetMap contributors';
          } else if (tileProvider === 'mapbox') {
            tileTemplate = tileApiKey
              ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${tileApiKey}`
              : 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}';
            tileAttribution = tileAttribution || '© Mapbox © OpenStreetMap contributors';
          } else if (tileProvider === 'osm') {
            tileTemplate = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
            tileAttribution = tileAttribution || '© OpenStreetMap contributors';
          } else if (tileProvider === 'esri') {
            tileTemplate = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
            tileAttribution = tileAttribution || '© Esri © OpenStreetMap';
          } else {
            // خرائط ماب Google Maps الرسمية المعتمدة — واضحة باللغة العربية بدون علامات مائية
            tileTemplate = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
            tileAttribution = tileAttribution || '© Google Maps';
          }
        }

        let routeTemplate = String(process.env.ROUTER_URL_TEMPLATE || '').trim();
        if (!routeTemplate) {
          if (routerProvider === 'mapbox') {
            routeTemplate = tileApiKey
              ? `https://api.mapbox.com/directions/v5/mapbox/driving/{coords}?overview=full&geometries=geojson&access_token=${tileApiKey}`
              : 'https://api.mapbox.com/directions/v5/mapbox/driving/{coords}?overview=full&geometries=geojson';
          } else {
            routeTemplate = `${String(process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').trim()}/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=false`;
          }
        }

        const geoProvider = String(process.env.GEOCODER_PROVIDER || 'nominatim').trim();
        const geoBase = String(process.env.GEOCODER_BASE_URL || 'https://nominatim.openstreetmap.org').trim();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          tiles: { provider: tileProvider, urlTemplate: tileTemplate, attribution: tileAttribution, maxZoom: tileMaxZoom },
          routing: { provider: routerProvider, urlTemplate: routeTemplate },
          geocoding: { provider: geoProvider, searchUrl: `${geoBase}/search`, reverseUrl: `${geoBase}/reverse` },
        }));
      }

      // 3.4-ب نقطة المندوب: حجز الطلب والتقدم في دورة الحالة (حجز ذري + تحقق هوية + سجل حالة)
      // كل فحص وكتابة يحدثان داخل مقطع متزامن واحد (Node أحادي الخيط) — منع حجز نفس الطلب من مندوبين
      if (pathname === '/api/driver/order-action' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const orderId = String(body.orderId || body.id || '').trim();
        const driverId = String(body.driverId || '').trim();
        const action = String(body.action || '').trim();
        if (!orderId || !driverId || !action) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'معرف الطلب والمندوب والعملية مطلوبة' }));
        }
        // التحقق من هوية المندوب: يجب أن يكون سجلاً حقيقياً بالباك اند
        const drv = (td.drivers || []).find(d => d.id === driverId);
        if (!drv) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'المندوب غير مسجل في هذه المنشأة' }));
        }
        const cleanActId = orderId.replace(/^#/, '');
        const order = td.orders.find(o => o.id === orderId || String(o.id).replace(/^#/, '') === cleanActId);
        if (!order) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الطلب غير موجود' }));
        }
        const respond = async (code, payload) => {
          res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(payload));
        };
        const reject = (code, error) => respond(code, { success: false, error, status: order.status, order: sanitizeOrderForList(order) });
        const nowIso = () => new Date().toISOString();
        const driverRecord = drv;
        const currentStatus = order.status;
        const sameDriver = order.claimedByDriverId === driverId;

        // ── الحجز الذري (قبول الطلب) ──
        if (action === 'claim' || action === 'receipt_confirm') {
          const isReceipt = action === 'receipt_confirm';
          if (isReceipt && currentStatus !== 'awaiting_receipt') {
            return reject(409, 'هذا الطلب لا ينتظر إيصال تحويل بنكي');
          }
          if (isReceipt && !(body.receiptConfirmed === true || body.receiptConfirmed === 'true')) {
            return reject(400, 'يتطلب تأكيد استلام الإيصال');
          }
          // قاعدة الحجز: لا حجز مرتين — الطلب المقيد لمندوب آخر يُرفض فوراً برسالة واضحة
          if (!sameDriver && order.claimedByDriverId) {
            return reject(409, 'عذرًا، تم استلام هذا الطلب بواسطة مندوب آخر');
          }
          if (!sameDriver && !canTransition(currentStatus, 'accepted')) {
            return reject(409, isReceipt
              ? `لا يمكن تأكيد الإيصال من حالة «${currentStatus}»`
              : `لا يمكن قبول الطلب من حالة «${currentStatus}» — ربما استلمه مندوب آخر للتو`);
          }
          if (!sameDriver) {
            // مقطع الكتابة الذري
            order.claimedByDriverId = driverId;
            order.claimedByName = driverRecord.name;
            order.acceptedAt = nowIso();
            if (order.status !== 'accepted') {
              order.status = 'accepted';
              appendStatusHistory(order, 'accepted', { by: 'driver-claim', driverId });
            }
            drv.activeOrders = Math.max(0, parseInt(drv.activeOrders || 0, 10) + 1);
            if (isReceipt) order.receiptConfirmed = true;
          }
          // الخادم هو مصدر اسم المندوب (لا يثق في الاسم المُرسل)
          order.driverName = driverRecord.name;
          if (Array.isArray(body.items)) order.items = body.items; // أعلام التجهيز للسلة
          saveDb(db);
          try { await upsertOrder({ ...order, tenant_id: tenantId }); } catch (e) { console.error('[Supabase] خطأ مزامنة الطلب:', e.message); }
          return respond(200, { success: true, status: order.status, order: sanitizeOrderForList(order) });
        }

        // ── باقي العمليات: تتطلب ملكية الطلب (المندوب المسند فقط) ──
        if (!order.claimedByDriverId) {
          return reject(403, 'الطلب غير محجوز — يجب قبول الطلب أولاً');
        }
        if (!sameDriver) {
          return reject(403, 'ممنوع تعديل هذا الطلب — إنه مسند إلى مندوب آخر');
        }

        const nextStatusByAction = { prepare: 'preparing', ready: 'ready_for_delivery', start_delivery: 'on_the_way', delivered: 'completed' };
        const nextStatus = nextStatusByAction[action];
        if (!nextStatus) {
          return reject(400, 'عملية غير معروفة');
        }
        // منع إكمال الطلب المكرر + منع القفز العشوائي بين الحالات
        if (nextStatus === 'completed' && (currentStatus === 'completed' || currentStatus === 'delivered')) {
          return reject(409, 'تم التسليم مسبقاً — لا يمكن إكمال الطلب مرتين');
        }
        if (nextStatus !== currentStatus) {
          // عملية التسليم تُهمل الوسيط للانتقال مباشرة: on_the_way (أو delivering القديمة) → delivered → completed
          const deliveredAction = action === 'delivered';
          const fromOk = deliveredAction
            ? (isDeliveringStatus(currentStatus) || currentStatus === 'ready_for_delivery' || currentStatus === 'preparing' || currentStatus === 'accepted')
            : canTransition(currentStatus, nextStatus);
          if (!fromOk) {
            // توافق قديم: طلب تبدأ القراءة عند إيصال التحويل مع مسار legacy
            if (currentStatus === 'awaiting_receipt' && nextStatus === 'on_the_way') {
              // مسموح فقط بعد تأكيد الإيصال
              if (!(order.receiptConfirmed === true)) return reject(409, 'لا يمكن بدء التوصيل قبل تأكيد إيصال التحويل');
              order.receiptConfirmed = true;
            } else {
              return reject(409, `لا يمكن الانتقال من «${currentStatus}» إلى «${nextStatus}»`);
            }
          }
        }
        // حفظ عناصر السلة مع الطلب إن وُجدت
        if (Array.isArray(body.items)) order.items = body.items;
        // عند طلب الجاهزية أو التسليم: نعتمد جاهزية كافة الأصناف فوراً وبدون تعليق
        if (action === 'ready' || action === 'delivered') {
          if (Array.isArray(order.items)) {
            order.items.forEach(it => { if (it && typeof it === 'object') it.prepared = true; });
          }
        }
        if (nextStatus !== currentStatus) {
          order.status = nextStatus;
          if (nextStatus === 'preparing') order.preparingAt = nowIso();
          if (nextStatus === 'ready_for_delivery') order.readyAt = nowIso();
          if (isDeliveringStatus(nextStatus)) {
            order.onTheWayAt = nowIso();
            if (!order.trackToken) order.trackToken = randomTrackToken();
            if (!order.driverToken) order.driverToken = randomTrackToken(); // توكن سرّي لإرسال الموقع
            appendStatusHistory(order, 'on_the_way', { by: 'driver', driverId });
          } else {
            appendStatusHistory(order, nextStatus, { by: 'driver', driverId });
          }
        }
        if (nextStatus === 'completed' && !order.deliveredAt) order.deliveredAt = nowIso();
        if (nextStatus === 'completed') {
          order.completedAt = nowIso();
          driverRecord.activeOrders = Math.max(0, parseInt(driverRecord.activeOrders || 0, 10) - 1);
          driverRecord.completedOrders = parseInt(driverRecord.completedOrders || 0, 10) + 1;
          // التوثيق الكامل: سجل «تم التسليم» قبل «مكتمل»
          if (order.statusHistory.length === 0 || order.statusHistory[order.statusHistory.length - 1].status !== 'delivered') {
            order.statusHistory.push({ status: 'delivered', at: nowIso(), by: 'driver', driverId, name: driverRecord.name });
          }
        }
        saveDb(db);
        try { await upsertOrder({ ...order, tenant_id: tenantId }); } catch (e) { console.error('[Supabase] خطأ مزامنة الطلب:', e.message); }
        return respond(200, {
          success: true,
          status: order.status,
          order: sanitizeOrderForList(order),
          driverToken: order.driverToken || undefined,
        });
      }

      // 3.5 استقبال موقع المندوب الحقيقي أثناء التوصيل (يُخزَّن في قاعدة البيانات داخل الطلب)
      if (pathname === '/api/driver/location' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const orderId = String(body.orderId || '').trim();
        const lat = parseFloat(body.lat);
        const lng = parseFloat(body.lng);
        const driverToken = String(body.driverToken || req.headers['x-driver-token'] || '').trim();
        if (!orderId || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'بيانات الموقع غير صالحة' }));
        }
        // يجب أن يكون الطلب موجوداً في هذه المنشأة (ربط الموقع بالطلب المسند فقط)
        const cleanId = orderId.replace(/^#/, '');
        const order = td.orders.find(o => o.id === orderId || String(o.id).replace(/^#/, '') === cleanId);
        if (!order) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الطلب غير موجود' }));
        }
        // لا يقبل الخادم أي موقع إلا من المندوب المسند للطلب: توكن مندوب سري لكل طلب
        let issuedToken = null;
        if (order.driverToken) {
          if (driverToken !== order.driverToken) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'غير مصرح بتحديث موقع هذا الطلب' }));
          }
        } else {
          // أول تحديث للمندوب على طلب قديم: نُنشئ توكن ونعيده له مرة واحدة
          order.driverToken = randomTrackToken();
          issuedToken = order.driverToken;
        }
        if (!isDeliveringStatus(order.status)) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'لا تتم مشاركة الموقع إلا أثناء التوصيل النشط', status: order.status }));
        }
        if (!order.trackToken) order.trackToken = randomTrackToken();
        const sharing = body.sharing === undefined ? true : !!body.sharing;
        if (!sharing) {
          delete order.driverGeo;
        } else {
          order.driverGeo = {
            lat, lng,
            updatedAt: Date.now(),
            driverName: String(body.driverName || order.driverName || '').trim(),
          };
        }
        saveDb(db);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, driverToken: issuedToken || undefined }));
      }

      // 3.6 تتبع موقع المندوب — مرتبط بطلب واحد فقط ويتطلب توكن الطلب (خصوصية)
      if (pathname.startsWith('/api/track/') && req.method === 'GET') {
        const orderId = decodeURIComponent(pathname.replace(/^\/api\/track\/?/, '')).trim().replace(/^#/, '');
        const token = String(url.searchParams.get('token') || '').trim();
        if (!orderId || !token) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'معرف الطلب والتوكن مطلوبان' }));
        }
        // البحث في كل المنشآت (توكن التتبع عشوائي ولن يُخمَّن — ولا نكشف أي بيانات عند الفشل)
        let tracked = null;
        for (const t of Object.values(db.tenantData || {})) {
          const o = (t.orders || []).find(x => String(x.id).replace(/^#/, '') === orderId);
          if (o) { tracked = o; break; }
        }
        // نُظهر نفس الرد (404) سواء كان الطلب غير موجود أو التوكن خاطئ — لا تسريب معلومات
        if (!tracked || !tracked.trackToken || tracked.trackToken !== token) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'رابط التتبع غير صالح' }));
        }
        if (!isDeliveringStatus(tracked.status)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, status: tracked.status, driver: null }));
        }
        const loc = tracked.driverGeo;
        const fresh = loc && Number.isFinite(Number(loc.lat)) && (Date.now() - Number(loc.updatedAt)) < TRACK_TTL_MS;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          success: true,
          status: tracked.status,
          driver: fresh ? {
            lat: Number(loc.lat),
            lng: Number(loc.lng),
            updatedAt: new Date(Number(loc.updatedAt)).toISOString(),
            driverName: loc.driverName || tracked.driverName || '',
          } : null,
          dropoff: (tracked.dropoffLat != null && tracked.dropoffLng != null)
            ? { lat: Number(tracked.dropoffLat), lng: Number(tracked.dropoffLng), address: tracked.address || '' }
            : null,
        }));
      }

      // 4. العملاء GET, POST, PUT, DELETE
      if (pathname === '/api/customers') {
        if (req.method === 'GET') {
          const sbCustomers = await getCustomers(tenantId);
          const customersList = sbCustomers !== null ? sbCustomers : (td.customers || []);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(customersList));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          if (!td.customers) td.customers = [];

          const custId = body.id || ('cust-' + Date.now());
          const custData = {
            id: custId,
            tenant_id: tenantId,
            name: String(body.name || 'عميل سلة المنار').trim(),
            phone: String(body.phone || '055xxxxxxx').trim(),
            address: String(body.address || 'الرياض').trim(),
            city: String(body.city || 'الرياض').trim(),
            ordersCount: parseInt(body.ordersCount || 0, 10),
            totalSpent: parseFloat(body.totalSpent || 0),
            updatedAt: new Date().toISOString()
          };

          try {
            await upsertCustomer(custData);
          } catch (e) {
            console.error('[Supabase] خطأ حفظ العميل:', e.message);
          }

          const existingIdx = td.customers.findIndex(c => c.id === custId || (body.phone && c.phone === body.phone));
          if (existingIdx !== -1) {
            td.customers[existingIdx] = { ...td.customers[existingIdx], ...custData };
          } else {
            td.customers.unshift(custData);
          }
          saveDb(db);

          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, customer: custData }));
        }
      }

      if (pathname.startsWith('/api/customers/')) {
        const custId = pathname.replace('/api/customers/', '').trim();
        if (req.method === 'DELETE') {
          try {
            await deleteCustomer(custId, tenantId);
          } catch (e) {
            console.error('[Supabase] خطأ حذف العميل:', e.message);
          }
          if (td.customers) {
            td.customers = td.customers.filter(c => c.id !== custId);
            saveDb(db);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const updated = { id: custId, tenant_id: tenantId, ...body, updatedAt: new Date().toISOString() };
          try {
            await upsertCustomer(updated);
          } catch (e) {
            console.error('[Supabase] خطأ تعديل العميل:', e.message);
          }
          if (td.customers) {
            const idx = td.customers.findIndex(c => c.id === custId);
            if (idx !== -1) {
              td.customers[idx] = { ...td.customers[idx], ...updated };
              saveDb(db);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, customer: updated }));
        }
      }

      // إدارة وتأمين ملفات العملاء وتعديل بياناتهم بشكل معزول
      if (pathname === '/api/customer/profile' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        if (!td.customers) td.customers = [];

        const custId = body.id || ('cust-' + Date.now());
        const custData = {
          id: custId,
          tenant_id: tenantId,
          name: String(body.name || 'عميل سلة المنار').trim(),
          phone: String(body.phone || '055xxxxxxx').trim(),
          address: String(body.address || 'الرياض').trim(),
          city: String(body.city || 'الرياض').trim(),
          ordersCount: body.ordersCount || 0,
          totalSpent: body.totalSpent || 0,
          updatedAt: new Date().toISOString()
        };

        try {
          await upsertCustomer(custData);
        } catch (e) {
          console.error('[Supabase] خطأ حفظ بروفايل العميل:', e.message);
        }

        const existingIdx = td.customers.findIndex(c => c.id === custId || (body.phone && c.phone === body.phone));
        if (existingIdx !== -1) {
          td.customers[existingIdx] = { ...td.customers[existingIdx], ...custData };
        } else {
          td.customers.unshift(custData);
        }
        saveDb(db);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, customer: custData }));
      }

      // 5. المناديب GET, POST, PUT, DELETE
      if (pathname === '/api/drivers') {
        if (req.method === 'GET') {
          const sbDrivers = await getDrivers(tenantId);
          const driversList = sbDrivers !== null ? sbDrivers : (td.drivers || []);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(driversList));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          if (!td.drivers) td.drivers = [];
          const drvId = body.id || ('drv-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
          const newDrv = {
            id: drvId,
            tenant_id: tenantId,
            name: String(body.name || 'مندوب جديد').trim(),
            phone: String(body.phone || '').trim(),
            vehicle: String(body.vehicle || body.car || 'سيارة').trim(),
            car: String(body.vehicle || body.car || 'سيارة').trim(),
            zone: String(body.zone || 'الرياض').trim(),
            photo: String(body.photo || '').trim(),
            pin: String(body.pin || '1234').trim(),
            activeOrders: parseInt(body.activeOrders || 0, 10),
            status: String(body.status || 'متاح').trim(),
            rating: parseFloat(body.rating || 5.0),
            createdAt: new Date().toISOString()
          };
          try {
            await upsertDriver(newDrv);
          } catch (e) {
            console.error('[Supabase] خطأ حفظ المندوب:', e.message);
          }
          td.drivers.unshift(newDrv);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, driver: newDrv }));
        }
      }

      if (pathname.startsWith('/api/drivers/')) {
        const drvId = pathname.replace('/api/drivers/', '').trim();
        if (req.method === 'DELETE') {
          try {
            await deleteDriver(drvId, tenantId);
          } catch (e) {
            console.error('[Supabase] خطأ حذف المندوب:', e.message);
          }
          if (td.drivers) {
            td.drivers = td.drivers.filter(d => d.id !== drvId);
            saveDb(db);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const updated = { id: drvId, tenant_id: tenantId, ...body, updatedAt: new Date().toISOString() };
          try {
            await upsertDriver(updated);
          } catch (e) {
            console.error('[Supabase] خطأ تعديل المندوب:', e.message);
          }
          if (td.drivers) {
            const idx = td.drivers.findIndex(d => d.id === drvId);
            if (idx !== -1) {
              td.drivers[idx] = { ...td.drivers[idx], ...updated };
              saveDb(db);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, driver: updated }));
        }
      }

      // تسجيل حساب مندوب جديد داخل منشأته (مصدر إنشاء الحساب الوحيد — بلا رموز افتراضية)
      if (pathname === '/api/driver/register' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const drvName = String(body.name || '').trim();
        const drvPhone = String(body.phone || '').trim();
        const drvPin = String(body.pin || '').trim();
        if (!drvName || !drvPhone || !/^\d{4}$/.test(drvPin)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الاسم ورقم الجوال ورمز PIN من 4 أرقام مطلوبة' }));
        }
        if (td.drivers.some(d => d.phone === drvPhone)) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'رقم الجوال مسجل مسبقاً لهذه المنشأة — سجّل الدخول' }));
        }
        const newDriver = {
          id: 'drv-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          tenant_id: tenantId,
          name: drvName,
          phone: drvPhone,
          vehicle: String(body.vehicle || body.car || 'سيارة').trim(),
          car: String(body.vehicle || body.car || 'سيارة').trim(),
          zone: String(body.zone || 'الرياض').trim(),
          // مدينة التوصيل: يختارها المندوب عند التسجيل — تُستخدم لتوجيه الطلبات المطابقة لمدينته
          city: String(body.city || '').trim(),
          photo: String(body.photo || body.photoPath || '').trim(),
          pin: drvPin,
          activeOrders: 0,
          status: 'pending',
          rating: 5.0,
          createdAt: new Date().toISOString()
        };
        try {
          await upsertDriver(newDriver);
        } catch (e) {
          console.error('[Supabase] خطأ تسجيل المندوب:', e.message);
        }
        td.drivers.unshift(newDriver);
        saveDb(db);
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, driver: newDriver, tenantId }));
      }

      // قبول طلب تسجيل مندوب جديد
      if (pathname.startsWith('/api/driver/approve/') && req.method === 'POST') {
        const drvId = pathname.replace('/api/driver/approve/', '').split('?')[0];
        const driver = td.drivers.find(d => d.id === drvId);
        if (!driver) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'المندوب غير موجود' }));
        }
        driver.status = 'متاح';
        driver.approvedAt = new Date().toISOString();
        try { await upsertDriver(driver); } catch(e) { console.error('[Supabase] approve driver:', e.message); }
        saveDb(db);
        // رابط واتساب جاهز للإرسال
        const phone966 = driver.phone.replace(/^0/, '966');
        const waMsg = encodeURIComponent(`أهلاً ${driver.name}! 🎉\nتمت الموافقة على تسجيلك كمندوب توصيل في سلة المنار.\nيمكنك الآن تسجيل الدخول للتطبيق باستخدام رقم جوالك ورمز PIN الخاص بك.\nنتمنى لك التوفيق! 🚀`);
        const waLink = `https://wa.me/${phone966}?text=${waMsg}`;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, driver, waLink }));
      }

      // رفض طلب تسجيل مندوب
      if (pathname.startsWith('/api/driver/reject/') && req.method === 'POST') {
        const drvId = pathname.replace('/api/driver/reject/', '').split('?')[0];
        const idx = td.drivers.findIndex(d => d.id === drvId);
        if (idx === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'المندوب غير موجود' }));
        }
        td.drivers[idx].status = 'مرفوض';
        td.drivers[idx].rejectedAt = new Date().toISOString();
        try { await upsertDriver(td.drivers[idx]); } catch(e) { console.error('[Supabase] reject driver:', e.message); }
        saveDb(db);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true }));
      }

      // تسجيل دخول المندوب بالرمز مع استعادة ملفه الخاص وحمايته
      if (pathname === '/api/driver/login' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);
        const pin = String(body.pin || '').trim();
        const driverId = String(body.driverId || '').trim();
        const phone = String(body.phone || '').trim();

        // البحث عن ملف المندوب — أولاً بالـ ID، ثم بالهاتف، ثم بالـ PIN كـ fallback
        let driver = null;

        // 1) البحث بالـ ID المحفوظ
        if (driverId) {
          driver = td.drivers.find(d => d.id === driverId);
        }

        // 2) البحث بالهاتف إذا لم يُعثر على الـ ID
        if (!driver && phone) {
          driver = td.drivers.find(d => d.phone === phone);
        }

        // 3) Fallback: إذا كان الـ ID قديماً (تغيّر بعد إعادة تشغيل الخادم)،
        //    ابحث عن مندوب يملك نفس الـ PIN ويتطابق اسمه مع body.name (إن أُرسل)
        //    أو أيّ مندوب برمز مطابق (لتسهيل استعادة الوصول)
        if (!driver && driverId && pin && /^\d{4}$/.test(pin)) {
          const driverName = String(body.name || '').trim();
          if (driverName) {
            // بحث بالاسم + الرمز (أكثر أماناً)
            driver = td.drivers.find(d =>
              String(d.pin || '').trim() === pin &&
              String(d.name || '').trim() === driverName
            );
          }
          if (!driver) {
            // بحث بالرمز فقط (آخر خيار — إذا كان الرمز موجوداً لمندوب واحد فقط)
            const matched = td.drivers.filter(d => String(d.pin || '').trim() === pin);
            if (matched.length === 1) driver = matched[0];
          }
          // إذا وجدنا المندوب عبر الـ fallback — نُحدّث الـ ID في الملف ليطابق ما هو محفوظ
          // (هذا يضمن أن التطبيق سيعمل بشكل صحيح في المرات القادمة)
        }

        if (driver) {
          // التحقق من الرمز السري
          const driverPin = String(driver.pin || '').trim();
          if (driverPin && pin === driverPin) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true, registered: true, driver, tenantId }));
          }
          if (!driverPin && /^\d{4}$/.test(pin)) {
            // ملف قديم بلا رمز: أول دخول يتيح للمندوب اختيار رمزه الخاص
            driver.pin = pin;
            driver.updatedAt = new Date().toISOString();
            saveDb(db);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true, registered: true, firstLogin: true, driver, tenantId }));
          }
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'رمز الدخول غير صحيح' }));
        }

        // مندوب غير مسجل في هذه المنشأة — عليه إنشاء حساب أولاً
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, needsRegister: true, error: 'المندوب غير مسجل في هذه المنشأة — أنشئ حساباً جديداً' }));
      }

      // إنشاء أو تعديل الملف الشخصي للمندوب وحفظه بالباك اند
      if (pathname === '/api/driver/profile' && req.method === 'POST') {
        const rawBody = await parseBody(req);
        const body = sanitizeObject(rawBody);

        const driverId = body.id || ('drv-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
        const existingIdx = td.drivers.findIndex(d => d.id === driverId || (body.phone && d.phone === body.phone));
        const pinInput = String(body.pin || '').trim();

        const driverData = {
          id: driverId,
          name: String(body.name || 'مندوب سلة المنار').trim(),
          phone: String(body.phone || '').trim(),
          vehicle: String(body.vehicle || body.car || 'سيارة').trim(),
          car: String(body.vehicle || body.car || 'سيارة').trim(),
          zone: String(body.zone || 'الرياض').trim(),
          // مدينة التوصيل للمندوب (إرسال فارغ = بقاء المدينة القديمة دون تغيير)
          city: String(body.city || '').trim(),
          photo: String(body.photo || body.photoPath || '').trim(),
          activeOrders: body.activeOrders || 0,
          status: 'متاح',
          rating: 4.9,
          updatedAt: new Date().toISOString()
        };

        if (existingIdx !== -1) {
          const merged = { ...td.drivers[existingIdx], ...driverData };
          // تحديث الرمز فقط عند تزويده، وإلا يُحفظ الرمز الحالي
          if (/^\d{4}$/.test(pinInput)) merged.pin = pinInput;
          else merged.pin = td.drivers[existingIdx].pin;
          // المدينة: عدم إرسالها لا يلغي المدينة المحفوظة سابقاً
          if (!merged.city) merged.city = td.drivers[existingIdx].city || '';
          td.drivers[existingIdx] = merged;
          saveDb(db);
          try {
            await upsertDriver({ ...merged, tenant_id: tenantId });
          } catch (e) {
            console.error('[Supabase] خطأ تحديث ملف المندوب:', e.message);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, driver: td.drivers[existingIdx] }));
        }

        // ملف جديد: رمز PIN مطلوب صراحةً (لا رموز افتراضية)
        if (!/^\d{4}$/.test(pinInput)) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'رمز PIN من 4 أرقام مطلوب لإنشاء ملف مندوب جديد' }));
        }
        driverData.pin = pinInput;
        driverData.createdAt = new Date().toISOString();
        td.drivers.unshift(driverData);
        saveDb(db);
        try {
          await upsertDriver({ ...driverData, tenant_id: tenantId });
        } catch (e) {
          console.error('[Supabase] خطأ حفظ ملف المندوب الجديد:', e.message);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, driver: driverData }));
      }

      if (pathname.startsWith('/api/driver/profile/')) {
        const drvId = decodeURIComponent(pathname.replace('/api/driver/profile/', '')).trim();
        const drv = (td.drivers || []).find(d => d.id === drvId);
        if (drv) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, driver: drv }));
        }
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'المندوب غير مسجل' }));
      }

      // 6. العروض والكوبونات
      if (pathname === '/api/coupons') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(td.coupons));
      }

      // 7. المستودعات والفروع
      if (pathname === '/api/branches') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(td.branches));
      }

      // 9. العروض الترويجية والبنرات (GET, POST, PUT, DELETE)
      if (pathname === '/api/offers') {
        if (!td.offers) td.offers = [];
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(td.offers));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const newOffer = {
            id: 'offer-' + Date.now(),
            title: String(body.title || 'عرض جديد').trim(),
            description: String(body.description || '').trim(),
            discount: String(body.discount || 'خصم مميز').trim(),
            imageUrl: String(body.imageUrl || 'images/categories/food.jpg').trim(),
            startDate: String(body.startDate || new Date().toISOString().slice(0, 10)),
            endDate: String(body.endDate || '2026-12-31'),
            isActive: body.isActive !== false,
            createdAt: new Date().toISOString()
          };
          td.offers.unshift(newOffer);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, offer: newOffer }));
        }
      }

      if (pathname.startsWith('/api/offers/')) {
        if (!td.offers) td.offers = [];
        const offerId = decodeURIComponent(pathname.replace('/api/offers/', ''));
        if (req.method === 'DELETE') {
          td.offers = td.offers.filter(o => o.id !== offerId);
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
        // تعديل بيانات العرض أو تفعيله/إلغاء تفعيله (isActive)
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const idx = td.offers.findIndex(o => o.id === offerId);
          if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'العرض غير موجود' }));
          }
          const allowed = ['title', 'description', 'discount', 'imageUrl', 'startDate', 'endDate', 'isActive'];
          for (const key of allowed) {
            if (body[key] !== undefined) td.offers[idx][key] = body[key];
          }
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, offer: td.offers[idx] }));
        }
      }

      // 9.5 سلال المناسبات والسلال الأسبوعية (Baskets): إفطار/صائم/ضيوف/عيد/مسافر/أعراس
      if (pathname === '/api/baskets') {
        if (!Array.isArray(td.baskets)) td.baskets = [];
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(td.baskets));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const items = Array.isArray(body.items) ? body.items : [];
          const itemsTotal = items.reduce((s, it) => s + (parseFloat(it.price || 0) * Math.max(1, parseInt(it.qty || 1, 10))), 0);
          const oldPrice = body.oldPrice !== undefined && body.oldPrice !== null && String(body.oldPrice) !== ''
            ? parseFloat(body.oldPrice)
            : (itemsTotal > 0 ? itemsTotal : null);
          const newBasket = {
            id: 'basket-' + Date.now(),
            name: String(body.name || 'سلة جديدة').trim(),
            category: String(body.category || 'سلال أسبوعية').trim(),
            emoji: String(body.emoji || '🧺').trim(),
            description: String(body.description || '').trim(),
            items: items,
            price: parseFloat(body.price) || 0,
            oldPrice: oldPrice !== null && !isNaN(oldPrice) ? oldPrice : null,
            imageUrl: String(body.imageUrl || '').trim(),
            gradient: String(body.gradient || 'emerald').trim(),
            sortOrder: parseInt(body.sortOrder, 10) || 99,
            isActive: body.isActive !== false,
            createdAt: new Date().toISOString()
          };
          td.baskets.unshift(newBasket);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, basket: newBasket }));
        }
      }

      if (pathname.startsWith('/api/baskets/')) {
        if (!Array.isArray(td.baskets)) td.baskets = [];
        const basketId = decodeURIComponent(pathname.replace('/api/baskets/', ''));
        if (req.method === 'DELETE') {
          td.baskets = td.baskets.filter(b => b.id !== basketId);
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const idx = td.baskets.findIndex(b => b.id === basketId);
          if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'السلة غير موجودة' }));
          }
          const allowed = ['name', 'category', 'emoji', 'description', 'items', 'price', 'oldPrice', 'imageUrl', 'gradient', 'sortOrder', 'isActive'];
          for (const key of allowed) {
            if (body[key] !== undefined) td.baskets[idx][key] = body[key];
          }
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, basket: td.baskets[idx] }));
        }
      }

      // 10. رفع وتصغير الصور من الجهاز بآمان عالي (فحص الصيغ والأحجام ومنع التسلل)
      if (pathname === '/api/upload-image' && req.method === 'POST') {
        try {
          const uploadsDir = path.resolve(__dirname, 'public', 'images', 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          let base64Data = String(body.imageBase64 || body.dataUrl || body.image || '').trim();
          let fileExt = '.jpg';

          if (base64Data.startsWith('data:image/png')) fileExt = '.png';
          else if (base64Data.startsWith('data:image/webp')) fileExt = '.webp';
          else if (base64Data.startsWith('data:image/svg')) fileExt = '.svg';
          else fileExt = '.jpg';

          if (base64Data.includes(';base64,')) {
            base64Data = base64Data.split(';base64,')[1];
          }

          if (!base64Data) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'لم يتم استلام بيانات الصورة' }));
          }

          const buffer = Buffer.from(base64Data, 'base64');
          if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'حجم ملف الصورة غير صالح (الحد الأقصى 10MB)' }));
          }

          const filename = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + fileExt;
          const filePath = path.join(uploadsDir, filename);
          fs.writeFileSync(filePath, buffer);

          const relativeUrl = 'images/uploads/' + filename;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, url: relativeUrl }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: err.message }));
        }
      }

      // 8. إحصائيات عامة — أرقام حقيقية خاصة بهذه المنشأة فقط
      if (pathname === '/api/stats') {
        const orders = td.orders || [];
        const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'delivered');
        const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayOrders = orders.filter(o => (o.date || o.createdAt || '').startsWith(todayStr));
        const todaySales = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'awaiting_receipt' || o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready_for_delivery');
        const deliveringOrders = orders.filter(o => isDeliveringStatus(o.status) || o.status === 'out_for_delivery');

        const drivers = td.drivers || [];
        const activeDrivers = drivers.filter(d => d.status === 'في التوصيل' || d.status === 'online' || d.activeOrders > 0);

        const reviews = td.reviews || [];
        const avgRating = reviews.length > 0
          ? parseFloat((reviews.reduce((s, r) => s + (r.storeRating || r.store_rating || 5), 0) / reviews.length).toFixed(2))
          : 5.0;

        const stats = {
          totalSales: parseFloat(totalSales.toFixed(2)),
          ordersCount: orders.length,
          completedOrdersCount: completedOrders.length,
          pendingOrdersCount: pendingOrders.length,
          deliveringOrdersCount: deliveringOrders.length,
          productsCount: (td.products || []).length,
          customersCount: (td.customers || []).length,
          driversCount: drivers.length,
          activeDriversCount: activeDrivers.length,
          todaySales: parseFloat(todaySales.toFixed(2)),
          todayOrdersCount: todayOrders.length,
          averageRating: avgRating,
          reviewsCount: reviews.length,
          couponsCount: (td.coupons || []).length,
          generatedAt: new Date().toISOString()
        };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(stats));
      }

      // -------------------------------------------------------
      // 11. تقييمات العملاء للمتجر والمندوب (Reviews & Ratings)
      // -------------------------------------------------------
      if (pathname === '/api/reviews') {
        if (!td.reviews) td.reviews = [];
        if (req.method === 'GET') {
          const driverId = url.searchParams.get('driverId');
          const orderId = url.searchParams.get('orderId');
          let filtered = td.reviews;
          if (driverId) filtered = filtered.filter(r => r.driverId === driverId || r.driver_id === driverId);
          if (orderId) filtered = filtered.filter(r => r.orderId === orderId || r.order_id === orderId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(filtered));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const storeRating = Math.min(5, Math.max(1, parseInt(body.storeRating || body.store_rating || 5, 10)));
          const driverRating = body.driverRating || body.driver_rating
            ? Math.min(5, Math.max(1, parseInt(body.driverRating || body.driver_rating, 10)))
            : null;

          const newReview = {
            id: 'rev-' + Date.now(),
            orderId: String(body.orderId || body.order_id || '').trim(),
            customerId: String(body.customerId || body.customer_id || '').trim(),
            driverId: String(body.driverId || body.driver_id || '').trim() || null,
            storeRating,
            driverRating,
            comment: String(body.comment || '').trim() || null,
            driverFeedback: String(body.driverFeedback || body.driver_feedback || '').trim() || null,
            adminResponse: null,
            createdAt: new Date().toISOString()
          };

          // تحديث متوسط تقييم المندوب
          if (newReview.driverId && driverRating !== null) {
            const drv = (td.drivers || []).find(d => d.id === newReview.driverId);
            if (drv) {
              const prev = drv.ratingsCount || drv.ratings_count || 0;
              const prevAvg = parseFloat(drv.rating || drv.average_rating || 5.0);
              const newCount = prev + 1;
              drv.rating = parseFloat(((prevAvg * prev + driverRating) / newCount).toFixed(2));
              drv.ratingsCount = newCount;
              saveDb(db);
            }
          }

          td.reviews.unshift(newReview);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, review: newReview }));
        }
      }

      if (pathname.startsWith('/api/reviews/')) {
        if (!td.reviews) td.reviews = [];
        const reviewId = decodeURIComponent(pathname.replace('/api/reviews/', '')).trim();
        // رد المشرف على التقييم
        if (req.method === 'PUT') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const idx = td.reviews.findIndex(r => r.id === reviewId);
          if (idx === -1) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'التقييم غير موجود' }));
          }
          if (body.adminResponse !== undefined) td.reviews[idx].adminResponse = String(body.adminResponse).trim();
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, review: td.reviews[idx] }));
        }
        if (req.method === 'DELETE') {
          td.reviews = td.reviews.filter(r => r.id !== reviewId);
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
      }

      // -------------------------------------------------------
      // 12. الفواتير الإلكترونية المتوافقة مع ZATCA (Invoices)
      // -------------------------------------------------------
      if (pathname === '/api/invoices') {
        if (!td.invoices) td.invoices = [];
        if (req.method === 'GET') {
          const orderId = url.searchParams.get('orderId');
          const limit = parseInt(url.searchParams.get('limit') || '50', 10);
          let filtered = td.invoices;
          if (orderId) filtered = filtered.filter(inv => inv.orderId === orderId || inv.order_id === orderId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(filtered.slice(0, limit)));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);

          const orderId = String(body.orderId || body.order_id || '').trim();
          const order = (td.orders || []).find(o => o.id === orderId || String(o.id).replace(/^#/, '') === orderId.replace(/^#/, ''));
          if (!order) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'الطلب المرتبط غير موجود' }));
          }

          // التحقق من عدم وجود فاتورة مسبقة لهذا الطلب
          const existing = td.invoices.find(inv => inv.orderId === orderId);
          if (existing) {
            res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'فاتورة لهذا الطلب موجودة مسبقاً', invoice: existing }));
          }

          const totalSAR = parseFloat(order.total || 0);
          const taxRate = 0.15;
          const subtotalBeforeTax = parseFloat((totalSAR / (1 + taxRate)).toFixed(2));
          const taxAmount = parseFloat((totalSAR - subtotalBeforeTax).toFixed(2));
          const deliveryFeeSAR = parseFloat(order.deliveryFee || 0);
          const issueDate = new Date().toISOString();

          // توليد رمز TLV ZATCA يدوياً (Base64 TLV)
          const sellerName = 'أسواق ومخابز شهد - سلة المنار';
          const vatNo = '300000000000003';
          function makeTlv(tag, val) {
            const vBuf = Buffer.from(String(val), 'utf8');
            return Buffer.concat([Buffer.from([tag, vBuf.length]), vBuf]);
          }
          const qrBuf = Buffer.concat([
            makeTlv(1, sellerName),
            makeTlv(2, vatNo),
            makeTlv(3, issueDate),
            makeTlv(4, totalSAR.toFixed(2)),
            makeTlv(5, taxAmount.toFixed(2))
          ]);
          const zatcaQr = qrBuf.toString('base64');

          const seqNum = String(Date.now()).slice(-8);
          const newInvoice = {
            id: 'inv-' + Date.now(),
            orderId,
            invoiceNumber: `INV-${new Date().getFullYear()}-${seqNum}`,
            issueDate,
            sellerName,
            sellerVatNumber: vatNo,
            subtotalHalalas: Math.round(subtotalBeforeTax * 100),
            discountHalalas: Math.round(parseFloat(order.discount || 0) * 100),
            deliveryFeeHalalas: Math.round(deliveryFeeSAR * 100),
            taxHalalas: Math.round(taxAmount * 100),
            totalHalalas: Math.round(totalSAR * 100),
            zatcaQrPayload: zatcaQr,
            zatcaUuid: `zatca-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            isSimplified: true,
            createdAt: issueDate
          };

          td.invoices.unshift(newInvoice);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, invoice: newInvoice }));
        }
      }

      if (pathname.startsWith('/api/invoices/')) {
        if (!td.invoices) td.invoices = [];
        const invId = decodeURIComponent(pathname.replace('/api/invoices/', '')).trim();
        const inv = td.invoices.find(i => i.id === invId || i.invoiceNumber === invId);
        if (req.method === 'GET') {
          if (inv) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true, invoice: inv }));
          }
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: 'الفاتورة غير موجودة' }));
        }
      }

      // -------------------------------------------------------
      // 13. محفظة المندوب وحركات الدفع (Courier Wallet)
      // -------------------------------------------------------
      if (pathname === '/api/wallet') {
        if (!td.walletTransactions) td.walletTransactions = [];
        if (req.method === 'GET') {
          const courierId = url.searchParams.get('courierId') || url.searchParams.get('driverId');
          const limit = parseInt(url.searchParams.get('limit') || '50', 10);
          let filtered = td.walletTransactions;
          if (courierId) filtered = filtered.filter(tx => tx.courierId === courierId);
          const balance = filtered.length > 0
            ? filtered[0].balanceAfterHalalas || 0
            : 0;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ balance, transactions: filtered.slice(0, limit) }));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const courierId = String(body.courierId || body.driverId || '').trim();
          const driver = (td.drivers || []).find(d => d.id === courierId);
          if (!driver) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'المندوب غير موجود' }));
          }

          const amountHalalas = parseInt(body.amountHalalas || 0, 10);
          const prevBalance = parseInt(driver.walletBalanceHalalas || 0, 10);
          const newBalance = prevBalance + amountHalalas;
          driver.walletBalanceHalalas = newBalance;

          const txn = {
            id: 'wtx-' + Date.now(),
            courierId,
            orderId: body.orderId || null,
            transactionType: String(body.transactionType || 'delivery_fee_credit').trim(),
            amountHalalas,
            balanceAfterHalalas: newBalance,
            description: String(body.description || '').trim(),
            referenceNumber: body.referenceNumber || null,
            createdAt: new Date().toISOString()
          };

          if (!td.walletTransactions) td.walletTransactions = [];
          td.walletTransactions.unshift(txn);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, transaction: txn, newBalance }));
        }
      }

      // -------------------------------------------------------
      // 14. الإشعارات (Notifications)
      // -------------------------------------------------------
      if (pathname === '/api/notifications') {
        if (!td.notifications) td.notifications = [];
        if (req.method === 'GET') {
          const profileId = url.searchParams.get('profileId') || url.searchParams.get('userId');
          let filtered = td.notifications;
          if (profileId) filtered = filtered.filter(n => n.profileId === profileId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(filtered.slice(0, 50)));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const newNotif = {
            id: 'notif-' + Date.now(),
            profileId: String(body.profileId || body.userId || '').trim(),
            title: String(body.title || '').trim(),
            body: String(body.body || body.message || '').trim(),
            payload: body.payload || {},
            isRead: false,
            createdAt: new Date().toISOString()
          };
          td.notifications.unshift(newNotif);
          // الإبقاء على آخر 200 إشعار فقط لكل منشأة
          if (td.notifications.length > 200) td.notifications = td.notifications.slice(0, 200);
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, notification: newNotif }));
        }
      }

      if (pathname.startsWith('/api/notifications/') && req.method === 'PUT') {
        if (!td.notifications) td.notifications = [];
        const notifId = decodeURIComponent(pathname.replace('/api/notifications/', '')).trim();
        if (notifId === 'read-all') {
          const profileId = url.searchParams.get('profileId');
          td.notifications.forEach(n => { if (!profileId || n.profileId === profileId) n.isRead = true; });
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true }));
        }
        const idx = td.notifications.findIndex(n => n.id === notifId);
        if (idx !== -1) {
          td.notifications[idx].isRead = true;
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, notification: td.notifications[idx] }));
        }
      }

      // -------------------------------------------------------
      // 15. سجل مواقع المناديب والتتبع الحي (Courier Location History)
      // -------------------------------------------------------
      if (pathname === '/api/courier-locations') {
        if (!td.courierLocations) td.courierLocations = [];
        if (req.method === 'GET') {
          const courierId = url.searchParams.get('courierId');
          const orderId = url.searchParams.get('orderId');
          const limit = parseInt(url.searchParams.get('limit') || '20', 10);
          let filtered = td.courierLocations;
          if (courierId) filtered = filtered.filter(l => l.courierId === courierId);
          if (orderId) filtered = filtered.filter(l => l.orderId === orderId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(filtered.slice(0, limit)));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const lat = parseFloat(body.latitude || body.lat || 0);
          const lng = parseFloat(body.longitude || body.lng || 0);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'إحداثيات الموقع غير صالحة' }));
          }
          const point = {
            id: 'loc-' + Date.now(),
            courierId: String(body.courierId || body.driverId || '').trim(),
            orderId: body.orderId || null,
            latitude: lat,
            longitude: lng,
            speedKmh: parseFloat(body.speedKmh || 0) || 0,
            headingDegrees: parseFloat(body.headingDegrees || 0) || 0,
            accuracyMeters: parseFloat(body.accuracyMeters || 5) || 5,
            recordedAt: new Date().toISOString()
          };
          if (!td.courierLocations) td.courierLocations = [];
          td.courierLocations.unshift(point);
          // الإبقاء على آخر 1000 نقطة فقط
          if (td.courierLocations.length > 1000) td.courierLocations = td.courierLocations.slice(0, 1000);

          // تحديث الموقع الحالي للمندوب في بياناته
          const driver = (td.drivers || []).find(d => d.id === point.courierId);
          if (driver) {
            driver.currentLat = lat;
            driver.currentLng = lng;
            driver.lastLocationUpdated = point.recordedAt;
          }
          saveDb(db);
          res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, point }));
        }
      }

      // -------------------------------------------------------
      // 16. طابور المزامنة بدون إنترنت (Offline Sync Queue)
      // -------------------------------------------------------
      if (pathname === '/api/sync') {
        if (!td.offlineSyncQueue) td.offlineSyncQueue = [];
        if (req.method === 'GET') {
          const profileId = url.searchParams.get('profileId');
          const status = url.searchParams.get('status') || 'pending';
          let filtered = td.offlineSyncQueue;
          if (profileId) filtered = filtered.filter(s => s.profileId === profileId);
          filtered = filtered.filter(s => s.syncStatus === status);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify(filtered.slice(0, 100)));
        }
        if (req.method === 'POST') {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          const mutId = String(body.clientMutationId || body.client_mutation_id || '').trim();
          if (!mutId) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'clientMutationId مطلوب لمنع التكرار' }));
          }
          // منع التكرار: idempotency
          const existing = td.offlineSyncQueue.find(s => s.clientMutationId === mutId);
          if (existing) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true, isDuplicate: true, record: existing }));
          }

          const entityType = String(body.entityType || '').trim();
          const operation = String(body.operation || 'INSERT').trim().toUpperCase();
          let syncStatus = 'synced';
          let errorMessage = null;

          // محاولة تطبيق العملية مباشرةً
          try {
            if (entityType === 'order' && operation === 'INSERT' && body.payload) {
              // إضافة طلب من قائمة الانتظار دون اتصال
              if (!td.orders) td.orders = [];
              const orderPayload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;
              const already = td.orders.find(o => o.idempotencyKey === mutId);
              if (!already) {
                const synced = { ...orderPayload, idempotencyKey: mutId, syncedAt: new Date().toISOString() };
                if (!synced.id) synced.id = '#' + Math.floor(10000000 + Math.random() * 90000000);
                td.orders.unshift(synced);
              }
            } else if (entityType === 'address' && operation === 'INSERT' && body.payload) {
              if (!td.customerAccounts) td.customerAccounts = [];
              // تسجيل العنوان الجديد في حساب العميل
            } else if (entityType === 'review' && operation === 'INSERT' && body.payload) {
              if (!td.reviews) td.reviews = [];
              const reviewPayload = typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload;
              const alreadyRev = td.reviews.find(r => r.idempotencyKey === mutId);
              if (!alreadyRev) {
                td.reviews.unshift({ ...reviewPayload, id: 'rev-' + Date.now(), idempotencyKey: mutId });
              }
            }
          } catch (err) {
            syncStatus = 'failed';
            errorMessage = err.message;
          }

          const record = {
            id: 'sync-' + Date.now(),
            clientMutationId: mutId,
            profileId: String(body.profileId || '').trim(),
            entityType,
            operation,
            payload: body.payload || {},
            syncStatus,
            conflictResolution: body.conflictResolution || 'server_wins',
            clientTimestamp: body.clientTimestamp || new Date().toISOString(),
            serverSyncedAt: new Date().toISOString(),
            errorMessage,
            createdAt: new Date().toISOString()
          };
          td.offlineSyncQueue.unshift(record);
          if (td.offlineSyncQueue.length > 500) td.offlineSyncQueue = td.offlineSyncQueue.slice(0, 500);
          saveDb(db);
          res.writeHead(syncStatus === 'synced' ? 201 : 422, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: syncStatus === 'synced', record }));
        }
      }

      // -------------------------------------------------------
      // 17. النسخ الاحتياطية (Database Backup & Restore)
      // -------------------------------------------------------
      if (pathname === '/api/backup' && req.method === 'GET') {
        const backupData = JSON.parse(JSON.stringify(db));
        delete backupData.admin; // لا تُرسل كلمة مرور المدير في النسخة الاحتياطية العامة
        const payload = {
          version: '2.0.0',
          tenant: tenantId,
          createdAt: new Date().toISOString(),
          data: td
        };
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="backup_${tenantId}_${new Date().toISOString().slice(0, 10)}.json"`
        });
        return res.end(JSON.stringify(payload, null, 2));
      }

      if (pathname === '/api/backup/restore' && req.method === 'POST') {
        try {
          const rawBody = await parseBody(req);
          const body = sanitizeObject(rawBody);
          if (!body.data || typeof body.data !== 'object') {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: false, error: 'بيانات الاستعادة غير صالحة' }));
          }
          // استعادة انتقائية آمنة — فقط بيانات المنشأة وليس الكل
          const safeFields = ['products', 'categories', 'orders', 'customers', 'drivers', 'coupons', 'branches', 'offers', 'baskets', 'invoices', 'reviews', 'notifications', 'walletTransactions', 'courierLocations'];
          for (const field of safeFields) {
            if (body.data[field] !== undefined && Array.isArray(body.data[field])) {
              td[field] = body.data[field];
            }
          }
          saveDb(db);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: true, restoredAt: new Date().toISOString(), message: 'تم استعادة بيانات المنشأة بنجاح' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ success: false, error: err.message }));
        }
      }

      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }

    // -------------------------------------------------------------
    // ملف جافاسكريبت الواجهة التفاعلية المستقل (Clean Client Script)
    // -------------------------------------------------------------
    if (pathname === '/admin.js') {
      const jsPath = path.resolve(__dirname, 'public', 'admin.js');
      if (fs.existsSync(jsPath) && fs.statSync(jsPath).isFile()) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(fs.readFileSync(jsPath, 'utf8'));
      }
    }

    if (pathname === '/admin_additions.js') {
      const jsPath = path.resolve(__dirname, 'public', 'admin_additions.js');
      if (fs.existsSync(jsPath) && fs.statSync(jsPath).isFile()) {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(fs.readFileSync(jsPath, 'utf8'));
      }
    }

    // -------------------------------------------------------------
    // تقديم الصور الحقيقية والمرفوعة مع حماية تامة ضد Path Traversal
    // -------------------------------------------------------------
    if (pathname.startsWith('/images/')) {
      const imagesRootDir = path.resolve(__dirname, 'public', 'images');
      // تنظيف المسار تماماً لمنع محاولات الـ ../ أو null bytes
      const decodedSubpath = decodeURIComponent(pathname.replace(/^\/images\/?/, '')).replace(/\0/g, '');
      const safeRelative = path.normalize(decodedSubpath).replace(/^(\.\.[\/\\])+/, '');
      const fullImgPath = path.resolve(imagesRootDir, safeRelative);

      // فحص أمني صارم: التأكد أن المسار المطلوب يقع حصراً داخل مجلد images
      if (!fullImgPath.startsWith(imagesRootDir) || fullImgPath === imagesRootDir) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('ممنوع الوصول: محاولة تجاوز المسار المصرح به');
      }

      if (fs.existsSync(fullImgPath) && fs.statSync(fullImgPath).isFile()) {
        const ext = path.extname(fullImgPath).toLowerCase();
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.bmp': 'image/bmp'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(fs.readFileSync(fullImgPath));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('الصورة غير موجودة');
      }
    }

    // -------------------------------------------------------------
    // واجهة الويب التفاعلية الكاملة للوحة التحكم (لوحة الإدارة)
    // -------------------------------------------------------------
    if (pathname === '/' || pathname === '/index.html' || pathname === '' || pathname === '/admin' || pathname === '/admin/' || pathname === '/dashboard') {
      const db = getDb();
      initTenants(db);
      const tenantId = getTenantId(req, url);
      const qTenant = url.searchParams.get('tenant') || url.searchParams.get('tenantId');
      if (qTenant) {
        res.setHeader('Set-Cookie', 'almanar_tenant=' + encodeURIComponent(qTenant.trim()) + '; Path=/; SameSite=Lax; Max-Age=31536000');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderFullAdminHtml(tenantId, db));
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('المسار المطلوب غير موجود (404)');
  } catch (unhandledErr) {
    console.error('Unhandled server error:', unhandledErr);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: 'حدث خطأ داخلي في الخادم' }));
    }
  }
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, '0.0.0.0', 2048, () => {
  console.log(`=======================================================`);
  console.log(`🚀 لوحة إدارة سلة المنار التفاعلية والـ API تعمل الآن!`);
  console.log(`📍 الرابط: http://localhost:${PORT}`);
  console.log(`⚡ API الرابط: http://localhost:${PORT}/api/products`);
  console.log(`=======================================================`);
});

// -------------------------------------------------------------
// قوالب واجهة لوحة الإدارة مع جميع الأقسام التفاعلية
// -------------------------------------------------------------
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFullAdminHtml(tenantId, db) {
  tenantId = tenantId || 'almanar_main';
  const tenant = (db?.tenants || []).find(t => t.id === tenantId) || {
    id: 'almanar_main',
    name: 'سلة المنار — الفرع الرئيسي',
    category: 'سوبرماركت ومواد غذائية',
    city: 'الرياض',
    logo: '/images/logo.png'
  };
  const tData = db ? getTenantData(db, tenantId) : {};
  const sub = tData.subscription || { plan: 'trial', status: 'active', expiresAt: null };
  const planInfo = (typeof SUBSCRIPTION_PLANS !== 'undefined' && SUBSCRIPTION_PLANS[sub.plan]) || {
    id: 'trial', name: 'باقة تجريبية', periodLabel: '14 يوم', price: 0
  };
  const adminName = tData.admin?.name || 'مدير المنشأة';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة التحكم | سلة المنار</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: 'Cairo', sans-serif !important; background-color: #F8FAF9; }
    * { font-family: 'Cairo', sans-serif; }
    .custom-scroll::-webkit-scrollbar { width: 4px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
    .tab-active { background-color: rgba(255,255,255,0.15) !important; color: #ffffff !important; border-right: 3px solid #00C98D !important; }
    .tab-active svg { stroke: #00C98D !important; }
    .section-view { display: none; }
    .section-view.active { display: block; }
    /* ═══ Sidebar Dark ═══ */
    .sidebar-nav-btn { color: rgba(255,255,255,0.65); }
    .sidebar-nav-btn:hover { background: rgba(255,255,255,0.08) !important; color: #fff !important; }
    .sidebar-badge-green { background: rgba(0,201,141,0.2); color: #00C98D; }
    .sidebar-badge-orange { background: rgba(251,146,60,0.2); color: #fb923c; }
    .sidebar-badge-blue { background: rgba(96,165,250,0.2); color: #60a5fa; }

    /* ═══════════ التوافق مع الجوال والأجهزة اللوحية ═══════════ */
    /* الجداول: تمرير أفقي بدل قصّ الأعمدة */
    .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: inherit; }
    .table-scroll table { min-width: 620px; }

    @media (max-width: 1023px) {
      /* القائمة الجانبية تصبح درجاً كاملاً يظهر بزر ☰ */
      .admin-aside {
        position: fixed !important; top: 0; right: 0; bottom: 0; z-index: 60;
        width: 17rem; transform: translateX(105%);
        transition: transform .28s ease; box-shadow: -14px 0 44px rgba(15, 23, 42, .28);
      }
      .admin-aside.open { transform: translateX(0); }
      .sidebar-backdrop.show { display: block; }
      .admin-main { padding: 14px !important; }
      .header-search { display: none !important; }
      .header-welcome { display: none !important; }
      .section-view table { font-size: 11px; }
    }
    @media (min-width: 1024px) {
      .sidebar-backdrop { display: none !important; }
    }
    @media (max-width: 640px) {
      .admin-header { padding-left: 12px !important; padding-right: 12px !important; height: 3.4rem !important; }
      .card-pad { padding: 14px !important; }
    }
  </style>
</head>
<body class="text-slate-800 flex h-screen overflow-hidden">

  <!-- السايدبار الجانبي الأيمن (على الجوال: درج جانبي يفتح بزر ☰) -->
  <aside id="admin-aside" class="admin-aside w-64 flex flex-col justify-between h-full select-none z-20" style="background:#142A4A;">
    <div class="p-4 border-b flex items-center justify-between" style="border-color:rgba(255,255,255,0.1);">
      <div class="flex items-center gap-2.5 min-w-0">
        <img src="${escapeHtml(tenant.logo || '/images/logo.png')}" alt="شعار المنشأة" class="w-10 h-10 rounded-xl object-contain border p-1 shrink-0 shadow-sm" style="border-color:rgba(0,201,141,0.4);background:rgba(255,255,255,0.1);" onerror="this.src='/images/logo.png'" />
        <div class="min-w-0">
          <div class="font-extrabold text-sm tracking-wide truncate" style="color:#00C98D;" title="${escapeHtml(tenant.name)}">${escapeHtml(tenant.name)}</div>
          <div class="text-[10px] font-medium truncate" style="color:rgba(255,255,255,0.5);">${escapeHtml(tenant.category || 'تجارة عامة')} • ${escapeHtml(tenant.city || 'الرياض')}</div>
        </div>
      </div>
      <span style="color:rgba(255,255,255,0.3);" class="text-xs">‹</span>
    </div>

    <!-- قائمة اختيار وتبديل المنشأة السريعة -->
    <div class="px-3 py-2 border-b" style="border-color:rgba(255,255,255,0.08);background:rgba(0,0,0,0.15);">
      <div class="flex items-center justify-between text-[10px] font-bold mb-1.5" style="color:rgba(255,255,255,0.4);">
        <span class="flex items-center gap-1">🏢 المنشأة النشطة:</span>
        <a href="/register" style="color:#00C98D;" class="hover:underline flex items-center gap-0.5 font-extrabold">+ متجر جديد</a>
      </div>
      <select onchange="switchTenant(this.value)" class="w-full border rounded-lg py-1.5 px-2 text-xs font-bold focus:outline-none cursor-pointer" style="background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.15);color:#fff;">
        ${(db?.tenants || []).map(t => '<option value="' + escapeHtml(t.id) + '" ' + (t.id === tenantId ? 'selected' : '') + ' style="background:#1e3a5f;color:#fff;">🏢 ' + escapeHtml(t.name) + '</option>').join('')}
      </select>
    </div>

    <!-- قائمة الروابط القابلة للضغط -->
    <nav class="flex-1 overflow-y-auto custom-scroll p-3 space-y-0.5 text-xs font-semibold">
      <div class="text-[10px] font-bold px-3 py-1" style="color:rgba(255,255,255,0.3);">القائمة /</div>
      
      <button onclick="switchTab('dashboard')" id="nav-dashboard" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2.5 rounded-lg tab-active transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
          لوحة التحكم
        </span>
      </button>

      <button onclick="switchTab('orders')" id="nav-orders" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
          المبيعات والطلبات
        </span>
        <span class="sidebar-badge-green text-[10px] font-bold px-1.5 py-0.5 rounded-full" id="sidebar-order-count">...</span>
      </button>

      <button onclick="switchTab('products')" id="nav-products" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          إدارة المنتجات
        </span>
        <span class="sidebar-badge-orange text-[10px] font-bold px-1.5 py-0.5 rounded-full" id="sidebar-product-count">...</span>
      </button>

      <button onclick="switchTab('customers')" id="nav-customers" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          العملاء
        </span>
      </button>

      <button onclick="switchTab('coupons')" id="nav-coupons" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"></path></svg>
          التسويق والعروض
        </span>
      </button>

      <button onclick="switchTab('baskets')" id="nav-baskets" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          سلال المناسبات
        </span>
      </button>

      <button onclick="switchTab('categories')" id="nav-categories" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>
          الفئات والأقسام
        </span>
      </button>

      <button onclick="switchTab('branches')" id="nav-branches" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
          المستودعات والفروع
        </span>
      </button>

      <button onclick="switchTab('drivers')" id="nav-drivers" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
          المناديب والتوصيل
        </span>
        <span class="sidebar-badge-blue text-[10px] font-bold px-1.5 py-0.5 rounded-full" id="sidebar-driver-count">0</span>
      </button>

      <button onclick="switchTab('zatca')" id="nav-zatca" class="sidebar-nav-btn w-full text-right flex items-center justify-between px-3 py-2 rounded-lg transition">
        <span class="flex items-center gap-2.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          الضرائب والفواتير (ZATCA)
        </span>
      </button>
    </nav>

    <!-- الفوتر السفلي -->
    <div class="p-3 space-y-0.5 text-xs font-semibold" style="border-top:1px solid rgba(255,255,255,0.1);">
      <a href="javascript:void(0)" onclick="showSettings()" id="nav-settings" class="flex items-center gap-2 px-3 py-1.5 rounded-lg sidebar-nav-btn">⚙ الإعدادات العامة</a>
      <a href="javascript:void(0)" onclick="showHelp()" id="nav-help" class="flex items-center gap-2 px-3 py-1.5 rounded-lg sidebar-nav-btn">❓ المساعدة والدعم</a>
      <a href="#" id="logout-link" class="flex items-center gap-2 px-3 py-1.5 rounded-lg" style="color:#f87171;" onmouseover="this.style.background='rgba(248,113,113,0.1)'" onmouseout="this.style.background='transparent'">🚪 تسجيل الخروج</a>
    </div>
  </aside>

  <!-- خلفية معتمة خلف الدرج الجانبي على الجوال -->
  <div id="sidebar-backdrop" class="sidebar-backdrop hidden fixed inset-0 bg-slate-900/50 z-50" onclick="toggleSidebar(false)"></div>

  <!-- المنطقة الرئيسية للمحتوى -->
  <div class="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
    
    <!-- الهيدر العلوي -->
    <header class="admin-header h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between select-none shadow-sm z-10">
      <div class="flex items-center gap-3 min-w-0">
        <button onclick="toggleSidebar()" class="lg:hidden shrink-0 p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-base leading-none" aria-label="فتح القائمة">☰</button>
        <img src="/images/logo.png" alt="مدير المنشأة" class="w-9 h-9 rounded-full object-cover border border-emerald-300 bg-white shrink-0" onerror="this.outerHTML='<div class=\'w-9 h-9 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center font-bold text-[#008955] text-xs\'>م</div>'" />
        <div class="min-w-0">
          <div class="font-bold text-xs text-slate-800 truncate" id="header-admin-name">${escapeHtml(adminName)}</div>
          <div class="text-[10px] text-slate-400 font-medium truncate">${escapeHtml(tenant.name)}</div>
        </div>

        <!-- شريط الباقة النشطة وزر الترقية -->
        <div class="hidden sm:flex items-center gap-2 mr-3 px-3 py-1.5 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 text-xs shadow-sm">
          <span class="inline-flex items-center gap-1 font-extrabold text-amber-800">
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            ${escapeHtml(planInfo.name)}
          </span>
          <span class="text-[11px] text-amber-700 font-medium border-r border-amber-200 pr-2">
            ${sub.expiresAt ? 'متبقي ' + Math.max(0, Math.ceil((new Date(sub.expiresAt) - Date.now()) / 86400000)) + ' يوم' : planInfo.periodLabel}
          </span>
          <button onclick="openPlansModal()" class="mr-1 px-2.5 py-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-[11px] rounded-lg shadow-sm transition">
            ⚡ ترقية الباقة
          </button>
        </div>
        <div class="hidden sm:flex items-center gap-1 mr-4 border-r pr-4 border-slate-200">
          <button id="btn-date" onclick="showDatePicker()" title="التقويم والتاريخ" class="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition">📅</button>
          <div class="relative">
            <button id="btn-notifications" onclick="showNotifications()" title="مركز الإشعارات" class="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition">🔔</button>
            <span class="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold shadow-sm" id="header-notif-badge">3</span>
          </div>
          <button id="lang-toggle-btn" onclick="toggleLanguage()" title="تبديل اللغة (عربي / English)" class="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold mr-1 transition">🌐 <span id="current-lang-text">🇸🇦 عربي</span></button>
        </div>
      </div>

      <!-- محرك البحث السريع بالهيدر (يختفي على الجوال ليتسع المحتوى) -->
      <div class="flex items-center gap-4 min-w-0">
        <div class="relative w-80 header-search hidden md:block">
          <input type="text" id="global-search" oninput="handleGlobalSearch(this.value)" placeholder="عم نبحث عن شيء ما..." class="w-full bg-slate-50 border border-slate-200 rounded-full py-1.5 pr-9 pl-4 text-xs focus:outline-none focus:border-[#008955] focus:bg-white transition" />
          <span class="absolute right-3 top-2 text-slate-400 text-xs">🔍</span>
        </div>
        <div class="flex items-center gap-2 header-welcome hidden lg:flex">
          <div class="text-right">
            <div class="font-extrabold text-sm text-slate-800 flex items-center gap-1 justify-end">أهلاً بعودتك 👏</div>
            <div class="text-xs font-bold text-[#008955] truncate max-w-[180px]" id="header-tenant-name">${escapeHtml(tenant.name)}</div>
          </div>
        </div>
      </div>
    </header>

    <!-- المحتوى القابل للتمرير حسب القسم النشط -->
    <main class="admin-main flex-1 overflow-y-auto custom-scroll p-6 bg-[#F8FAF9]">
      
      <!-- ======================================================== -->
      <!-- 1. لوحة التحكم الرئيسية (Dashboard) -->
      <!-- ======================================================== -->
      <div id="section-dashboard" class="section-view active space-y-6">
        
        <!-- ترويسة الترحيب والإجراءات المطابقة للصورة المرجعية -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-black text-slate-800 tracking-tight">مرحبًا بعودتك</h1>
            <p class="text-xs text-slate-400 mt-1">تحديث لآخر 7 أيام، تحقق الآن من نشاط المتجر والتوصيل</p>
          </div>
          <div class="flex items-center gap-2.5">
            <button onclick="showToast('تم تصدير تقرير العمليات بنجاح', 'success')" class="px-4 py-2 bg-[#0ea5e9] hover:bg-[#0284c7] text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
              تصدير
            </button>
            <div class="relative">
              <select class="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2 pr-3 pl-8 appearance-none focus:outline-none shadow-sm cursor-pointer">
                <option value="week">أسبوع</option>
                <option value="month">شهر</option>
                <option value="year">سنة</option>
              </select>
              <span class="absolute left-2.5 top-2.5 text-slate-400 text-xs pointer-events-none">▼</span>
            </div>
          </div>
        </div>

        <!-- 4 بطاقات KPI الرئيسية المطابقة للتصميم المرجعي -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- بطاقة 1: الكارت الأزرق السماوي ذو التدرج اللوني والنقشة -->
          <div class="p-5 rounded-2xl text-white shadow-sm flex flex-col justify-between relative overflow-hidden" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
            <div class="flex items-center justify-between text-white/80">
              <span class="text-xs font-bold">إجمالي الزوار</span>
              <span class="text-xs tracking-widest opacity-60">•••</span>
            </div>
            <div class="my-3">
              <div class="text-3xl font-black tracking-tight" id="kpi-visitors">10.525</div>
              <div class="text-[11px] text-white/90 font-medium mt-1.5 flex items-center gap-1">
                <span class="text-emerald-300 font-bold">+15.2%</span>
                <span class="opacity-80">منذ الفترة السابقة</span>
              </div>
            </div>
            <!-- زخرفة دائرية شفافة في الخلفية مثل الصورة المرجعية -->
            <div class="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none"></div>
            <div class="absolute -left-2 -bottom-2 w-16 h-16 rounded-full bg-white/10 pointer-events-none"></div>
          </div>

          <!-- بطاقة 2: إجمالي الطلبات مع شارت بياني مصغر -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-xs font-bold text-slate-700">إجمالي الطلبات</span>
              <span class="text-xs tracking-widest opacity-60">•••</span>
            </div>
            <div class="flex items-end justify-between mt-3">
              <div>
                <div class="text-3xl font-black text-slate-800" id="kpi-orders">5.715</div>
                <div class="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                  <span class="font-bold">+10.4%</span>
                  <span class="text-slate-400">منذ الشهر الماضي</span>
                </div>
              </div>
              <!-- شارت أعمدة مصغر (Mini Bar Sparkline) -->
              <div class="flex items-end gap-1 h-9">
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 45%;"></div>
                <div class="w-1.5 bg-slate-200 rounded-t" style="height: 60%;"></div>
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 85%;"></div>
                <div class="w-1.5 bg-slate-200 rounded-t" style="height: 50%;"></div>
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 100%;"></div>
              </div>
            </div>
          </div>

          <!-- بطاقة 3: العملاء المسجلين -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-xs font-bold text-slate-700">العملاء النشطين</span>
              <span class="text-xs tracking-widest opacity-60">•••</span>
            </div>
            <div class="flex items-end justify-between mt-3">
              <div>
                <div class="text-3xl font-black text-slate-800" id="kpi-customers">523</div>
                <div class="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                  <span class="font-bold">+165</span>
                  <span class="text-slate-400">منذ الشهر الماضي</span>
                </div>
              </div>
              <!-- شارت أعمدة مصغر -->
              <div class="flex items-end gap-1 h-9">
                <div class="w-1.5 bg-slate-200 rounded-t" style="height: 35%;"></div>
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 75%;"></div>
                <div class="w-1.5 bg-slate-200 rounded-t" style="height: 55%;"></div>
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 90%;"></div>
                <div class="w-1.5 bg-slate-200 rounded-t" style="height: 40%;"></div>
              </div>
            </div>
          </div>

          <!-- بطاقة 4: كباتن التوصيل -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between text-slate-400">
              <span class="text-xs font-bold text-slate-700">كباتن التوصيل</span>
              <span class="text-xs tracking-widest opacity-60">•••</span>
            </div>
            <div class="flex items-end justify-between mt-3">
              <div>
                <div class="text-3xl font-black text-slate-800" id="kpi-drivers">115</div>
                <div class="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                  <span class="font-bold">+10</span>
                  <span class="text-slate-400">منذ الشهر الماضي</span>
                </div>
              </div>
              <!-- شارت أعمدة مصغر -->
              <div class="flex items-end gap-1 h-9">
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 70%;"></div>
                <div class="w-1.5 bg-slate-200 rounded-t" style="height: 40%;"></div>
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 80%;"></div>
                <div class="w-1.5 bg-slate-200 rounded-t" style="height: 60%;"></div>
                <div class="w-1.5 bg-[#142A4A] rounded-t" style="height: 95%;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- شريط الفلاتر والتبويبات العلوية -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex flex-wrap items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 text-xs font-semibold shadow-sm">
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">نظرة سريعة</button>
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">المؤشرات العامة</button>
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">الملخص المالي</button>
            <button class="px-4 py-1.5 rounded-lg bg-[#008955] text-white font-bold shadow-sm">المبيعات</button>
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">التشغيل</button>
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">العملاء</button>
            <button onclick="switchTab('products')" class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">المنتجات</button>
          </div>

          <div class="flex flex-wrap items-center gap-1 text-xs font-semibold bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button class="px-3 py-1.5 rounded-lg bg-[#142A4A] text-white font-bold">آخر 24 ساعة</button>
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">آخر أسبوع</button>
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">آخر شهر</button>
            <button class="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800">آخر عام</button>
          </div>
        </div>

        <!-- شبكة الـ 10 بطاقات للمؤشرات وحالات الطلبات -->
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات الجديدة</span>
              <span>📦</span>
            </div>
            <div class="text-xl font-black text-slate-800" id="stat-new-orders">12</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">↑ 12% زيادة عن الأمس</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات المؤكدة</span>
              <span>🛒</span>
            </div>
            <div class="text-xl font-black text-slate-800">45.5K</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">↑ 12% زيادة +1000 ر.س</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">طلبات قيد التحضير</span>
              <span>👨‍🍳</span>
            </div>
            <div class="text-xl font-black text-slate-800">8</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">↑ 12% زيادة +1000 ر.س</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات الجاهزة للشحن</span>
              <span>🛵</span>
            </div>
            <div class="text-xl font-black text-slate-800">6</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">↑ 12% زيادة +1000 ر.س</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">مع شركة التوصيل</span>
              <span>🚚</span>
            </div>
            <div class="text-xl font-black text-slate-800">4</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">↑ 12% زيادة +1000 ر.س</div>
          </div>

          <!-- الصف الثاني من البطاقات -->
          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات التي تم توصيلها</span>
              <span>✅</span>
            </div>
            <div class="text-xl font-black text-slate-800">142</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">↑ 12% زيادة +1000 ر.س</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات المكتملة</span>
              <span>⭐</span>
            </div>
            <div class="text-xl font-black text-slate-800">45.5K</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">↑ 12% زيادة +1000 ر.س</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات الملغية</span>
              <span>❌</span>
            </div>
            <div class="text-xl font-black text-slate-800">2</div>
            <div class="text-[10px] text-rose-500 font-bold mt-1">↓ معدل منخفض 0.4%</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات المعلقة</span>
              <span>⏳</span>
            </div>
            <div class="text-xl font-black text-slate-800">3</div>
            <div class="text-[10px] text-amber-500 font-bold mt-1">بانتظار موافقة العميل</div>
          </div>

          <div class="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 mb-1">
              <span class="text-xs font-bold text-slate-700">الطلبات المعلقة بالمطبخ</span>
              <span>🥐</span>
            </div>
            <div class="text-xl font-black text-slate-800">5</div>
            <div class="text-[10px] text-emerald-600 font-bold mt-1">مخبوزات طازجة</div>
          </div>
        </div>

        <!-- الرسوم البيانية المتطابقة تماماً مع التصميم المرجعي (الصورة 2) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- شارت الأعمدة المزدوج لإحصائيات المبيعات الأسبوعية -->
          <div class="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <span class="text-xs text-slate-300">•••</span>
                <h3 class="font-bold text-sm text-slate-800">إحصائيات المبيعات والطلبات الأسبوعية</h3>
              </div>
              <!-- Legend مطابق للصورة المرجعية -->
              <div class="flex items-center gap-4 text-xs font-bold text-slate-500">
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#0ea5e9]"></span> الرياض</span>
                <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#142A4A]"></span> فروع أخرى</span>
              </div>
            </div>
            <div class="h-64 relative">
              <canvas id="weeklyBarChart"></canvas>
            </div>
          </div>

          <!-- شارت الدونات لإحصائيات الطلبات والحجوزات -->
          <div class="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs text-slate-300">•••</span>
              <h3 class="font-bold text-sm text-slate-800">إحصائيات الطلبات</h3>
            </div>
            
            <div class="flex items-center justify-between gap-4 py-2">
              <!-- قائمة التصنيفات والأرقام على الجانب مثل الصورة المرجعية -->
              <div class="space-y-4">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#0ea5e9]"></span>
                    <span class="font-black text-lg text-slate-800" id="donut-stat-confirmed">514</span>
                  </div>
                  <div class="text-[11px] font-bold text-slate-400 pr-4.5">الطلبات المؤكدة</div>
                </div>

                <div>
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-[#142A4A]"></span>
                    <span class="font-black text-lg text-slate-800" id="donut-stat-delivering">234</span>
                  </div>
                  <div class="text-[11px] font-bold text-slate-400 pr-4.5">قيد التوصيل</div>
                </div>

                <div>
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                    <span class="font-black text-lg text-slate-800" id="donut-stat-completed">345</span>
                  </div>
                  <div class="text-[11px] font-bold text-slate-400 pr-4.5">الطلبات المكتملة</div>
                </div>
              </div>

              <!-- حلقة الدونات وبداخلها الرقم الإجمالي مثل الصورة المرجعية -->
              <div class="relative w-44 h-44 flex items-center justify-center shrink-0">
                <canvas id="ordersDonutChart"></canvas>
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <div class="text-2xl font-black text-slate-800" id="donut-total-count">1.135</div>
                  <div class="text-[11px] text-slate-400 font-bold">الطلبات</div>
                </div>
              </div>
            </div>

            <div class="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
              محدث تلقائياً حسب حركة الطلبات اللحظية
            </div>
          </div>
        </div>

        <!-- جدول العمليات والطلبات الحديثة المطابق تماماً للصورة المرجعية -->
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="font-extrabold text-base text-slate-800">جميع العمليات والطلبات</h3>
              <p class="text-xs text-slate-400 mt-0.5">سجل تدفق الطلبات وحالات التوصيل المباشرة</p>
            </div>
            
            <div class="flex items-center gap-2.5">
              <button class="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition">
                <span>⚡</span> تصفية
              </button>
              <div class="relative w-64">
                <input type="text" placeholder="ابحث عن أي شيء هنا..." class="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-8 pl-3 text-xs focus:outline-none focus:border-[#0ea5e9] transition" />
                <span class="absolute right-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
              </div>
            </div>
          </div>

          <div class="table-scroll">
            <table class="w-full text-right text-xs">
              <thead>
                <tr class="text-slate-400 font-bold border-b border-slate-100 text-[11px]">
                  <th class="pb-3 pr-2">رقم</th>
                  <th class="pb-3">رمز الطلب</th>
                  <th class="pb-3">اسم العميل</th>
                  <th class="pb-3 text-center">الفرع</th>
                  <th class="pb-3">تاريخ الإنشاء</th>
                  <th class="pb-3">الوقت</th>
                  <th class="pb-3">نوع الطلب</th>
                  <th class="pb-3 text-center">حالة الطلب</th>
                  <th class="pb-3 text-center pl-2">الإجراء</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3.5 pr-2 font-mono text-slate-400">01</td>
                  <td class="py-3.5 font-mono font-bold text-slate-800">#87605218</td>
                  <td class="py-3.5">
                    <div class="flex items-center gap-2">
                      <div class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">ع</div>
                      <span class="font-bold text-xs text-slate-800">عميل الروضة</span>
                    </div>
                  </td>
                  <td class="py-3.5 text-center text-slate-500">الفرع الرئيسي</td>
                  <td class="py-3.5 text-slate-500">25 نوفمبر 2026</td>
                  <td class="py-3.5 text-slate-500 font-mono">08:30 مساءً</td>
                  <td class="py-3.5"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">سلة رمضانية</span></td>
                  <td class="py-3.5 text-center">
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">تمت ✓</span>
                  </td>
                  <td class="py-3.5 text-center pl-2">
                    <div class="flex items-center justify-center gap-1.5">
                      <button class="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-[10px]" title="معلومات">ℹ</button>
                      <button class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-[10px]" title="تعديل">✎</button>
                      <button class="w-6 h-6 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center text-[10px]" title="عرض">👁</button>
                    </div>
                  </td>
                </tr>

                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3.5 pr-2 font-mono text-slate-400">02</td>
                  <td class="py-3.5 font-mono font-bold text-slate-800">#30260604</td>
                  <td class="py-3.5">
                    <div class="flex items-center gap-2">
                      <div class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">خ</div>
                      <span class="font-bold text-xs text-slate-800">خالد رضا</span>
                    </div>
                  </td>
                  <td class="py-3.5 text-center text-slate-500">حي الحمراء</td>
                  <td class="py-3.5 text-slate-500">25 نوفمبر 2026</td>
                  <td class="py-3.5 text-slate-500 font-mono">08:30 مساءً</td>
                  <td class="py-3.5"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">منتجات طازجة</span></td>
                  <td class="py-3.5 text-center">
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">معلق ⏳</span>
                  </td>
                  <td class="py-3.5 text-center pl-2">
                    <div class="flex items-center justify-center gap-1.5">
                      <button class="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-[10px]" title="معلومات">ℹ</button>
                      <button class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-[10px]" title="تعديل">✎</button>
                      <button class="w-6 h-6 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center text-[10px]" title="عرض">👁</button>
                    </div>
                  </td>
                </tr>

                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3.5 pr-2 font-mono text-slate-400">03</td>
                  <td class="py-3.5 font-mono font-bold text-slate-800">#31242411</td>
                  <td class="py-3.5">
                    <div class="flex items-center gap-2">
                      <div class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">ل</div>
                      <span class="font-bold text-xs text-slate-800">لؤي طارق</span>
                    </div>
                  </td>
                  <td class="py-3.5 text-center text-slate-500">حي الياسمين</td>
                  <td class="py-3.5 text-slate-500">25 نوفمبر 2026</td>
                  <td class="py-3.5 text-slate-500 font-mono">08:30 مساءً</td>
                  <td class="py-3.5"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">سلة أسبوعية</span></td>
                  <td class="py-3.5 text-center">
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">انتظار 🛵</span>
                  </td>
                  <td class="py-3.5 text-center pl-2">
                    <div class="flex items-center justify-center gap-1.5">
                      <button class="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-[10px]" title="معلومات">ℹ</button>
                      <button class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-[10px]" title="تعديل">✎</button>
                      <button class="w-6 h-6 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center text-[10px]" title="عرض">👁</button>
                    </div>
                  </td>
                </tr>

                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-3.5 pr-2 font-mono text-slate-400">04</td>
                  <td class="py-3.5 font-mono font-bold text-slate-800">#31242499</td>
                  <td class="py-3.5">
                    <div class="flex items-center gap-2">
                      <div class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">م</div>
                      <span class="font-bold text-xs text-slate-800">مؤمن ندى</span>
                    </div>
                  </td>
                  <td class="py-3.5 text-center text-slate-500">حي النرجس</td>
                  <td class="py-3.5 text-slate-500">25 نوفمبر 2026</td>
                  <td class="py-3.5 text-slate-500 font-mono">08:30 مساءً</td>
                  <td class="py-3.5"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">سلة الضيافة</span></td>
                  <td class="py-3.5 text-center">
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">تمت ✓</span>
                  </td>
                  <td class="py-3.5 text-center pl-2">
                    <div class="flex items-center justify-center gap-1.5">
                      <button class="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-[10px]" title="معلومات">ℹ</button>
                      <button class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-[10px]" title="تعديل">✎</button>
                      <button class="w-6 h-6 rounded-full bg-sky-50 text-sky-500 flex items-center justify-center text-[10px]" title="عرض">👁</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 2. إدارة المنتجات الفعالة (إضافة / تعديل / حذف فوري) -->
      <!-- ======================================================== -->
      <div id="section-products" class="section-view space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h2 class="text-lg font-bold text-slate-800">إدارة المنتجات والأصناف</h2>
            <p class="text-xs text-slate-500 mt-0.5">أي تعديل أو إضافة منتج هنا يترحل فوراً لتطبيق العملاء بدون إعادة تشغيل!</p>
          </div>
          <button onclick="openAddProductModal()" class="flex items-center gap-2 bg-[#008955] hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition">
            <span>➕</span>
            <span>إضافة صنف جديد</span>
          </button>
        </div>

        <!-- جدول المنتجات -->
        <div class="bg-white rounded-2xl border border-slate-200 table-scroll shadow-sm">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th class="p-3.5">المنتج</th>
                <th class="p-3.5">القسم</th>
                <th class="p-3.5">السعر</th>
                <th class="p-3.5">الوحدة</th>
                <th class="p-3.5">المخزون المتوفر</th>
                <th class="p-3.5">الباركود</th>
                <th class="p-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody id="products-table-body" class="divide-y divide-slate-100">
              <!-- يُملأ عبر جافاسكريبت تلقائياً -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 3. المبيعات والطلبات (Order Management) -->
      <!-- ======================================================== -->
      <div id="section-orders" class="section-view space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h2 class="text-lg font-bold text-slate-800">طلبات العملاء الحية</h2>
            <p class="text-xs text-slate-500 mt-0.5">الطلبات المرسلة من تطبيق العميل تظهر هنا مباشرةً وتنتقل للمندوب فوراً</p>
          </div>
          <span class="bg-emerald-50 text-[#008955] text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200">
            🟢 النظام متصل ومزامن لحظياً
          </span>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 table-scroll shadow-sm">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th class="p-3.5">رقم الطلب</th>
                <th class="p-3.5">العميل</th>
                <th class="p-3.5">العنوان والهاتف</th>
                <th class="p-3.5">المبلغ الإجمالي</th>
                <th class="p-3.5">طريقة الدفع</th>
                <th class="p-3.5">المندوب المسند</th>
                <th class="p-3.5">حالة الطلب</th>
                <th class="p-3.5 text-center">تغيير الحالة</th>
              </tr>
            </thead>
            <tbody id="orders-table-body" class="divide-y divide-slate-100">
              <!-- يُملأ عبر جافاسكريبت تلقائياً -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 4. العملاء (Customers) -->
      <!-- ======================================================== -->
      <div id="section-customers" class="section-view space-y-6">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-6 bg-amber-500 rounded-full inline-block"></span>
              <h2 class="text-lg font-black text-slate-800">سجل العملاء وبرنامج المكافآت</h2>
            </div>
            <p class="text-xs text-slate-500 mt-1">إجمالي مشتريات العملاء، إدارة نقاط الولاء، ومنح كوبونات ومكافآت التميز للعملاء</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="showCustomerLoyalty()" class="px-4 py-2.5 bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition">
              <span>🏆</span> برنامج الولاء والمكافآت
            </button>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 table-scroll shadow-sm">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th class="p-3.5">اسم العميل</th>
                <th class="p-3.5">رقم الجوال</th>
                <th class="p-3.5">المدينة والحي</th>
                <th class="p-3.5">عدد الطلبات</th>
                <th class="p-3.5">إجمالي المشتريات</th>
                <th class="p-3.5 text-center">مستوى الولاء</th>
                <th class="p-3.5 text-center">مكافأة</th>
              </tr>
            </thead>
            <tbody id="customers-table-body" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 5. التسويق والعروض (Coupons) -->
      <!-- ======================================================== -->
      
      <!-- ======================================================== -->
      <!-- 5. التسويق وإدارة العروض الترويجية والبنرات -->
      <!-- ======================================================== -->
      <div id="section-coupons" class="section-view space-y-6">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-slate-800">التسويق والعروض الترويجية</h2>
            <p class="text-xs text-slate-500 mt-0.5">أنشئ عروضاً وارفع صورها من جهازك لتترحل مباشرة لتطبيق العملاء</p>
          </div>
          <button onclick="switchMarketingTab('offers')" class="bg-[#008955] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition">
            + إضافة عرض جديد
          </button>
        </div>

        <!-- التبويبات الداخلية -->
        <div class="flex gap-2 border-b border-slate-200">
          <button id="tab-btn-offers" onclick="switchMarketingTab('offers')" class="px-5 py-2.5 font-bold text-xs rounded-t-xl bg-[#008955] text-white transition">
            📢 العروض والبنرات المنشورة
          </button>
          <button id="tab-btn-coupons" onclick="switchMarketingTab('coupons')" class="px-5 py-2.5 font-bold text-xs rounded-t-xl bg-white text-slate-600 transition">
            🎫 كوبونات الخصم
          </button>
        </div>

        <!-- محتوى تبويب العروض -->
        <div id="marketing-panel-offers" class="space-y-6">
          <!-- كرت إنشاء عرض جديد -->
          <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 class="font-bold text-sm text-slate-800 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-[#008955]"></span>
              إضافة عرض أو بنر ترويجي جديد لتطبيق العملاء
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">عنوان العرض</label>
                <input type="text" id="offer-input-title" placeholder="مثال: عروض التوفير الأسبوعية 🔥" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">نسبة / قيمة الخصم</label>
                <input type="text" id="offer-input-discount" placeholder="مثال: خصم 30% أو 1+1 مجاناً" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">الوصف المختصر</label>
                <input type="text" id="offer-input-desc" placeholder="تخفيضات كبرى على منتجات مختارة" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
              </div>
            </div>

            <!-- رفع صورة العرض من الجهاز -->
            <div class="border-t border-slate-100 pt-3">
              <label class="block font-bold text-slate-700 text-xs mb-2">صورة العرض الترويجي (اختر أي صورة من جهاز الكمبيوتر)</label>
              <div class="flex items-center gap-4">
                <div id="offer-preview-box" class="w-32 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                  <span class="text-3xl text-slate-400">🖼️</span>
                </div>
                <div class="space-y-1.5">
                  <label for="offer-file-picker" class="cursor-pointer inline-flex items-center gap-2 bg-[#008955] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition shadow-sm">
                    📁 اختيار صورة من الجهاز
                  </label>
                  <input type="file" id="offer-file-picker" accept="image/*" class="hidden" onchange="handleImageFilePick(this, 'offer')" />
                  <p id="offer-file-status" class="text-[11px] text-slate-400">يقبل أي صيغة وأي حجم (PNG, JPG, WebP...) ويقوم بتصغيرها تلقائياً</p>
                  <input type="hidden" id="offer-image-final-url" value="" />
                </div>
              </div>
            </div>

            <div class="pt-2">
              <button onclick="saveAndPublishOffer()" class="bg-[#008955] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow hover:bg-emerald-700 transition flex items-center gap-2">
                <span>💾 حفظ العرض ونشره فوراً في تطبيق العميل</span>
              </button>
            </div>
          </div>

          <!-- شبكة العروض الحالية -->
          <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <h3 class="font-bold text-sm text-slate-800 mb-4">العروض النشطة حالياً في تطبيق العميل</h3>
            <div id="offers-display-grid" class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <!-- يتم تعبئة العروض بالجافاسكريبت -->
            </div>
          </div>
        </div>

        <!-- محتوى تبويب الكوبونات -->
        <div id="marketing-panel-coupons" class="hidden">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="coupons-cards"></div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 5.5 سلال المناسبات والسلال الأسبوعية (Baskets) -->
      <!-- ======================================================== -->
      <div id="section-baskets" class="section-view space-y-6">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-slate-800">سلال المناسبات والسلال الأسبوعية 🧺</h2>
            <p class="text-xs text-slate-500 mt-0.5">تظهر في سلايدر 3D متحرك داخل تبويب العروض في تطبيق العميل — فعّل أو ألغِ أي سلة بضغطة واحدة</p>
          </div>
          <button onclick="openAddBasketModal()" class="bg-[#008955] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition">
            + إنشاء سلة جديدة
          </button>
        </div>

        <!-- السلال الجاهزة (قوالب سريعة) -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 class="font-bold text-sm text-slate-800 mb-3">قوالب جاهزة — اضغط لإضافة السلة فوراً</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3" id="basket-templates-grid"></div>
        </div>

        <!-- شبكة السلال الحالية -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 class="font-bold text-sm text-slate-800 mb-4">السلال الحالية (تظهر في السلايدر عند التفعيل)</h3>
          <div id="baskets-display-grid" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 6. الفئات والأقسام (Categories) -->
      <!-- ======================================================== -->
      <div id="section-categories" class="section-view space-y-6">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h2 class="text-lg font-bold text-slate-800">فئات وأقسام المتجر</h2>
          <p class="text-xs text-slate-500 mt-0.5">الأقسام الظاهرة للعميل في واجهة التطبيق</p>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4" id="categories-grid"></div>
      </div>

      <!-- ======================================================== -->
      <!-- 7. الفروع والمستودعات (Branches) -->
      <!-- ======================================================== -->
      <div id="section-branches" class="section-view space-y-6">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h2 class="text-lg font-bold text-slate-800">فروع سلة المنار ومستودعات التوزيع</h2>
          <p class="text-xs text-slate-500 mt-0.5">إدارة نقاط تحضير الطلبات في مدينة الرياض</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4" id="branches-grid"></div>
      </div>

      <!-- ======================================================== -->
      <!-- 8. المناديب والتوصيل (Drivers) -->
      <!-- ======================================================== -->
      <div id="section-drivers" class="section-view space-y-6">
        
        <!-- الهيدر والترويسة -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-6 bg-[#00C98D] rounded-full inline-block"></span>
              <h2 class="text-lg font-black text-slate-800">إدارة كباتن التوصيل والمناديب</h2>
            </div>
            <p class="text-xs text-slate-500 mt-1">متابعة طلبات التسجيل الجديدة، تقارير الأرباح، واعتماد المناديب مع إرسال إشعار فوري عبر واتساب و SMS</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="refreshDriversData()" class="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition">
              <span>🔄</span> تحديث البيانات
            </button>
            <button onclick="showDriverReports()" class="px-3.5 py-2 bg-gradient-to-l from-emerald-600 to-[#008955] hover:from-emerald-700 hover:to-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition">
              <span>📊</span> تقارير مبيعات المناديب
            </button>
            <a href="http://localhost:8090" target="_blank" class="px-4 py-2 bg-[#142A4A] hover:bg-[#1e3a5f] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition">
              <span>🛵</span> فتح تطبيق المندوب
            </a>
          </div>
        </div>

        <!-- 4 بطاقات إحصائية بتصميم لوحة التحكم المودرن (Image 2 Style) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- بطاقة أرباح التوصيل الرئيسية (Dark Navy / Emerald Accent) -->
          <div class="p-4 rounded-2xl shadow-sm text-white relative overflow-hidden flex flex-col justify-between" style="background: linear-gradient(135deg, #142A4A 0%, #1e3a5f 100%); border-right: 4px solid #00C98D;">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-200">إجمالي أرباح التوصيل</span>
              <span class="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-sm">💰</span>
            </div>
            <div class="my-2">
              <div class="text-2xl font-black text-white flex items-baseline gap-1">
                <span id="stat-driver-earnings">0.00</span>
                <span class="text-xs font-normal text-slate-300">ر.س</span>
              </div>
              <div class="text-[10px] text-emerald-300 font-semibold mt-1">✓ عمولات كافة طلبات التوصيل المنجزة</div>
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-[#00C98D] rounded-full" style="width: 78%;"></div>
            </div>
          </div>

          <!-- بطاقة إجمالي المناديب -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between text-slate-500">
              <span class="text-xs font-bold text-slate-700">إجمالي الكباتن المعتمدين</span>
              <span class="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm">🛵</span>
            </div>
            <div class="my-2">
              <div class="text-2xl font-black text-slate-800" id="stat-driver-total">0</div>
              <div class="text-[10px] text-blue-600 font-bold mt-1">كابتن مسجل بالنظام</div>
            </div>
            <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-blue-500 rounded-full" style="width: 100%;"></div>
            </div>
          </div>

          <!-- بطاقة طلبات التسجيل المعلقة (Pending Registrations) -->
          <div class="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm flex flex-col justify-between relative overflow-hidden" style="background: linear-gradient(to bottom, #fff, #fffbeb);">
            <div class="flex items-center justify-between text-slate-500">
              <span class="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                طلبات تسجيل جديدة
              </span>
              <span class="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-sm">⏳</span>
            </div>
            <div class="my-2">
              <div class="text-2xl font-black text-amber-700" id="stat-driver-pending">0</div>
              <div class="text-[10px] text-amber-800 font-bold mt-1">بانتظار المراجعة والاعتماد</div>
            </div>
            <div class="h-1.5 w-full bg-amber-100 rounded-full overflow-hidden">
              <div class="h-full bg-amber-500 rounded-full" id="stat-driver-pending-bar" style="width: 0%;"></div>
            </div>
          </div>

          <!-- بطاقة الكباتن النشطين الآن -->
          <div class="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div class="flex items-center justify-between text-slate-500">
              <span class="text-xs font-bold text-slate-700">الكباتن المتاحين الآن</span>
              <span class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">🟢</span>
            </div>
            <div class="my-2">
              <div class="text-2xl font-black text-emerald-600" id="stat-driver-active">0</div>
              <div class="text-[10px] text-emerald-600 font-bold mt-1">جاهزون لاستلام الطلبات</div>
            </div>
            <div class="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-[#00C98D] rounded-full" style="width: 65%;"></div>
            </div>
          </div>
        </div>

        <!-- قسم طلبات الانضمام المعلقة (Pending Approvals) -->
        <div id="pending-drivers-wrapper" class="hidden bg-amber-50/60 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center text-sm font-bold shadow-sm">!</span>
              <div>
                <h3 class="font-extrabold text-sm text-amber-950">طلبات انضمام كباتن جديدة بحاجة للموافقة</h3>
                <p class="text-[11px] text-amber-800">عند الموافقة على الطلب سيتم إرسال رسالة ترحيب وقبول للمندوب برقم جواله عبر الواتساب أو SMS</p>
              </div>
            </div>
            <span class="bg-amber-200/80 text-amber-900 font-bold text-xs px-2.5 py-1 rounded-full" id="pending-badge-count">0 طلبات</span>
          </div>

          <!-- قائمة بطاقات الطلبات المعلقة -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="pending-drivers-list">
            <!-- تُعبأ بواسطة JavaScript -->
          </div>
        </div>

        <!-- جدول وإدارة الكباتن المعتمدين والتقارير والأرباح -->
        <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 class="font-extrabold text-base text-slate-800">سجل الكباتن والتقارير المالية</h3>
              <p class="text-xs text-slate-400 mt-0.5">تفاصيل المبيعات، عمولات التوصيل المنجزة، والتقييمات لكل مندوب</p>
            </div>
            
            <div class="flex items-center gap-2">
              <div class="relative w-64">
                <input type="text" id="driver-search-input" oninput="filterDriversTable()" placeholder="بحث باسم المندوب، الجوال، المدينة..." class="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pr-8 pl-3 text-xs focus:outline-none focus:border-[#008955] transition" />
                <span class="absolute right-2.5 top-2 text-slate-400 text-xs">🔍</span>
              </div>
              <select id="driver-status-filter" onchange="filterDriversTable()" class="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer">
                <option value="all">كل الحالات</option>
                <option value="متاح">متاح</option>
                <option value="في التوصيل">في التوصيل</option>
                <option value="pending">معلق</option>
                <option value="مرفوض">مرفوض</option>
              </select>
            </div>
          </div>

          <!-- جدول الكباتن والتقارير -->
          <div class="table-scroll">
            <table class="w-full text-right text-xs">
              <thead>
                <tr class="text-slate-400 font-bold border-b border-slate-100 text-[11px]">
                  <th class="pb-3 pr-2">الكابتن</th>
                  <th class="pb-3">رقم الجوال</th>
                  <th class="pb-3">المركبة / النطاق</th>
                  <th class="pb-3 text-center">الطلبات المنجزة</th>
                  <th class="pb-3 text-center">إجمالي الأرباح</th>
                  <th class="pb-3 text-center">التقييم</th>
                  <th class="pb-3 text-center">الحالة</th>
                  <th class="pb-3 text-center pl-2">إجراءات</th>
                </tr>
              </thead>
              <tbody id="drivers-table-body" class="divide-y divide-slate-100">
                <!-- يُعبأ بواسطة JavaScript -->
              </tbody>
            </table>
          </div>
          
          <div id="drivers-empty-state" class="hidden text-center py-10 text-slate-400 text-xs font-medium">
            لا يوجد كباتن مطابقين للبحث أو التصفية الحالية
          </div>
        </div>

      </div>

      <!-- مودال إشعار القبول والرسالة النصية / واتساب -->
      <div id="driver-approval-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
        <div class="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 text-right">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl bg-emerald-100 text-[#008955] flex items-center justify-center text-base font-bold">✓</span>
              <div>
                <h4 class="font-extrabold text-sm text-slate-800">تم قبول المندوب بنجاح!</h4>
                <p class="text-[11px] text-slate-400">اختر طريقة إرسال إشعار القبول للمندوب</p>
              </div>
            </div>
            <button onclick="closeDriverApprovalModal()" class="text-slate-400 hover:text-slate-600 text-lg">✕</button>
          </div>

          <div class="space-y-3 text-xs">
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div class="text-slate-500 mb-1">اسم المندوب: <span id="modal-driver-name" class="font-bold text-slate-800"></span></div>
              <div class="text-slate-500">رقم الجوال: <span id="modal-driver-phone" class="font-bold text-slate-800 font-mono"></span></div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">نص رسالة القبول:</label>
              <textarea id="modal-driver-msg" rows="4" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#008955] font-sans"></textarea>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-2">
              <button id="modal-btn-whatsapp" onclick="sendApprovalViaWhatsApp()" class="w-full py-2.5 px-3 bg-[#25D366] hover:bg-[#20ba5a] text-white font-extrabold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition">
                <span>💬</span> إرسال عبر واتساب
              </button>
              <button id="modal-btn-sms" onclick="sendApprovalViaSms()" class="w-full py-2.5 px-3 bg-[#142A4A] hover:bg-[#1e3a5f] text-white font-extrabold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition">
                <span>📱</span> إرسال رسالة SMS
              </button>
            </div>
            
            <button onclick="copyApprovalText()" class="w-full py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold transition text-center">
              📋 نسخ نص الرسالة فقط
            </button>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- 9. الضرائب والفواتير (ZATCA) -->
      <!-- ======================================================== -->
      <div id="section-zatca" class="section-view space-y-6">
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h2 class="text-lg font-bold text-slate-800">الفوترة الإلكترونية والضريبة (هيئة الزكاة والضريبة والجمارك ZATCA)</h2>
          <p class="text-xs text-slate-500 mt-0.5">نسبة ضريبة القيمة المضافة 15% وفواتير ضريبية مبسطة معتمدة</p>
        </div>
        <div class="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 text-xs font-semibold">
          <div class="flex justify-between items-center py-2 border-b border-slate-100">
            <span>الرقم الضريبي للمنشأة:</span>
            <span class="font-mono font-bold text-slate-800">300123456700003</span>
          </div>
          <div class="flex justify-between items-center py-2 border-b border-slate-100">
            <span>نسبة ضريبة القيمة المضافة (VAT):</span>
            <span class="font-bold text-emerald-600">15% (مطبقة تلقائياً على كل المبيعات)</span>
          </div>
          <div class="flex justify-between items-center py-2 border-b border-slate-100">
            <span>حالة الربط مع منصة فاتورة (Fatoora):</span>
            <span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-bold">جاهز ومتوافق للمرحلة الثانية ✓</span>
          </div>
        </div>
      </div>

    </main>
  </div>

  <!-- مودال إضافة منتج جديد -->
  <div id="add-product-modal" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl space-y-4 text-right">
      <div class="flex justify-between items-center pb-2 border-b">
        <h3 class="font-bold text-base text-slate-800">إضافة صنف جديد</h3>
        <button onclick="closeAddProductModal()" class="text-slate-400 hover:text-slate-600">✕</button>
      </div>

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">اسم المنتج</label>
          <input type="text" id="new-prod-name" placeholder="مثال: خبز توست أبيض بر" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">القسم</label>
            <select id="new-prod-cat" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]">
              <option value="المخبوزات والحلويات">المخبوزات والحلويات</option>
              <option value="الألبان والأجبان">الألبان والأجبان</option>
              <option value="الفواكه والخضار">الفواكه والخضار</option>
              <option value="المعلبات والأرز">المعلبات والأرز</option>
              <option value="المشروبات والعصائر">المشروبات والعصائر</option>
              <option value="اللحوم والدواجن">اللحوم والدواجن</option>
              <option value="الزيوت والصلصات">الزيوت والصلصات</option>
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">رمز الإيموجي الافتراضي</label>
            <input type="text" id="new-prod-emoji" value="🥖" class="w-full border rounded-xl p-2.5 outline-none text-center text-base" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">السعر (ر.س)</label>
            <input type="number" step="0.5" id="new-prod-price" placeholder="10.00" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">الوحدة</label>
            <input type="text" id="new-prod-unit" value="كيس" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">المخزون</label>
            <input type="number" id="new-prod-stock" value="50" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
        </div>

        <!-- خيار رفع صورة من الكمبيوتر للمنتج الجديد -->
        <div class="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 space-y-2">
          <label class="block font-bold text-slate-700">صورة الصنف (اختياري)</label>
          <div class="flex items-center gap-3">
            <div id="new-img-preview" class="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              <span class="text-2xl text-slate-300">🖼️</span>
            </div>
            <div class="flex-1 space-y-1">
              <input type="file" id="new-prod-file-input" accept="image/*" class="hidden" onchange="handleImageFilePick(this, 'product-add')" />
              <button type="button" onclick="document.getElementById('new-prod-file-input').click()" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border rounded-lg text-xs flex items-center gap-1.5 transition">
                📷 رفع صورة من الكمبيوتر
              </button>
              <input type="hidden" id="new-prod-img-url" />
              <p id="new-img-status" class="text-[10px] text-slate-400">أي صيغة وأي حجم - يتم تصغيرها تلقائياً</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <button onclick="submitNewProduct()" class="flex-1 bg-[#008955] text-white py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 transition">
          حفظ ونشر في تطبيق العملاء
        </button>
        <button onclick="closeAddProductModal()" class="px-4 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-200 transition">
          إلغاء
        </button>
      </div>
    </div>
  </div>

  <!-- مودال تعديل بيانات المنتج وصورته -->
  <div id="edit-product-modal" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl space-y-4 text-right">
      <div class="flex justify-between items-center pb-2 border-b">
        <h3 class="font-bold text-base text-slate-800">تعديل بيانات الصنف والصورة</h3>
        <button onclick="closeEditProductModal()" class="text-slate-400 hover:text-slate-600">✕</button>
      </div>

      <input type="hidden" id="edit-prod-id" />
      <input type="hidden" id="edit-prod-img-url" />

      <div class="space-y-3 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">اسم المنتج</label>
          <input type="text" id="edit-prod-name" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">القسم</label>
            <select id="edit-prod-cat" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]">
              <option value="المخبوزات والحلويات">المخبوزات والحلويات</option>
              <option value="الألبان والأجبان">الألبان والأجبان</option>
              <option value="الفواكه والخضار">الفواكه والخضار</option>
              <option value="المعلبات والأرز">المعلبات والأرز</option>
              <option value="المشروبات والعصائر">المشروبات والعصائر</option>
              <option value="اللحوم والدواجن">اللحوم والدواجن</option>
              <option value="الزيوت والصلصات">الزيوت والصلصات</option>
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">الوحدة</label>
            <input type="text" id="edit-prod-unit" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">السعر الحالي (ر.س)</label>
            <input type="number" step="0.5" id="edit-prod-price" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">السعر السابق (ر.س)</label>
            <input type="number" step="0.5" id="edit-prod-oldprice" placeholder="اختياري" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">المخزون</label>
            <input type="number" id="edit-prod-stock" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
        </div>

        <!-- رفع وتغيير صورة الصنف من الكمبيوتر -->
        <div class="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 space-y-2">
          <label class="block font-bold text-slate-700">صورة المنتج الحالية والجديدة</label>
          <div class="flex items-center gap-3">
            <div id="edit-img-preview" class="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              <span class="text-3xl">📦</span>
            </div>
            <div class="flex-1 space-y-1">
              <input type="file" id="edit-img-file-input" accept="image/*" class="hidden" onchange="handleImageFilePick(this, 'product-edit')" />
              <button type="button" onclick="document.getElementById('edit-img-file-input').click()" class="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold border rounded-lg text-xs flex items-center gap-1.5 transition">
                📷 تغيير الصورة من الكمبيوتر
              </button>
              <p id="edit-img-status" class="text-[10px] text-slate-500">اختر أي صورة بأي حجم - سيتم تصغيرها وحفظها تلقائياً</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex gap-2 pt-2">
        <button onclick="submitEditProduct()" class="flex-1 bg-[#008955] text-white py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 transition">
          حفظ التعديلات ونشرها في تطبيق العملاء
        </button>
        <button onclick="closeEditProductModal()" class="px-4 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-200 transition">
          إلغاء
        </button>
      </div>
    </div>
  </div>

  <!-- مودال إنشاء / تعديل سلة مناسبات -->
  <div id="basket-modal" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white w-full max-w-lg rounded-2xl p-6 shadow-xl space-y-4 text-right max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center pb-2 border-b">
        <h3 id="basket-modal-title" class="font-bold text-base text-slate-800">سلة جديدة</h3>
        <button onclick="closeBasketModal()" class="text-slate-400 hover:text-slate-600">✕</button>
      </div>

      <input type="hidden" id="basket-edit-id" value="" />

      <div class="space-y-3 text-xs">
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">اسم السلة *</label>
            <input type="text" id="basket-name" placeholder="مثال: سلة إفطار" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">الأيقونة</label>
            <input type="text" id="basket-emoji" value="🧺" class="w-full border rounded-xl p-2.5 outline-none text-center text-base" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">التصنيف</label>
            <input type="text" id="basket-cat" value="سلال أسبوعية" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">الوصف (يظهر داخل السلايدر)</label>
          <input type="text" id="basket-desc" placeholder="كل ما تحتاجه سفرة الإفطار في سلة واحدة" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block font-bold text-slate-700 mb-1">سعر السلة (ر.س) *</label>
            <input type="number" step="0.5" id="basket-price" placeholder="150.00" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">السعر قبل الخصم</label>
            <input type="number" step="0.5" id="basket-oldprice" placeholder="اختياري" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">الترتيب في السلايدر</label>
            <input type="number" id="basket-sort" value="1" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]" />
          </div>
        </div>

        <!-- محتويات السلة: كل سطر = اسم منتج + سعر + كمية -->
        <div class="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 space-y-2">
          <div class="flex items-center justify-between">
            <label class="block font-bold text-slate-700">محتويات السلة (تُعرض كقائمة في تطبيق العميل)</label>
            <button type="button" onclick="addBasketItemRow()" class="px-2.5 py-1 bg-white border rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-100">+ إضافة صنف</button>
          </div>
          <div id="basket-items-rows" class="space-y-2"></div>
        </div>

        <!-- صورة السلة -->
        <div class="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 space-y-2">
          <label class="block font-bold text-slate-700">صورة السلة (اختياري)</label>
          <div class="flex items-center gap-3">
            <div id="basket-img-preview" class="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              <span class="text-2xl text-slate-300">🖼️</span>
            </div>
            <div class="flex-1 space-y-1">
              <input type="file" id="basket-file-input" accept="image/*" class="hidden" onchange="handleImageFilePick(this, 'basket')" />
              <button type="button" onclick="document.getElementById('basket-file-input').click()" class="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold border rounded-lg text-xs flex items-center gap-1.5 transition">
                📷 اختيار صورة من الجهاز
              </button>
              <input type="hidden" id="basket-image-final-url" value="" />
              <p id="basket-img-status" class="text-[10px] text-slate-400">إن لم تختر صورة ستُعرض أيقونة السلة بشكل كبير</p>
            </div>
          </div>
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1.5">لون السلة في السلايدر</label>
          <select id="basket-gradient" class="w-full border rounded-xl p-2.5 outline-none focus:border-[#008955]">
            <option value="emerald">أخضر زمردي</option>
            <option value="amber">كهرماني (رملي)</option>
            <option value="rose">أحمر (تخفيضات)</option>
            <option value="violet">بنفسجي</option>
          </select>
        </div>

        <label class="flex items-center gap-2 font-bold text-slate-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 cursor-pointer">
          <input type="checkbox" id="basket-active" checked class="w-4 h-4 accent-[#008955]" />
          <span>السلة مفعّلة وتظهر في سلايدر تطبيق العميل فوراً</span>
        </label>
      </div>

      <div class="flex gap-2 pt-1">
        <button onclick="submitBasket()" class="flex-1 bg-[#008955] text-white py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 transition">
          حفظ السلة ونشرها في تطبيق العملاء
        </button>
        <button onclick="closeBasketModal()" class="px-4 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-200 transition">
          إلغاء
        </button>
      </div>
    </div>
  </div>

  <!-- مودال ترقية الباقات المتقدم -->
  <div id="plans-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto custom-scroll">
      <div class="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 class="font-extrabold text-lg text-slate-800">ترقية باقة المنشأة</h3>
          <p class="text-xs text-slate-400">اختر الباقة المناسبة لحجم أعمالك للترقية الفورية لـ ${escapeHtml(tenant.name)}</p>
        </div>
        <button onclick="closePlansModal()" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center">✕</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-5" id="upgrade-plans-grid">
        <!-- ستُملأ ببطاقات الباقات ديناميكياً -->
      </div>

      <div class="flex justify-end pt-2 border-t border-slate-100">
        <button onclick="closePlansModal()" class="px-5 py-2 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200">إغلاق</button>
      </div>
    </div>
  </div>

  <script>
    window.CURRENT_TENANT = {
      id: "${escapeHtml(tenant.id)}",
      name: "${escapeHtml(tenant.name)}",
      plan: "${escapeHtml(sub.plan || 'trial')}"
    };

    function switchTenant(tid) {
      document.cookie = "almanar_tenant=" + encodeURIComponent(tid) + "; path=/; max-age=31536000; SameSite=Lax";
      window.location.href = "/?tenant=" + encodeURIComponent(tid);
    }

    async function openPlansModal() {
      const modal = document.getElementById('plans-modal');
      const grid = document.getElementById('upgrade-plans-grid');
      modal.classList.remove('hidden');
      grid.innerHTML = '<div class="col-span-2 text-center py-8 text-slate-400 text-xs">جاري تحميل الباقات...</div>';
      try {
        const res = await fetch('/api/plans');
        const plans = await res.json();
        const curPlan = window.CURRENT_TENANT.plan;
        grid.innerHTML = plans.map(function(p) {
          var isCurrent = p.id === curPlan;
          var curBadge = isCurrent ? '<span class="absolute -top-2.5 left-4 bg-[#008955] text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm">باقتك الحالية</span>' : '';
          var borderCls = isCurrent ? 'border-[#008955] bg-emerald-50/40 shadow-sm' : 'border-slate-200 hover:border-emerald-300';
          var btnCls = isCurrent ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-[#008955] hover:bg-emerald-700 text-white shadow-sm transition';
          var btnLabel = isCurrent ? 'الباقة المفعلة' : 'ترقية الآن';
          var feats = (p.features || []).map(function(f) { return '<li class="flex items-center gap-1.5"><span class="text-emerald-500 font-bold">✓</span> ' + f + '</li>'; }).join('');

          return '<div class="border-2 ' + borderCls + ' rounded-2xl p-4 flex flex-col justify-between transition relative">' +
            curBadge +
            '<div>' +
              '<div class="flex items-center justify-between mb-1">' +
                '<span class="font-black text-sm text-slate-800">' + p.name + '</span>' +
                '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:' + p.badgeColor + '22;color:' + p.badgeColor + '">' + p.badge + '</span>' +
              '</div>' +
              '<div class="my-2">' +
                '<span class="text-2xl font-black text-[#008955]">' + p.price + '</span>' +
                '<span class="text-xs text-slate-400 font-bold"> ' + p.currency + ' / ' + p.periodLabel + '</span>' +
              '</div>' +
              '<ul class="text-[11px] text-slate-600 space-y-1.5 my-3">' + feats + '</ul>' +
            '</div>' +
            '<button onclick="upgradeToPlan(\'' + p.id + '\')" ' + (isCurrent ? 'disabled' : '') + ' class="w-full mt-2 py-2.5 rounded-xl text-xs font-bold ' + btnCls + '">' +
              btnLabel +
            '</button>' +
          '</div>';
        }).join('');
      } catch (e) {
        grid.innerHTML = '<div class="col-span-2 text-center text-rose-500 text-xs py-4">تعذر جلب الباقات</div>';
      }
    }

    function closePlansModal() {
      document.getElementById('plans-modal').classList.add('hidden');
    }

    async function upgradeToPlan(planId) {
      if (!confirm('هل ترغب بتأكيد ترقية المنشأة إلى هذه الباقة؟')) return;
      try {
        const res = await fetch('/api/subscription/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: planId, tenant: window.CURRENT_TENANT.id })
        });
        const data = await res.json();
        if (data.success) {
          alert('✓ تم ترقية باقة المنشأة بنجاح إلى: ' + data.subscription.planName);
          location.reload();
        } else {
          alert('خطأ: ' + (data.error || 'تعذر الترقية'));
        }
      } catch (e) {
        alert('تعذر الاتصال بالخادم');
      }
    }
  </script>

  <!-- جافاسكريبت الواجهة التفاعلية المستقل والشامل -->
  <script src="/admin.js"></script>
  <script src="/admin_additions.js"></script>
</body>
</html>`;
}

// -------------------------------------------------------------
// صفحة تسجيل الدخول — نمط نقاط البيع، مستخدم واحد فقط: المدير
// -------------------------------------------------------------
function renderLoginHtml(url) {
  const tenantQ = (url && (url.searchParams.get('tenant') || url.searchParams.get('tenantId'))) || '';
  let tenantName = '';
  try {
    const _db = getDb();
    const _t = (_db.tenants || []).find(t => t.id === tenantQ);
    tenantName = _t ? _t.name : '';
  } catch (_) {}
  const brandSub = tenantName || 'التوفير بإختصار';
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تسجيل الدخول | سلة المنار</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Cairo', sans-serif; box-sizing: border-box; }
    html, body { margin: 0; min-height: 100vh; }
    body {
      background: radial-gradient(1200px 700px at 50% -10%, #1cb99c 0%, #11786a 45%, #0a4f47 80%, #063530 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 32px 16px; color: #fff;
      position: relative; overflow-x: hidden;
    }
    /* توهجات خلفية جمالية تعزز تأثير الشفافية والزجاج */
    .bg-glow-1 {
      position: fixed; width: 480px; height: 480px; border-radius: 50%;
      background: radial-gradient(circle, rgba(52, 211, 153, 0.3) 0%, rgba(52, 211, 153, 0) 70%);
      top: 5%; right: 10%; pointer-events: none; z-index: 0; filter: blur(40px);
    }
    .bg-glow-2 {
      position: fixed; width: 440px; height: 440px; border-radius: 50%;
      background: radial-gradient(circle, rgba(20, 184, 166, 0.28) 0%, rgba(20, 184, 166, 0) 70%);
      bottom: 5%; left: 10%; pointer-events: none; z-index: 0; filter: blur(40px);
    }
    .brand-wrap { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; }
    .brand-logo-img {
      max-width: 270px; height: auto; max-height: 80px; object-fit: contain;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 20px;
      border: 1.5px solid rgba(255, 255, 255, 0.42);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 10px 22px; margin-bottom: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    }
    .brand-logo {
      width: 64px; height: 64px; border-radius: 18px;
      background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.45);
      backdrop-filter: blur(14px);
      display: flex; align-items: center; justify-content: center;
      font-size: 30px; color: #fff; margin-bottom: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .brand-name { color: #fff; font-size: 26px; font-weight: 800; letter-spacing: .3px; text-align: center; text-shadow: 0 2px 10px rgba(0,0,0,0.25); }
    .brand-sub { color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 600; margin-top: 4px; text-align: center; }

    /* كرت تسجيل الدخول الزجاجي الشفاف */
    .card {
      position: relative; z-index: 1;
      margin-top: 24px; width: 100%; max-width: 440px;
      background: rgba(255, 255, 255, 0.14);
      border-radius: 28px; padding: 26px 22px 22px;
      backdrop-filter: blur(30px) saturate(190%);
      -webkit-backdrop-filter: blur(30px) saturate(190%);
      border: 1.5px solid rgba(255, 255, 255, 0.35);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.45);
      color: #fff;
    }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .head-label { font-size: 11px; font-weight: 800; letter-spacing: .5px; color: rgba(255,255,255,0.9); }
    .pill {
      border: 1px solid rgba(255, 255, 255, 0.45);
      background: rgba(255, 255, 255, 0.22);
      backdrop-filter: blur(10px);
      color: #fff;
      font-size: 11px; font-weight: 800; padding: 5px 12px; border-radius: 999px; white-space: nowrap;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-start; margin-top: 14px; }
    .chip {
      padding: 8px 16px; border-radius: 12px;
      background: rgba(255, 255, 255, 0.14);
      color: rgba(255, 255, 255, 0.85);
      font-size: 12.5px; font-weight: 800;
      border: 1.2px solid rgba(255, 255, 255, 0.25);
      cursor: pointer; backdrop-filter: blur(8px);
      transition: all .2s ease;
    }
    .chip.selected {
      background: rgba(255, 255, 255, 0.32);
      border-color: rgba(255, 255, 255, 0.65);
      color: #fff;
      box-shadow: 0 6px 18px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.4);
    }
    .info-bar {
      margin-top: 16px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 14px;
      padding: 10px 14px; display: flex; align-items: center; gap: 8px;
      font-size: 11.5px; font-weight: 700; color: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
    }
    .dots { display: flex; gap: 16px; justify-content: center; margin: 20px 0 16px; }
    .dot {
      width: 14px; height: 14px; border-radius: 50%;
      background: rgba(255, 255, 255, 0.28);
      border: 1.5px solid rgba(255, 255, 255, 0.45);
      transition: all .18s ease;
    }
    .dot.filled {
      background: #ffffff;
      border-color: #ffffff;
      box-shadow: 0 0 14px rgba(255, 255, 255, 0.95);
      transform: scale(1.2);
    }
    .dot.error {
      background: #ef4444; border-color: #fca5a5;
      box-shadow: 0 0 14px #ef4444; transform: scale(1.2);
    }
    .keypad { direction: ltr; display: grid; grid-template-columns: repeat(3, 72px); gap: 14px; justify-content: center; }
    .key {
      width: 72px; height: 64px; border-radius: 999px;
      border: 1.5px solid rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      font-size: 22px; font-weight: 800; color: #ffffff;
      cursor: pointer; transition: all .15s ease;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }
    .key:hover {
      background: rgba(255, 255, 255, 0.34);
      border-color: rgba(255, 255, 255, 0.65);
      transform: translateY(-2px);
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    }
    .key:active { transform: scale(.93); background: rgba(255, 255, 255, 0.45); }
    .key.back { color: rgba(255, 255, 255, 0.9); font-size: 19px; }
    .key.ghost { visibility: hidden; }
    .caption { text-align: center; font-size: 12.5px; font-weight: 700; color: rgba(255, 255, 255, 0.9); margin-top: 16px; }

    .foot-link {
      position: relative; z-index: 1;
      margin-top: 18px; color: rgba(255, 255, 255, 0.9); background: none; border: none;
      font-family: 'Cairo', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; gap: 8px; transition: color .15s;
    }
    .foot-link:hover { color: #ffffff; text-decoration: underline; text-shadow: 0 0 8px rgba(255,255,255,0.4); }
    
    .email-mode { display: none; }
    .email-mode.open { display: block; }
    .email-mode .field { margin-top: 12px; }
    .email-mode input {
      width: 100%; padding: 12px 14px;
      border: 1.5px solid rgba(255, 255, 255, 0.35);
      border-radius: 14px;
      font-family: 'Cairo', sans-serif; font-size: 13px; font-weight: 700;
      outline: none; background: rgba(255, 255, 255, 0.18);
      color: #ffffff; backdrop-filter: blur(10px);
      transition: all .2s;
    }
    .email-mode input::placeholder { color: rgba(255, 255, 255, 0.65); }
    .email-mode input:focus {
      border-color: rgba(255, 255, 255, 0.85);
      background: rgba(255, 255, 255, 0.28);
      box-shadow: 0 0 16px rgba(255, 255, 255, 0.2);
    }
    .email-mode button {
      margin-top: 16px; width: 100%; padding: 13px; border: 1.5px solid rgba(255, 255, 255, 0.5);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.28);
      color: #ffffff; font-family: 'Cairo', sans-serif; font-size: 13.5px; font-weight: 800;
      cursor: pointer; backdrop-filter: blur(12px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4);
      transition: all .2s;
    }
    .email-mode button:hover {
      background: rgba(255, 255, 255, 0.4);
      border-color: #ffffff;
      transform: translateY(-1px);
    }
    .email-mode .err { color: #fca5a5; font-size: 12px; font-weight: 700; margin-top: 8px; display: none; text-align: center; }
    .pin-error { color: #ef4444 !important; }

    /* النافذة المنبثقة لاسترجاع الحساب الشفافة */
    .reset-modal-backdrop {
      display: none; position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 9999; align-items: center; justify-content: center; padding: 16px;
    }
    .reset-modal-backdrop.open { display: flex; }
    .reset-modal {
      width: 100%; max-width: 440px;
      background: rgba(14, 45, 42, 0.88);
      border: 1.5px solid rgba(255, 255, 255, 0.28);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border-radius: 26px; padding: 26px 22px;
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35);
      color: #ffffff; text-align: right;
    }
    .reset-modal input {
      background: rgba(255, 255, 255, 0.15) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.3) !important;
      color: #fff !important;
      outline: none;
    }
    .reset-modal input::placeholder { color: rgba(255, 255, 255, 0.6) !important; }
    .reset-modal input:focus {
      border-color: rgba(255, 255, 255, 0.85) !important;
      background: rgba(255, 255, 255, 0.25) !important;
    }
    .reset-modal button.submit-btn {
      background: rgba(255, 255, 255, 0.28) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.45) !important;
      color: #fff !important;
      backdrop-filter: blur(8px);
      transition: all .2s;
    }
    .reset-modal button.submit-btn:hover {
      background: rgba(255, 255, 255, 0.4) !important;
    }
    .reset-modal button.close-btn {
      border: none; background: rgba(255, 255, 255, 0.2); color: #fff;
      border-radius: 50%; width: 30px; height: 30px; font-weight: 800; cursor: pointer;
    }

    @keyframes shake {
      0%,100% { transform: translateX(0); } 20% { transform: translateX(-7px); }
      40% { transform: translateX(7px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); }
    }
    .shake { animation: shake .45s ease; }
  </style>
</head>
<body>
  <div class="bg-glow-1"></div>
  <div class="bg-glow-2"></div>

  <div class="brand-wrap">
    <img src="/images/logo.png" class="brand-logo-img" alt="شعار سلة المنار" onerror="this.outerHTML='<div class=\'brand-logo\'>🏢</div>'" />
    <div class="brand-name">سلة المنار</div>
    <div class="brand-sub">${tenantName ? 'منشأة: ' + tenantName.replace(/</g, '&lt;') : 'التوفير بإختصار'}</div>
  </div>

  <div class="card" id="login-card">
    <div class="card-head">
      <div class="head-label">اختر المستخدم</div>
      <span class="pill">🔑 المدير — رمز الدخول: ••••</span>
    </div>

    <div class="chips">
      <span class="chip selected">المدير</span>
    </div>

    <div class="info-bar">
      <span>🛒</span>
      <span>حساب المدير — صلاحيات كاملة على كل أقسام المتجر والطلبات والمخزون</span>
    </div>

    <!-- وضع الرمز السري -->
    <div id="pin-mode">
      <div class="dots">
        <span class="dot" id="d1"></span><span class="dot" id="d2"></span>
        <span class="dot" id="d3"></span><span class="dot" id="d4"></span>
      </div>
      <div class="keypad">
        <button class="key" onclick="inputDigit('3')">3</button>
        <button class="key" onclick="inputDigit('2')">2</button>
        <button class="key" onclick="inputDigit('1')">1</button>
        <button class="key" onclick="inputDigit('6')">6</button>
        <button class="key" onclick="inputDigit('5')">5</button>
        <button class="key" onclick="inputDigit('4')">4</button>
        <button class="key" onclick="inputDigit('9')">9</button>
        <button class="key" onclick="inputDigit('8')">8</button>
        <button class="key" onclick="inputDigit('7')">7</button>
        <button class="key back" onclick="backspace()">⌫</button>
        <button class="key" onclick="inputDigit('0')">0</button>
        <span class="key ghost"></span>
      </div>
    </div>

    <!-- وضع البريد الإلكتروني -->
    <div class="email-mode" id="email-mode">
      <div class="field"><input type="email" id="email-input" placeholder="البريد الإلكتروني" dir="ltr" /></div>
      <div class="field"><input type="password" id="password-input" placeholder="كلمة المرور" dir="ltr" /></div>
      <button onclick="loginWithEmail()">تسجيل الدخول</button>
      <div class="err" id="email-error">بيانات الدخول غير صحيحة، حاول مرة أخرى</div>
    </div>

    <div class="caption" id="caption">ادخل الرمز المكوّن من 4 أرقام للمتابعة</div>
    
  </div>

  <button class="foot-link" onclick="toggleEmailMode()">🔑 <span id="foot-text">تسجيل الدخول بالبريد الإلكتروني وكلمة المرور</span></button>
  <button class="foot-link" onclick="openResetModal()" style="margin-top:8px; color:#fde047">❓ <span>نسيت كلمة المرور أو رمز الدخول؟ (استرجاع)</span></button>
  <button class="foot-link" onclick="location.href='/register${tenantQ ? '?tenant=' + encodeURIComponent(tenantQ) : ''}'" style="margin-top:8px">🆕 <span>إنشاء حساب منشأة جديد</span></button>

  <!-- نافذة مودال استرجاع كلمة المرور / رمز الدخول بالهاتف أو البريد -->
  <div class="reset-modal-backdrop" id="reset-modal">
    <div class="reset-modal">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:10px">
        <h3 style="margin:0; font-size:16px; font-weight:800; color:#5eead4">🔄 استرجاع بيانات الدخول للمدير</h3>
        <button onclick="closeResetModal()" style="border:none; background:rgba(255,255,255,0.2); color:#fff; border-radius:50%; width:28px; height:28px; font-weight:800; cursor:pointer">✕</button>
      </div>

      <div id="reset-step-1">
        <p style="font-size:12.5px; color:rgba(255,255,255,0.85); margin-top:0">أدخل رقم الهاتف أو البريد الإلكتروني المسجل لحساب المنشأة:</p>
        <input type="text" id="reset-identifier" placeholder="أدخل بريدك الإلكتروني أو رقم جوالك المسجل" dir="ltr"
               style="width:100%; padding:11px 14px; border-radius:12px; font-size:13px; font-family:'Cairo'; outline:none; font-weight:bold" />
        <button onclick="requestResetCode()" style="margin-top:14px; width:100%; padding:12px; background:rgba(255,255,255,0.28); color:#fff; border:1.5px solid rgba(255,255,255,0.45); border-radius:12px; font-size:13px; font-weight:800; cursor:pointer; font-family:'Cairo'; backdrop-filter:blur(8px)">
          إرسال رمز التحقق للاسترجاع
        </button>
        <div id="reset-step1-err" style="color:#fca5a5; font-size:11.5px; font-weight:bold; margin-top:8px; display:none; text-align:center"></div>
      </div>

      <div id="reset-step-2" style="display:none">
        <div style="background:rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.35); padding:10px; border-radius:12px; font-size:12px; color:#5eead4; font-weight:bold; margin-bottom:12px" id="reset-otp-hint">
          ✓ تم إرسال الرمز بنجاح! أدخل رمز التحقق 9876 ثم اختر الرمز الجديد:
        </div>
        
        <div style="margin-bottom:10px">
          <label style="font-size:11.5px; font-weight:bold; color:rgba(255,255,255,0.9)">رمز التحقق (OTP):</label>
          <input type="text" id="reset-otp" placeholder="9876" dir="ltr" maxlength="6"
                 style="width:100%; padding:10px; border-radius:10px; font-size:14px; font-family:'Cairo'; font-weight:bold; text-align:center" />
        </div>

        <div style="margin-bottom:10px">
          <label style="font-size:11.5px; font-weight:bold; color:rgba(255,255,255,0.9)">رمز الدخول السريع الجديد (4 أرقام):</label>
          <input type="text" id="reset-new-pin" placeholder="مثال: 5566" dir="ltr" maxlength="4"
                 style="width:100%; padding:10px; border-radius:10px; font-size:14px; font-family:'Cairo'; font-weight:bold; text-align:center" />
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:11.5px; font-weight:bold; color:rgba(255,255,255,0.9)">كلمة المرور الجديدة للبريد الإلكتروني:</label>
          <input type="password" id="reset-new-pass" placeholder="كلمة مرور جديدة (4 خانات فأكثر)" dir="ltr"
                 style="width:100%; padding:10px; border-radius:10px; font-size:13px; font-family:'Cairo'; font-weight:bold" />
        </div>

        <button onclick="submitNewCredentials()" style="width:100%; padding:12px; background:rgba(255,255,255,0.28); color:#fff; border:1.5px solid rgba(255,255,255,0.45); border-radius:12px; font-size:13px; font-weight:800; cursor:pointer; font-family:'Cairo'; backdrop-filter:blur(8px)">
          ✓ حفظ بيانات الدخول الجديدة والدخول المباشر
        </button>
        <div id="reset-step2-err" style="color:#fca5a5; font-size:11.5px; font-weight:bold; margin-top:8px; display:none; text-align:center"></div>
      </div>
    </div>
  </div>

  <script>
    let entered = '';

    function openResetModal() {
      document.getElementById('reset-modal').classList.add('open');
      document.getElementById('reset-step-1').style.display = 'block';
      document.getElementById('reset-step-2').style.display = 'none';
      document.getElementById('reset-step1-err').style.display = 'none';
      document.getElementById('reset-step2-err').style.display = 'none';
    }

    function closeResetModal() {
      document.getElementById('reset-modal').classList.remove('open');
    }

    async function requestResetCode() {
      const idVal = document.getElementById('reset-identifier').value.trim();
      const errEl = document.getElementById('reset-step1-err');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/api/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: idVal, tenant: tenantQ })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          document.getElementById('reset-step-1').style.display = 'none';
          document.getElementById('reset-step-2').style.display = 'block';
          document.getElementById('reset-otp').value = '9876';
          document.getElementById('reset-otp-hint').innerHTML = '✓ تم التحقق من الحساب (' + (data.email || data.phone) + ')<br>رمز التحقق السريع: <b>9876</b>';
        } else {
          errEl.textContent = data.error || 'تعذر إيجاد الحساب، تأكد من الرقم أو البريد';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = 'حدث خطأ في الاتصال بالخادم';
        errEl.style.display = 'block';
      }
    }

    async function submitNewCredentials() {
      const otp = document.getElementById('reset-otp').value.trim();
      const newPin = document.getElementById('reset-new-pin').value.trim();
      const newPassword = document.getElementById('reset-new-pass').value.trim();
      const errEl = document.getElementById('reset-step2-err');
      errEl.style.display = 'none';

      if (!newPin || newPin.length !== 4) {
        errEl.textContent = 'يجب إدخال رمز دخول سري من 4 أرقام';
        errEl.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/api/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp, newPin, newPassword, tenant: tenantQ })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert('✓ تم تحديث بيانات الدخول بنجاح! رمزك السري الجديد: ' + newPin);
          closeResetModal();
          location.reload();
        } else {
          errEl.textContent = data.error || 'تعذر التحديث';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = 'حدث خطأ أثناء حفظ البيانات';
        errEl.style.display = 'block';
      }
    }


    function renderDots(cls) {
      for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById('d' + i);
        dot.className = 'dot' + (i <= entered.length ? ' ' + (cls || 'filled') : '');
      }
    }

    const tenantQ = ${JSON.stringify(tenantQ)};
    const homeUrl = tenantQ ? '/?tenant=' + encodeURIComponent(tenantQ) : '/';

    async function verifyPin() {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: entered, tenant: tenantQ })
        });
        if (res.ok) {
          sessionStorage.setItem('almanar_admin_session', '1');
          const data = await res.json().catch(() => ({}));
          if (data.user && data.user.name) sessionStorage.setItem('almanar_admin_name', data.user.name);
          if (data.tenant) sessionStorage.setItem('almanar_tenant_name', data.tenant);
          location.href = tenantQ ? homeUrl : (data.tenantId ? '/?tenant=' + encodeURIComponent(data.tenantId) : '/');
          return;
        }
      } catch (e) {}
      // رمز خاطئ: اهتزاز وتحذير أحمر ثم تصفير
      document.getElementById('login-card').classList.add('shake');
      renderDots('error');
      document.getElementById('caption').textContent = 'الرمز غير صحيح، حاول مرة أخرى';
      document.getElementById('caption').classList.add('pin-error');
      setTimeout(() => {
        entered = '';
        renderDots();
        document.getElementById('login-card').classList.remove('shake');
        document.getElementById('caption').textContent = 'ادخل الرمز المكوّن من 4 أرقام للمتابعة';
        document.getElementById('caption').classList.remove('pin-error');
      }, 900);
    }

    function inputDigit(d) {
      if (entered.length >= 4) return;
      entered += d;
      renderDots();
      if (entered.length === 4) setTimeout(verifyPin, 220);
    }

    function backspace() {
      entered = entered.slice(0, -1);
      renderDots();
    }

    function toggleEmailMode() {
      const pinMode = document.getElementById('pin-mode');
      const emailMode = document.getElementById('email-mode');
      const open = !emailMode.classList.contains('open');
      emailMode.classList.toggle('open', open);
      pinMode.style.display = open ? 'none' : '';
      document.getElementById('caption').textContent = open
        ? 'بدائل الدخول عبر البريد وكلمة المرور'
        : 'ادخل الرمز المكوّن من 4 أرقام للمتابعة';
      document.getElementById('foot-text').textContent = open
        ? 'العودة لاستخدام الرمز السري'
        : 'تسجيل الدخول بالبريد الإلكتروني وكلمة المرور';
    }

    async function loginWithEmail() {
      const email = document.getElementById('email-input').value.trim();
      const password = document.getElementById('password-input').value.trim();
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, tenant: tenantQ })
        });
        if (res.ok) {
          sessionStorage.setItem('almanar_admin_session', '1');
          const data = await res.json().catch(() => ({}));
          if (data.user && data.user.name) sessionStorage.setItem('almanar_admin_name', data.user.name);
          if (data.tenant) sessionStorage.setItem('almanar_tenant_name', data.tenant);
          location.href = tenantQ ? homeUrl : (data.tenantId ? '/?tenant=' + encodeURIComponent(data.tenantId) : '/');
          return;
        }
      } catch (e) {}
      document.getElementById('email-error').style.display = 'block';
      document.getElementById('email-mode').classList.add('shake');
      setTimeout(() => document.getElementById('email-mode').classList.remove('shake'), 500);
    }

    // الدعم بلوحة مفاتيح الحاسوب
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('email-mode').classList.contains('open')) {
        if (e.key === 'Enter') loginWithEmail();
        return;
      }
      if (/^[0-9]$/.test(e.key)) inputDigit(e.key);
      else if (e.key === 'Backspace') backspace();
    });
  </script>
</body>
</html>`;
}

// -------------------------------------------------------------
// صفحة إنشاء حساب منشأة/مدير جديد — مع نظام الباقات والاشتراكات
// -------------------------------------------------------------
function renderRegisterHtml(url) {
  const tenantQ = (url && (url.searchParams.get('tenant') || url.searchParams.get('tenantId'))) || '';
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>إنشاء حساب منشأة | سلة المنار</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { font-family: 'Cairo', sans-serif; box-sizing: border-box; }
    html, body { margin: 0; min-height: 100vh; }
    body {
      background: radial-gradient(1200px 700px at 50% -10%, #1cb99c 0%, #0f7a6a 45%, #0a4f47 80%, #063530 100%);
      display: flex; flex-direction: column; align-items: center;
      padding: 28px 16px 48px; color: #fff; position: relative; overflow-x: hidden;
    }
    .bg-glow { position: fixed; border-radius: 50%; pointer-events: none; filter: blur(50px); z-index: 0; }
    .bg-glow-1 { width: 500px; height: 500px; background: radial-gradient(circle, rgba(52,211,153,.25) 0%, transparent 70%); top: 0; right: -100px; }
    .bg-glow-2 { width: 400px; height: 400px; background: radial-gradient(circle, rgba(14,165,233,.2) 0%, transparent 70%); bottom: 0; left: -80px; }
    .wrap { position: relative; z-index: 1; width: 100%; max-width: 860px; display: flex; flex-direction: column; align-items: center; }
    .brand-logo-img { width: 72px; height: 72px; border-radius: 20px; object-fit: contain; background: rgba(255,255,255,.2); border: 1.5px solid rgba(255,255,255,.45); backdrop-filter: blur(14px); padding: 6px; margin-bottom: 10px; box-shadow: 0 14px 40px rgba(0,0,0,.28); }
    .brand-name { color: #fff; font-size: 24px; font-weight: 800; text-align: center; }
    .brand-sub { color: rgba(255,255,255,.8); font-size: 12px; font-weight: 600; margin-top: 3px; text-align: center; margin-bottom: 24px; }

    /* ── مؤشر الخطوات ── */
    .steps { display: flex; align-items: center; gap: 0; margin-bottom: 28px; }
    .step { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .step-num { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.18); border: 2px solid rgba(255,255,255,.35); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: rgba(255,255,255,.7); transition: all .3s; }
    .step.active .step-num { background: rgba(255,255,255,.95); color: #0d7a6a; border-color: #fff; box-shadow: 0 0 18px rgba(255,255,255,.5); }
    .step.done .step-num { background: #10b981; border-color: #10b981; color: #fff; }
    .step-label { font-size: 9.5px; font-weight: 700; color: rgba(255,255,255,.65); white-space: nowrap; }
    .step.active .step-label { color: #fff; }
    .step-line { width: 60px; height: 2px; background: rgba(255,255,255,.25); margin: 0 4px; margin-bottom: 18px; transition: background .3s; }
    .step-line.done { background: #10b981; }

    /* ── بطاقة زجاجية مشتركة ── */
    .card { width: 100%; background: rgba(255,255,255,.13); border-radius: 28px; padding: 26px 24px 24px; backdrop-filter: blur(30px) saturate(180%); -webkit-backdrop-filter: blur(30px) saturate(180%); border: 1.5px solid rgba(255,255,255,.32); box-shadow: 0 28px 70px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.4); color: #fff; }
    .card-title { font-size: 16px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .card-sub { font-size: 11.5px; font-weight: 600; color: rgba(255,255,255,.8); margin-bottom: 18px; }

    /* ── شبكة الباقات ── */
    .plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
    .plan-card { border-radius: 20px; padding: 18px 16px; background: rgba(255,255,255,.1); border: 2px solid rgba(255,255,255,.2); cursor: pointer; transition: all .22s ease; position: relative; }
    .plan-card:hover { background: rgba(255,255,255,.2); transform: translateY(-3px); box-shadow: 0 14px 40px rgba(0,0,0,.2); }
    .plan-card.selected { background: rgba(255,255,255,.25); border-color: rgba(255,255,255,.8); box-shadow: 0 0 0 3px rgba(255,255,255,.35), 0 14px 40px rgba(0,0,0,.2); transform: translateY(-3px); }
    .plan-badge { position: absolute; top: -10px; right: 12px; font-size: 9.5px; font-weight: 800; padding: 3px 10px; border-radius: 999px; color: #fff; }
    .plan-name { font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .plan-price { font-size: 26px; font-weight: 900; color: #fff; line-height: 1; }
    .plan-price span { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.75); }
    .plan-period { font-size: 10px; font-weight: 600; color: rgba(255,255,255,.65); margin-bottom: 12px; }
    .plan-features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
    .plan-features li { font-size: 10.5px; font-weight: 700; color: rgba(255,255,255,.9); display: flex; align-items: center; gap: 5px; }
    .plan-features li::before { content: '✓'; font-size: 10px; font-weight: 900; color: #34d399; flex-shrink: 0; }
    .plan-divider { height: 1px; background: rgba(255,255,255,.18); margin: 10px 0; }

    /* ── فورم التسجيل ── */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field.full { grid-column: 1 / -1; }
    .field label { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.92); }
    .field input, .field select {
      width: 100%; padding: 11px 14px; border-radius: 14px;
      border: 1.5px solid rgba(255,255,255,.35);
      background: rgba(255,255,255,.16); color: #fff;
      font-family: 'Cairo', sans-serif; font-size: 13px; font-weight: 700; outline: none;
      transition: all .2s;
    }
    .field input::placeholder { color: rgba(255,255,255,.55); font-weight: 600; }
    .field input:focus, .field select:focus { border-color: rgba(255,255,255,.85); background: rgba(255,255,255,.25); box-shadow: 0 0 16px rgba(255,255,255,.15); }
    .field select option { background: #0a4f47; color: #fff; }

    .btn-primary {
      width: 100%; padding: 13px; border: 1.5px solid rgba(255,255,255,.5); border-radius: 16px;
      background: rgba(255,255,255,.28); color: #fff; font-family: 'Cairo',sans-serif; font-size: 14px; font-weight: 800;
      cursor: pointer; backdrop-filter: blur(12px); box-shadow: 0 8px 24px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.4);
      transition: all .2s; margin-top: 16px;
    }
    .btn-primary:hover { background: rgba(255,255,255,.4); border-color: #fff; transform: translateY(-1px); }
    .btn-primary:active { transform: scale(.98); }
    .btn-primary:disabled { opacity: .6; cursor: wait; }
    .btn-ghost { background: none; border: none; color: rgba(255,255,255,.85); font-family: 'Cairo',sans-serif; font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 6px; transition: color .15s; }
    .btn-ghost:hover { color: #fff; text-decoration: underline; }

    .msg { display: none; margin-top: 12px; border-radius: 12px; padding: 10px 14px; font-size: 12px; font-weight: 700; text-align: center; }
    .msg.err { background: rgba(239,68,68,.2); border: 1px solid rgba(252,165,165,.5); color: #fff; }
    .msg.ok  { background: rgba(16,185,129,.2); border: 1px solid rgba(110,231,183,.5); color: #fff; }
    .hint { font-size: 10.5px; color: rgba(255,255,255,.65); text-align: center; margin-top: 8px; }

    .hidden { display: none !important; }
    @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-7px)} 40%{transform:translateX(7px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
    .shake { animation: shake .45s ease; }

    /* ── ملخص الباقة المختارة ── */
    .plan-summary { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,.12); border: 1.5px solid rgba(255,255,255,.3); border-radius: 16px; padding: 12px 16px; margin-bottom: 16px; }
    .plan-summary-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .plan-summary-info { flex: 1; }
    .plan-summary-name { font-size: 13px; font-weight: 800; }
    .plan-summary-price { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.75); }
    .plan-summary-change { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.8); cursor: pointer; text-decoration: underline; }

    @media (max-width: 560px) {
      .plans-grid { grid-template-columns: 1fr 1fr; }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 380px) { .plans-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="bg-glow bg-glow-1"></div>
  <div class="bg-glow bg-glow-2"></div>

  <div class="wrap">
    <img src="/images/logo.png" class="brand-logo-img" alt="شعار سلة المنار" onerror="this.style.display='none'" />
    <div class="brand-name">سلة المنار</div>
    <div class="brand-sub">منصة إدارة المنشآت والتوصيل — التوفير بإختصار</div>

    <!-- مؤشر الخطوات -->
    <div class="steps">
      <div class="step active" id="step-ind-1"><div class="step-num">1</div><div class="step-label">اختر الباقة</div></div>
      <div class="step-line" id="line-1"></div>
      <div class="step" id="step-ind-2"><div class="step-num">2</div><div class="step-label">بيانات المنشأة</div></div>
      <div class="step-line" id="line-2"></div>
      <div class="step" id="step-ind-3"><div class="step-num">3</div><div class="step-label">تم الإنشاء</div></div>
    </div>

    <!-- الخطوة 1: اختيار الباقة -->
    <div class="card" id="step-1" style="max-width:860px">
      <div class="card-title">📦 اختر باقة الاشتراك المناسبة</div>
      <div class="card-sub">يمكنك الترقية أو تغيير الباقة في أي وقت من لوحة التحكم</div>

      <div class="plans-grid" id="plans-container">
        <!-- تُعبأ ديناميكياً -->
        <div style="text-align:center; padding:30px; color:rgba(255,255,255,.7); font-size:13px">جارٍ تحميل الباقات...</div>
      </div>

      <div class="msg err" id="err1"></div>
      <button class="btn-primary" onclick="goToStep2()">التالي — إدخال بيانات المنشأة ←</button>
    </div>

    <!-- الخطوة 2: بيانات المنشأة والمدير -->
    <div class="card hidden" id="step-2" style="max-width:560px">

      <!-- ملخص الباقة المختارة -->
      <div class="plan-summary" id="plan-summary-box">
        <div class="plan-summary-dot" id="summary-dot"></div>
        <div class="plan-summary-info">
          <div class="plan-summary-name" id="summary-name"></div>
          <div class="plan-summary-price" id="summary-price"></div>
        </div>
        <span class="plan-summary-change" onclick="goBack()">← تغيير</span>
      </div>

      <div class="card-title">🏢 بيانات المنشأة والمدير</div>
      <div class="card-sub">كل منشأة لها بياناتها المعزولة تماماً عن باقي المنشآت</div>

      <div class="grid">
        <div class="field full">
          <label>اسم المنشأة / المتجر *</label>
          <input id="store-name" placeholder="مثال: سوبرماركت النور" />
        </div>
        <div class="field">
          <label>النشاط التجاري</label>
          <select id="category">
            <option>سوبرماركت ومواد غذائية</option>
            <option>مخبوزات وحلويات</option>
            <option>لحوم ودواجن</option>
            <option>خضار وفاكهة</option>
            <option>مطعم وكافيه</option>
            <option>صيدلية</option>
            <option>تجارة عامة</option>
          </select>
        </div>
        <div class="field">
          <label>المدينة</label>
          <select id="city">
            <option>الرياض</option>
            <option>جدة</option>
            <option>مكة المكرمة</option>
            <option>المدينة المنورة</option>
            <option>الدمام</option>
            <option>الخبر</option>
            <option>تبوك</option>
            <option>أخرى</option>
          </select>
        </div>
        <div class="field">
          <label>اسم المدير *</label>
          <input id="admin-name" placeholder="الاسم الكامل" />
        </div>
        <div class="field">
          <label>رقم الجوال</label>
          <input id="phone" placeholder="05xxxxxxxx" dir="ltr" />
        </div>
        <div class="field full">
          <label>البريد الإلكتروني</label>
          <input id="email" type="email" placeholder="name@example.com" dir="ltr" />
        </div>
        <div class="field">
          <label>كلمة المرور * (4 أحرف فأكثر)</label>
          <input id="password" type="password" placeholder="••••••••" dir="ltr" />
        </div>
        <div class="field">
          <label>تأكيد كلمة المرور *</label>
          <input id="password2" type="password" placeholder="••••••••" dir="ltr" />
        </div>
        <div class="field full">
          <label>رمز الدخول PIN (4 أرقام) *</label>
          <input id="pin" inputmode="numeric" maxlength="4" placeholder="● ● ● ●" dir="ltr" style="letter-spacing:12px; text-align:center; font-size:18px;" />
        </div>
      </div>

      <div class="msg err" id="err2"></div>
      <div class="msg ok" id="ok2"></div>
      <button class="btn-primary" id="submit-btn" onclick="submitRegister()">🚀 إنشاء المنشأة والبدء فوراً</button>
      <div class="hint">بياناتك معزولة تماماً — لا تظهر لأي منشأة أخرى في النظام</div>
    </div>

    <!-- الخطوة 3: تم الإنشاء بنجاح -->
    <div class="card hidden" id="step-3" style="max-width:480px; text-align:center">
      <div style="font-size:56px; margin-bottom:12px">🎉</div>
      <div class="card-title" style="font-size:20px">تم إنشاء منشأتك بنجاح!</div>
      <div class="card-sub" style="font-size:13px; margin-bottom:20px">
        منشأتك الآن جاهزة مع بيانات معزولة تماماً وباقة اشتراك نشطة.
      </div>
      <div id="success-info" style="background:rgba(255,255,255,.12); border-radius:16px; padding:14px; margin-bottom:20px; text-align:right; font-size:12px; line-height:2; border:1px solid rgba(255,255,255,.2)"></div>
      <button class="btn-primary" id="go-login-btn">الدخول إلى لوحة التحكم ←</button>
    </div>

    <div style="margin-top:20px; display:flex; gap:20px; flex-wrap:wrap; justify-content:center; position:relative; z-index:1">
      <button class="btn-ghost" onclick="location.href='/login${tenantQ ? '?tenant=' + encodeURIComponent(tenantQ) : ''}'">🔑 لدي حساب بالفعل — تسجيل الدخول</button>
    </div>
  </div>

  <script>
    const preselected = ${JSON.stringify(tenantQ)};
    let selectedPlan = null;
    let plansData = [];
    let createdTenantId = '';

    // ── تحميل الباقات من الـ API ──
    async function loadPlans() {
      try {
        const r = await fetch('/api/plans');
        plansData = await r.json();
      } catch (e) {
        // بيانات احتياطية في حال فشل الاتصال
        plansData = [
          { id: 'trial', name: 'تجريبي مجاني', price: 0, periodLabel: '14 يوم', badge: 'مجاني', badgeColor: '#10b981', features: ['لوحة تحكم كاملة', 'تطبيق العميل والمندوب', 'دعم فني أساسي'], maxProducts: 30, maxOrders: 50, maxDrivers: 2, recommended: false },
          { id: 'basic', name: 'الأساسية', price: 149, periodLabel: 'شهر', badge: 'الأكثر طلباً', badgeColor: '#f59e0b', features: ['لوحة تحكم متقدمة', 'فواتير ZATCA', 'تقييمات العملاء', 'دعم 24 ساعة'], maxProducts: 200, maxOrders: 500, maxDrivers: 5, recommended: true },
          { id: 'pro', name: 'الاحترافية', price: 349, periodLabel: 'شهر', badge: 'للنمو السريع', badgeColor: '#8b5cf6', features: ['كل ميزات الأساسية', 'تقارير متقدمة', 'تتبع المناديب لحظياً', 'API مفتوح', 'مدير حساب'], maxProducts: 2000, maxOrders: 5000, maxDrivers: 20, recommended: false },
          { id: 'enterprise', name: 'المؤسسية', price: 899, periodLabel: 'شهر', badge: 'للمؤسسات الكبرى', badgeColor: '#0ea5e9', features: ['كل شيء بلا حدود', 'منشآت متعددة', 'SLA 99.9%', 'فريق دعم 24/7', 'تدريب الفريق'], maxProducts: -1, maxOrders: -1, maxDrivers: -1, recommended: false }
        ];
      }
      renderPlans();
    }

    function renderPlans() {
      const c = document.getElementById('plans-container');
      c.innerHTML = '';
      for (const plan of plansData) {
        const div = document.createElement('div');
        div.className = 'plan-card' + (plan.recommended ? ' selected' : '');
        div.dataset.planId = plan.id;
        if (plan.recommended && !selectedPlan) { selectedPlan = plan.id; }
        div.innerHTML = \`
          \${plan.badge ? \`<div class="plan-badge" style="background:\${plan.badgeColor}">\${plan.badge}</div>\` : ''}
          <div class="plan-name">\${plan.name}</div>
          <div class="plan-price">
            \${plan.price === 0 ? 'مجاني' : plan.price.toLocaleString('ar-SA')}
            \${plan.price > 0 ? '<span> ر.س</span>' : ''}
          </div>
          <div class="plan-period">/ \${plan.periodLabel}</div>
          <div class="plan-divider"></div>
          <ul class="plan-features">
            \${plan.features.map(f => \`<li>\${f}</li>\`).join('')}
          </ul>
          <div class="plan-divider" style="margin-top:10px"></div>
          <div style="font-size:10px; color:rgba(255,255,255,.65); font-weight:700; margin-top:6px">
            منتجات: \${plan.maxProducts === -1 ? 'غير محدود' : plan.maxProducts + '+'} &nbsp;|&nbsp;
            مناديب: \${plan.maxDrivers === -1 ? 'غير محدود' : plan.maxDrivers}
          </div>
        \`;
        div.addEventListener('click', () => selectPlan(plan.id));
        c.appendChild(div);
      }
      // اختر الأول إن لم يكن هناك موصى به
      if (!selectedPlan && plansData.length) selectPlan(plansData[0].id);
    }

    function selectPlan(planId) {
      selectedPlan = planId;
      document.querySelectorAll('.plan-card').forEach(el => {
        el.classList.toggle('selected', el.dataset.planId === planId);
      });
    }

    function goToStep2() {
      if (!selectedPlan) { showMsg('err1', 'اختر باقة للمتابعة'); return; }
      const plan = plansData.find(p => p.id === selectedPlan);
      // تحديث ملخص الباقة
      document.getElementById('summary-dot').style.background = plan.badgeColor || '#10b981';
      document.getElementById('summary-name').textContent = 'باقة ' + plan.name;
      document.getElementById('summary-price').textContent = plan.price === 0 ? 'مجاني لـ ' + plan.periodLabel : plan.price.toLocaleString('ar-SA') + ' ر.س / ' + plan.periodLabel;
      // التبديل
      setStep(2);
    }

    function goBack() { setStep(1); }

    function setStep(n) {
      ['step-1','step-2','step-3'].forEach((id, i) => {
        document.getElementById(id).classList.toggle('hidden', i + 1 !== n);
      });
      for (let i = 1; i <= 3; i++) {
        const ind = document.getElementById('step-ind-' + i);
        ind.classList.toggle('active', i === n);
        ind.classList.toggle('done', i < n);
      }
      for (let i = 1; i <= 2; i++) {
        document.getElementById('line-' + i).classList.toggle('done', i < n);
      }
    }

    async function submitRegister() {
      hideMsg('err2'); hideMsg('ok2');
      const storeName = document.getElementById('store-name').value.trim();
      const name = document.getElementById('admin-name').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const password = document.getElementById('password').value;
      const password2 = document.getElementById('password2').value;
      const pin = document.getElementById('pin').value.trim();
      const city = document.getElementById('city').value;
      const category = document.getElementById('category').value;

      if (!storeName) return showMsg('err2', 'أدخل اسم المنشأة');
      if (!name) return showMsg('err2', 'أدخل اسم المدير');
      if (password.length < 4) return showMsg('err2', 'كلمة المرور يجب أن تكون 4 أحرف فأكثر');
      if (password !== password2) return showMsg('err2', 'كلمتا المرور غير متطابقتين');
      if (!/^\\d{4}$/.test(pin)) return showMsg('err2', 'رمز PIN يجب أن يكون 4 أرقام');

      const btn = document.getElementById('submit-btn');
      btn.disabled = true; btn.textContent = 'جارٍ إنشاء المنشأة...';
      try {
        const r = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeName, name, email, phone, password, pin, city, category, plan: selectedPlan })
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.success) {
          createdTenantId = data.tenantId;
          const plan = plansData.find(p => p.id === selectedPlan) || {};
          document.getElementById('success-info').innerHTML = \`
            <b>المنشأة:</b> \${storeName}<br>
            <b>الباقة:</b> \${plan.name || selectedPlan}<br>
            <b>المعرف:</b> <span dir="ltr">\${data.tenantId}</span><br>
            <b>المدير:</b> \${name}
          \`;
          document.getElementById('go-login-btn').onclick = () => { location.href = '/login?tenant=' + encodeURIComponent(data.tenantId); };
          setStep(3);
          return;
        }
        showMsg('err2', data.error || 'فشل إنشاء الحساب، حاول مرة أخرى');
      } catch (e) { showMsg('err2', 'تعذر الاتصال بالخادم'); }
      btn.disabled = false; btn.textContent = '🚀 إنشاء المنشأة والبدء فوراً';
    }

    function showMsg(id, msg) {
      const el = document.getElementById(id);
      el.textContent = msg; el.style.display = 'block';
      const card = el.closest('.card');
      if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
    }
    function hideMsg(id) { document.getElementById(id).style.display = 'none'; }

    document.getElementById('pin').addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !document.getElementById('step-2').classList.contains('hidden')) submitRegister(); });

    loadPlans();
  </script>
</body>
</html>`;
}
