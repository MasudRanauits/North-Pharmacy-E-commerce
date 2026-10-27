/**
 * Test data for the North Pharmacy suite.
 *
 * Source: NP-QA-TC-001 §2.6 "Reference Test Data Used Throughout".
 *
 * Nothing in this file is a real credential or a real person. The environment
 * URL and every account come from the environment, so that a clone of this
 * repository cannot reach anyone's installation and no customer's details are
 * published with the code. Copy `.env.example` to `.env` and fill it in, or
 * export the variables before running. See the README.
 */

export const BASE_URL =
  process.env.BASE_URL ?? 'https://localhost:1165';

/** True once the suite has been pointed at a real environment. */
export const isConfigured = Boolean(
  process.env.BASE_URL && process.env.TEST_USER && process.env.TEST_PASSWORD,
);

/** §2.6 — accounts. Values come from the environment; see `.env.example`. */
export const users = {
  customer: {
    mobile: process.env.TEST_USER ?? '01000000001',
    password: process.env.TEST_PASSWORD ?? 'set-TEST_PASSWORD',
    name: process.env.TEST_USER_NAME ?? 'QA Customer',
  },
  admin: {
    mobile: process.env.ADMIN_USER ?? '01000000002',
    password: process.env.ADMIN_PASSWORD ?? 'set-ADMIN_PASSWORD',
    name: process.env.ADMIN_USER_NAME ?? 'Store Admin',
    role: 'Admin',
  },
  /**
   * A second, unrelated customer. Only ever used in negative assertions —
   * "this account must not be able to see that account's number" — so the
   * placeholder keeps those checks running, and setting OTHER_CUSTOMER_MOBILE
   * to a real account in your environment makes them meaningful.
   */
  existingCustomer: {
    name: process.env.OTHER_CUSTOMER_NAME ?? 'Other Customer',
    mobile: process.env.OTHER_CUSTOMER_MOBILE ?? '01000000003',
    orders: 1,
    lifetimeSpend: 6022.65,
  },
  unregistered: {
    mobile: '01999999999',
    password: 'NotAUser123!',
  },
};

/** §2.6 — products */
export const products = {
  /** Non-prescription product A */
  napa: {
    name: 'Napa',
    generic: 'Paracetamol',
    strength: '500 mg',
    formation: 'Tablet',
    manufacturer: 'Beximco Pharmaceutical Ltd.',
    price: 1.2,
    slug: 'napa-500-mg-tablet',
  },
  /** Non-prescription product B */
  dps: {
    name: 'Dps',
    generic: 'Disposable Syringe',
    strength: '5 cc/ml',
    formation: 'Surgical',
    manufacturer: 'Nipro JMI Medical Ltd.',
    price: 5.03,
  },
  /** Prescription-required product A */
  merobac: {
    name: 'Merobac',
    generic: 'Meropenem',
    strength: '1 gm',
    formation: 'Injection',
    manufacturer: 'Popular Pharmaceuticals',
    price: 1204.53,
    prescriptionRequired: true,
  },
  /** Prescription-required product B — low stock */
  maxima: {
    name: 'Maxima',
    generic: 'Esomeprazole',
    strength: '40 mg',
    formation: 'Injection',
    manufacturer: 'The Acme Laboratories Ltd.',
    price: 90,
    mrp: 90,
    stock: 1,
    prescriptionRequired: true,
  },
};

/**
 * §2.6 — orders seeded in the environment.
 *
 * Order references are specific to an installation, so they come from the
 * environment too. The cases that use them skip when they are not set.
 */
export const orders = {
  pending: process.env.ORDER_PENDING ?? '',
  packedWithPrescription: process.env.ORDER_PACKED ?? '',
  cancelled: process.env.ORDER_CANCELLED ?? '',
};

/** §2.6 — delivery and ordering rules */
export const storeRules = {
  insideDistrict: { district: 'Dhaka', charge: 60 },
  outsideDistricts: ['Chittagong', 'Sylhet', 'Rangpur'],
  outsideCharge: 120,
  freeDeliveryThreshold: 2000,
  maxQtyPerItem: 200,
  hotline: '+880 1330-770000',
  address:
    'Cemex Iconic Tower, Plot No. 24/1-A (Ka), 24/1-A (Kha) Block-B, Khilji Road, Mohammadpur, Dhaka-1207',
  districtCount: 64,
};

/** The 11 categories shown in the All Categories panel (NP-NAV-TC-016). */
export const categories = [
  { name: 'Tablets & Capsules', slug: 'tablets-capsules' },
  { name: 'Syrups & Liquids', slug: 'syrups-liquids' },
  { name: 'Injections & Insulin', slug: 'injections' },
  { name: 'Skin & Topicals', slug: 'skin-topicals' },
  { name: 'Eye, Ear & Nose', slug: 'eye-ear-nose' },
  { name: 'Inhalers & Respiratory', slug: 'respiratory' },
  { name: 'Surgical & Devices', slug: 'devices' },
  { name: 'Baby & Mother', slug: 'baby-mother' },
  { name: 'Personal Care', slug: 'personal-care' },
  { name: 'Food & Nutrition', slug: 'food-nutrition' },
  { name: 'More Essentials', slug: 'essentials' },
];

/** The six departments on the home page (NP-HOM-TC-005). */
export const departments = [
  'Medicines',
  'Health & Wellness',
  'Personal Care',
  'Baby Care',
  'Skin Care',
  'Nutrition',
];

/** Search terms used across the SRC module. */
export const searchTerms = {
  brand: 'napa',
  generic: 'Paracetamol',
  partial: 'nap',
  noResult: 'zzzqqqxyz',
  bangla: 'নাপা',
  xss: '<script>alert(1)</script>',
  sqli: "' OR 1=1--",
  long: 'a'.repeat(500),
};

/** Responsive breakpoints from the test plan §5.3 (NP-RSP module). */
export const breakpoints = [
  { label: '360 px', width: 360, height: 740 },
  { label: '414 px', width: 414, height: 896 },
  { label: '768 px', width: 768, height: 1024 },
  { label: '1024 px', width: 1024, height: 768 },
  { label: '1366 px', width: 1366, height: 768 },
  { label: '1920 px', width: 1920, height: 1080 },
];

/** Routes used repeatedly across the suites. */
export const routes = {
  home: '/',
  shop: '/shop',
  offers: '/shop?offers=true',
  cart: '/cart',
  checkout: '/checkout',
  login: '/login',
  register: '/register',
  account: '/account',
  orders: '/account/orders',
  prescriptions: '/account/prescriptions',
  addresses: '/account/addresses',
  wishlist: '/account/wishlist',
  manufacturers: '/manufacturers',
  help: '/help',
  delivery: '/delivery',
  terms: '/terms',
  privacy: '/privacy',
  contact: '/contact',
  about: '/about',
  returns: '/returns',
  admin: '/admin',
  adminDashboard: '/admin/dashboard',
  adminOrders: '/admin/orders',
  adminPrescriptions: '/admin/prescriptions',
  adminInventory: '/admin/inventory',
  adminCustomers: '/admin/customers',
  adminPromotions: '/admin/promotions',
  adminContent: '/admin/content',
  adminReports: '/admin/reports',
  adminSettings: '/admin/settings',
};
