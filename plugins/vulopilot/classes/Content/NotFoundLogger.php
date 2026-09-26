<?php
namespace VuloPilot\Content;

use VuloPilot\Content\NotFoundLogRepository;
use VuloPilot\Content\RedirectRepository;
use VuloPilot\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Readme.txt's "Redirects & 404s" - the `log_404s` setting's own
 * implementation, distinct from Scanners\Basic\NotFoundScanner (which only
 * checks this site's OWN published permalinks for internal links pointing
 * at a 404, a content-integrity check with no visitor traffic involved).
 * This logs real visitor requests that actually 404, so a site owner can
 * see which missing URLs are still being hit and turn the worthwhile ones
 * into a redirect from the Redirects page - readme.txt's own description:
 * "Track visits to missing pages so you can turn them into redirect
 * suggestions."
 *
 * Self-registers on `template_redirect` at priority 20 - after
 * Services\RedirectManager's own priority-1 hook has had a chance to
 * redirect the request away first, so a path that already HAS a configured
 * redirect is never also logged as a 404 (by the time this runs, a
 * matched redirect has already `exit`ed the request).
 *
 * No IP address or other visitor-identifying data, ever - same posture
 * CrawlerTrafficLogger's own docblock documents for the same reason (this
 * plugin's general privacy stance on visit logging, not a promise specific
 * to crawler traffic).
 *
 * @class       NotFoundLogger class
 * @version     1.0.0
 * @author      VuloLabs
 */
class NotFoundLogger {

    /**
     * Path prefixes that mark a 404 as "system" rather than a missing
     * CONTENT page - core/theme/plugin asset directories and browser/
     * tooling auto-probe paths (Chrome DevTools' own
     * `/.well-known/appspecific/com.chrome.devtools.json`, Apple's
     * `/.well-known/apple-app-site-association`, etc.). On a site where
     * every unmatched request routes through `index.php` (any normal
     * pretty-permalink rewrite setup), a stale/renamed theme or plugin
     * asset URL - or a browser silently probing a well-known path - is a
     * genuine WordPress 404 exactly like a real missing content page is,
     * but nobody ever wants to "create a redirect" for
     * `/wp-content/themes/x/assets/old.css`. These are still logged (real
     * 404s, real data) - `is_system_path()` below is what lets
     * `log_or_increment()` route them to `is_system = 1` instead of
     * dropping them, so RedirectsTab.tsx's main missing-page list can stay
     * scoped to `is_system = 0` while its own "System 404s" link still
     * shows the rest.
     *
     * @var string[]
     */
    private const SYSTEM_PATH_PREFIXES = array( '/wp-content/', '/wp-includes/', '/wp-admin/', '/.well-known/' );

    /**
     * File extensions treated the same way as SYSTEM_PATH_PREFIXES above -
     * a static asset request that 404s (an old cached bundle hash, a
     * favicon, a source map) is the same kind of "system, not content" 404
     * even when it isn't under one of those directories (a root-level
     * `/favicon.ico`, an upload under `/wp-content/uploads/` already
     * caught by the prefix check above but listed again here for anything
     * similar outside it).
     *
     * @var string[]
     */
    private const SYSTEM_EXTENSIONS = array(
        'css',
        'js',
        'mjs',
        'map',
        'json',
        'xml',
        'png',
        'jpg',
        'jpeg',
        'gif',
        'svg',
        'webp',
        'avif',
        'ico',
        'woff',
        'woff2',
        'ttf',
        'eot',
        'otf',
        'zip',
        'txt',
        'pdf',
        'mp4',
        'webm',
        'mp3',
        'csv',
    );

    /**
     * NotFoundLogger constructor.
     */
    public function __construct() {
        add_action( 'template_redirect', array( $this, 'maybe_log' ), 20 );
    }

    /**
     * Logs the current request as a 404 visit, if it is one - classified
     * as `is_system` (see is_system_path()) or a real content-page miss.
     *
     * @return void
     */
    public function maybe_log(): void {
        $settings = wp_parse_args( get_option( Utill::VULOPILOT_SETTINGS_KEY, array() ), Utill::VULOPILOT_SETTINGS_DEFAULTS );

        if ( empty( $settings['log_404s'] ) || ! is_404() ) {
            return;
        }

        global $wp;

        $path           = wp_parse_url( home_url( $wp->request ), PHP_URL_PATH ) ?? '/';
        $requested_path = RedirectRepository::normalize_path( $path );
        $referrer       = wp_get_referer();

        ( new NotFoundLogRepository() )->log_or_increment(
            $requested_path,
            $referrer ? esc_url_raw( $referrer ) : null,
            self::is_system_path( $requested_path )
        );
    }

    /**
     * Checks a path against SYSTEM_PATH_PREFIXES/SYSTEM_EXTENSIONS.
     *
     * @param string $path Already-normalized request path (RedirectRepository::normalize_path()).
     * @return bool True if this path is a static asset/tooling-probe request, not a real missing content page.
     */
    private static function is_system_path( string $path ): bool {
        foreach ( self::SYSTEM_PATH_PREFIXES as $prefix ) {
            if ( 0 === strpos( $path, $prefix ) ) {
                return true;
            }
        }

        $extension = strtolower( (string) pathinfo( $path, PATHINFO_EXTENSION ) );

        return '' !== $extension && in_array( $extension, self::SYSTEM_EXTENSIONS, true );
    }
}
