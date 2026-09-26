<?php
namespace VuloPilot\SeoVisibility;


defined( 'ABSPATH' ) || exit;

/**
 * Restyles WordPress core's own native `/wp-sitemap.xml` browser view
 * (`WP_Sitemaps_Stylesheet`, wp-includes/sitemaps) to match the reference
 * mockup - a purple banner header (this plugin's own real brand color,
 * `#7c3aed`, the same `var(--color-primary, #7c3aed)` fallback already
 * used throughout this plugin's own admin UI) instead of core's plain
 * white header, and a real "Last Modified" column on the sitemap INDEX
 * page's own table.
 *
 * Deliberately does NOT build a second, competing sitemap renderer -
 * same "wrap/restyle core's own native sitemap, don't replace it" posture
 * SitemapManager.php's own docblock already establishes for the data side
 * of this same feature. Only 2 real core hooks are used:
 *
 * - `wp_sitemaps_stylesheet_css` - real CSS-only override, applies to
 *   BOTH the index page and every individual child sitemap page (core's
 *   own `get_stylesheet_css()` is shared between both), so the banner/
 *   table restyle is consistent everywhere with one filter.
 * - `wp_sitemaps_stylesheet_index_content` - a full real XSL override,
 *   ONLY for the index page's own table (`/wp-sitemap.xml`, the one
 *   listing child sitemaps the mockup shows) - core's own default XSL
 *   already conditionally renders a real "Last Modified" column
 *   (`<xsl:if test="$has-lastmod">`) but only when EVERY listed sitemap
 *   happens to carry one; this override removes that condition so the
 *   column always renders, with real per-sitemap `<lastmod>` values core
 *   itself already provides (genuinely empty, never a fabricated date,
 *   for the rare sitemap type with none). Individual child sitemap pages
 *   (the per-URL listing, e.g. `/wp-sitemap-posts-post-1.xml`) are left on
 *   core's own default XSL structure - only the CSS restyle above applies
 *   there, since that table already has a real, always-conditional
 *   "Last Modified" column of its own core doesn't need help with.
 *
 * Self-registers its own hooks in the constructor (php-wordpress.md) and
 * is constructed unconditionally in VuloPilot::init_classes(), same shape
 * as SitemapManager.php right next to it.
 *
 * @class       SitemapStylesheet class
 * @version     1.0.0
 * @author      VuloLabs
 */
class SitemapStylesheet {

    /**
     * Compiled file, relative to the plugin folder.
     *
     * @var string
     */
    private const STYLE_FILE = 'assets/styles/public/vulopilot-sitemap-stylesheet.min.css';

    /**
     * SitemapStylesheet constructor.
     */
    public function __construct() {
        add_filter( 'wp_sitemaps_stylesheet_css', array( $this, 'filter_stylesheet_css' ) );
        add_filter( 'wp_sitemaps_stylesheet_index_content', array( $this, 'filter_index_stylesheet_content' ) );
    }

    /**
     * Real CSS-only restyle - applies to core's own existing markup
     * structure (`#sitemap__header`/`#sitemap__table`) unchanged, so this
     * alone can't break core's own XSL templating on either the index or
     * any child sitemap page. Core prints this filter's result itself, so it
     * is the one place the CSS rules are handed to core as text; the
     * rules come from the same file the index page links to.
     *
     * @param string $css Core's own default CSS for the sitemap.
     * @return string
     */
    public function filter_stylesheet_css( $css ) {
        $path = VuloPilot()->plugin_path . self::STYLE_FILE;

        if ( ! file_exists( $path ) ) {
            return $css;
        }

        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- reads this plugin's own built stylesheet, not user input.
        return $css . (string) file_get_contents( $path );
    }

    /**
     * Address of the compiled file for the index page, with the plugin
     * version appended. Empty when the file has not been built.
     *
     * @return string
     */
    private function get_stylesheet_url(): string {
        if ( ! file_exists( VuloPilot()->plugin_path . self::STYLE_FILE ) ) {
            return '';
        }

        wp_register_style(
            'vulopilot-sitemap-stylesheet',
            VuloPilot()->plugin_url . self::STYLE_FILE,
            array(),
            VuloPilot()->version
        );

        $style = wp_styles()->registered['vulopilot-sitemap-stylesheet'];

        return add_query_arg( 'ver', $style->ver, $style->src );
    }

    /**
     * Full real XSL override for the sitemap INDEX page only (the
     * top-level `/wp-sitemap.xml` listing child sitemaps) - same real
     * `sitemap:sitemapindex/sitemap:sitemap` data core's own default
     * template already reads, just without the `$has-lastmod` guard that
     * hides the "Last Modified" column whenever even one listed sitemap
     * happens to lack a real `<lastmod>`.
     *
     * @param string $xsl_content Core's own default index XSL content (unused - this returns a full real replacement built from the same real translatable strings core itself would use).
     * @return string
     */
    public function filter_index_stylesheet_content( $xsl_content ) {
        $title       = esc_xml( __( 'XML Sitemap', 'vulopilot' ) );
        $description = esc_xml( __( 'This XML Sitemap is generated by WordPress to make your content more visible for search engines.', 'vulopilot' ) );
        $learn_more  = sprintf(
            '<a href="%s">%s</a>',
            esc_url( __( 'https://www.sitemaps.org/', 'vulopilot' ) ),
            esc_xml( __( 'Learn more about XML sitemaps.', 'vulopilot' ) )
        );

        $text = sprintf(
            /* translators: %s: real count of child sitemaps in this index. */
            esc_xml( __( 'This XML Sitemap Index file contains %s sitemaps.', 'vulopilot' ) ),
            '<xsl:value-of select="count( sitemap:sitemapindex/sitemap:sitemap )" />'
        );

        $lang    = get_language_attributes( 'html' );
        $url     = esc_xml( __( 'Sitemap', 'vulopilot' ) );
        $lastmod = esc_xml( __( 'Last Modified', 'vulopilot' ) );
        $css_url = $this->get_stylesheet_url();
        $link    = '' !== $css_url
            ? '<xsl:element name="link"><xsl:attribute name="rel">stylesheet</xsl:attribute><xsl:attribute name="href">' . esc_xml( esc_url( $css_url ) ) . '</xsl:attribute></xsl:element>'
            : '';

        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<xsl:stylesheet
		version=\"1.0\"
		xmlns:xsl=\"http://www.w3.org/1999/XSL/Transform\"
		xmlns:sitemap=\"http://www.sitemaps.org/schemas/sitemap/0.9\"
		exclude-result-prefixes=\"sitemap\"
		>

	<xsl:output method=\"html\" encoding=\"UTF-8\" indent=\"yes\" />

	<xsl:template match=\"/\">
		<html {$lang}>
			<head>
				<title>{$title}</title>
				{$link}
			</head>
			<body>
				<div id=\"sitemap\">
					<div id=\"sitemap__header\">
						<h1>{$title}</h1>
						<p>{$description}</p>
						<p>{$learn_more}</p>
					</div>
					<div id=\"sitemap__content\">
						<p class=\"text\">{$text}</p>
						<table id=\"sitemap__table\">
							<thead>
								<tr>
									<th class=\"loc\">{$url}</th>
									<th class=\"lastmod\">{$lastmod}</th>
								</tr>
							</thead>
							<tbody>
								<xsl:for-each select=\"sitemap:sitemapindex/sitemap:sitemap\">
									<tr>
										<td class=\"loc\"><a href=\"{sitemap:loc}\"><xsl:value-of select=\"sitemap:loc\" /></a></td>
										<td class=\"lastmod\"><xsl:value-of select=\"sitemap:lastmod\" /></td>
									</tr>
								</xsl:for-each>
							</tbody>
						</table>
					</div>
				</div>
			</body>
		</html>
	</xsl:template>
</xsl:stylesheet>

";
    }
}
