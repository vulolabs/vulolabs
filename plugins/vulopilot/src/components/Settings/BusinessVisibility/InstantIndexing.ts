import { __ } from '@wordpress/i18n';

/**
 * Settings → Get Started → Instant Indexing (IndexNow). Moved here from
 * Scanning per direct instruction ("shift this two tabs in get started
 * section after sitemap") — same real `id: 'indexnow'`, so the existing
 * `?...&subtab=indexnow` deep link still resolves (`getSettingById()`
 * recurses by id alone, with no concept of which folder a tab lives in).
 * `IndexNowPanel.tsx` moved alongside this file into `GetStarted/` too.
 *
 * Only `id`/`priority`/`headerTitle`/`headerIcon` are actually used for
 * navigation — Settings.tsx's GetForm() special-cases `currentTab ===
 * 'indexnow'` to render IndexNowPanel.tsx instead of InputRenderer (same
 * escape hatch 'connections'/'import-export' already use), since this
 * tab's "Submit URLs" and "History" cards are real actions/logs, not
 * persisted settings fields.
 *
 * `modal` below still lists `indexnow_api_key`/`indexnow_post_types` (the
 * two fields of this tab that ARE real flat settings, unlike AI service
 * configs which live in their own table) purely so Settings.tsx's existing
 * per-tab seeding logic (`fieldKeys` from `modal[].key`) populates
 * SettingContext with their current values before IndexNowPanel reads them
 * via `useSetting()` — the same `useSetting()`-inside-a-hand-built-
 * component approach LlmsTxtCard.tsx already uses.
 */
export default {
	id: 'indexnow',
	priority: 4,
	headerTitle: __('Instant Indexing', 'vulopilot'),
	headerDescription: __(
		'Submit new and updated URLs to search engines the moment they\'re published.',
		'vulopilot'
	),
	headerIcon: 'web-page-website',
	groupBySections: true,
	hideSettingHeader: true,
	submitUrl: 'settings',
	modal: [
		{ key: 'indexnow_api_key', type: 'text', label: '' },
		{ key: 'indexnow_post_types', type: 'checkbox', label: '', options: [] },
	],
};
