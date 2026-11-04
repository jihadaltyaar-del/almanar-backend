// ============================================================================
// سلة المنار — بناء كتالوج سوبرماركت متكامل مع صور حقيقية من الإنترنت
// الاستخدام:  node fetch_and_seed.js
// - يبحث عن صورة لكل منتج عبر بحث صور DuckDuckGo ثم يحمّلها
// - يحفظ الصور في public/images/products و public/images/categories
// - يدمج الأقسام والمنتجات في database.json مع الحفاظ على بيانات سليمة
// ============================================================================
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');
const PRODUCTS_DIR = path.join(__dirname, 'public', 'images', 'products');
const CATEGORIES_DIR = path.join(__dirname, 'public', 'images', 'categories');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// الكتالوج: أقسام + منتجات (كل منتج: اسم، سعر، وحدة، استعلام صورة)
// ─────────────────────────────────────────────────────────────
const CATALOG = {
  sections: [
    { id: 'cat-rice', name: 'الأرز والمواد الجافة', icon: '🍚', imageQuery: 'basmati rice supermarkt', fallback: 'images/products/rice.jpg' },
    { id: 'cat-oils', name: 'الزيوت المأكولة', icon: '🫒', imageQuery: 'cis certificate olive oil bottle', fallback: 'images/products/olive_oil.jpg' },
    { id: 'cat-sugar', name: 'السكر والمحليات', icon: '🧂', imageQuery: 'white sugar bag package', fallback: 'images/products/sugar.jpg' },
    { id: 'cat-coffee', name: 'القهوة والشاي', icon: '☕', imageQuery: 'arabic coffee package', fallback: 'images/products/coffee.jpg' },
    { id: 'cat-dairy', name: 'الألبان والعصائر', icon: '🥛', imageQuery: 'milk cheese dairy products', fallback: 'images/products/cheese.jpg' },
    { id: 'cat-canned', name: 'المعلبات', icon: '🥫', imageQuery: 'canned food supermarket', fallback: 'images/categories/canned.jpg' },
    { id: 'cat-veg', name: 'الخضار والفواكه', icon: '🍎', imageQuery: 'fresh fruits vegetables market', fallback: 'images/products/fruits.jpg' },
    { id: 'cat-bakery', name: 'المخبوزات', icon: '🍞', imageQuery: 'toast bread loaf', fallback: 'images/products/bread.jpg' },
    { id: 'cat-sweets', name: 'الحلويات والشوكولاتة', icon: '🍫', imageQuery: 'chocolate bars supermarket', fallback: 'images/products/sweets_choc.jpg' },
    { id: 'cat-spices', name: 'البهارات والتوابل', icon: '🌶️', imageQuery: 'spices jars colorful', fallback: null },
    { id: 'cat-detergents', name: 'المنظفات وخادمات المنزل', icon: '🧴', imageQuery: 'laundry detergent box', fallback: 'images/products/detergent.jpg' },
    { id: 'cat-paper', name: 'الحفائض والورقيات', icon: '🧻', imageQuery: 'baby diapers pampers pack', fallback: 'images/products/diapers.jpg' },
  ],
  products: [
    // ── المنتجات الست المطلوبة تحديداً (صور مطابقة) ──
    { slug: 'aljouf_organic_oliveoil_4l', name: 'زيت زيتون الجوف عضوي بكر ممتاز 4 لتر', category: 'الزيوت المأكولة', price: 89.0, oldPrice: 119, unit: 'جالون 4 لتر', stock: 30, rating: 4.9, query: 'Al Jouf organic extra virgin olive oil 4L tin' },
    { slug: 'aljouf_organic_oliveoil_250', name: 'زيت زيتون الجوف عضوي بكر ممتاز 250 مل', category: 'الزيوت المأكولة', price: 17.5, oldPrice: 22, unit: 'زجاجة 250 مل', stock: 60, rating: 4.8, query: 'Al Jouf organic extra virgin olive oil 250ml bottle' },
    { slug: 'nems_sunflower_1.8', name: 'زيت النيمس دوار الشمس النقي 1.8 لتر', category: 'الزيوت المأكولة', price: 21.0, oldPrice: 27, unit: 'عبوة 1.8 لتر', stock: 45, rating: 4.7, query: 'Nems sunflower oil 1.8 litre bottle' },
    { slug: 'alaila_rice_5kg', name: 'أرز بسمتي العائلة هندي فاخر 5 كغ', category: 'الأرز والمواد الجافة', price: 57.0, oldPrice: 69, unit: 'كيس 5 كغ', stock: 40, rating: 4.9, query: 'Al Aila white Indian basmati rice 5kg package' },
    { slug: 'alaila_rice_10kg', name: 'أرز بسمتي العائلة هندي فاخر 10 كغ', category: 'الأرز والمواد الجافة', price: 109.0, oldPrice: 132, unit: 'كيس 10 كغ', stock: 25, rating: 4.9, query: 'Al Aila jumbo basmati rice 10kg bag' },
    { slug: 'alosra_sugar_10kg', name: 'سكر ناعم الأوسرة 10 كغ', category: 'السكر والمحليات', price: 38.5, oldPrice: 45, unit: 'كيس 10 كغ', stock: 50, rating: 4.8, query: 'Al Osra fine sugar 10kg bag' },

    // ── الأرز والمواد الجافة ──
    { slug: 'rice_shoulan_5kg', name: 'أرز بسمتي الشعلان عنبر 5 كغ', category: 'الأرز والمواد الجافة', price: 52.0, oldPrice: 65, unit: 'كيس 5 كغ', stock: 35, rating: 4.7, query: 'basmati rice bag 5kg supermarkt' },
    { slug: 'pasta_abukas_shells', name: 'مكرونة قواقع أبو كاس 400 جم', category: 'الأرز والمواد الجافة', price: 15.0, oldPrice: 22, unit: 'كيس', stock: 80, rating: 4.5, query: 'pasta shells 400g package' },
    { slug: 'pasta_abukas_spaghetti', name: 'مكرونة سباغيتي أبو كاس 500 جرام', category: 'الأرز والمواد الجافة', price: 14.0, oldPrice: 19, unit: 'كيس', stock: 75, rating: 4.5, query: 'spaghetti pasta 500g package' },
    { slug: 'vermicelli', name: 'شعيرية أبو كاس 400 جرام', category: 'الأرز والمواد الجافة', price: 5.5, oldPrice: 8, unit: 'كيس', stock: 90, rating: 4.4, query: 'vermicelli noodles package 400g' },
    { slug: 'lentils_1kg', name: 'عدس مطحون / مجروش 1 كغ', category: 'الأرز والمواد الجافة', price: 9.0, oldPrice: 12, unit: '1 كغ', stock: 60, rating: 4.4, query: 'red lentils 1kg bag' },
    { slug: 'beans_1kg', name: 'فاصوليا بيضاء 1 كغ', category: 'الأرز والمواد الجافة', price: 8.5, oldPrice: 11, unit: '1 كغ', stock: 55, rating: 4.3, query: 'white beans 1kg bag' },

    // ── الزيوت ──
    { slug: 'olive_jufolea_4l', name: 'زيت زيتون الجوفية 4 لتر', category: 'الزيوت المأكولة', price: 76.0, oldPrice: 95, unit: 'جالون 4 لتر', stock: 20, rating: 4.8, query: 'Joufolea extra virgin olive oil gallon 4L' },
    { slug: 'olive_aljouf_500', name: 'زيت زيتون الجوف بكر ممتاز 500 مل', category: 'الزيوت المأكولة', price: 26.0, oldPrice: 32, unit: 'زجاجة 500 مل', stock: 55, rating: 4.8, query: 'Aljouf extra virgin olive oil 500ml glass bottle' },
    { slug: 'sunflower_baraka_1.8', name: 'زيت بركة دوار الشمس 1.8 لتر', category: 'الزيوت المأكولة', price: 19.5, oldPrice: 25, unit: 'عبوة 1.8 لتر', stock: 60, rating: 4.6, query: 'sunflower cooking oil 1.8L bottle' },
    { slug: 'corn_oil_1.8', name: 'زيت ذرة العربي 1.8 لتر', category: 'الزيوت المأكولة', price: 23.0, oldPrice: 29, unit: 'عبوة 1.8 لتر', stock: 50, rating: 4.6, query: 'corn oil 1.8 litre bottle' },
    { slug: 'honey_1kg', name: 'عسل سدر طبيعي 1 كغ', category: 'الزيوت المأكولة', price: 120.0, oldPrice: 155, unit: 'علبة 1 كغ', stock: 12, rating: 4.9, query: 'natural sidr honey jar 1kg' },

    // ── السكر والمحليات ──
    { slug: 'sugar_white_2kg', name: 'سكر أبيض بلوري ناعم 2 كغ', category: 'السكر والمحليات', price: 10.5, oldPrice: 14, unit: 'كيس 2 كغ', stock: 85, rating: 4.6, query: 'fine white sugar 2kg pack' },
    { slug: 'sugar_cube_500', name: 'سكر محبب (مكعبات) 500 جم', category: 'السكر والمحليات', price: 5.0, oldPrice: 7, unit: 'علبة', stock: 70, rating: 4.5, query: 'sugar cubes box 500g' },

    // ── القهوة والشاي ──
    { slug: 'coffee_sada_200', name: 'باجة قهوة تركية سادة بدون هيل 200 جرام', category: 'القهوة والشاي', price: 14.95, oldPrice: 18, unit: 'علبة', stock: 55, rating: 4.9, query: 'turkish coffee plain 200g pack' },
    { slug: 'coffee_instant_zafran', name: 'الخير قهوة سريعة التحضير بالزعفران 12 كيس', category: 'القهوة والشاي', price: 7.0, oldPrice: 10, unit: 'علبة', stock: 65, rating: 4.6, query: 'instant coffee with saffron sachets' },
    { slug: 'tea_green_ghamdan', name: 'شاي غمدان شاي أخضر 100 كيس 200 جرام', category: 'القهوة والشاي', price: 12.0, oldPrice: 15, unit: 'علبة', stock: 70, rating: 4.7, query: 'green tea bags box 100' },
    { slug: 'tea_ceylon_anwar', name: 'شاي أنور علي شاي سيلاني درجة أولى 250 جرام', category: 'القهوة والشاي', price: 11.0, oldPrice: 14, unit: 'علبة', stock: 80, rating: 4.6, query: 'ceylon black tea 250g pack' },
    { slug: 'coffee_arabica_pound', name: 'قهوة عربية مطحونة بالهيل 500 جم', category: 'القهوة والشاي', price: 28.0, oldPrice: 35, unit: 'علبة', stock: 30, rating: 4.8, query: 'arabic coffee ginger blend 500g' },

    // ── الألبان والعصائر ──
    { slug: 'milk_foremost_1l', name: 'حليب طويل الأجل كامل الدسم 1 لتر', category: 'الألبان والعصائر', price: 6.5, oldPrice: 8.5, unit: '1 لتر', stock: 65, rating: 4.6, query: 'long life full cream milk 1L tetra pack' },
    { slug: 'cheese_kiri_24', name: 'أجبان وقشطة كيري الأصلية 24 قطعة', category: 'الألبان والعصائر', price: 13.0, oldPrice: 16.5, unit: 'علبة', stock: 50, rating: 4.8, query: 'La Vache Kiri cheese 24 portions box' },
    { slug: 'juice_orange_1.5', name: 'عصير برتقال طبيعي 1.5 لتر', category: 'الألبان والعصائر', price: 8.0, oldPrice: 11, unit: 'حجم 1.5 لتر', stock: 45, rating: 4.4, query: 'orange juice tesra bottle 1.5L' },
    { slug: 'water_10pk', name: 'مياه معدنية 10 × 250 مل', category: 'الألبان والعصائر', price: 8.5, oldPrice: 11, unit: 'كرتون', stock: 70, rating: 4.5, query: 'table water bottles 10x250ml pack' },
    { slug: 'juice_tetley_ice', name: 'مشروبات شاي بارد 3 × 340 مل', category: 'الألبان والعصائر', price: 12.0, oldPrice: 15, unit: 'حزمة', stock: 25, rating: 4.3, query: 'ice tea drinks multipack' },
    { slug: 'juice_coconut', name: 'ماء جوز هند عطري 1 لتر', category: 'الألبان والعصائر', price: 10.0, oldPrice: 13, unit: 'عبوة', stock: 30, rating: 4.4, query: 'coconut water 1L carton' },

    // ── المعلبات ──
    { slug: 'tuna_yazid_4', name: 'تونة المدمسة 4 × 185 جم', category: 'المعلبات', price: 17.0, oldPrice: 21, unit: 'حزمة', stock: 40, rating: 4.6, query: 'canned tuna multipack 4x185g' },
    { slug: 'corn_can', name: 'ذرة تجارية معلبة 340 جرام', category: 'المعلبات', price: 4.5, oldPrice: 6, unit: 'علبة', stock: 60, rating: 4.5, query: 'canned sweet corn 340g' },
    { slug: 'fava_beans_can', name: 'فول مدمس معلب 400 جرام', category: 'المعلبات', price: 4.0, oldPrice: 5.5, unit: 'علبة', stock: 75, rating: 4.5, query: 'canned fava beans 400g' },
    { slug: 'tomato_paste_bottle', name: 'صلصة طماطم مركزة 660 جرام', category: 'المعلبات', price: 9.0, oldPrice: 12, unit: 'قنينة', stock: 55, rating: 4.5, query: 'tomato paste bottle 660g' },
    { slug: 'pickles_farmfirst', name: 'مخللات فارم فيرست مشكلة 950 جرام', category: 'المعلبات', price: 14.0, oldPrice: 18, unit: 'علبة', stock: 35, rating: 4.4, query: 'mixed pickles jar 950g' },
    { slug: 'soup_chicken', name: 'حساء دجاج كريمي 500 جرام', category: 'المعلبات', price: 6.5, oldPrice: 9, unit: 'علبة', stock: 45, rating: 4.3, query: 'cream of chicken soup can' },

    // ── الخضار والفواكه ──
    { slug: 'fruit_mix', name: 'تشكيلة فواكه طازجة موسمية', category: 'الخضار والفواكه', price: 25.0, oldPrice: 32, unit: 'كيس', stock: 30, rating: 4.7, query: 'fresh fruit mix basket' },
    { slug: 'veg_mix', name: 'خضراوات طازجة مشكلة', category: 'الخضار والفواكه', price: 18.0, oldPrice: 24, unit: 'سلة', stock: 35, rating: 4.7, query: 'fresh vegetables assortment crate' },
    { slug: 'apples_red', name: 'تفاح أحمر أمريكي 1 كغ', category: 'الخضار والفواكه', price: 9.5, oldPrice: 13, unit: '1 كغ', stock: 45, rating: 4.6, query: 'red american apples 1kg bag' },
    { slug: 'oranges', name: 'برتقالي مصرحي 2 كغ', category: 'الخضار والفواكه', price: 11.0, oldPrice: 15, unit: '2 كغ', stock: 40, rating: 4.6, query: 'fresh oranges 2kg' },
    { slug: 'potatoes', name: 'بطاطس طازجة 5 كغ', category: 'الخضار والفواكه', price: 16.0, oldPrice: 20, unit: '5 كغ', stock: 25, rating: 4.5, query: 'fresh potatoes 5kg' },
    { slug: 'tomatoes', name: 'طماطم بلدي طازجة 1 كغ', category: 'الخضار والفواكه', price: 4.5, oldPrice: 6.5, unit: '1 كغ', stock: 60, rating: 4.5, query: 'fresh tomatoes 1kg' },
    { slug: 'onions', name: 'بصل حلو طازج 3 كغ', category: 'الخضار والفواكه', price: 12.0, oldPrice: 16, unit: '3 كغ', stock: 30, rating: 4.5, query: 'sweet onions fresh 3kg' },
    { slug: 'dates_sukhari', name: 'تمر سكري من الانتقاء الفاخر 1 كغ', category: 'الخضار والفواكه', price: 29.0, oldPrice: 38, unit: '1 كغ', stock: 22, rating: 4.9, query: 'sukkari dates premium 1kg box' },

    // ── المخبوزات ──
    { slug: 'toast_harvest_400', name: 'خبز توست هارفست الكامل 400 جرام', category: 'المخبوزات', price: 10.0, oldPrice: 19, unit: 'كيس', stock: 55, rating: 4.6, query: 'whole wheat toast bread 400g' },
    { slug: 'arabic_bread', name: 'خبز عربي حجازي 10 قطع', category: 'المخبوزات', price: 3.0, oldPrice: 4.5, unit: 'كيس', stock: 95, rating: 4.6, query: 'arabic pita bread pack' },
    { slug: 'croissant_nader', name: 'كرواسون طازج 30 جم', category: 'المخبوزات', price: 1.5, oldPrice: 2.5, unit: 'قطعة', stock: 120, rating: 4.4, query: 'croissant pastry single wrap' },
    { slug: 'cake_nuttela', name: 'كيك بالشوكولاتة 300 جرام', category: 'المخبوزات', price: 8.0, oldPrice: 11, unit: 'علبة', stock: 40, rating: 4.4, query: 'chocolate snack cake 300g' },

    // ── الحلويات والشوكولاتة ──
    { slug: 'kitkat_4', name: 'شوكولاتة كيتكات مستوردة 4 فنجر 45 جرام', category: 'الحلويات والشوكولاتة', price: 3.5, oldPrice: 5, unit: 'لوح', stock: 150, rating: 4.8, query: 'KitKat 4 fingers 45g chocolate' },
    { slug: 'oreo_biscuits', name: 'بسكويت أوريو كلاسيك', category: 'الحلويات والشوكولاتة', price: 4.0, oldPrice: 6, unit: 'علبة', stock: 110, rating: 4.7, query: 'Oreo original biscuits pack' },
    { slug: 'bullfac_5_nuts', name: 'مكسرات مشكلة محمصة 30 جم', category: 'الحلويات والشوكولاتة', price: 2.5, oldPrice: 3.5, unit: 'قطعة', stock: 90, rating: 4.5, query: 'mixed nuts snack pack 30g' },
    { slug: 'biscuits_tea_lux', name: 'بسكويت الشاي 2 علبة', category: 'الحلويات والشوكولاتة', price: 7.5, oldPrice: 10, unit: 'علبة', stock: 80, rating: 4.5, query: 'tea biscuits pack 2 pieces' },
    { slug: 'halawa_tahini', name: 'حلا طحينية بالفستا الحلبي 250 جم', category: 'الحلويات والشوكولاتة', price: 12.0, oldPrice: 16, unit: 'علبة', stock: 33, rating: 4.6, query: 'tahini halva pistachio 250g' },

    // ── البهارات والتوابل ──
    { slug: 'salt_iodized_1kg', name: 'ملح يودي ناعم 1 كغ', category: 'البهارات والتوابل', price: 2.0, oldPrice: 3, unit: 'كيس', stock: 160, rating: 4.6, query: 'iodized salt 1kg pack' },
    { slug: 'black_pepper_200', name: 'فلفل أسود مطحون 200 جم', category: 'البهارات والتوابل', price: 9.0, oldPrice: 12, unit: 'عبوة', stock: 65, rating: 4.6, query: 'ground black pepper 200g jar' },
    { slug: 'turmeric_200', name: 'كركم مطحون 200 جم', category: 'البهارات والتوابل', price: 6.5, oldPrice: 9, unit: 'عبوة', stock: 70, rating: 4.6, query: 'turmeric powder 200g jar' },
    { slug: 'mixed_spices', name: 'بهارات مشكلة الحجاز 250 جم', category: 'البهارات والتوابل', price: 8.0, oldPrice: 11, unit: 'عبوة', stock: 60, rating: 4.7, query: 'mixed arabic spices pack 250g' },
    { slug: 'sauce_pakistani', name: 'صوص شطة حارة 200 مل', category: 'البهارات والتوابل', price: 5.5, oldPrice: 7.5, unit: 'قنينة', stock: 75, rating: 4.5, query: 'hot pepper sauce bottle 200ml' },

    // ── المنظفات وخادمات المنزل ──
    { slug: 'tide_5kg', name: 'مسحوق غسيل تايد مركز 5 كغ', category: 'المنظفات وخادمات المنزل', price: 62.0, oldPrice: 78, unit: 'كيس 5 كغ', stock: 28, rating: 4.8, query: 'Tide laundry detergent 5kg' },
    { slug: 'klorox_1l', name: 'مبيض ومعطر كلوروكس 1 لتر', category: 'المنظفات وخادمات المنزل', price: 7.5, oldPrice: 10, unit: 'قنينة', stock: 55, rating: 4.6, query: 'clorox bleach 1L bottle' },
    { slug: 'dishwash_lime', name: 'سائل جلي بالليمون 750 مل', category: 'المنظفات وخادمات المنزل', price: 5.5, oldPrice: 8, unit: 'قنينة', stock: 70, rating: 4.5, query: 'dishwashing liquid lime 750ml' },
    { slug: 'air_freshener', name: 'معطر جو فاخر 300 مل', category: 'المنظفات وخادمات المنزل', price: 9.0, oldPrice: 13, unit: 'علبة', stock: 50, rating: 4.5, query: 'air freshener spray 300ml' },
    { slug: 'trash_bags', name: 'أكياس القمامة 20 كيس', category: 'المنظفات وخادمات المنزل', price: 6.0, oldPrice: 8, unit: 'رول', stock: 85, rating: 4.4, query: 'garbage trash bags roll 20' },

    // ── الحفائض والورقيات ──
    { slug: 'pampers_size4', name: 'حفائض ومناديل مبللة بامبرز مقاس 4 (52 حبة)', category: 'الحفائض والورقيات', price: 65.0, oldPrice: 82, unit: 'حزمة', stock: 22, rating: 4.9, query: 'Pampers diapers size 4 pack' },
    { slug: 'facial_tissues', name: 'مناديل ورقية فاين 10 علبة', category: 'الحفائض والورقيات', price: 22.0, oldPrice: 28, unit: 'كرتون', stock: 35, rating: 4.6, query: 'facial tissues 10 boxes pack' },
    { slug: 'kitchen_towel', name: 'مناديل مطبخ برانة 6 لفات', category: 'الحفائض والورقيات', price: 17.5, oldPrice: 23, unit: 'حزمة', stock: 40, rating: 4.5, query: 'kitchen paper towels 6 rolls' },
    { slug: 'aluminium_foil', name: 'ورق ألمنيوم 30 متر', category: 'الحفائض والورقيات', price: 8.0, oldPrice: 11, unit: 'لفة', stock: 60, rating: 4.4, query: 'aluminium foil roll 30m' },
    { slug: 'toilet_tissue', name: 'ورق تواليت 12 لفة', category: 'الحفائض والورقيات', price: 24.0, oldPrice: 32, unit: 'حزمة', stock: 45, rating: 4.6, query: 'toilet tissue 12 rolls pack' },
  ],
};

// ─────────────────────────────────────────────────────────────
// أدوات مساعدة: بحث صور DDG + تحميل الصور
// ─────────────────────────────────────────────────────────────
async function getVqd(query) {
  const res = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images', {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8' },
  });
  const html = await res.text();
  const m = html.match(/vqd=["']?([\d-]+)["']?/);
  return m ? m[1] : null;
}

async function searchImages(query, vqd) {
  const url = 'https://duckduckgo.com/i.js?l=ar-sa&o=json&q=' + encodeURIComponent(query) + '&vqd=' + vqd + '&f=,,,&p=1';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/', Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

function isImageBytes(buf) {
  const head = buf.subarray(0, 12).toString('binary');
  return head.startsWith('\xff\xd8') /* jpeg */ ||
    head.startsWith('\x89PNG') /* png */ ||
    /^RIFF/.test(head) && buf.toString('binary', 8, 12) === 'WEBP' /* webp */;
}

const BAD_EXT = ['.svg', '.gif'];

async function downloadFirstValid(query, destBase, keywords) {
  // 1) المحاولة عبر DuckDuckGo مع مهل تصاعدي عند الحجب
  const backoffs = [1500, 6000, 12000, 20000];
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    const vqd = await getVqd(query);
    if (!vqd) { await sleep(backoffs[attempt]); continue; }
    await sleep(400);
    const results = await searchImages(query, vqd);
    for (const r of results.slice(0, 8)) {
      const url = r.image || r.thumbnail;
      if (!url) continue;
      const ext = path.extname(new URL(url).pathname).toLowerCase();
      if (BAD_EXT.includes(ext)) continue;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://duckduckgo.com/' } });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 8000 || !isImageBytes(buf)) continue;
        const extUse = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
        const dest = destBase + extUse;
        fs.writeFileSync(dest, buf);
        return { ok: true, url, file: path.basename(dest), size: buf.length };
      } catch (e) { /* حاول الرابط التالي */ }
    }
    await sleep(backoffs[attempt]);
  }

  // 2) البديل: Bing images مع فلترة بالكلمات المفتاحية
  try {
    const res = await fetch('https://www.bing.com/images/search?q=' + encodeURIComponent(query) + '&form=HDRSC2&first=1', {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    });
    let html = (await res.text()).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\/g, '');
    const urls = [...html.matchAll(/"murl":"(https?:[^"]+)"/g)].map((m) => m[1]);
    const kws = (keywords || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const ranked = urls.filter((u) => {
      const ext = path.extname(new URL(u).pathname).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    }).map((u) => {
      const lower = u.toLowerCase();
      const score = kws.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0);
      return { u, score };
    }).sort((a, b) => b.score - a.score);
    for (const { u } of ranked.slice(0, 10)) {
      try {
        const r2 = await fetch(u, { headers: { 'User-Agent': UA } });
        if (!r2.ok) continue;
        const buf = Buffer.from(await r2.arrayBuffer());
        if (buf.length < 8000 || !isImageBytes(buf)) continue;
        const ext = path.extname(new URL(u).pathname).toLowerCase();
        const dest = destBase + (['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg');
        fs.writeFileSync(dest, buf);
        return { ok: true, url: u, file: path.basename(dest), size: buf.length };
      } catch (e) { /* التالي */ }
    }
  } catch (e) { /* تجاهل */ }
  return { ok: false };
}

// ─────────────────────────────────────────────────────────────
// التنفيذ الرئيسي
// ─────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  fs.mkdirSync(CATEGORIES_DIR, { recursive: true });

  // 1) تحميل صور الأقسام الجديدة (البهارات فقط ناقص عندنا)
  const existingCats = new Set(fs.readdirSync(CATEGORIES_DIR).map((f) => path.parse(f).name));
  for (const s of CATALOG.sections) {
    const catSlug = ({ 'البهارات والتوابل': 'spices', 'الزيوت المأكولة': 'oils' }[s.name]) || null;
    if (!catSlug) continue;
    if (existingCats.has(catSlug)) continue;
    const r = await downloadFirstValid(s.imageQuery, path.join(CATEGORIES_DIR, catSlug), s.imageQuery);
    console.log((r.ok ? '✔ صورة قسم' : '✘ فشل قسم'), s.name, r.url || '');
    await sleep(700);
  }

  // 2) تحميل صور المنتجات
  const failed = [];
  let doneInBatch = 0;
  for (const p of CATALOG.products) {
    const base = path.join(PRODUCTS_DIR, p.slug);
    const existing = fs.readdirSync(PRODUCTS_DIR).find((f) => path.parse(f).name === p.slug);
    if (existing) {
      console.log('= موجودة مسبقاً:', p.slug);
      p.imageFile = existing;
      continue;
    }
    const r = await downloadFirstValid(p.query, base, p.name + ' ' + p.query);
    if (r.ok) {
      p.imageFile = r.file;
      console.log('✔', p.slug, '→', r.file, Math.round(r.size / 1024) + 'KB');
    } else {
      failed.push(p.slug);
      console.log('✘ فشل:', p.slug, '(', p.query, ')');
    }
    doneInBatch++;
    // استراحة دورية لتجنب حجب محركات البحث
    if (doneInBatch % 8 === 0) {
      console.log('… استراحة قصيرة بين الدفعات');
      await sleep(15000);
    } else {
      await sleep(800);
    }
  }

  // 3) دمج البيانات في database.json
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  const catBySlug = Object.fromEntries(CATALOG.sections.map((s) => [s.name, s]));

  // أقسام: تحديث الموجود أو إضافة الجديد
  const catImageFor = (name) => {
    const map = {
      'البهارات والتوابل': 'images/categories/spices',
      'الزيوت المأكولة': 'images/categories/oils',
    };
    const custom = map[name];
    if (custom) {
      const ext = ['.jpg', '.jpeg', '.png', '.webp'].find((e) => fs.existsSync(path.join(__dirname, 'public', custom + e)));
      if (ext) return custom + ext;
    }
    return catBySlug[name] && catBySlug[name].fallback ? catBySlug[name].fallback : 'images/categories/food.jpg';
  };

  const sectionDefs = [
    { id: 'cat-all', name: 'جميع المنتجات', icon: '🛒' },
    ...CATALOG.sections.map((s) => ({ id: s.id, name: s.name, icon: s.icon })),
  ];

  const mergedCats = [];
  for (const sd of sectionDefs) {
    const prev = (db.categories || []).find((c) => c.id === sd.id);
    mergedCats.push({
      id: sd.id,
      name: sd.name,
      icon: sd.icon,
      image: catImageFor(sd.name),
      count: sd.name === 'جميع المنتجات' ? CATALOG.products.length : countForCat(sd.name),
    });
  }
  db.categories = mergedCats;

  function countForCat(name) {
    return CATALOG.products.filter((p) => p.category === name).length;
  }

  // منتجات: حافظ على الموجودين وحدّث صورتين، ثم أضف الجدد
  const legacy = Array.isArray(db.products) ? db.products : Object.values(db.products || {});
  const byName = new Map(legacy.map((p) => [p.name, p]));
  const slugImageMap = Object.fromEntries(CATALOG.products.filter((p) => p.imageFile).map((p) => [p.slug, p.imageFile]));

  // تحديث صور منتجات موجودة قديمًا بأسلوب مطابق
  const legacyImageFix = {
    'أرز بسمتي الشعلان عنبر 5 كغ': 'alaila_rice_5kg',
    'زيت زيتون الجوف بكر ممتاز 500 مل': 'olive_aljouf_500',
    'مكرونة قواقع أبو كاس 400 جرام': 'pasta_abukas_shells',
    'خبز توست هارفست الكامل 400 جرام': 'toast_harvest_400',
    'سكر أبيض بلوري ناعم 2 كغ': 'sugar_white_2kg',
    'تشكيلة فواكه طازجة موسمية': 'fruit_mix',
    'خضراوات طازجة مشكلة': 'veg_mix',
    'مخللات فارم فيرست مشكلة 950 جرام': 'pickles_farmfirst',
    'شوكولاتة كيتكات مستوردة 4 فنجر 45 جرام': 'kitkat_4',
    'مسحوق غسيل تايد مركز 5 كغ': 'tide_5kg',
    'حفائض ومناديل مبللة بامبرز مقاس 4 (52 حبة)': 'pampers_size4',
    'أجبان وقشطة كيري الأصلية 24 قطعة': 'cheese_kiri_24',
  };

  const seen = new Set();
  const finalProducts = [];
  for (const p of legacy) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    const fixSlug = legacyImageFix[p.name] || (byName.has(p.name) ? null : null);
    if (fixSlug && slugImageMap[fixSlug]) p.image = 'images/products/' + slugImageMap[fixSlug];
    finalProducts.push(p); // بدون إعادة إعادة التعديل الهدف الأخرى
  }

  for (const p of CATALOG.products) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    finalProducts.push({
      id: 'prod-' + p.slug,
      name: p.name,
      category: p.category,
      price: p.price,
      oldPrice: p.oldPrice,
      unit: p.unit,
      stock: p.stock,
      rating: p.rating ?? 4.5,
      barcode: String(63000000000 + Math.floor(Math.random() * 99999999)),
      image: p.imageFile ? 'images/products/' + p.imageFile : (
        (catBySlug[p.category] && catBySlug[p.category].fallback) || 'images/products/fruits.jpg'),
      isOffer: p.oldPrice ? (p.price / p.oldPrice < 0.8) : false,
    });
  }

  db.products = finalProducts;
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');

  console.log('───────────────────────────────');
  console.log('الأقسام:', db.categories.length, '| المنتجات:', db.products.length);
  if (failed.length) console.log('فشل تحميل صور:', failed.join(', '));
  console.log('اكتمل البناء.');
})();
