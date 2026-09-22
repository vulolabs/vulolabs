import { __ } from '@wordpress/i18n';
import ConnectionsPanel from './ConnectionsPanel';

/**
 * Settings → Get Started → Get Started (this folder's own original
 * content, back to being a real sub-tab file again). Was briefly
 * flattened to a standalone top-level file (`Settings/GetStarted.ts`)
 * when it was the only real sub-tab under this folder and the resulting
 * single-item sub-tab bar was pure UI noise — now 2 more real sub-tabs
 * (Title Formats, Business Information) have moved in from the old Site
 * Identity folder per direct instruction ("move this 2 sub tab in Get
 * Started" / "Get Started have 3 tab 1 his own and two tab from Site
 * Identity"), so a real sub-tab bar is worth having again, and this file
 * moved back down into `GetStarted/` (`templateService.ts`'s own
 * file-vs-folder distinction — a `.ts` file directly under `Settings/` is
 * a flat top-level tab, one nested in a subfolder becomes a folder tab
 * with its own inner bar) to be one of its 3 real sub-tabs, `priority: 1`
 * (first).
 *
 * `ConnectionsPanel.tsx` and the real per-provider panel components it
 * composes (`VuloCloudAiConnectionPanel.tsx`/`GoogleServicesPanel.tsx`/
 * `PageSpeedStatusPanel.tsx`/`SiteVerificationPanel.tsx`) already lived in
 * this same `GetStarted/` folder — they're plain `.tsx` components, not
 * settings-tab configs (`templateService.ts`'s own `require.context` only
 * scans `.ts$` files), so this file moving back in alongside them changes
 * nothing about how those resolve; the relative import above is now
 * `./ConnectionsPanel` (same folder) rather than `./GetStarted/ConnectionsPanel`.
 *
 * `id: 'connections'` is kept exactly as-is — real navigation across this
 * plugin already links to `?page=vulopilot#&tab=settings&subtab=connections`
 * (VisibilityBySourceCard.tsx, CrawlRobotsSitemapSection.tsx,
 * PerformanceScoreCard.tsx, SlowPagesTab.tsx, Modules/index.ts's own
 * `settingsLink`), and `getSettingById()` (`@zyra/core`) resolves a
 * `subtab` by this real `id` alone, recursing through folders — it has no
 * concept of "which folder a tab lives in," so moving this file changes
 * nothing about those links.
 *
 * `modal` below is the same union of real flat setting keys the old
 * Connections.ts carried — still needed even though `PanelComponent`
 * bypasses InputRenderer entirely, purely so Settings.tsx's own per-tab
 * seeding logic (`fieldKeys` from `modal[].key`) populates SettingContext
 * with their current values before ConnectionsPanel.tsx's own components
 * mount and read them via `useSetting()`.
 */
export default {
	id: 'connections',
	priority: 6,
	headerTitle: __('Connections', 'vulopilot'),
	headerDescription: __(
		'Connect VuloPilot to AI services, Google services, and verify your site ownership.',
		'vulopilot'
	),
	hideSettingHeader: true,
	groupBySections: true,
	headerIcon: 'link',
	submitUrl: 'settings',
	modal: [
		// Google Services.
		{ key: 'ga_install_tracking_code', type: 'checkbox', label: '', options: [] },
		{ key: 'ga_anonymize_ip', type: 'checkbox', label: '', options: [] },
		{ key: 'ga_self_hosted_js', type: 'checkbox', label: '', options: [] },
		{ key: 'ga_exclude_logged_in_users', type: 'checkbox', label: '', options: [] },
		// Tag Manager (TagManagerPanel.tsx) — moved in from Scanning → SEO
		// & Content per direct instruction, rendered above Webmaster Tools.
		{ key: 'tag_manager_enabled', type: 'checkbox', label: '', options: [] },
		{ key: 'tag_manager_container_id', type: 'text', label: '' },
		// Site Verification.
		{ key: 'webmaster_google_verification', type: 'text', label: '' },
		{ key: 'webmaster_google_verified_at', type: 'text', label: '' },
		{ key: 'webmaster_bing_verification', type: 'text', label: '' },
		{ key: 'webmaster_bing_verified_at', type: 'text', label: '' },
		{ key: 'webmaster_pinterest_verification', type: 'text', label: '' },
		{ key: 'webmaster_pinterest_verified_at', type: 'text', label: '' },
		{ key: 'webmaster_baidu_verification', type: 'text', label: '' },
		{ key: 'webmaster_yandex_verification', type: 'text', label: '' },
		{ key: 'webmaster_norton_verification', type: 'text', label: '' },
		{ key: 'webmaster_custom_tags', type: 'textarea', label: '' },
		// PageSpeed Insights (PageSpeedStatusPanel.tsx) — moved here per
		// direct instruction, rendered after Webmaster Tools above.
		{ key: 'psi_api_key', type: 'text', label: '' },
		{ key: 'psi_daily_limit', type: 'text', label: '' },
	],
	PanelComponent: ConnectionsPanel,
};
