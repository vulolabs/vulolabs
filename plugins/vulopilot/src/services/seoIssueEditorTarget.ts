/**
 * Single source of truth for the "All SEO Issues" table's "Fix with AI"
 * deep link (`SeoIssuesByPageTable.tsx`) and the block-editor "VuloPilot
 * SEO" sidebar's own handling of it (`post-editor/index.tsx`). The table
 * builds `post.php?post={id}&action=edit&vulopilot_seo_issue={scannerId}`;
 * the editor reads that query param and looks it up here to decide which
 * tab to open and which field/checklist row to scroll to and highlight.
 *
 * Deliberately has no entry for scanner ids with no real editor-sidebar
 * equivalent (duplicate-content, orphan-pages, broken-links, sitemap,
 * sitemap-validation, robots-txt, ai-crawler-blocked-pages, multiple-h1,
 * meta-description-duplication, focus-keyword-audit) - the editor still
 * opens the sidebar for these (see post-editor/index.tsx), it just doesn't
 * pretend to highlight something that isn't there.
 */

export type SeoIssueEditorTab = 'general' | 'social' | 'schema' | 'page-analysis';

export interface SeoIssueEditorTarget {
	tab: SeoIssueEditorTab;
	/** OnPageAnalyzer check id (General tab) or field key (Social/Schema, or a General-tab field). */
	target?: string;
}

export const SEO_ISSUE_EDITOR_TARGETS: Record<string, SeoIssueEditorTarget> = {
	seo: { tab: 'page-analysis', target: 'title_length' },
	'meta-description': { tab: 'page-analysis', target: 'description_length' },
	'thin-content': { tab: 'page-analysis', target: 'content_length' },
	'heading-structure': { tab: 'page-analysis', target: 'has_subheadings' },
	'seo-images': { tab: 'page-analysis', target: 'image_alt' },
	images: { tab: 'page-analysis', target: 'image_alt' },
	'internal-linking': { tab: 'page-analysis', target: 'has_links' },
	'canonical-url': { tab: 'general', target: 'canonical_url' },
	'open-graph': { tab: 'social', target: 'social_title' },
	'twitter-card': { tab: 'social', target: 'social_title' },
	schema: { tab: 'schema', target: 'schema_json' },
	'structured-data': { tab: 'schema', target: 'schema_json' },
	'sitewide-structured-data': { tab: 'schema', target: 'schema_json' },
	/** Brand Intelligence's Person/Organization schema checks - the fix is the same JSON-LD the Schema tab generates/edits (Generate with AI adds the missing author/organization data), so they land there too. */
	'author-schema': { tab: 'schema', target: 'schema_json' },
	'organization-schema': { tab: 'schema', target: 'schema_json' },
	/** AEO's own "Schema Markup" section (AeoTab.tsx) - same real Schema tab every other schema-flavored scanner id above already resolves to; no separate sub-target, same as those. */
	'aeo-schema': { tab: 'schema', target: 'schema_json' },
};

export const getEditorTargetForScanner = (
	scannerId: string
): SeoIssueEditorTarget | null => SEO_ISSUE_EDITOR_TARGETS[scannerId] ?? null;

/** Query-string param name the table and the editor both agree on. */
export const SEO_ISSUE_QUERY_PARAM = 'vulopilot_seo_issue';

/**
 * Separate deep-link param `GEO/PageAnalysisPanel.tsx`'s own checklist uses
 * instead of `SEO_ISSUE_QUERY_PARAM` above - its checks come from
 * `Controllers\Seo::get_page_analysis()`'s own `key`s (`title_tag`,
 * `broken_links`, `orphan_page`, `indexability`, …), a different, larger
 * vocabulary than `SEO_ISSUE_EDITOR_TARGETS`' scanner ids, several of which
 * (Featured Image, Broken Links, Orphan Page, Indexability) have no real
 * scanner-id equivalent at all. Rather than force-fitting all 13 of that
 * panel's checks through a scanner-id translation layer that can't
 * represent them, the value here carries the check `key` straight through;
 * the editor's own "Page Analysis" tab (`post-editor/tabs/PageAnalysisTab.tsx`)
 * renders that exact same real checklist and highlights the row whose
 * `key` matches, so every issue this panel shows is genuinely listed and
 * highlightable in the editor - not just "the sidebar opens."
 */
export const PAGE_ANALYSIS_CHECK_QUERY_PARAM = 'vulopilot_page_analysis_check';

/**
 * A 3rd deep-link param, alongside the 2 above - GEO's/AEO's own real
 * open-findings tables (`GeoAeoPageAnalysisPanel.tsx`, and
 * `SeoIssuesByPageTable.tsx` for GEO/AEO rows) use this instead of
 * `SEO_ISSUE_QUERY_PARAM` whenever a finding's own `scanner_id` has no
 * entry in `SEO_ISSUE_EDITOR_TARGETS` above - most real GEO/AEO scanner ids
 * (`geo-summary-block`, `geo-faq-opportunity`, `geo-chunking`, …) are
 * content-body concerns with no dedicated editor-sidebar field, so a
 * scanner-id lookup can never resolve them to anything to highlight, the
 * same real gap that caused GEO/AEO issues to redirect into the editor
 * with nothing highlighted before this param existed. Carries the real
 * finding's own numeric `id` (`RawFinding['id']`, confirmed stable between
 * every real caller - dashboard tables and the editor's own
 * `PageAnalysisTab.tsx` fetch both hit the same `GET /findings` route)
 * straight through, the same "bypass the scanner-id map entirely" posture
 * `PAGE_ANALYSIS_CHECK_QUERY_PARAM`'s own docblock already takes for SEO's
 * Page Analysis checklist - `post-editor/tabs/PageAnalysisTab.tsx`'s own
 * "GEO Issues"/"AEO Issues" sections match this against their own real
 * `geoFindings`/`aeoFindings` by id once loaded.
 */
export const FINDING_ID_QUERY_PARAM = 'vulopilot_finding_id';
