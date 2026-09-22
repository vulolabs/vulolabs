import { useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { useLocation, Link } from 'react-router-dom';
import { NavigatorComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import SiteHealthTab from '../Security/SiteHealthTab';
import BackupsTab, { BackupsTabHandle } from '../Security/BackupsTab';

const TAB_IDS = ['site-health', 'backups'] as const;

const TAB_META: Record<
	(typeof TAB_IDS)[number],
	{ headerTitle: string; headerIcon: string }
> = {
	'site-health': { headerTitle: __('Site Health', 'vulopilot'), headerIcon: 'active' },
	backups: { headerTitle: __('Backups', 'vulopilot'), headerIcon: 'error' },
};

/**
 * "Site Health" (WP menu slug `site-health`) — promoted out of the former
 * "Protect My Site" page's own 3-tab shell (Security.tsx), which used to
 * hold Security/Site Health/Backups as inner tabs. Security became its own
 * standalone top-level page; Site Health and Backups are merged into this
 * one page as 2 real inner tabs — Site Health first (SiteHealthTab.tsx),
 * Backups second (BackupsTab.tsx).
 *
 * Tab bar/body are one `NavigatorComponent` rather than a bare
 * `TabsComponent` — same real settings-navigator component
 * Performance.tsx/SeoVisibility.tsx's own tab shells already use, reused
 * here instead of a hand-rolled `TAB_IDS`-driven `TabsComponent` +
 * separate `NavigatorHeaderComponent` above it. `NavigatorComponent` wraps
 * its own tab body in `ContainerComponent general` internally, so no
 * separate wrapper is needed here either. Each tab's `hideSettingHeader:
 * true` suppresses `NavigatorComponent`'s own per-tab title/description
 * section, since `SiteHealthTab`/`BackupsTab` already render their own.
 *
 * `activeTab` is still owned here (not left as `NavigatorComponent`'s own
 * uncontrolled tracking) so `BackupProtectionNotice`'s "View Backups"
 * action (rendered inside `SiteHealthTab.tsx`) can jump straight to the
 * Backups tab in place instead of a full reload — fed into
 * `NavigatorComponent`'s own `currentSetting` prop, same "re-syncs its
 * internal active tab whenever `currentSetting` changes, not just on
 * mount" behavior Performance.tsx's own conversion already relies on for
 * the same kind of cross-tab jump.
 *
 * `goToBackups()` also pushes the matching URL itself
 * (`window.history.pushState`) — confirmed live: `NavigatorComponent`'s own
 * `useEffect` that reacts to a `currentSetting` prop change (as opposed to
 * one of its own tab-bar `Link` clicks) only updates its internal active
 * tab, it never calls `prepareUrl`/`pushState` for that path (that's
 * install-specific to its own `navigate()`, run only from a real click).
 * Left alone, the panel content correctly swapped to Backups but the
 * address bar silently kept showing Site Health — refreshing, using back,
 * or sharing/copying the link would all land back on Site Health instead.
 * The `window.history.pushState(null, '', url)` call below is the exact
 * same real call zyra's own `navigate()` makes for a genuine tab click
 * (confirmed by reading the installed `@multivendorx/zyra` build), so this
 * keeps the address bar in sync the same way a direct click already does.
 *
 * `SiteHealthTab`/`BackupsTab` are imported from `../Security/` rather
 * than physically moved — they're both still genuinely shared with
 * Security's own file tree there (`SectionedFindingsTab`,
 * `SectionedIssuesTable` types), same "kept here, cross-imported" choice
 * `Performance/OverviewTab.tsx` already makes for the Efficiency* cards it
 * shares with this same folder. `BackupProtectionNotice` itself renders
 * inside `SiteHealthTab.tsx` (its own header, right before
 * `SiteHealthStatusCard`) rather than above the tab bar here.
 */
const SiteHealth = () => {
	const location = useLocation();
	const subtab = new URLSearchParams(location.hash.substring(1)).get(
		'subtab'
	);
	const initialTab = (
		subtab && (TAB_IDS as readonly string[]).includes(subtab)
			? subtab
			: 'site-health'
	) as (typeof TAB_IDS)[number];

	const [activeTab, setActiveTab] = useState<(typeof TAB_IDS)[number]>(
		initialTab
	);

	// "Create Backup Now" lives in the page header's own "Run scan" slot
	// while the Backups tab is active (replacing "Run scan" entirely, per
	// direct instruction — a backup isn't a scan, so this tab never showed
	// a real "Run scan" action of its own to begin with), driven through
	// BackupsTab's own real `handleCreate` via `BackupsTabHandle` rather
	// than duplicating that request/notice logic here.
	const backupsTabRef = useRef<BackupsTabHandle>(null);
	const [isCreatingBackup, setIsCreatingBackup] = useState(false);

	const prepareUrl = (subTab: string) =>
		`?page=vulopilot#&tab=site-health&subtab=${subTab}`;

	const goToBackups = () => {
		setActiveTab('backups');
		window.history.pushState(null, '', prepareUrl('backups'));
	};

	// A real tab-pill click doesn't go through react-router at all —
	// confirmed by reading the installed zyra bundle: NavigatorComponent's
	// own `navigate()` calls `window.history.pushState()` directly (only
	// routed through a real `onNavigate` prop when one is given), which
	// updates the visible URL without ever touching react-router's own
	// history object or firing a native `hashchange` event — so this
	// component's own `activeTab` (and every real prop derived from it
	// below: `hideRunScanButton`/`replaceRunScanButton`/`settingsSubtab`)
	// silently went stale the moment someone clicked "Site Health" after
	// being on "Backups" (or the reverse): the header kept showing "Create
	// Backup Now" pointed at the Backups-only settings link even though the
	// real panel content underneath had already switched to Site Health.
	// Supplying this real `onNavigate` handler (NavigatorComponent's own
	// escape hatch for exactly this — see that component's own `navigate()`)
	// keeps `activeTab` in sync with every real navigation, not just the
	// initial page load.
	const handleNavigate = (url: string) => {
		window.history.pushState(null, '', url);

		const hashIndex = url.indexOf('#');
		const nextSubtab = new URLSearchParams(
			hashIndex >= 0 ? url.slice(hashIndex + 1) : ''
		).get('subtab');

		if (nextSubtab && (TAB_IDS as readonly string[]).includes(nextSubtab)) {
			setActiveTab(nextSubtab as (typeof TAB_IDS)[number]);
		}
	};

	const settingContent = TAB_IDS.map((tabId) => ({
		type: 'file' as const,
		content: {
			id: tabId,
			headerTitle: TAB_META[tabId].headerTitle,
			headerIcon: TAB_META[tabId].headerIcon,
			hideSettingHeader: true,
		},
	}));

	const getForm = (tabId: string) => {
		switch (tabId) {
			case 'site-health':
				return <SiteHealthTab onNavigateToBackups={goToBackups} />;
			case 'backups':
				return (
					<BackupsTab
						ref={backupsTabRef}
						onCreatingChange={setIsCreatingBackup}
					/>
				);
			default:
				return <div></div>;
		}
	};

	return (
		<NavigatorComponent
			headerIcon="active"
			headerTitle={__('Site Health', 'vulopilot')}
			headerCustomContent={
				'backups' === activeTab ? (
					// "Create Backup Now" replaces "Run scan" entirely
					// while the Backups tab is active — a backup isn't a
					// scan, so this tab never had a real "Run scan" action
					// of its own to begin with (see this file's own
					// docblock). Same icon/label/color BackupsTab.tsx's
					// own header button already uses.
					<ButtonInput
						buttons={{
							text: isCreatingBackup
								? __('Starting…', 'vulopilot')
								: __('Create Backup Now', 'vulopilot'),
							icon: isCreatingBackup ? 'update' : 'cloud-upload',
							color: 'purple-bg',
							disabled: isCreatingBackup,
							onClick: () => backupsTabRef.current?.createBackup(),
						}}
					/>
				) : (
					// Real category ids of every scanner SiteHealthTab.tsx's
					// own SECTIONS cover (wordpress-health/updates/cron/
					// database/server-health/php-warnings), so "Run Site
					// Health Scan" only re-runs what this tab actually shows
					// findings for, same scoped-scan pattern every other
					// category page's own header already uses (Security.tsx's
					// `categories={['security']}`, SeoVisibility.tsx's
					// `categories={['geo','seo','images','schema','links']}`).
					<RunScanHeaderExtra
						categories={[
							'wordpress',
							'updates',
							'cron',
							'database',
							'server',
							'php-warnings',
						]}
						label={__('Run Site Health Scan', 'vulopilot')}
						// None of these 6 scanners has a Settings tab of its
						// own to point the gear at (all always-on, no
						// per-scanner toggle) — same "no single matching
						// Settings subtab" case Dashboard.tsx's own header
						// already documents for its own site-wide scan
						// (`settingsSubtab` ignored either way once
						// `hideSettingsButton` is set — kept as a real,
						// existing id anyway, same as Dashboard.tsx's own
						// call, rather than an empty string).
						settingsSubtab="general"
						hideSettingsButton
					/>
				)
			}
			className="site-health-tabs"
			settingContent={settingContent}
			currentSetting={activeTab}
			getForm={getForm}
			prepareUrl={prepareUrl}
			onNavigate={handleNavigate}
			Link={Link}
			settingName="Site Health"
			menuIcon
		/>
	);
};

export default SiteHealth;
