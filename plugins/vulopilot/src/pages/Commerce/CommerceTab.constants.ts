
/** The 11 existing free-tier Product* scanners that aren't about stock. */
export const PRODUCT_SCANNER_IDS = [
	'product-pricing',
	'product-missing-images',
	'product-completeness',
	'product-missing-categories',
	'product-missing-tags',
	'product-missing-description',
	'product-missing-short-description',
	'product-sku-issues',
	'product-attributes',
	'product-duplicate',
	'product-seo',
];

/** The 4 new "Checkout & Payments"/"Orders" scanners (WooCommerceCheckoutScanner + its 3 order-health siblings). */
export const CHECKOUT_SCANNER_IDS = [
	'woocommerce-checkout',
	'woocommerce-failed-orders',
	'woocommerce-stale-pending-orders',
	'woocommerce-stale-onhold-orders',
];

/** General store setup (the original WooCommerceScanner) + the new template-compatibility check. */
export const STORE_SCANNER_IDS = ['woocommerce', 'woocommerce-compatibility'];
