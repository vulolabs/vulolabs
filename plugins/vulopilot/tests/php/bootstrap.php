<?php
/**
 * PHPUnit bootstrap file.
 *
 * @package VuloPilot
 */

// Every class file in this codebase starts with `defined('ABSPATH') || exit;`
// (php-wordpress.md convention) — ABSPATH must exist before any of them are
// `require`d by a test, or the file would `exit` the whole test run the
// instant it's loaded.
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}

// WordPress core's own time-duration constants — several classes
// (CronScanner, BrokenLinksScanner, SslMonitoringScanner,
// RobotsTxtBotAccess, AiRequestSender) use these as class-const
// defaults/arithmetic, which PHP resolves at class-load time, well before
// any Brain\Monkey stub could intercept them. Defining the real values
// here (identical to WordPress core's own wp-includes/load.php) is
// simplest — these are fixed numeric constants, nothing to stub per test.
if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
    define( 'MINUTE_IN_SECONDS', 60 );
}
if ( ! defined( 'HOUR_IN_SECONDS' ) ) {
    define( 'HOUR_IN_SECONDS', 60 * MINUTE_IN_SECONDS );
}
if ( ! defined( 'DAY_IN_SECONDS' ) ) {
    define( 'DAY_IN_SECONDS', 24 * HOUR_IN_SECONDS );
}
if ( ! defined( 'WEEK_IN_SECONDS' ) ) {
    define( 'WEEK_IN_SECONDS', 7 * DAY_IN_SECONDS );
}

require_once dirname( __DIR__, 2 ) . '/vendor/autoload.php';

// Global-namespace test doubles for the two WooCommerce core classes
// scanner code checks/type-hints against — `class_exists('WooCommerce')`/
// `instanceof \WC_Product` both resolve against the ROOT namespace
// regardless of which namespace the calling code lives in (a string passed
// to class_exists(), and the backslash-prefixed instanceof target, are both
// already fully-qualified), so these must be declared here, in this
// no-namespace file, not inside any `VuloPilot\Tests`-namespaced test file
// (declaring them there creates `VuloPilot\Tests\WooCommerce`, which never
// satisfies a real class_exists('WooCommerce') check).
if ( ! class_exists( 'WooCommerce', false ) ) {
    class WooCommerce {}
}

if ( ! class_exists( 'WC_Product', false ) ) {
    class WC_Product {
        private int $id;
        private string $name;
        private string $short_description;
        private string $description;

        public function __construct( int $id, string $name, string $short_description = '', string $description = '' ) {
            $this->id                 = $id;
            $this->name               = $name;
            $this->short_description  = $short_description;
            $this->description        = $description;
        }

        public function get_id(): int {
            return $this->id;
        }

        public function get_name(): string {
            return $this->name;
        }

        public function get_short_description(): string {
            return $this->short_description;
        }

        public function get_description(): string {
            return $this->description;
        }
    }
}

if ( ! function_exists( 'WC' ) ) {
    /**
     * A stub for WooCommerce's own global WC() accessor. A bare `WC()`
     * call from inside a namespaced class (e.g. Scanners\Basic\WooCommerceScanner)
     * falls back to this GLOBAL function when no `WooCommerceScanner`-
     * namespaced `WC()` exists — same reasoning as the WooCommerce/
     * WC_Product stubs above, just for a function instead of a class.
     * Returns whatever test double the currently running test configured
     * via $GLOBALS['vulopilot_test_wc_instance'].
     *
     * @return object|null
     */
    function WC() {
        return $GLOBALS['vulopilot_test_wc_instance'] ?? null;
    }
}

// This test suite deliberately uses Brain\Monkey (already a dev dependency)
// for fast, isolated unit tests over pure/deterministic logic — not a full
// wp-phpunit integration bootstrap against a real WordPress + MySQL install,
// which is real infrastructure this pass doesn't stand up. `tests/src/*`
// only exercises functions/methods with no real side effects (regex/data
// logic, class contracts), stubbing the handful of WordPress functions they
// touch (`__`, etc.) via Brain\Monkey\Functions rather than requiring a live
// WordPress. See TestCase.php's own docblock.
