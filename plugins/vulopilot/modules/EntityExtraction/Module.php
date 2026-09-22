<?php
/**
 * Module class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\EntityExtraction;

use VuloPilot\EntityExtraction\EntityExtractor;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot EntityExtraction module.
 *
 * Unlike modules/Seo/Module.php (which genuinely gates scanner
 * registration) or modules/Geo/Module.php (a thin automation layer over
 * always-on core scanning), this module's own job is to make deactivating
 * it actually change EntityExtractor's output — that class has no
 * scanner/finding to gate through ScannerRegistry's usual category
 * mechanism, so it checks `VuloPilot()->modules->get_active_modules()`
 * directly instead (see its own docblock).
 *
 * This module's real, concrete job: bust EntityExtractor's 1-hour
 * transient cache on the real content-change events that would actually
 * affect its output — a post publishing/unpublishing changes People
 * (post authorship); a term being created/edited/deleted changes
 * Categories; and (the fix this docblock is now updated for — a real,
 * confirmed bug: saving Settings → Business Information's `entity_business_type`/
 * `entity_service_pages`/`entity_business_locations` fields persisted the
 * new values correctly, but `GET /entities` kept serving the pre-save
 * cached result for up to an hour, because no hook here ever busted the
 * cache on a settings save — only on the post/term hooks above, none of
 * which fire when only `vulopilot_settings` changes) changing any of
 * those 3 fields now also busts the cache immediately, via WordPress's
 * own `update_option_{option}` hook (fires only when the stored value
 * actually changes, so a no-op save on an unrelated tab doesn't bust it
 * for nothing). Same "don't leave a stale cache up to an hour after a
 * real, known change" care `RobotsTxtBotAccess`'s own cache doesn't
 * bother with (robots.txt changes are rare and external), but here the
 * triggering WordPress hooks are cheap and well-known.
 *
 * @class       Module class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Module {

    /**
     * @var EntityExtractor
     */
    private EntityExtractor $extractor;

    /**
     * Module constructor.
     */
    public function __construct() {
        $this->extractor = new EntityExtractor();

        add_action( 'save_post', array( $this, 'clear_cache' ) );
        add_action( 'deleted_post', array( $this, 'clear_cache' ) );
        add_action( 'created_term', array( $this, 'clear_cache' ) );
        add_action( 'edited_term', array( $this, 'clear_cache' ) );
        add_action( 'delete_term', array( $this, 'clear_cache' ) );
        add_action( 'update_option_' . Utill::VULOPILOT_SETTINGS_KEY, array( $this, 'maybe_clear_cache_on_settings_change' ), 10, 2 );
    }

    /**
     * `update_option_{$option}` fires with the old and new full settings
     * array whenever `vulopilot_settings` actually changes — busts the
     * cache only when one of the 3 fields EntityExtractor itself reads
     * (business type, service pages, business locations) is part of what
     * changed, so a save on an unrelated Settings tab doesn't bust it for
     * nothing.
     *
     * @param mixed $old_value Previously stored `vulopilot_settings` value.
     * @param mixed $new_value Newly stored `vulopilot_settings` value.
     * @return void
     */
    public function maybe_clear_cache_on_settings_change( $old_value, $new_value ): void {
        $old_value = is_array( $old_value ) ? $old_value : array();
        $new_value = is_array( $new_value ) ? $new_value : array();

        foreach ( array( 'entity_business_type', 'entity_service_pages', 'entity_business_locations' ) as $key ) {
            if ( ( $old_value[ $key ] ?? '' ) !== ( $new_value[ $key ] ?? '' ) ) {
                $this->clear_cache();

                return;
            }
        }
    }

    /**
     * @return void
     */
    public function clear_cache(): void {
        $this->extractor->clear_cache();
    }
}
