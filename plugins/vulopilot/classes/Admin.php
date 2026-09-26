<?php
/**
 * Admin class file.
 *
 * @package VuloPilot
 */

namespace VuloPilot;

defined( 'ABSPATH' ) || exit;

/**
 * VuloPilot Admin class.
 *
 * Registers the top-level admin menu and its submenu pages, and enqueues
 * the React dashboard bundle on VuloPilot's own admin screen. Mirrors
 * VuloLabs\Admin's add_menu_page()/add_submenu_page() + hash-tab
 * pattern (`vulopilot#&tab=dashboard`) rather than WordPress's normal
 * per-page URLs, so the whole admin UI is one React app reading `tab`
 * from location.hash (see src/app.tsx) - same mechanism the free
 * vulolabs plugin's admin screen already uses.
 *
 * Also grafts a grouped/collapsible look onto that same native
 * `#toplevel_page_vulopilot` menu itself (public/js, public/styles) rather
 * than a custom in-content React sidebar - see enqueue_menu_grouping_assets()'s
 * own docblock for why, and for the constraints that choice comes with.
 *
 * @class       Admin class
 * @version     1.0.0
 * @author      VuloLabs
 */
class Admin {

    /**
     * Dashicon class per collapsible group id (matches each submenu
     * entry's own 'group' value below). Just id → icon, not id → label -
     * class constants can't run __() at declaration time, so the
     * translated label per group is built separately, from literal
     * __() calls, in enqueue_menu_grouping_assets().
     *
     * @var array<string, string>
     */
    const GROUPS = array(
        'ai-visibility' => 'dashicons-lightbulb',
        'seo-content'   => 'dashicons-search',
        'site-health'   => 'dashicons-shield',
        'tools'         => 'dashicons-admin-tools',
    );

    /**
     * Admin constructor.
     */
    public function __construct() {
        add_action( 'admin_menu', array( $this, 'add_menus' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_script' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_menu_grouping_assets' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_user_edit_highlight_script' ) );
    }

    /**
     * Registers the VuloPilot top-level menu and its submenu tabs.
     *
     * Each entry's optional 'group' key must match a GROUPS key -
     * public/js/admin-menu-groups.js reads it (via the
     * tabToGroup map enqueue_menu_grouping_assets() localizes) to decide
     * which already-rendered `<li>` belongs under which collapsible
     * group header. Priorities are deliberately assigned so every group's
     * members sort contiguously - the grouping script only inserts a
     * header before a run's first member and shows/hides the run in
     * place, it never re-parents `<li>` elements (see that file's own
     * docblock for why), so non-contiguous members of the same group
     * would render as two separate broken-up sections instead of one.
     *
     * @return void
     */
    public function add_menus() {
        if ( ! is_admin() ) {
            return;
        }

        add_menu_page(
            'VuloPilot',
            'VuloPilot',
            'manage_options',
            'vulopilot',
            array( $this, 'create_admin_page' ),
            'dashicons-shield',
            56
        );

        // Flat top-level IA - each entry reuses an existing tab slug/route
        // (src/routes.ts) so no new pages were needed, just new labels,
        // icons and a new order. This is the final menu (per direct
        // instruction) - every tab/page that used to be reachable-but-
        // unlinked outside this list (AEO, Crawler Traffic, Brand
        // Visibility, Knowledge Graph, Schema, Redirects & 404s, Health,
        // Activity, Modules) has been removed outright, both here and
        // from their own React routes/pages, rather than kept around for
        // a possible future re-surfacing.
        $submenus = apply_filters(
            'vulopilot_submenus',
            array(
                'dashboard'     => array(
                    'name'     => __( 'Dashboard', 'vulopilot' ),
                    'priority' => 10,
                    'icon'     => 'dashicons-dashboard',
                ),
                'ai-assistant'  => array(
                    'name'     => __( 'AI Copilot', 'vulopilot' ),
                    'priority' => 20,
                    'icon'     => 'dashicons-lightbulb',
                ),
                'seo-visibility' => array(
                    'name'     => __( 'SEO & Visibility', 'vulopilot' ),
                    'priority' => 30,
                    'icon'     => 'dashicons-chart-line',
                ),
                'content'       => array(
                    'name'     => __( 'Content', 'vulopilot' ),
                    'priority' => 40,
                    'icon'     => 'dashicons-media-text',
                ),
                'performance'   => array(
                    'name'     => __( 'Performance', 'vulopilot' ),
                    'priority' => 50,
                    'icon'     => 'dashicons-performance',
                ),
                // Promoted out of "Protect My Site"'s own former 3-tab
                // shell (Security.tsx) along with Backups, which is now
                // merged into this page - see pages/SiteHealth/SiteHealth.tsx's
                // own docblock.
                'site-health'   => array(
                    'name'     => __( 'Site Health', 'vulopilot' ),
                    'priority' => 55,
                    'icon'     => 'dashicons-heart',
                ),
                'accessibility' => array(
                    'name'     => __( 'Accessibility', 'vulopilot' ),
                    'priority' => 65,
                    'icon'     => 'dashicons-universal-access',
                ),
                // "Protect My Site"'s own remaining tab, now standalone -
                // see pages/Security/Security.tsx's own docblock.
                'security'      => array(
                    'name'     => __( 'Security', 'vulopilot' ),
                    'priority' => 67,
                    'icon'     => 'dashicons-shield',
                ),
                'commerce'      => array(
                    'name'     => __( 'Commerce', 'vulopilot' ),
                    'priority' => 70,
                    'icon'     => 'dashicons-cart',
                ),
                'automations'   => array(
                    'name'     => __( 'Automations', 'vulopilot' ),
                    'priority' => 80,
                    'icon'     => 'dashicons-update',
                ),
                // 'divider' draws a thin rule before this item in the
                // native submenu (admin-menu-groups.js's addDividers()) -
                // marks the split between the day-to-day work items above
                // and the account-level pages below, same as the design.
                'reports'       => array(
                    'name'     => __( 'Reports', 'vulopilot' ),
                    'priority' => 90,
                    'icon'     => 'dashicons-chart-bar',
                    'divider'  => true,
                ),
                'settings'      => array(
                    'name'     => __( 'Settings', 'vulopilot' ),
                    'priority' => 100,
                    'icon'     => 'dashicons-admin-generic',
                ),
                // 'modules' used to sit here too (always last, pinned via
                // PHP_INT_MAX so a filter adding a higher-priority item
                // later couldn't push it out of the last slot) - removed
                // per direct instruction ("move the modules tab in
                // settings after general tab"): its real content
                // (ModuleGridComponent) now renders as Settings' own
                // "Modules" tab instead (src/components/Settings/Modules.ts,
                // priority 1.5, right after "General"). The old `tab=modules`
                // React route (src/routes.ts) stayed registered for a
                // while as a reachable-but-unlinked fallback, but was
                // later removed outright too, per direct instruction,
                // once every real deep-link to it had been repointed at
                // `admin.php?page=vulopilot#&tab=settings&subtab=modules`
                // instead.
            )
        );

        if ( ! class_exists( 'WooCommerce' ) ) {
            unset( $submenus['commerce'] );
        }

        uasort(
            $submenus,
            function ( $a, $b ) {
                return ( $a['priority'] ?? 0 ) <=> ( $b['priority'] ?? 0 );
            }
        );

        foreach ( $submenus as $slug => $submenu ) {
            add_submenu_page(
                'vulopilot',
                $submenu['name'],
                $submenu['name'],
                'manage_options',
                'vulopilot#&tab=' . $slug,
                '__return_null'
            );
        }

        // The top-level menu click target duplicates the "Dashboard" submenu
        // it was auto-registered as by add_menu_page() - remove it so the
        // submenu list doesn't show "VuloPilot" twice.
        remove_submenu_page( 'vulopilot', 'vulopilot' );

        // Stash the same $submenus this method just built so
        // enqueue_menu_grouping_assets() (a separate admin_enqueue_scripts
        // callback, running later in the same request) can derive the
        // tab→group map from it without re-declaring the list a second
        // time - add_menus() itself runs on 'admin_menu', always earlier
        // than 'admin_enqueue_scripts' in WordPress's own load order.
        $this->registered_submenus = $submenus;
    }

    /**
     * Renders the empty mount point the React app renders into.
     *
     * @return void
     */
    public function create_admin_page() {
        echo '<div id="admin-main-wrapper" class="admin-main-wrapper"></div>';
    }

    /**
     * Enqueues and localizes the admin script bundle on VuloPilot's own
     * admin screen only.
     *
     * @return void
     */
    public function enqueue_admin_script() {
        $screen = get_current_screen();

        if ( ! $screen || 'toplevel_page_vulopilot' !== $screen->id ) {
            return;
        }

        // Needed so zyra's FileInput component (AI Copilot's "Attach"
        // button, ChatTab.tsx) can open WordPress's real media library
        // picker/uploader (wp.media()) instead of silently falling back to
        // a local-only blob preview that the server could never read back.
        wp_enqueue_media();

        wp_enqueue_script( 'wp-element' );

        FrontendScripts::admin_load_scripts();
        FrontendScripts::enqueue_script( 'vulopilot-vendor-script' );
        FrontendScripts::enqueue_script( 'vulopilot-admin-script' );
        FrontendScripts::enqueue_style( 'vulopilot-admin-style' );
        FrontendScripts::localize_scripts( 'vulopilot-admin-script' );
    }

    /**
     * Scrolls to and briefly highlights WP core's own "Email" field on its
     * native user-edit.php screen when linked here with `?highlight=email`
     * - BusinessProfileCard.tsx's "Contact details" row (Key Information
     * Found by AI) links an admin here this way, whether their account
     * email is present or missing, so they land straight on the one field
     * that matters instead of a bare user-edit.php with several unrelated
     * sections to hunt through. WP core has no built-in way to deep-link a
     * single profile field, so this is a small first-party addition -
     * `id="email"` is WP core's own stable field id on this screen
     * (wp-admin/user-edit.php), not something this plugin controls.
     */
    public function enqueue_user_edit_highlight_script() {
        $screen = get_current_screen();

        if ( ! $screen || 'user-edit' !== $screen->id ) {
            return;
        }

        $highlight = sanitize_key( (string) filter_input( INPUT_GET, 'highlight' ) );

        if ( 'email' !== $highlight ) {
            return;
        }

        wp_add_inline_script(
            'jquery-core',
            "document.addEventListener( 'DOMContentLoaded', function () {"
            . "var field = document.getElementById( 'email' );"
            . 'if ( ! field ) { return; }'
            . "field.scrollIntoView( { behavior: 'smooth', block: 'center' } );"
            . "field.style.outline = '2px solid #7c3aed';"
            . "field.style.transition = 'outline 0.2s ease';"
            . 'field.focus();'
            . 'setTimeout( function () { field.style.outline = ""; }, 4000 );'
            . '} );'
        );
    }

    /**
     * Grafts a grouped/collapsible look onto the native
     * `#toplevel_page_vulopilot` admin menu - a deliberately different
     * approach from a custom in-content React sidebar: this menu is
     * WordPress core's own markup, rendered on *every* wp-admin screen
     * (not just VuloPilot's own page), so it has to be enqueued
     * unconditionally here rather than gated to one screen the way
     * enqueue_admin_script() is.
     *
     * The public/js/admin-menu-groups.js file (and its
     * public/styles/admin-menu-groups.scss sibling) is hand-written
     * vanilla JS/CSS rather than a webpack entry - it only ever touches
     * plain DOM (no JSX/TS, no React, no dependency on the admin bundle
     * even being loaded on the current screen), so routing it through
     * wp-scripts/webpack would add a bundling step for zero benefit. It's
     * still minified though (tools/scripts/minify.mjs's own `public/js`+
     * `public/styles` asset-folder handling, terser/sass, no webpack) into
     * assets/js/public/ and assets/styles/public/ - the paths enqueued
     * below - so the release zip ships the same minified shape as every
     * wp-scripts-built asset, not raw source.
     *
     * The script only ever *shows/hides* and *inserts a header before*
     * the `<li>` elements WordPress itself already rendered from
     * add_menus()'s $submenus list - it never re-parents them out of the
     * submenu `<ul>`, specifically so this file's
     * `#toplevel_page_vulopilot > ul > li > a` selector in src/app.tsx
     * (used to toggle the 'current' class as the hash tab changes) keeps
     * matching every item regardless of which group it's in.
     *
     * @return void
     */
    public function enqueue_menu_grouping_assets() {
        if ( ! is_admin() || empty( $this->registered_submenus ) ) {
            return;
        }

        $tab_to_group   = array();
        $tab_to_icon    = array();
        $divider_before = array();

        foreach ( $this->registered_submenus as $slug => $submenu ) {
            if ( ! empty( $submenu['group'] ) ) {
                $tab_to_group[ $slug ] = $submenu['group'];
            }

            if ( ! empty( $submenu['icon'] ) ) {
                $tab_to_icon[ $slug ] = $submenu['icon'];
            }

            if ( ! empty( $submenu['divider'] ) ) {
                $divider_before[] = $slug;
            }
        }

        // Built from literal __() calls (never GROUPS's own label strings
        // fed through __() dynamically) so the i18n string-extraction
        // tooling can actually find these - see i18n.md.
        $translated_labels = array(
            'ai-visibility' => __( 'AI Visibility', 'vulopilot' ),
            'seo-content'   => __( 'SEO & Content', 'vulopilot' ),
            'site-health'   => __( 'Site Health', 'vulopilot' ),
            'tools'         => __( 'Tools', 'vulopilot' ),
        );

        $groups = array();

        foreach ( self::GROUPS as $group_id => $icon ) {
            $groups[] = array(
                'id'    => $group_id,
                'label' => $translated_labels[ $group_id ] ?? $group_id,
                'icon'  => $icon,
            );
        }

        wp_enqueue_script(
            'vulopilot-admin-menu-groups',
            VuloPilot()->plugin_url . 'assets/js/public/vulopilot-admin-menu-groups.min.js',
            array(),
            VuloPilot()->version,
            true
        );

        wp_enqueue_style(
            'vulopilot-admin-menu-groups',
            VuloPilot()->plugin_url . 'assets/styles/public/vulopilot-admin-menu-groups.min.css',
            array(),
            VuloPilot()->version
        );

        wp_localize_script(
            'vulopilot-admin-menu-groups',
            'vulopilotMenuGroups',
            array(
                'groups'        => $groups,
                'tabToGroup'    => $tab_to_group,
                'tabToIcon'     => $tab_to_icon,
                'dividerBefore' => $divider_before,
            )
        );
    }

    /**
     * The $submenus list add_menus() built, stashed for
     * enqueue_menu_grouping_assets() to read - see add_menus()'s own
     * docblock for why this isn't just rebuilt a second time there.
     *
     * @var array
     */
    private $registered_submenus = array();
}
