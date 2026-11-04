import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// التحقق من توفر بيانات Supabase بشكل صارم
// المفاتيح الصحيحة لـ Supabase تبدأ بـ eyJ (JWT tokens)
const isSupabaseConfigured =
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl !== 'https://YOUR_PROJECT_ID.supabase.co' &&
  supabaseKey !== 'YOUR_SERVICE_ROLE_KEY_HERE' &&
  supabaseUrl.includes('.supabase.co') &&
  (supabaseKey.startsWith('eyJ') || supabaseKey.startsWith('sb_secret_'));

// ⚡ مهلة قصيرة جداً: 1.5 ثانية فقط لاكتشاف مشاكل الشبكة بسرعة
const SUPABASE_TIMEOUT_MS = 1500;

const fetchWithTimeout = (input, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  return fetch(input, { ...(init || {}), signal: controller.signal }).finally(() => clearTimeout(timer));
};

// فحص الاتصال
let supabaseReachable = true;
let lastConnectivityCheck = 0;
const CONNECTIVITY_CACHE_MS = 60000; // إعادة الفحص كل دقيقة

async function checkSupabaseReachable(force = false) {
  if (!supabase) return false;
  const now = Date.now();
  if (!force && now - lastConnectivityCheck < CONNECTIVITY_CACHE_MS) {
    return supabaseReachable;
  }
  lastConnectivityCheck = now;
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    supabaseReachable = !error;
  } catch {
    supabaseReachable = false;
  }
  return supabaseReachable;
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, { fetch: fetchWithTimeout })
  : null;

if (!isSupabaseConfigured) {
  console.warn('[Supabase] ⚠️  لم يتم تهيئة Supabase - الخادم سيعمل بالبيانات المحلية فقط');
  console.warn('[Supabase] أضف SUPABASE_URL و SUPABASE_SERVICE_KEY في ملف .env');
} else {
  // فحص الاتصال عند بدء الخادم
  checkSupabaseReachable().then(ok => {
    if (ok) console.log('[Supabase] ✅ الاتصال يعمل');
    else console.warn('[Supabase] ❌ تعذر الاتصال بـ Supabase — ستُستخدم البيانات المحلية');
  });
}

/**
 * تنفيذ أمر Supabase مع حماية ضد الفشل السريع
 * إذا كان Supabase غير متاح، يعيد null فوراً بدون انتظار
 */
async function safeSupabaseCall(fn) {
  if (!supabase) return null;
  const reachable = await checkSupabaseReachable();
  if (!reachable) return null;
  try {
    return await fn();
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      supabaseReachable = false;
      lastConnectivityCheck = Date.now();
      console.warn('[Supabase] اتصال فشل — تم الانتقال للبيانات المحلية');
    }
    return null;
  }
}

/** Retrieve tenant data (categories, products, etc.) */
export async function getTenantData(tenantId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();
  if (error) throw error;
  return data;
}

/** Get drivers for a tenant */
export async function getDrivers(tenantId) {
  return safeSupabaseCall(async () => {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[Supabase] getDrivers error:', error.message); return null; }
    return data ?? [];
  });
}

/** Upsert (create or update) a driver record */
export async function upsertDriver(driver) {
  if (!supabase) return [driver];
  const { data, error } = await supabase
    .from('drivers')
    .upsert(driver, { onConflict: 'id,tenant_id' })
    .select();
  if (error) {
    console.error('[Supabase] upsertDriver error:', error.message);
    throw error;
  }
  return data;
}

/** Delete a driver by ID and tenant */
export async function deleteDriver(driverId, tenantId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('drivers')
    .delete()
    .eq('id', driverId)
    .eq('tenant_id', tenantId)
    .select();
  if (error) {
    console.error('[Supabase] deleteDriver error:', error.message);
    throw error;
  }
  return data;
}

/** Get products for a tenant */
export async function getProducts(tenantId) {
  return safeSupabaseCall(async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[Supabase] getProducts error:', error.message);
      return null;
    }
    return data ?? [];
  });
}

/** Upsert (create or update) a product record */
export async function upsertProduct(product) {
  if (!supabase) return [product];
  try {
    const { data, error } = await supabase
      .from('products')
      .upsert(product, { onConflict: 'id' })
      .select();
    if (error) {
      console.error('[Supabase] upsertProduct error:', error.message);
      return [product];
    }
    return data;
  } catch (err) {
    console.error('[Supabase] upsertProduct network error:', err.message);
    return [product];
  }
}

/** Delete a product by ID and tenant */
export async function deleteProduct(productId, tenantId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .select();
    if (error) {
      console.error('[Supabase] deleteProduct error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Supabase] deleteProduct network error:', err.message);
    return null;
  }
}

/** Get categories for a tenant */
export async function getCategories(tenantId) {
  return safeSupabaseCall(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[Supabase] getCategories error:', error.message);
      return null;
    }
    return data ?? [];
  });
}

/** Upsert (create or update) a category record */
export async function upsertCategory(category) {
  if (!supabase) return [category];
  try {
    const { data, error } = await supabase
      .from('categories')
      .upsert(category, { onConflict: 'id,tenant_id' })
      .select();
    if (error) {
      console.error('[Supabase] upsertCategory error:', error.message);
      return [category];
    }
    return data;
  } catch (err) {
    console.error('[Supabase] upsertCategory network error:', err.message);
    return [category];
  }
}

/** Delete a category by ID and tenant */
export async function deleteCategory(categoryId, tenantId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .eq('tenant_id', tenantId)
      .select();
    if (error) {
      console.error('[Supabase] deleteCategory error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Supabase] deleteCategory network error:', err.message);
    return null;
  }
}

/** Get orders for a tenant */
export async function getOrders(tenantId) {
  return safeSupabaseCall(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[Supabase] getOrders error:', error.message);
      return null;
    }
    return data ?? [];
  });
}

/** Upsert (create or update) an order record */
export async function upsertOrder(order) {
  if (!supabase) return [order];
  try {
    const { data, error } = await supabase
      .from('orders')
      .upsert(order, { onConflict: 'id,tenant_id' })
      .select();
    if (error) {
      console.error('[Supabase] upsertOrder error:', error.message);
      return [order];
    }
    return data;
  } catch (err) {
    console.error('[Supabase] upsertOrder network error:', err.message);
    return [order];
  }
}

/** Delete an order by ID and tenant */
export async function deleteOrder(orderId, tenantId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .select();
    if (error) {
      console.error('[Supabase] deleteOrder error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Supabase] deleteOrder network error:', err.message);
    return null;
  }
}

/** Decrement stock for order items atomically */
export async function decrementStockForOrder(tenantId, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  if (!supabase) return;

  try {
    for (const item of items) {
      const qty = parseInt(item.qty, 10) || 1;
      if (qty <= 0) continue;

      let query = supabase.from('products').select('id, stock').eq('tenant_id', tenantId);
      if (item.prodId || item.id) {
        query = query.eq('id', item.prodId || item.id);
      } else if (item.name) {
        query = query.eq('name', item.name);
      } else {
        continue;
      }

      const { data: matched } = await query;
      if (matched && matched.length > 0) {
        const prod = matched[0];
        const newStock = Math.max(0, (prod.stock || 0) - qty);
        await supabase
          .from('products')
          .update({ stock: newStock, updated_at: new Date().toISOString() })
          .eq('id', prod.id)
          .eq('tenant_id', tenantId);
      }
    }
  } catch (err) {
    console.error('[Supabase] decrementStockForOrder network error:', err.message);
  }
}

/** Get customers for a tenant */
export async function getCustomers(tenantId) {
  return safeSupabaseCall(async () => {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[Supabase] getCustomers error:', error.message);
      return null;
    }
    return data ?? [];
  });
}

/** Upsert (create or update) a customer record */
export async function upsertCustomer(customer) {
  if (!supabase) return [customer];
  try {
    const { data, error } = await supabase
      .from('customers')
      .upsert(customer, { onConflict: 'id,tenant_id' })
      .select();
    if (error) {
      console.error('[Supabase] upsertCustomer error:', error.message);
      return [customer];
    }
    return data;
  } catch (err) {
    console.error('[Supabase] upsertCustomer network error:', err.message);
    return [customer];
  }
}

/** Delete a customer by ID and tenant */
export async function deleteCustomer(customerId, tenantId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .select();
    if (error) {
      console.error('[Supabase] deleteCustomer error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Supabase] deleteCustomer network error:', err.message);
    return null;
  }
}
