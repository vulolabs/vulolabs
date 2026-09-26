# SEO Core: Sitemaps, Titles, Indexing, Redirects, Post Editor

Code reference for the always-on SEO features in `classes/SeoVisibility` and `classes/Content`. For the on-page SEO scanners see [SEO-MODULE](SEO-MODULE.md). The user view is in [../user/SEO.md](../user/SEO.md).

## How the pieces connect

```
Settings (option vulopilot_settings)
   |
   |-- sitemap_* / html_sitemap_*  -> SitemapManager (filters on WP core sitemaps)
   |                                  SitemapUrlRewriter (/sitemap_index.xml, 301 from /wp-sitemap.xml)
   |                                  SitemapStylesheet  (XSL restyle)
   |                                  HtmlSitemapRenderer ([vulopilot_html_sitemap])
   |-- title_* / description_*     -> TitleFormatter (pre_get_document_title + <meta description>)
   |-- indexnow_*                  -> IndexNowAutoSubmitter (save_post, wp_trash_post) -> IndexNowClient
   |                                  IndexNowKeyFileServer (serves /{key}.txt)
   |-- robots_auto_generate        -> RobotsTxtManager (robots_txt filter)
   |-- canonical_url_enabled       -> CanonicalUrlManager
   |-- social_meta_tags_enabled    -> SocialMetaTagsManager
   `-- enable_redirect_manager / auto_redirect_on_slug_change / log_404s
                                   -> RedirectManager, NotFoundLogger

Post editor sidebar (src/post-editor)
   -> post meta _vulopilot_* (PostSeoMetaFields, show_in_rest)
   -> POST /post-seo/{id}/analyze -> OnPageAnalyzer
   -> PostRobotsMetaManager (wp_robots) and SchemaJsonLdRenderer (wp_head)
```

## Sitemaps

- `SitemapManager` does not build a sitemap from scratch. It filters WordPress core's sitemap (`wp_sitemaps_enabled`, `wp_sitemaps_max_urls`, `wp_sitemaps_post_types`, `wp_sitemaps_taxonomies`, `wp_sitemaps_posts_query_args`, `wp_sitemaps_taxonomies_query_args`) using the settings below, and pings on `save_post`.
- `SitemapUrlRewriter` rewrites core URLs to `/sitemap_index.xml` and `/{subtype}-sitemap{page}.xml`, and 301-redirects the legacy `wp-sitemap*.xml` URLs.
- `SitemapStylesheet` restyles the browser view through `wp_sitemaps_stylesheet_css` and `wp_sitemaps_stylesheet_index_content`. The sitemap index page links its stylesheet (`assets/styles/public/vulopilot-sitemap-stylesheet.min.css`, registered with `wp_register_style()`) instead of embedding CSS, and the individual sitemap pages get the same file's contents through the core filter.
- `HtmlSitemapRenderer` registers the `[vulopilot_html_sitemap]` shortcode and reads the same post types, taxonomies and exclusions.

## Title and meta formats

`TitleFormatter` resolves `title_format_*` / `description_format_*` templates. Tokens: `%site_title%`, `%site_description%`, `%post_title%`, `%page_title%`, `%category_title%`, `%tag_title%`, `%search_term%`, `%archive_title%`, `%sep%` (the `title_separator` setting). A per-post value from the editor sidebar overrides the template.

## IndexNow

- `IndexNowClient` posts to `https://api.indexnow.org/indexnow` and treats the response code as pass/fail.
- `IndexNowKeyFileServer` serves the site's key at `/{key}.txt` through a rewrite rule and `template_redirect`.
- `IndexNowAutoSubmitter` submits on `save_post` and on `wp_trash_post` for the post types in `indexnow_post_types`.
- `IndexNowLogRepository` keeps the last 100 requests (shown in the UI).
- Manual submission and history: REST `/indexnow/submit`, `/indexnow/history` (see [REST-API](REST-API.md)).

## Robots, canonical, social, schema

- `RobotsTxtManager` filters `robots_txt` to append a sitemap line and applies edits saved from the UI (`/robots-sitemap/robots`). `RobotsTxtBotAccess` parses the live robots.txt per AI user agent.
- `CanonicalUrlManager` (`get_canonical_url`, `wp_head`) and `SocialMetaTagsManager` (`wp_head`) output tags when their settings are on.
- `PostRobotsMetaManager` filters `wp_robots` for the per-post noindex/nofollow toggles.
- `SchemaJsonLdRenderer` reads the post meta `_vulopilot_schema_json`, JSON-decodes it and re-encodes with `wp_json_encode()`, then prints it with `wp_print_inline_script_tag()` (type `application/ld+json`). Invalid JSON is dropped rather than echoed.
- `HomepageSchemaRenderer` does the same for the homepage option. `SchemaPageInspector` and `SchemaCoverageAnalyzer` back the Schema tab.

## Post editor sidebar

- JS: `src/post-editor/index.tsx` registers the plugin sidebar `vulopilot-seo-sidebar` ("VuloPilot SEO") with tabs General, Social, Schema, Advanced and Page Analysis.
- PHP: `PostEditorAssets` enqueues it on `enqueue_block_editor_assets` and localizes `vulopilotPostSeo`.
- Data: `PostSeoMetaFields` registers post meta with `show_in_rest`, so the block editor reads and writes fields without a custom endpoint. Keys include `_vulopilot_focus_keyword`, `_vulopilot_canonical_url`, `_vulopilot_robots_noindex`, `_vulopilot_robots_nofollow`, `_vulopilot_social_title` (see the class for the full list).
- The only custom endpoint is `POST /post-seo/{id}/analyze` -> `OnPageAnalyzer` (checklist for the General tab).

## Redirects and the 404 log

- `Content\RedirectManager` applies stored redirects at request time and creates one on slug change when `auto_redirect_on_slug_change` is on. Storage: table `vulopilot_redirects` (`RedirectRepository`).
- `Content\NotFoundLogger` records 404s into `vulopilot_not_found_logs` (`NotFoundLogRepository`) when `log_404s` is on and separates content requests from system paths (`/wp-content/`, `/wp-includes/`, `/wp-admin/`, `/.well-known/`).
- Scanners: `NotFoundScanner`, `RedirectAnalysisScanner` (redirect chains, checked with `wp_remote_get`).

## Blocks

`Content\BlockRegistrar` registers two blocks from `src/blocks`: `vulopilot/table-of-contents` (attributes `title`, `minLevel`, `maxLevel`, `collapsible`; rendered by `TableOfContentsRenderer` with `HeadingAnchorInjector` adding heading ids) and `vulopilot/faq` (rendered by `FaqRenderer`, which also emits FAQPage JSON-LD through `wp_get_inline_script_tag()`).

## Settings keys

| Setting key | Default |
|---|---|
| `sitemap_enabled` | `array( 'sitemap_enabled' )` |
| `sitemap_links_per_page` | `200` |
| `sitemap_include_images` | `array()` |
| `sitemap_include_featured_images` | `array()` |
| `sitemap_exclude_posts` | `''` |
| `sitemap_exclude_terms` | `''` |
| `sitemap_xml_post_types` | `array( 'post', 'page', 'attachment', 'product' )` |
| `sitemap_xml_taxonomies` | `array( 'category', 'post_tag', 'product_cat', 'product_tag' )` |
| `html_sitemap_enabled` | `array( 'html_sitemap_enabled' )` |
| `html_sitemap_display_format` | `'list'` |
| `html_sitemap_sort_by` | `'published_date'` |
| `html_sitemap_show_dates` | `array( 'html_sitemap_show_dates' )` |
| `html_sitemap_item_titles` | `'post_title'` |
| `indexnow_post_types` | `array( 'post', 'page', 'product' )` |
| `indexnow_api_key` | `''` |
| `robots_auto_generate` | `array( 'robots_auto_generate' )` |
| `canonical_url_enabled` | `array()` |
| `social_meta_tags_enabled` | `array()` |
| `title_separator` | `'\|'` |
| `title_format_home` | `'%site_title% %sep% %site_description%'` |
| `title_format_post` | `'%post_title% %sep% %site_title%'` |
| `title_format_page` | `'%page_title% %sep% %site_title%'` |
| `title_format_category` | `'%category_title% %sep% %site_title%'` |
| `title_format_tag` | `'%tag_title% %sep% %site_title%'` |
| `title_format_search` | `'Search results for "%search_term%" %sep% %site_title%'` |
| `title_format_archive` | `'%archive_title% %sep% %site_title%'` |
| `description_format_home` | `'%site_description%'` |
| `description_format_post` | `'%post_title% %sep% %site_description%'` |
| `description_format_page` | `'%page_title% %sep% %site_description%'` |
| `description_format_category` | `'%category_title% %sep% %site_description%'` |
| `description_format_tag` | `'%tag_title% %sep% %site_description%'` |
| `description_format_search` | `'Search results for "%search_term%" %sep% %site_description%'` |
| `description_format_archive` | `'%archive_title% %sep% %site_description%'` |
| `enable_redirect_manager` | `array( 'enable_redirect_manager' )` |
| `auto_redirect_on_slug_change` | `array( 'auto_redirect_on_slug_change' )` |
| `log_404s` | `array( 'log_404s' )` |

## Class reference

### `classes/SeoVisibility`

| Class | File | What it does |
|---|---|---|
| `AeoSchemaScanner` | `classes/SeoVisibility/AeoSchemaScanner.php` | AEO (Answer Engine Optimization) - the one GEO check this pass adds that the existing 9 `geo`-category scanners don't already cover: whether a post whose own content is *already shaped* like an answer-engine-ready FAQ or HowTo (qu |
| `CanonicalUrlManager` | `classes/SeoVisibility/CanonicalUrlManager.php` | Outputs canonical tags when `canonical_url_enabled` is on. |
| `CrawlerTrafficLogger` | `classes/SeoVisibility/CrawlerTrafficLogger.php` | Detects AI crawlers by user agent and logs each visit. |
| `CrawlerVisitRepository` | `classes/SeoVisibility/CrawlerVisitRepository.php` | Storage for `vulopilot_crawler_visits`. |
| `HomepageSchemaRenderer` | `classes/SeoVisibility/HomepageSchemaRenderer.php` | No settings gate: like SchemaJsonLdRenderer, there's nothing to output until the option actually has content, so construction is unconditional and the hook is a no-op until then. |
| `HtmlSitemapRenderer` | `classes/SeoVisibility/HtmlSitemapRenderer.php` | Renders the `[vulopilot_html_sitemap]` shortcode. |
| `IndexNowAutoSubmitter` | `classes/SeoVisibility/IndexNowAutoSubmitter.php` | Submits URLs to IndexNow on publish, update and trash. |
| `IndexNowClient` | `classes/SeoVisibility/IndexNowClient.php` | Real HTTP client for the IndexNow protocol (indexnow.org) - a single submission to this one neutral aggregator endpoint is picked up by every participating search engine (Bing, Yandex, Seznam.cz, Naver, and others), so this never  |
| `IndexNowKeyFileServer` | `classes/SeoVisibility/IndexNowKeyFileServer.php` | Serves this site's IndexNow key file at `/{key}.txt` - the IndexNow protocol's own ownership-proof mechanism (a plain-text file at the site root containing exactly the key, matching `keyLocation` in every IndexNowClient submission |
| `IndexNowLogRepository` | `classes/SeoVisibility/IndexNowLogRepository.php` | Keeps the last 100 IndexNow requests in the activity log. |
| `MissingFeaturedImageRule` | `classes/SeoVisibility/MissingFeaturedImageRule.php` | Turns Seo\Scanners\SeoImagesScanner's "no featured image" Finding into a recommendation. |
| `MissingMetaDescriptionRule` | `classes/SeoVisibility/MissingMetaDescriptionRule.php` | Turns Seo\Scanners\MetaDescriptionScanner's "no excerpt set" Finding into a recommendation to draft one with AI - same reasoning as SeoTitleRewriteRule: a good description has to actually summarize the page's content, which needs  |
| `OnPageAnalyzer` | `classes/SeoVisibility/OnPageAnalyzer.php` | Stateless on-page SEO checklist for the post-editor metabox (RestAPI\Controllers\PostSeo::analyze_item()), grouped into "Basic SEO"/"Additional"/"Title Readability". |
| `PostEditorAssets` | `classes/SeoVisibility/PostEditorAssets.php` | Enqueues the post-editor SEO metabox - src/post-editor/index.tsx, a `@wordpress/plugins` PluginSidebar registered into the Block Editor, not a mount into VuloPilot's own dashboard app (a separate `#admin-main-wrapper` mount point) |
| `PostRobotsMetaManager` | `classes/SeoVisibility/PostRobotsMetaManager.php` | The post-editor metabox's General tab noindex/nofollow toggles (Services\PostSeoMetaFields::META_KEYS) - filters WordPress core's own `wp_robots` output (the `<meta name="robots">` tag core has generated since WP 5.7) rather than |
| `PostSeoMetaFields` | `classes/SeoVisibility/PostSeoMetaFields.php` | Registers the post-editor metabox's own postmeta fields via `register_post_meta( ..., 'show_in_rest' => true )` rather than a bespoke REST controller for reading/writing them - this makes every field here ride along with the Block |
| `RobotsBlockingCrawlersRule` | `classes/SeoVisibility/RobotsBlockingCrawlersRule.php` | Turns Seo\Scanners\RobotsTxtScanner's "robots.txt blocks every crawler" HIGH-severity Finding into a critical recommendation. |
| `RobotsTxtBotAccess` | `classes/SeoVisibility/RobotsTxtBotAccess.php` | Parses `/robots.txt` into per-user-agent Disallow groups, scoped to the known AI bot tokens (CrawlerTrafficLogger::get_bot_signatures()) - the one piece Seo\Scanners\RobotsTxtScanner deliberately doesn't cover (its own docblock: a |
| `RobotsTxtManager` | `classes/SeoVisibility/RobotsTxtManager.php` | Adds the sitemap line and applies edited robots.txt content. |
| `SchemaCoverageAnalyzer` | `classes/SeoVisibility/SchemaCoverageAnalyzer.php` | Snapshot of which pages have valid JSON-LD. |
| `SchemaJsonLdRenderer` | `classes/SeoVisibility/SchemaJsonLdRenderer.php` | No settings gate - unlike SitemapManager/RobotsTxtManager (which decide whether to generate something site-wide), this only ever outputs something a site owner (or an approved AI action) already explicitly created for one specific |
| `SchemaPageInspector` | `classes/SeoVisibility/SchemaPageInspector.php` | Real single-page JSON-LD inspection for the "Schema & Knowledge" tab's own Inspector section - a real `wp_remote_get()` of the requested page plus the exact same `StructuredDataValidationScanner::extract_json_ld_blocks()` extracti |
| `SeoTitleRewriteRule` | `classes/SeoVisibility/SeoTitleRewriteRule.php` | Turns Seo\Scanners\SeoScanner's title-length Finding into a recommendation to rewrite the title. |
| `SitemapManager` | `classes/SeoVisibility/SitemapManager.php` | Filters WordPress core sitemaps using the sitemap settings. |
| `SitemapStylesheet` | `classes/SeoVisibility/SitemapStylesheet.php` | Restyles the sitemap's browser view. |
| `SitemapUrlRewriter` | `classes/SeoVisibility/SitemapUrlRewriter.php` | Rewrites WordPress core's native sitemap URLs from `/wp-sitemap.xml`/`/wp-sitemap-{provider}-{subtype}-{page}.xml` to the more familiar `/sitemap_index.xml`/`/{subtype}-sitemap{page}.xml`. |
| `SocialMetaTagsManager` | `classes/SeoVisibility/SocialMetaTagsManager.php` | Outputs Open Graph and Twitter Card tags. |
| `TagManagerService` | `classes/SeoVisibility/TagManagerService.php` | Outputs the Google Tag Manager snippet. |
| `TitleFormatter` | `classes/SeoVisibility/TitleFormatter.php` | Resolves title and description templates. |
| `CrawlerTraffic` | `classes/SeoVisibility/Rest/CrawlerTraffic.php` | - |
| `IndexNow` | `classes/SeoVisibility/Rest/IndexNow.php` | Backs the Instant Indexing tab's two action-driven cards that don't fit Controllers\Settings' per-field auto-save model (Settings.tsx's own "special component" escape hatch - see that class's docblock): the "Submit URLs" textarea/ |
| `PostSeo` | `classes/SeoVisibility/Rest/PostSeo.php` | `POST /post-seo/{id}/analyze` - the one part of the post-editor metabox that needs a custom endpoint. |
| `RobotsSitemap` | `classes/SeoVisibility/Rest/RobotsSitemap.php` | `GET /robots-sitemap/robots` and `GET /robots-sitemap/sitemap` - real, live fetch-and-parse of this site's OWN actual `/robots.txt` and sitemap index, backing RobotsSitemapSection.tsx's "Robots.txt Analysis"/"XML Sitemap Overview" |
| `Schema` | `classes/SeoVisibility/Rest/Schema.php` | `POST /schema/inspect` backs the Inspector section's real single-page checker (SchemaPageInspector) - POST, not GET, same "real outbound HTTP only on explicit request" reasoning as `/schema/coverage`. |
| `Visibility` | `classes/SeoVisibility/Rest/Visibility.php` | `GET /visibility/score` / `GET /visibility/progress` - back the "SEO & Visibility → Overview" tab's own real dashboard (OverviewTab.tsx): one combined score across the 4 real free-tier areas already scored elsewhere on this plugin |

Hooks and routes registered by these classes:

- `CanonicalUrlManager` - hooks: `get_canonical_url`, `wp_head`
- `CrawlerTrafficLogger` - hooks: `init`, `template_redirect`
- `HomepageSchemaRenderer` - hooks: `wp_head`
- `IndexNowAutoSubmitter` - hooks: `save_post`, `wp_trash_post`
- `IndexNowKeyFileServer` - hooks: `init`, `query_vars`, `template_redirect`
- `PostEditorAssets` - hooks: `enqueue_block_editor_assets`
- `PostRobotsMetaManager` - hooks: `wp_robots`
- `PostSeoMetaFields` - hooks: `init`
- `RobotsTxtManager` - hooks: `robots_txt`
- `SchemaJsonLdRenderer` - hooks: `wp_head`
- `SitemapManager` - hooks: `save_post`, `wp_sitemaps_enabled`, `wp_sitemaps_max_urls`, `wp_sitemaps_post_types`, `wp_sitemaps_posts_query_args`, `wp_sitemaps_taxonomies`, `wp_sitemaps_taxonomies_query_args`
- `SitemapStylesheet` - hooks: `wp_sitemaps_stylesheet_css`, `wp_sitemaps_stylesheet_index_content`
- `SitemapUrlRewriter` - hooks: `init`, `query_vars`, `redirect_canonical`, `template_redirect`, `wp_sitemaps_index_entry`, `wp_sitemaps_init`
- `SocialMetaTagsManager` - hooks: `wp_head`
- `TagManagerService` - hooks: `wp_body_open`, `wp_enqueue_scripts`
- `TitleFormatter` - hooks: `pre_get_document_title`, `wp_head`
- `CrawlerTraffic` - routes: `/crawler-traffic`, `/crawler-traffic/analytics`, `/crawler-traffic/summary`
- `IndexNow` - routes: `/indexnow/history`, `/indexnow/submit`
- `PostSeo` - routes: `/post-seo/(?P<id>\d+)/analyze`
- `RobotsSitemap` - routes: `/robots-sitemap/robots`, `/robots-sitemap/sitemap`
- `Schema` - routes: `/schema/coverage`, `/schema/inspect`, `/schema/inspectable-pages`
- `Visibility` - routes: `/visibility/progress`, `/visibility/score`, `/visibility/traffic-sources`

### `classes/Content`

| Class | File | What it does |
|---|---|---|
| `BlockRegistrar` | `classes/Content/BlockRegistrar.php` | Discovers and registers every Gutenberg block VuloPilot ships - `tools/webpack/create-config.js` builds each `src/blocks/{name}/` folder into `assets/js/block/{name}/` (block.json + render.php, if present, copied alongside the bui |
| `FaqOpportunityRule` | `classes/Content/FaqOpportunityRule.php` | Turns Geo\Scanners\GeoFaqOpportunityScanner's "no FAQ-style questions" Finding into a recommendation to draft one with AI - good FAQ questions have to actually anticipate what a reader would ask about this specific content, which  |
| `FaqRenderer` | `classes/Content/FaqRenderer.php` | Real render logic for the `vulopilot/faq` block (`src/blocks/faq/render.php` calls straight into this - see TableOfContentsRenderer's own docblock for why render.php itself must stay declaration-free). |
| `HeadingAnchorInjector` | `classes/Content/HeadingAnchorInjector.php` | Injects `id="..."` onto every real `<h1>`-`<h6>` a `vulopilot/table-of- contents` block's own links point to - without this, the TOC's `<a href="#slug">` links would have nowhere real to land. |
| `HeadingAnchorResolver` | `classes/Content/HeadingAnchorResolver.php` | The one real heading-slug algorithm both the `vulopilot/table-of-contents` block and `HeadingAnchorInjector` build on - kept in exactly one place so the TOC's own `<a href="#...">` links and the `id="..."` actually injected onto t |
| `MissingSummaryBlockRule` | `classes/Content/MissingSummaryBlockRule.php` | Turns Geo\Scanners\GeoSummaryBlockScanner's "no upfront summary" Finding into a recommendation to draft one with AI - a good summary has to actually distill this specific content's key points, which needs the content itself. |
| `NotFoundLogRepository` | `classes/Content/NotFoundLogRepository.php` | Persistence for vulopilot_not_found_logs - one row per unique missing URL visitors actually hit, not one row per visit (Install.php's own schema: `requested_path` is UNIQUE). |
| `NotFoundLogger` | `classes/Content/NotFoundLogger.php` | - |
| `NotFoundScanner` | `classes/Content/NotFoundScanner.php` | Checks whether a bounded batch of recently-modified published posts' OWN permalinks resolve - distinct from BrokenLinksScanner, which only checks outbound/internal links found INSIDE content, never whether the post's own URL actua |
| `RedirectAnalysisScanner` | `classes/Content/RedirectAnalysisScanner.php` | Walks the homepage's own redirect chain (if any), manually following `Location` headers rather than letting wp_remote_get()'s own `redirection` option silently follow them - the same `wp_remote_get( home_url() )` idiom RobotsTxtSc |
| `RedirectManager` | `classes/Content/RedirectManager.php` | - |
| `RedirectRepository` | `classes/Content/RedirectRepository.php` | Persistence for vulopilot_redirects - the "Redirects & 404s" feature's user-managed 301/302 redirect table. |
| `TableOfContentsRenderer` | `classes/Content/TableOfContentsRenderer.php` | Real render logic for the `vulopilot/table-of-contents` block (`src/blocks/table-of-contents/render.php` calls straight into this - kept out of render.php itself since WP loads a block's render.php via `require`, not `require_once |
| `BrokenLinksStats` | `classes/Content/Rest/BrokenLinksStats.php` | `GET /broken-links/stats` - backs BrokenLinksTab.tsx's own "Link health"/"Coverage" tiles (SEO & Visibility → Broken Links) with real numbers: BrokenLinksScanner::STATS_OPTION/BrokenImagesScanner::STATS_OPTION, each written fresh  |
| `ContentAssistant` | `classes/Content/Rest/ContentAssistant.php` | `POST /content-assistant/chat` - the conversational turn for "Create Content"'s AI Content Assistant sidebar (src/pages/Content/AiContentAssistantSidebar.tsx). |
| `NotFoundLogs` | `classes/Content/Rest/NotFoundLogs.php` | GET /not-found-logs, POST /not-found-logs/{id}/delete (dismiss a log entry), POST /not-found-logs/{id}/convert (turn it into a real redirect) - backs the Redirects page's own "404 Log" table. |
| `Redirects` | `classes/Content/Rest/Redirects.php` | GET/POST /redirects, POST /redirects/{id}, POST /redirects/{id}/delete - the "Redirects & 404s" feature's own CRUD surface, backing src/pages/Redirects/Redirects.tsx. |

Hooks and routes registered by these classes:

- `BlockRegistrar` - hooks: `enqueue_block_editor_assets`, `init`, `wp_enqueue_scripts`
- `HeadingAnchorInjector` - hooks: `the_content`
- `NotFoundLogger` - hooks: `template_redirect`
- `RedirectManager` - hooks: `post_updated`, `template_redirect`
- `BrokenLinksStats` - routes: `/broken-links/stats`
- `ContentAssistant` - routes: `/content-assistant/chat`
- `NotFoundLogs` - routes: `/not-found-logs`, `/not-found-logs/(?P<id>\d+)/convert`, `/not-found-logs/(?P<id>\d+)/delete`
- `Redirects` - routes: `/redirects`, `/redirects/(?P<id>\d+)`, `/redirects/(?P<id>\d+)/delete`, `/redirects/health`
