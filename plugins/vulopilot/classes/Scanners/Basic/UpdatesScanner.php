<?php
/**
 * UpdatesScanner class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot\Scanners\Basic;


use VuloPilot\ValueObjects\Finding;
use VuloPilot\ValueObjects\Severity;

defined( 'ABSPATH' ) || exit;

/**
 * Flags any pending WordPress core, plugin, or theme update, using core's
 * own update-check APIs rather than re-implementing version comparison —
 * `get_core_updates()`, `get_plugin_updates()`, and `get_theme_updates()`
 * already do exactly this and are what the native Updates admin screen
 * itself calls.
 *
 * @class       UpdatesScanner class
 * @version     1.0.0
 * @author      VuloLabs
 */
class UpdatesScanner extends AbstractBasicScanner {

    /**
     * @inheritDoc
     */
    public function get_id(): string {
        return 'updates';
    }

    /**
     * @inheritDoc
     */
    public function get_label(): string {
        return __( 'Updates', 'vulopilot' );
    }

    /**
     * @inheritDoc
     */
    public function get_category(): string {
        return 'updates';
    }

    /**
     * @inheritDoc
     */
    public function scan(): array {
        if ( ! function_exists( 'get_core_updates' ) ) {
            require_once ABSPATH . 'wp-admin/includes/update.php';
        }

        $findings = array();

        $core_updates = get_core_updates();
        if ( is_array( $core_updates ) && isset( $core_updates[0]->response ) && 'upgrade' === $core_updates[0]->response ) {
            $findings[] = new Finding(
                sprintf(
                    /* translators: %s is the available WordPress core version. */
                    __( 'WordPress core update available (%s)', 'vulopilot' ),
                    $core_updates[0]->version
                ),
                Severity::HIGH,
                $this->get_category(),
                __( 'Running an outdated core version increases security risk and can cause plugin/theme compatibility issues.', 'vulopilot' ),
                'core',
                $core_updates[0]->version
            );
        }

        $plugin_updates = get_plugin_updates();
        foreach ( $plugin_updates as $plugin_file => $plugin_data ) {
            // `$description` was `null` here — Finding::__construct()'s
            // own `$description` parameter is a non-nullable `string`, so
            // this threw a real `TypeError` the moment there was ever a
            // real plugin update pending, crashing this whole scanner
            // (confirmed live: 0 findings, status 'failed', every other
            // real update — including a genuinely stale, no-longer-true
            // "core update available" finding — silently stuck open
            // forever because the scan never got far enough to say
            // otherwise).
            $findings[] = new Finding(
                sprintf(
                    /* translators: %s is the plugin name. */
                    __( 'Plugin update available: %s', 'vulopilot' ),
                    $plugin_data->Name // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- get_plugin_updates()'s own property name, not ours to rename.
                ),
                Severity::MEDIUM,
                $this->get_category(),
                sprintf(
                    /* translators: %s is the plugin name. */
                    __( 'A newer version of %s is available. Keeping plugins up to date closes known security holes and fixes bugs.', 'vulopilot' ),
                    $plugin_data->Name // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- get_plugin_updates()'s own property name, not ours to rename.
                ),
                'plugin',
                $plugin_file
            );
        }

        $theme_updates = get_theme_updates();
        foreach ( $theme_updates as $stylesheet => $theme ) {
            $findings[] = new Finding(
                sprintf(
                    /* translators: %s is the theme name. */
                    __( 'Theme update available: %s', 'vulopilot' ),
                    $theme->get( 'Name' )
                ),
                Severity::MEDIUM,
                $this->get_category(),
                sprintf(
                    /* translators: %s is the theme name. */
                    __( 'A newer version of %s is available. Keeping themes up to date closes known security holes and fixes bugs.', 'vulopilot' ),
                    $theme->get( 'Name' )
                ),
                'theme',
                $stylesheet
            );
        }

        return $findings;
    }
}
