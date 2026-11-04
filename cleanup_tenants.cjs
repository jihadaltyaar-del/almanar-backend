// تنظيف منشآت الاختبار المؤقتة من قاعدة البيانات (يُشغّل والخادم متوقف)
const fs = require('fs');
const p = './database.json';
const db = JSON.parse(fs.readFileSync(p, 'utf8'));
const remove = new Set([
  'tenant_1793124731984',
  'tenant_1793124731990',
  'tenant_1793128262508',
  'tenant_1793128262513',
  'tenant_1793128354873',
  'tenant_1793128354886',
  'tenant_1793128878805',
  'tenant_1793128878815',
  'tenant_1793130489321',
  'tenant_1793130489329',
  'tenant_1793130625566',
  'tenant_1793130625571',
]);
const before = { tenants: (db.tenants || []).length, tenantData: Object.keys(db.tenantData || {}).length };
if (Array.isArray(db.tenants)) {
  db.tenants = db.tenants.filter((t) => !remove.has(t && (t.id || t.tenantId)));
}
if (db.tenantData) {
  for (const id of remove) delete db.tenantData[id];
}
fs.writeFileSync(p, JSON.stringify(db, null, 2));
const main = db.tenantData && db.tenantData.almanar_main;
console.log('قبل:', JSON.stringify(before));
console.log('بعد: tenants=' + (db.tenants || []).length + ' tenantData=' + Object.keys(db.tenantData || {}).length);
console.log('منشآت متبقية:', (db.tenants || []).map((t) => t && (t.id || t.tenantId)).join(', '));
console.log('حساب مدير almanar_main موجود:', !!(main && main.admin));
