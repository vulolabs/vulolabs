# SEO Module (`modules/TechnicalSeo`)

The on-page and technical SEO scanners. The user view is [../user/SEO.md](../user/SEO.md). Always-on SEO features (sitemap, titles, IndexNow, redirects, editor sidebar) are in [SEO-CORE](SEO-CORE.md).

## What the module does

`TechnicalSeo\Module` adds the module's scanners through the `vulopilot_scanner_sources` filter. Because the scanners are only added when the module is active, **turning the module off in Settings -> Modules stops all new SEO findings**. Findings that already exist are not deleted; they keep showing wherever findings are listed.

Active by default (`technical-seo`).

## Scanners

See the table in [SCANNERS](SCANNERS.md#technicalseo) for ids, categories and labels. In the admin they are grouped by `src/pages/GEO/seoSections.ts`:

| Section | Scanner ids |
|---|---|
| Titles & Meta | `seo`, `meta-description`, and related duplication and focus-keyword checks |
| Content Structure | `heading-structure`, `multiple-h1`, `thin-content` |
| Images | `seo-images`, `images` |
| Internal Linking | `internal-linking` |
| Indexability & Canonicals | `canonical-url`, `duplicate-content`, `orphan-pages` |
| Structured Data | `open-graph`, `twitter-card` |

A scanner id must be listed in `seoSections.ts` to appear in the SEO tab; a scanner added without being listed still produces findings but is not shown in a section.

## Settings that control scanning

| Setting key | Default |
|---|---|
| `flag_orphan_pages` | `array( 'flag_orphan_pages' )` |
| `thin_content_word_threshold` | `300` |
| `flag_missing_featured_image` | `array( 'flag_missing_featured_image' )` |
| `flag_missing_meta_description` | `array( 'flag_missing_meta_description' )` |
| `flag_duplicate_titles` | `array( 'flag_duplicate_titles' )` |
| `flag_missing_alt_text` | `array( 'flag_missing_alt_text' )` |
| `flag_broken_images` | `array( 'flag_broken_images' )` |
| `flag_broken_links` | `array( 'flag_broken_links' )` |
| `content_readability_min_score` | `50` |
| `broken_link_check_frequency` | `'daily'` |
| `flag_ai_crawler_blocked_pages` | `array( 'flag_ai_crawler_blocked_pages' )` |
| `canonical_url_enabled` | `array()` |
| `social_meta_tags_enabled` | `array()` |

## Rules that use SEO findings

`SeoTitleRewriteRule`, `MissingMetaDescriptionRule`, `MissingFeaturedImageRule`, `RobotsBlockingCrawlersRule` (see [RULE-ENGINE](RULE-ENGINE.md)). AI actions that fix SEO findings: `write-meta-description`, `add-subheadings`, `differentiate-duplicate-title` ([AI-ACTIONS](AI-ACTIONS.md)).

## Class reference

| Class | File | What it does |
|---|---|---|
| `Module` | `modules/TechnicalSeo/Module.php` | VuloPilot TechnicalSeo module. |
| `Seo` | `modules/TechnicalSeo/Rest/Seo.php` | `GET /seo/score` - a real, deterministic SEO Score (no AI, no cost) for the restyled SEO tab's own "SEO Health Score" card. |
| `AiCrawlerBlockedPagesScanner` | `modules/TechnicalSeo/Scanners/AiCrawlerBlockedPagesScanner.php` | - |
| `BrokenImagesScanner` | `modules/TechnicalSeo/Scanners/BrokenImagesScanner.php` | BrokenLinksScanner's own sibling for `<img src>` instead of `<a href>` - extracts image sources from the most recently published posts/pages and checks each one for a non-2xx/3xx HTTP response, flagging ones that appear broken. |
| `BrokenLinksScanner` | `modules/TechnicalSeo/Scanners/BrokenLinksScanner.php` | Extracts links from the most recently published posts/pages and checks each one for a non-2xx/3xx HTTP response, flagging ones that appear broken. |
| `CanonicalUrlScanner` | `modules/TechnicalSeo/Scanners/CanonicalUrlScanner.php` | Flags pages whose rendered HTML has no `<link rel="canonical">` tag. |
| `DuplicateContentScanner` | `modules/TechnicalSeo/Scanners/DuplicateContentScanner.php` | Flags published posts/pages that share an identical title with at least one other post. |
| `HeadingStructureScanner` | `modules/TechnicalSeo/Scanners/HeadingStructureScanner.php` | Flags substantial published content (over MIN_WORD_COUNT_TO_CHECK words - a short post genuinely may not need subheadings) with no `<h2>`-`<h6>` tags anywhere in it. |
| `ImagesScanner` | `modules/TechnicalSeo/Scanners/ImagesScanner.php` | Flags image attachments with no alt text set. |
| `InternalLinkingScanner` | `modules/TechnicalSeo/Scanners/InternalLinkingScanner.php` | Flags published posts/pages whose content contains zero links back to the site's own domain. |
| `MetaDescriptionScanner` | `modules/TechnicalSeo/Scanners/MetaDescriptionScanner.php` | Flags published posts/pages with no excerpt set. |
| `OpenGraphScanner` | `modules/TechnicalSeo/Scanners/OpenGraphScanner.php` | Fetches the homepage and flags any of the three Open Graph tags that make a shared link look correct on Facebook/LinkedIn/etc. |
| `OrphanPageScanner` | `modules/TechnicalSeo/Scanners/OrphanPageScanner.php` | Flags a published post/page that no other post among the same sampled batch links to - an "orphan" page reachable only through search, direct URL, or navigation menus outside the content itself, which search engines discover far l |
| `RobotsTxtScanner` | `modules/TechnicalSeo/Scanners/RobotsTxtScanner.php` | Fetches `/robots.txt` and flags two real, high-impact problems: the file isn't reachable at all, or it contains a sitewide `Disallow: /` for the wildcard user-agent - which tells every well-behaved crawler not to index anything on |
| `SchemaScanner` | `modules/TechnicalSeo/Scanners/SchemaScanner.php` | Flags a homepage with no JSON-LD structured data at all. |
| `SeoImagesScanner` | `modules/TechnicalSeo/Scanners/SeoImagesScanner.php` | Flags published posts/pages with no featured image set. |
| `SeoScanner` | `modules/TechnicalSeo/Scanners/SeoScanner.php` | Flags published post/page titles outside the length search engines reliably display in full (roughly 10-60 characters) - a title with no dedicated meta-description field can't be checked generically (that field's meta key varies b |
| `SitemapScanner` | `modules/TechnicalSeo/Scanners/SitemapScanner.php` | Flags a site with no reachable XML sitemap. |
| `StructuredDataValidationScanner` | `modules/TechnicalSeo/Scanners/StructuredDataValidationScanner.php` | Extracts every JSON-LD script block on the homepage and flags any that fail to parse as valid JSON. |
| `ThinContentScanner` | `modules/TechnicalSeo/Scanners/ThinContentScanner.php` | Flags published posts/pages under a minimum word count. |
| `TwitterCardScanner` | `modules/TechnicalSeo/Scanners/TwitterCardScanner.php` | Fetches the homepage and flags a missing `twitter:card` meta tag - without it, X/Twitter falls back to a plain link with no preview image or summary when this site's pages are shared there, independent of whether Open Graph tags ( |

Hooks and routes registered by these classes:

- `Module` - hooks: `vulopilot_scanner_sources`
- `Seo` - ; routes: `/seo/analyze-page`, `/seo/pages-needing-attention`, `/seo/progress`, `/seo/score`
