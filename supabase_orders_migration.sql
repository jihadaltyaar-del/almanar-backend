-- ========================================================
-- سلة المنار: هيكل قاعدة بيانات الطلبات (Orders) في Supabase
-- يشمل: إدارة المعاملات المالية، تحديث المخزون، وعزل المنشآت RLS
-- ========================================================

CREATE TABLE IF NOT EXISTS orders (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL DEFAULT 'عميل التطبيق',
    phone TEXT,
    address TEXT,
    branch TEXT,
    date TEXT,
    items_total NUMERIC(10, 2) DEFAULT 0.00,
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
    distance_km NUMERIC(5, 2) DEFAULT 2.5,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending',
    driver_name TEXT,
    payment_method TEXT DEFAULT 'الدفع عند الاستلام',
    receipt_url TEXT,
    receipt_image TEXT,
    receipt_confirmed BOOLEAN DEFAULT FALSE,
    customer_note TEXT,
    dropoff_lat DOUBLE PRECISION,
    dropoff_lng DOUBLE PRECISION,
    track_token TEXT,
    driver_token TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_track_token ON orders(track_token);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read orders" ON orders;
CREATE POLICY "Allow public read orders" ON orders
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow service_role full access orders" ON orders;
CREATE POLICY "Allow service_role full access orders" ON orders
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- دالة معالجة المخزون الآمنة (Atomic Stock Deduction)
CREATE OR REPLACE FUNCTION process_order_inventory_deduction()
RETURNS TRIGGER AS $$
DECLARE
    item JSONB;
    p_id TEXT;
    p_name TEXT;
    p_qty INTEGER;
BEGIN
    IF NEW.items IS NOT NULL AND jsonb_array_length(NEW.items) > 0 THEN
        FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
        LOOP
            p_id := item->>'id';
            p_name := item->>'name';
            p_qty := COALESCE((item->>'qty')::INTEGER, 1);

            IF p_id IS NOT NULL AND p_id <> '' THEN
                UPDATE products 
                SET stock = GREATEST(0, stock - p_qty), updated_at = NOW()
                WHERE id = p_id AND tenant_id = NEW.tenant_id;
            ELSIF p_name IS NOT NULL AND p_name <> '' THEN
                UPDATE products 
                SET stock = GREATEST(0, stock - p_qty), updated_at = NOW()
                WHERE name = p_name AND tenant_id = NEW.tenant_id;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_order_stock_deduction ON orders;
CREATE TRIGGER trigger_order_stock_deduction
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION process_order_inventory_deduction();

-- إدراج جميع الطلبات الحالية (23 طلب) دون أي تكرار
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#75795587', 'almanar_main', '???? ????? ???????', '0559988776', '?????? - ?? ????????', '??? ?????? - ??? ??????', '2026-11-03 10:58', 29.9, 5, 2, 34.9, 'pending', NULL, '??? (Mada)', NULL, NULL, FALSE, NULL, 0, 0, 'WCXJvfDBhaBx4uMPhNu8xYUPMDLCYFdk', NULL, '[{"price":14.95,"name":"???? ???? ????? ???? ???? ??? 200 ????","qty":2,"image":"images/products/coffee_sada_200.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#27119802', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-02 17:01', 292.09, 5, 2.5, 297.09, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'VuGSDnyVCTnSJVB98A4hPLkL834DzYbz', NULL, '[{"name":"🎊 سلة العيد","qty":1,"price":179,"image":"🎊"},{"name":"أجبان وقشطة كيري الأصلية 24 قطعة","qty":1,"price":28,"image":"images/products/cheese_kiri_24.webp"},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg"},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"images/products/rice_shoulan_5kg.png"},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#10555940', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-11-02 15:28', 100.5, 5, 2.5, 105.5, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 0, 0, 'bwzCWuq7YshLMVma3FUbYyaw2EgYAVVe', 'a63JyFzUd672xtFUeCp3XvwHzxH6JxMP', '[{"name":"أجبان وقشطة كيري الأصلية 24 قطعة","qty":1,"price":28,"image":"images/products/cheese_kiri_24.webp","prepared":true},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"images/products/olive_aljouf_500.jpg","prepared":true},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"images/products/rice_shoulan_5kg.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#80646660', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-01 19:09', 58.95, 5, 2.5, 63.95, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, 'AJwABqBx8dbwZzdzhy2693ezhMUHPWsn', NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#90348683', 'almanar_main', 'يوسف محمد', '0551234567', 'طريق الأمير سعود بن عبدالله بن جلوي, القيروان, محافظة الدرعية, منطقة الرياض, 13531, السعودية', 'سلة المنار - فرع الروضة', '2026-11-01 16:56', 74.95, 5, 2.5, 79.95, 'completed', NULL, 'تحويل بنكي للحساب', NULL, NULL, FALSE, NULL, 24.824283216257893, 46.56225640410983, '9UTtaHpf3gv6h49gu4ny5u5RvbWCRvTq', NULL, '[{"name":"🌙 سلة الإفطار","qty":1,"price":16,"image":"🌙"},{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg"},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png"},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#11176036', 'almanar_main', 'يوسف محمد', '0551234567', 'جبل ثهلان, بلدية المعذر, الرياض, محافظة الرياض, منطقة الرياض, 12313, السعودية', 'سلة المنار - فرع الروضة', '2026-10-31 22:21', 181.95, 5, 2.5, 186.95, 'completed', NULL, 'كاش عند الاستلام', NULL, NULL, FALSE, NULL, 24.692986450336917, 46.6738105455969, 'rxS43qr2yeVGHhH4a8akqHu8zgLntL9d', NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true},{"name":"🤲 سلة الضيوف","qty":1,"price":149,"image":"🤲","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#52931024', 'almanar_main', 'فحص التتبع الموثوق', '0551112233', 'الرياض - حي الياسمين', 'سلة المنار - فرع الروضة', '2026-10-31 22:01', 50, 5, 2.5, 55, 'completed', 'سلمان', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.82, 46.64, '7bW8yhz753HbEmLCgXZPPmsd6xkeDwbg', 'a88BwaTRcqCZFFnzgTtbb3ZFstXEn79a', '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#11616463', 'almanar_main', 'تجربة خرائط', '0559998877', 'الرياض - حي النرجس شارع عثمان بن عفان', 'سلة المنار - فرع الروضة', '2026-10-31 22:00', 65, 10, 4.2, 75, 'completed', 'جهاد الطيار', 'الدفع عند الاستلام', NULL, NULL, FALSE, NULL, 24.81234, 46.65432, 'jMuzrUF6jLJLn4yzQFs67vXNaDyyKpr4', 'AKB8UcMV3PYzqU7ZdERPDyEtybEA2nDn', '[]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#97666593', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-29 20:48', 63.5, 5, 2.5, 68.5, 'completed', NULL, 'تحويل بنكي للحساب', NULL, NULL, FALSE, NULL, 0, 0, '2aZv4shnfPFMqgnewnyqcFKsXrCEfTm4', NULL, '[{"name":"ورق تواليت 12 لفة","qty":1,"price":24,"image":"images/products/diapers.jpg"},{"name":"مناديل مطبخ برانة 6 لفات","qty":1,"price":17.5,"image":"images/products/diapers.jpg"},{"name":"مناديل ورقية فاين 10 علبة","qty":1,"price":22,"image":"images/products/diapers.jpg"}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#57558491', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-29 16:31', 32.95, 5, 2.5, 37.95, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, '2BPkWBkFPjawse2VamBCqvxuxPPfAuYJ', 'MYseswSCceJLZQyCrPnPs82vJe34nBBH', '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#57544842', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-28 15:48', 12.59, 10, 5, 22.59, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#43070394', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-28 15:47', 71.54, 10, 5, 81.54, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":false},{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":false},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":false},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#13208200', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-27 19:14', 45.54, 5, 2.5, 50.54, 'completed', NULL, 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"images/products/tea_ceylon_anwar.jpg","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#70970615', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-27 17:11', 18, 5, 2.5, 23, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"images/products/coffee_instant_zafran.png","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#84753154', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-27 12:35', 40.95, 5, 2.5, 45.95, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"images/products/coffee_sada_200.jpg","prepared":false},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26,"image":"images/products/tea_green_ghamdan.jpg","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#34597274', 'almanar_main', 'سارة خالد', '0554433221', 'الرياض - حي الياسمين', 'سلة المنار - فرع الروضة', '2026-10-27 10:12', 60.49, 5, 2.5, 65.49000000000001, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":2,"price":14.95,"image":"☕","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"☕","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59,"image":"🍵","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#62099990', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-26 22:58', 58.13, 5, 2.5, 63.13, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"📦","prepared":true},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"📦","prepared":true},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":2,"price":12.59,"image":"📦","prepared":true}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#94612642', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-26 22:52', 105.45, 5, 2.5, 110.45, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95,"image":"📦","prepared":false},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18,"image":"📦","prepared":false},{"name":"زيت زيتون الجوف بكر ممتاز 500 مل","qty":1,"price":24.5,"image":"📦","prepared":false},{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48,"image":"📦","prepared":false}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#48802353', 'almanar_main', 'فهد العتيبي', '0558877665', 'حي الروضة شارع خالد بن الوليد', 'سلة المنار - فرع الروضة', '2026-10-26 22:49', 71.54, 10, 5, 81.54, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"قهوة تركية 200 جرام","qty":1,"price":14.95},{"name":"شاي غمدان أخضر","qty":1,"price":26}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#98918832', 'almanar_main', 'فهد العتيبي', '0558877665', 'حي الروضة شارع خالد بن الوليد', 'سلة المنار - فرع الروضة', '2026-10-26 22:44', 0, 0, 0, 76.54, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"قهوة تركية 200 جرام","qty":1,"price":14.95},{"name":"شاي غمدان أخضر","qty":1,"price":26}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#78159410', 'almanar_main', 'يوسف محمد', '0551234567', 'الرياض - حي العارض شارع ريحانة', 'سلة المنار - فرع الروضة', '2026-10-26 22:24', 0, 0, 0, 94.271, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18},{"name":"شاي أنور علي شاي سيلاني درجة أولى 250 جرام","qty":1,"price":12.59},{"name":"شاي غمدان شاي أخضر 100 كيس 200 جرام","qty":1,"price":26}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('20241818', 'almanar_main', 'عمار محمد', '0551234567', 'الطائف - حي القيم شارع سليمان الراجحي', 'متاجر سلة المنار - الطائف', '08/02/2026', 0, 0, 0, 33, 'completed', 'رفيق سلطان', 'مدى (Mada)', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"باجة قهوة تركية سادة بدون هيل 200 جرام","qty":1,"price":14.95},{"name":"الخير قهوة سريعة التحضير بالزعفران 12 كيس","qty":1,"price":18}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
INSERT INTO orders (id, tenant_id, customer_name, phone, address, branch, date, items_total, delivery_fee, distance_km, total, status, driver_name, payment_method, receipt_url, receipt_image, receipt_confirmed, customer_note, dropoff_lat, dropoff_lng, track_token, driver_token, items)
VALUES ('#20241819', 'almanar_main', 'سارة علي', '0559876543', 'الطائف - الحلقة الغربية', 'متاجر سلة المنار - الطائف', '08/02/2026', 0, 0, 0, 48.75, 'completed', 'رفيق سلطان', 'Apple Pay', NULL, NULL, FALSE, NULL, 0, 0, NULL, NULL, '[{"name":"أرز بسمتي الشعلان عنبر 5 كغ","qty":1,"price":48}]'::jsonb)
ON CONFLICT (id, tenant_id) DO UPDATE SET
    status = EXCLUDED.status,
    driver_name = EXCLUDED.driver_name,
    receipt_confirmed = EXCLUDED.receipt_confirmed,
    updated_at = NOW();
