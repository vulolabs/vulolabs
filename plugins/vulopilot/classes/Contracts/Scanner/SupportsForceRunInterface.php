<?php
/**
 * SupportsForceRunInterface file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Contracts\Scanner;

defined( 'ABSPATH' ) || exit;

/**
 * Optional companion to ScannerInterface (same "optional, instanceof-checked
 * add-on" shape as TracksScannedObjectsInterface), implemented only by a
 * scanner that self-rate-limits its own real work independently of the
 * shared scan cadence (Seo\Scanners\BrokenLinksScanner/
 * BrokenImagesScanner's own `due_to_run()` — see that method's docblock).
 *
 * ScannerInterface::scan() deliberately takes no parameters, and isn't
 * widened here — every other scanner (free or Pro) implements the plain
 * zero-arg contract and would need no changes, so a real, user-initiated
 * "Run scan" click threading a force flag through only reaches the one or
 * two scanners that actually gate themselves, via ScanRunner::run()'s own
 * `instanceof` check, rather than every ScannerInterface implementation
 * across both plugins gaining a parameter it would never use.
 *
 * @class       SupportsForceRunInterface interface
 * @version     1.0.0
 * @author      VuloLabs
 */
interface SupportsForceRunInterface {

    /**
     * Tells this scanner's next scan() call to bypass its own self-rate-limit
     * — a real, user-initiated "Run scan" click (or `wp vulopilot scan run
     * --force`) should always actually check again, even if this scanner's
     * own configured frequency (e.g. "daily") hasn't elapsed since its last
     * genuine run; a scheduled/cron-driven run should still respect it.
     *
     * @param bool $force True to bypass the self-rate-limit for the next scan() call.
     * @return void
     */
    public function set_force_run( bool $force ): void;
}
