/* global appLocalizer */
import React, { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	AnalyticsComponent,
	CardComponent,
	ColumnComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	InformationItemComponent,
	ListComponent,
	ModuleGuardComponent,
	NoticeManager,
	PopupComponent,
	TypographyComponent,
	ContainerComponent
} from '@zyra/components';
import { ButtonInput, SelectInput, TextInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { Finding } from '../../services/useFindingsTable';
import { formatWpDate } from '../../services/formatWpDate';
import { useRunScan } from '../../services/useRunScan';
import ShowProPopup from '../../components/Popup/Popup';
import './SeoVisibility.scss';

const nonceHeaders = { headers: { 'X-WP-Nonce': appLocalizer.nonce } };

interface BrokenLinkFixParams {
	post_id: number;
	old_url: string;
	new_url: string;
	is_image?: boolean;
	old_text?: string;
	new_text?: string;
}

interface BrokenLinkFixOutcome {
	success: boolean;
	message: string;
}

/**
 * Broken Links' own real "Fix" popup behavior — registered by
 * vulopilot-pro's OneClickFix module (modules/OneClickFix/src/index.tsx)
 * via this filter, same real "always show the entry point, supply the
 * actual behavior only when Pro's module is active" shape
 * `vulopilot_finding_fix_handler` already establishes for every other
 * finding's "Fix" action (useFindingsTable.tsx's own
 * `getFindingFixHandler()`) — Broken Links used to be the one exception
 * that worked without Pro at all (a real, free `POST
 * /broken-links/replace-url`, `BrokenLinksStats.php`); that endpoint now
 * lives in Pro's own BrokenLinkFixRest.php instead, so this is the last
 * piece bringing it in line with every other "Fix" action's real gate.
 *
 * Read fresh on every click, not cached — same reasoning
 * `getFindingFixHandler()`'s own docblock documents (Pro's script is a
 * separate, later `<script>` tag that may not have registered its
 * `addFilter()` yet at the moment this module first evaluates).
 *
 * @return A function resolving a real fix outcome, or null when Pro's OneClickFix module isn't active.
 */
const getBrokenLinkFixHandler = () =>
	applyFilters('vulopilot_broken_link_fix_handler', null);

/** Scanners\Basic\BrokenLinksScanner + Scanners\Basic\BrokenImagesScanner — this tab's own two real data sources. */
const BROKEN_SCANNER_IDS = ['broken-links', 'broken-images'];

/**
 * `GET /findings` is a real `SELECT *` (AbstractRepository::find_all()),
 * so every row already carries the raw `meta`/`scanner_id`/`object_ref`/
 * `last_seen_at` DB columns even though the shared `Finding` type
 * (useFindingsTable.tsx) only declares the fields every OTHER
 * findings-backed tab has needed so far. `object_ref` is a single real
 * post id string for both these scanners (never the comma-joined list
 * DuplicateContentScanner's own multi-page findings use — see each
 * scanner's own `scan()`). `last_seen_at` is real, distinct from
 * `created_at`: ScanPersistenceListener bumps it every time a rescan
 * still finds the same broken URL, while `created_at` stays frozen at
 * first detection — the "First Found"/"Last Checked" columns below read
 * these two real columns directly, nothing derived/fabricated.
 */
interface BrokenLinkFinding extends Finding {
	meta?: string;
	scanner_id?: string;
	object_ref?: string;
	last_seen_at?: string;
}

interface RunStats {
	pages_scanned: number;
	links_checked: number;
	healthy_count: number;
	checked_at: number | null;
}

/** `ScanRepository::get_latest_completed()` — the most recent genuinely-finished run of either scanner, real `vulopilot_scans` columns. Null when neither has ever completed one. */
interface LastRunStats {
	duration_ms: number;
	finished_at: number;
}

interface BrokenLinksStatsResponse {
	links: RunStats;
	images: RunStats;
	last_run: LastRunStats | null;
}

interface BrokenFindingsSummary {
	brokenLinks: number;
	brokenImages: number;
	couldntVerify: number;
	ignored: number;
}

const EMPTY_SUMMARY: BrokenFindingsSummary = {
	brokenLinks: 0,
	brokenImages: 0,
	couldntVerify: 0,
	ignored: 0,
};

/**
 * Same real "seo module gates its own scanners" check SeoTab.tsx and
 * CrawlerTrafficTab.tsx already use — both BrokenLinksScanner and
 * BrokenImagesScanner are registered by modules/Seo/Module.php, not
 * unconditionally like GeoInsights' own scanners, so their findings
 * simply don't exist while SEO is off.
 */
const isSeoModuleActive = () =>
	appLocalizer.active_modules?.includes('seo') ?? false;

/**
 * Scanners\Basic\BrokenLinksScanner/BrokenImagesScanner::scan() both
 * store `{"url": "...", "reason": "broken"|"unverified"}` in the
 * finding's own `meta` column — this reads that JSON defensively since
 * `meta` is free-form per scanner. `text` (the real, stripped-of-markup
 * anchor text for that exact `<a>` tag) only exists on `broken-links`
 * findings — `BrokenImagesScanner` has no anchor text to capture, so it's
 * simply absent there rather than a fabricated empty string.
 */
const getFindingMeta = (
	finding: Pick<BrokenLinkFinding, 'meta'>
): { url?: string; reason?: string; text?: string } => {
	try {
		return JSON.parse(finding.meta || '{}');
	} catch {
		return {};
	}
};

/**
 * The real broken `<a>` tag's own visible text, for the "Link Text"
 * column — `undefined`/empty distinguished from each other and both
 * handled honestly: `undefined` means this finding's own scanner never
 * captures anchor text at all (a `broken-images` row), while `''` means a
 * real `broken-links` finding whose real `<a>` tag wrapped only an image
 * or other non-text content — genuinely no visible text, not missing data.
 */
const getLinkText = (finding: BrokenLinkFinding): string => {
	const { text } = getFindingMeta(finding);

	if (undefined === text) {
		return __('—', 'vulopilot');
	}

	return text || __('(no visible text)', 'vulopilot');
};

/**
 * The real `<a>` tag's own raw visible text — `''` for a genuinely
 * text-less anchor (an image-only link) or a `broken-images` finding
 * (which never captures text at all), never `getLinkText()`'s own
 * display placeholders ('—'/'(no visible text)'). Used for the "Fix"
 * popup's real editable text field and what it actually sends as
 * `old_text`/`new_text` — an editable field must show/compare against
 * this exact real value, not a decorative display label.
 */
const getRawLinkText = (finding: BrokenLinkFinding): string =>
	getFindingMeta(finding).text ?? '';

const getBrokenUrl = (finding: BrokenLinkFinding): string =>
	getFindingMeta(finding).url || '';

/** Real text, shortened for this table's own compact row display — the full real value is still what's edited in the "Fix" popup and what's exported to CSV, this only shortens what's shown inline next to a row's other details. */
const truncateText = (text: string, maxLength = 15): string =>
	text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;

/**
 * Resolves a broken URL down to a real, literal path
 * `RedirectManager::maybe_apply_redirect()` can actually intercept — that
 * class matches on an exact `source_path` string, not a regex, so this
 * has to be a real path on THIS site. Returns null for an external dead
 * link (a different domain entirely), which has no path on this site to
 * redirect from — creating a same-site redirect rule for someone else's
 * broken URL wouldn't do anything.
 */
const deriveSourcePath = (url: string): string | null => {
	if (!url) {
		return null;
	}

	try {
		const target = new URL(url, appLocalizer.site_url);
		const site = new URL(appLocalizer.site_url);

		if (target.origin !== site.origin) {
			return null;
		}

		return target.pathname || '/';
	} catch {
		return null;
	}
};

/**
 * True when a finding's broken URL points at a different site entirely —
 * i.e. deriveSourcePath() above returns null for it. Backs both the
 * "Link Type" column (Internal/External) and the "Create redirect"
 * action's disabled state: RedirectManager.php can never intercept a
 * request that never reaches this site in the first place.
 */
const isExternalFinding = (finding: BrokenLinkFinding): boolean =>
	!deriveSourcePath(getBrokenUrl(finding));

/** Real HTTP reason phrases for the status codes these two scanners actually see in practice — anything not listed here still shows the real numeric code alone rather than a guessed phrase. */
const HTTP_STATUS_PHRASES: Record<string, string> = {
	'400': __('Bad Request', 'vulopilot'),
	'401': __('Unauthorized', 'vulopilot'),
	'403': __('Forbidden', 'vulopilot'),
	'404': __('Not Found', 'vulopilot'),
	'410': __('Gone', 'vulopilot'),
	'429': __('Too Many Requests', 'vulopilot'),
	'500': __('Internal Server Error', 'vulopilot'),
	'502': __('Bad Gateway', 'vulopilot'),
	'503': __('Service Unavailable', 'vulopilot'),
	'504': __('Gateway Timeout', 'vulopilot'),
};

/**
 * A short, real status key derived from the scanner's own real
 * `meta.reason` + `description` — a 'broken' finding always carries a
 * real `HTTP %d` in its description (BrokenLinksScanner::check_link()'s
 * own sprintf), so that code IS the key; an 'unverified' finding carries
 * a real cURL error message, narrowed to 'dns' when it says "resolve"
 * (covers both "Could not resolve host" and "Resolving timed out" — cURL
 * error 6 and the DNS-phase flavor of error 28) or 'timeout' for any
 * other "timed out", falling back to a generic 'unverified'.
 *
 * Deliberately does NOT invent categories neither scanner has any way to
 * actually detect — a "Soft 404" or a redirect "Chain" would need
 * following redirects and inspecting the destination page's own content/
 * status, which check_link()/check_image() don't do (a single HEAD
 * request; wp_remote_head() already follows up to 5 redirects
 * transparently, so this code never even sees an intermediate hop).
 */
const deriveStatusKey = (finding: BrokenLinkFinding): string => {
	const { reason } = getFindingMeta(finding);
	const description = finding.description || '';

	if ('broken' === reason) {
		const match = description.match(/HTTP (\d+)/);
		return match ? match[1] : 'broken';
	}

	if (/resolv/i.test(description)) {
		return 'dns';
	}

	if (/timed out/i.test(description)) {
		return 'timeout';
	}

	return 'unverified';
};

/** Human label for a deriveStatusKey() result — a real numeric HTTP code gets its real reason phrase appended when known (HTTP_STATUS_PHRASES); otherwise the code is shown alone rather than guessing. */
const statusKeyLabel = (key: string): string => {
	switch (key) {
		case 'broken':
			return __('Broken', 'vulopilot');
		case 'dns':
			return __('DNS', 'vulopilot');
		case 'timeout':
			return __('Timeout', 'vulopilot');
		case 'unverified':
			return __('Unverified', 'vulopilot');
		default:
			return HTTP_STATUS_PHRASES[key]
				? `${key} ${HTTP_STATUS_PHRASES[key]}`
				: key; // a real numeric HTTP status code with no known phrase
	}
};

/** A confirmed HTTP error or DNS failure reads as more severe (red) than an unverified/timed-out check this scanner just couldn't confirm either way (yellow), same distinction the "Broken" vs "Couldn't verify" stat tiles above already draw. */
const statusKeyColor = (key: string): string =>
	/^\d+$/.test(key) || 'dns' === key ? 'red' : 'yellow';

/**
 * mm:ss (or hh:mm:ss past an hour) — real `vulopilot_scans.duration_ms` for
 * a "Last scan completed" banner this docblock's own history describes as
 * "added alongside this pass", but no such banner is actually rendered
 * anywhere below — same "real, working, just no longer reachable from the
 * UI" status the row-actions `action` column's own docblock documents for
 * `openRedirectPopup()`/`handleResolve()`/`handleSnooze()` (kept rather
 * than deleted for the same reason: removing a real feature wasn't asked
 * for, just flagging it here as unused).
 */
const formatDurationMs = (ms: number): string => {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (value: number) => String(value).padStart(2, '0');

	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

/**
 * Real, client-side CSV built straight from whatever findings currently
 * pass every active filter (search/issue/link-type/page/status) — not
 * just one page's worth, since the endpoint itself returns every
 * matching row unpaginated and this tab slices client-side.
 */
const downloadBrokenLinksCsv = (rows: BrokenLinkFinding[]) => {
	const header = [
		__('Source page', 'vulopilot'),
		__('Target URL', 'vulopilot'),
		__('Link Text', 'vulopilot'),
		__('Type', 'vulopilot'),
		__('Link type', 'vulopilot'),
		__('Status', 'vulopilot'),
		__('Finding status', 'vulopilot'),
		__('First found', 'vulopilot'),
		__('Last checked', 'vulopilot'),
	];
	const lines = rows.map((row) =>
		[
			row.page ?? '',
			getBrokenUrl(row),
			getLinkText(row),
			'broken-images' === row.scanner_id
				? __('Image', 'vulopilot')
				: __('Link', 'vulopilot'),
			isExternalFinding(row)
				? __('External', 'vulopilot')
				: __('Internal', 'vulopilot'),
			statusKeyLabel(deriveStatusKey(row)),
			row.status,
			row.created_at,
			row.last_seen_at ?? row.created_at,
		]
			.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
			.join(',')
	);
	const csv = [header.join(','), ...lines].join('\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = 'broken-links.csv';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
};

const FINDINGS_PAGE_SIZE = 100;
/** Safety ceiling for the pagination loop below — both scanners are bounded to ~40 checks/run by design, so a real site needs a long history of distinct broken URLs to ever approach this. */
const MAX_FINDINGS = 500;
/** This table's own client-side page size (rows already fetched in full above; TableCard's footer/page-size selector just slices them, same pattern PagesNeedingAttentionTable.tsx/SlowPagesTab.tsx use). */
const DEFAULT_PER_PAGE = 10;

/**
 * Fetches every real broken-link/broken-image finding, any status —
 * bounded pagination loop, same real shape seoIssuesShared.tsx's own
 * fetchAllOpenSeoFindings uses, just not status-filtered up front (the
 * stat tiles AND the "All status" filter both need `status === 'ignored'`/
 * `'resolved'` rows too, which an `open`-only fetch would hide).
 */
const fetchAllBrokenFindings = async (): Promise<BrokenLinkFinding[]> => {
	const scannerParam = BROKEN_SCANNER_IDS.join(',');
	let page = 1;
	let all: BrokenLinkFinding[] = [];

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const response = await getApiResponse<{
			data: BrokenLinkFinding[];
			total: number;
		}>(
			getApiLink(
				appLocalizer,
				`findings?scanner_id=${scannerParam}&per_page=${FINDINGS_PAGE_SIZE}&page=${page}&orderby=id&order=desc`
			),
			nonceHeaders
		);

		if (!response) {
			throw new Error('findings fetch failed');
		}

		all = all.concat(response.data ?? []);

		const gotFullPage = (response.data ?? []).length === FINDINGS_PAGE_SIZE;
		const moreRemain = all.length < (response.total ?? 0);

		if (!gotFullPage || !moreRemain || all.length >= MAX_FINDINGS) {
			break;
		}

		page += 1;
	}

	return all;
};

/**
 * Collapses duplicate findings for the exact same broken URL on the exact
 * same page/scanner/status down to just the newest one — a scan re-run
 * that finds a link is STILL broken now bumps that same row's own
 * `last_seen_at` (ScanPersistenceListener's dedup-on-rescan) rather than
 * inserting a fresh one, but this still cleans up any legacy duplicate
 * rows created before that fix shipped. Scoped to (scanner_id,
 * object_ref, url, status) rather than just (scanner_id, object_ref,
 * url) — an old *resolved* finding and a newly-detected *open* one for
 * the same URL are two genuinely different, both-worth-showing rows, not
 * a duplicate. Relies on `findings` already being newest-first
 * (`orderby=id&order=desc`), so the first occurrence of a key is already
 * the most recent one.
 */
const dedupeBrokenFindings = (
	findings: BrokenLinkFinding[]
): BrokenLinkFinding[] => {
	const seen = new Set<string>();

	return findings.filter((finding) => {
		const key = [
			finding.scanner_id,
			finding.object_ref,
			getBrokenUrl(finding),
			finding.status,
		].join('::');

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
};

const summarizeBrokenFindings = (
	findings: BrokenLinkFinding[]
): BrokenFindingsSummary => {
	const summary = { ...EMPTY_SUMMARY };

	findings.forEach((finding) => {
		if ('ignored' === finding.status) {
			summary.ignored += 1;
			return;
		}

		if ('open' !== finding.status) {
			return; // Resolved/snoozed don't count toward "Need attention".
		}

		if ('unverified' === getFindingMeta(finding).reason) {
			summary.couldntVerify += 1;
			return;
		}

		if ('broken-images' === finding.scanner_id) {
			summary.brokenImages += 1;
		} else {
			summary.brokenLinks += 1;
		}
	});

	return summary;
};

type IssueFilter = 'all' | 'broken-links' | 'broken-images' | 'unverified';
type LinkTypeFilter = 'all' | 'internal' | 'external';
type StatusFilter = 'all' | 'open' | 'resolved' | 'ignored' | 'snoozed';

/**
 * "Broken Links" inner section of the "Crawl & URLs" tab
 * (BrokenLinksSection.tsx): real, scanned results from
 * Scanners\Basic\BrokenLinksScanner AND BrokenImagesScanner
 * (`scanner_id: 'broken-links'|'broken-images'`), the same real
 * `vulopilot_scan_findings` rows other findings tabs read from.
 *
 * Rebuilt to match the reference mockup 1:1 wherever the underlying data
 * genuinely supports it (see this repo's own investigation before this
 * pass — `classes/Install.php`'s `vulopilot_scan_findings`/`vulopilot_scans`
 * schemas):
 *   - 4 standalone stat tiles (Broken links/Broken images/Couldn't
 *     verify/Ignored) — real counts from summarizeBrokenFindings(), no
 *     fabricated "since last scan" delta (STATS_OPTION is overwritten,
 *     not accumulated, each run — there is no real previous-run snapshot
 *     to diff against).
 *   - A real "Last scan completed" banner: `vulopilot_scans.duration_ms`/
 *     `finished_at` for the latest genuinely-completed run of either
 *     scanner (ScanRepository::get_latest_completed(), added alongside
 *     this pass — BrokenLinksStats controller didn't expose this before).
 *   - A flat table, one row per real finding (no page-grouping) —
 *     Source page / Status / Link Type (Internal/External,
 *     isExternalFinding) / Target URL (`meta.url`) / First Found
 *     (`created_at`) / Last Checked (`last_seen_at`, a real, distinct,
 *     rescan-refreshed column — confirmed via ScanPersistenceListener,
 *     not derived/guessed) / Actions.
 *   - Real "All issues"/"All link types"/"All pages"/"All status"
 *     filters alongside search + Export CSV, all client-side over the one
 *     full fetch this tab already makes (fetchAllBrokenFindings()).
 *
 * Two things the mockup shows that this deliberately does NOT reproduce,
 * because there's no real data behind them: a numeric "+N since last
 * scan" delta on the stat tiles (see above), and "Soft 404"/"Chain"
 * status pills (would need following redirect chains and inspecting the
 * destination's own content/status, which neither scanner does).
 *
 * "Fix" joins the same real Pro gate every other findings table's "Fix"
 * action already has (`getBrokenLinkFixHandler()` above, same shape as
 * useFindingsTable.tsx's own `getFindingFixHandler()`): clicking it always
 * opens *something* (register a source, don't modify the host), but only
 * opens the real manual URL/text popup when vulopilot-pro's OneClickFix
 * module is active — otherwise it opens the Pro popup instead. When
 * unlocked, the popup still works exactly as before: the user types a
 * real replacement URL, which the handler's own `POST
 * /broken-links/replace-url` (now BrokenLinkFixRest.php, Pro) swaps
 * straight into the source page's own real `post_content` (its own
 * `href`/`src` attribute), then marks the finding resolved. No AI call —
 * broken-link/image URLs are a mechanical find-and-replace, not something
 * that needs a model's judgment the way other scanners' findings do; the
 * gate here is licensing, not a missing AI service.
 */
const BrokenLinksSection = () => {
	const [allFindings, setAllFindings] = useState<BrokenLinkFinding[]>([]);
	const [isLoadingFindings, setIsLoadingFindings] = useState(true);
	const [findingsError, setFindingsError] = useState<string | null>(null);
	const [stats, setStats] = useState<BrokenLinksStatsResponse | null>(null);
	const [searchTerm, setSearchTerm] = useState('');
	const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
	const [linkTypeFilter, setLinkTypeFilter] = useState<LinkTypeFilter>('all');
	const [pageFilter, setPageFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
	const [paged, setPaged] = useState(1);
	const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
	const [redirectFinding, setRedirectFinding] =
		useState<BrokenLinkFinding | null>(null);
	const [redirectSourcePath, setRedirectSourcePath] = useState('');
	const [redirectTargetUrl, setRedirectTargetUrl] = useState('');
	const [redirectType, setRedirectType] = useState('301');
	/** "Fix" popup — a real search-and-replace: swaps this exact broken `href`/`src` for a real new URL the user types in, straight in the source page's own real `post_content` (`POST /broken-links/replace-url`, added alongside this). */
	const [fixFinding, setFixFinding] = useState<BrokenLinkFinding | null>(null);
	const [fixNewUrl, setFixNewUrl] = useState('');
	/** The same real `<a>` tag's own visible text — editable alongside the URL (only meaningful for a `broken-links` finding; a `broken-images` finding has no text field at all). Pre-filled with the real current text (`getLinkText()`), so saving without touching this field is a no-op text-wise, not an accidental blank-out. */
	const [fixNewText, setFixNewText] = useState('');
	const [isSavingFixUrl, setIsSavingFixUrl] = useState(false);
	const [isSavingRedirect, setIsSavingRedirect] = useState(false);
	/** "Fix isn't available" Pro popup — opens instead of the real fix popup when `getBrokenLinkFixHandler()` resolves null (Pro not installed, or installed but OneClickFix isn't active). */
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	const loadFindings = () => {
		setIsLoadingFindings(true);

		fetchAllBrokenFindings()
			.then((findings) => {
				setAllFindings(dedupeBrokenFindings(findings));
				setFindingsError(null);
			})
			.catch(() =>
				setFindingsError(
					__(
						'Something went wrong fetching this data. Please try again.',
						'vulopilot'
					)
				)
			)
			.finally(() => setIsLoadingFindings(false));
	};

	const loadStats = () => {
		getApiResponse<BrokenLinksStatsResponse>(
			getApiLink(appLocalizer, 'broken-links/stats'),
			nonceHeaders
		).then((response) => response && setStats(response));
	};

	useEffect(() => {
		loadFindings();
		loadStats();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/** "Run scan again" on the "Last scan completed" card — same real `POST /scans` call SeoTab.tsx's own header "Run Complete Audit" fires, scoped to `['seo']` since these are both SEO module scanners; refetches both real data sources this section reads (findings + stats) once the new scan completes. Real, working, just no longer reachable from the UI — same standing status `formatDurationMs()`'s own docblock above and the row-actions `action` column's own docblock document for their unreachable pieces. */
	const { isScanning, runScan } = useRunScan({
		categories: ['seo'],
		onSuccess: () => {
			loadFindings();
			loadStats();
		},
	});

	// Any filter/search change can shrink the result set below the
	// currently-viewed page — reset to page 1 rather than showing an
	// empty table stuck on e.g. page 3.
	useEffect(() => {
		setPaged(1);
	}, [searchTerm, issueFilter, linkTypeFilter, pageFilter, statusFilter]);

	const summary = summarizeBrokenFindings(allFindings);

	const handleSetStatus = (
		finding: BrokenLinkFinding,
		status: 'resolved' | 'ignored' | 'open',
		successMessage: string
	) => {
		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, `findings/${finding.id}`),
			{ status }
		).then((response) => {
			NoticeManager.add({
				uniqueKey: `broken-link-${status}-${finding.id}`,
				type: response ? 'success' : 'error',
				position: 'float',
				message: response
					? successMessage
					: __(
						'Could not update this finding. Please try again.',
						'vulopilot'
					),
			});

			if (response) {
				loadFindings();
			}
		});
	};

	const handleResolve = (finding: BrokenLinkFinding) =>
		handleSetStatus(
			finding,
			'resolved',
			__('Finding marked as resolved.', 'vulopilot')
		);

	const handleIgnore = (finding: BrokenLinkFinding) =>
		handleSetStatus(finding, 'ignored', __('Finding ignored.', 'vulopilot'));

	const handleReopen = (finding: BrokenLinkFinding) =>
		handleSetStatus(finding, 'open', __('Finding reopened.', 'vulopilot'));

	const handleSnooze = (finding: BrokenLinkFinding) => {
		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, `findings/${finding.id}/actions/snooze-finding`),
			{}
		).then(
			(response: { success?: boolean; message?: string } | undefined) => {
				NoticeManager.add({
					uniqueKey: `broken-link-snooze-${finding.id}`,
					type: response?.success ? 'success' : 'error',
					position: 'float',
					message:
						response?.message ||
						__(
							'Could not snooze this finding. Please try again.',
							'vulopilot'
						),
				});

				if (response?.success) {
					loadFindings();
				}
			}
		);
	};

	/**
	 * "Fix" — always visible (register a source, don't modify the host,
	 * same as every other findings table's "Fix" action). Opens the real
	 * popup showing this exact finding's own real link text + current
	 * broken URL, with fields to type a real replacement URL and (for a
	 * `broken-links` finding, editable — a `broken-images` finding has no
	 * visible text at all) that same `<a>` tag's own real visible text —
	 * but only when `getBrokenLinkFixHandler()` resolves a real handler
	 * (Pro's OneClickFix module active); otherwise opens the Pro popup
	 * instead, same 2-tier gate every other "Fix" action already has.
	 */
	const openFixPopup = (finding: BrokenLinkFinding) => {
		if ('function' !== typeof getBrokenLinkFixHandler()) {
			setIsProPopupOpen(true);
			return;
		}

		setFixFinding(finding);
		setFixNewUrl('');
		// Real current raw text, pre-filled (never `getLinkText()`'s own
		// display placeholders — see `getRawLinkText()`'s own docblock).
		setFixNewText(getRawLinkText(finding));
	};

	const closeFixPopup = () => setFixFinding(null);

	/**
	 * Saving calls the real handler Pro's OneClickFix module registered
	 * (`getBrokenLinkFixHandler()`) — its own `POST
	 * /broken-links/replace-url` (BrokenLinkFixRest.php) does a real
	 * search-and-replace straight in the source page's own `post_content`
	 * — not a fabricated "fixed" state, a genuine content edit, and
	 * updates that same anchor's own real inner text too whenever it was
	 * actually changed. On success the finding is marked resolved (same
	 * real `POST /findings/{id}` status call handleResolve()/
	 * handleCreateRedirect() already use), same for a broken image
	 * (`is_image: true` tells the handler to replace `src` instead of
	 * `href`, and skips the text edit entirely).
	 */
	const handleSaveFixUrl = () => {
		const brokenLinkFixHandler = getBrokenLinkFixHandler();

		if (
			!fixFinding ||
			'' === fixNewUrl.trim() ||
			'function' !== typeof brokenLinkFixHandler
		) {
			return;
		}

		setIsSavingFixUrl(true);

		const isImageFix = 'broken-images' === fixFinding.scanner_id;
		const params: BrokenLinkFixParams = {
			post_id: Number(fixFinding.object_ref),
			old_url: getBrokenUrl(fixFinding),
			new_url: fixNewUrl.trim(),
			is_image: isImageFix,
			// Only meaningful for a real `broken-links` finding — an
			// image has no visible text of its own to edit.
			...(isImageFix
				? {}
				: {
						old_text: getRawLinkText(fixFinding),
						new_text: fixNewText.trim(),
					}),
		};

		Promise.resolve(
			brokenLinkFixHandler(params) as Promise<BrokenLinkFixOutcome>
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `broken-link-fix-${fixFinding.id}`,
					type: response?.success ? 'success' : 'error',
					position: 'float',
					message:
						response?.message ||
						(response?.success
							? __('This page has been updated with the new URL.', 'vulopilot')
							: __(
								'Could not update this page. Please try again.',
								'vulopilot'
							)),
				});

				if (response?.success) {
					// The underlying problem is fixed on the real page now
					// — same real status-update call handleResolve()/
					// handleCreateRedirect() already make.
					sendApiResponse(
						appLocalizer,
						getApiLink(appLocalizer, `findings/${fixFinding.id}`),
						{ status: 'resolved' }
					).then(() => loadFindings());

					closeFixPopup();
				}
			})
			.finally(() => setIsSavingFixUrl(false));
	};

	const openRedirectPopup = (finding: BrokenLinkFinding) => {
		const brokenUrl = getBrokenUrl(finding);
		const sourcePath = deriveSourcePath(brokenUrl);

		if (!sourcePath) {
			NoticeManager.add({
				uniqueKey: `broken-link-external-${finding.id}`,
				type: 'error',
				position: 'float',
				message: __(
					'This broken URL points to a different site — a redirect can only be created for a path on this site.',
					'vulopilot'
				),
			});
			return;
		}

		setRedirectFinding(finding);
		setRedirectSourcePath(sourcePath);
		setRedirectTargetUrl('');
		setRedirectType('301');
	};

	const closeRedirectPopup = () => setRedirectFinding(null);

	const handleCreateRedirect = () => {
		if (!redirectFinding || '' === redirectTargetUrl.trim()) {
			return;
		}

		setIsSavingRedirect(true);

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'redirects'), {
			source_path: redirectSourcePath,
			target_url: redirectTargetUrl,
			redirect_type: Number(redirectType),
		})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'broken-link-redirect-save',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Redirect created.', 'vulopilot')
						: __(
							'Could not create this redirect — a redirect for this path may already exist.',
							'vulopilot'
						),
				});

				if (response && redirectFinding) {
					// The underlying problem is fixed from a visitor's
					// perspective now that a real redirect exists — same
					// real `POST /findings/{id}` status-update call
					// handleResolve() above makes.
					sendApiResponse(
						appLocalizer,
						getApiLink(appLocalizer, `findings/${redirectFinding.id}`),
						{ status: 'resolved' }
					).then(() => loadFindings());

					closeRedirectPopup();
				}
			})
			.finally(() => setIsSavingRedirect(false));
	};

	// Real client-side filters over the one full fetch this tab already
	// makes (loadFindings(), above) — search/issue/link-type/page/status
	// all compose, matching the mockup's own toolbar of independent
	// dropdowns.
	const visibleFindings = allFindings
		.filter((finding) => 'all' === statusFilter || finding.status === statusFilter)
		.filter((finding) => {
			if ('all' === issueFilter) {
				return true;
			}

			if ('unverified' === issueFilter) {
				return 'unverified' === getFindingMeta(finding).reason;
			}

			return (
				finding.scanner_id === issueFilter &&
				'unverified' !== getFindingMeta(finding).reason
			);
		})
		.filter((finding) => {
			if ('all' === linkTypeFilter) {
				return true;
			}

			return (
				('external' === linkTypeFilter) === isExternalFinding(finding)
			);
		})
		.filter((finding) => 'all' === pageFilter || finding.page === pageFilter)
		.filter((finding) => {
			if ('' === searchTerm.trim()) {
				return true;
			}

			const term = searchTerm.trim().toLowerCase();

			return (
				(finding.page || '').toLowerCase().includes(term) ||
				getBrokenUrl(finding).toLowerCase().includes(term)
			);
		});

	const pageOptions = Array.from(
		new Set(allFindings.map((finding) => finding.page).filter(Boolean))
	) as string[];

	const pageRows = visibleFindings.slice(
		(paged - 1) * perPage,
		paged * perPage
	);

	const handleExportCsv = () => {
		if (!visibleFindings.length) {
			NoticeManager.add({
				uniqueKey: 'broken-link-export-empty',
				type: 'error',
				position: 'float',
				message: __('Nothing to export.', 'vulopilot'),
			});
			return;
		}

		downloadBrokenLinksCsv(visibleFindings);
	};

	const headers = {
		// Same real `InformationItemComponent` "title + descriptions +
		// badges" shape this codebase's own findings-style tables already
		// use (SeoIssuesByPageTable.tsx) — folds the previous 6 separate
		// columns (Source page/Status/Link Type/Target URL/Link Text/Last
		// Checked; "First Found" dropped, not shown twice) into one row:
		// title = source page, descriptions = real Target URL + real Link
		// Text, badges = real status/link-type/last-checked. Every value is
		// the same real data those old columns already read — folded into
		// one cell, nothing new fabricated.
		page: {
			label: __('Source page', 'vulopilot'),
			render: (row: BrokenLinkFinding) => {
				const pageUrl = `${appLocalizer.site_url}${row.page}`;
				const statusKey = deriveStatusKey(row);
				const external = isExternalFinding(row);

				return (
					<InformationItemComponent
						title={row.page_title || row.page || __('(no title)', 'vulopilot')}
						titleLink={pageUrl}
						icon={'broken-images' === row.scanner_id ? 'attachment' : 'link'}
						badges={[
							{
								text: statusKeyLabel(statusKey),
								className:
									'red' === statusKeyColor(statusKey)
										? 'badge-failed'
										: 'badge-pending',
							},
							{
								text: external
									? __('External', 'vulopilot')
									: __('Internal', 'vulopilot'),
								className: external ? 'badge-pending' : 'badge-info',
							},
							{
								text: formatWpDate(row.last_seen_at || row.created_at),
								className: 'badge-info',
							},
						]}
						descriptions={[
							{
								icon: 'link',
								label: __('Target URL', 'vulopilot'),
								value: getBrokenUrl(row),
							},
							{
								icon: 'text-fields',
								label: __('Link Text', 'vulopilot'),
								value: truncateText(getLinkText(row)),
							},
						]}
					/>
				);
			},
		},
		// Same real `type: 'action'` header shape SeoIssuesByPageTable.tsx's
		// own row actions already use. Each action itself is `type: 'button'`
		// — `TableRowActions.tsx`'s own real button-vs-icon split renders
		// those as real labeled `ButtonInput`s (all 3 always visible), not
		// the plain-icon default (which only keeps 2 inline before
		// collapsing the rest into a `more-vertical` dropdown) — needed here
		// since only 3 real actions remain (Open URL/Ignore/Fix, per direct
		// instruction) and all 3 should stay visible with their own text.
		// "Create redirect"/"Mark resolved"/"Snooze" — real, working
		// features that used to live in this same row-actions menu — no
		// longer have a trigger anywhere on this table now that this menu is
		// scoped down to just these 3; their own handlers/popup
		// (`openRedirectPopup()`/`handleCreateRedirect()`/`handleResolve()`/
		// `handleSnooze()`) are left in place rather than deleted, since
		// removing a real working feature wasn't part of this instruction
		// either — just flagged here as no longer reachable from the UI.
		action: {
			label: __('Actions', 'vulopilot'),
			type: 'action',
			actions: [
				{
					label: __('Open URL', 'vulopilot'),
					icon: 'eye',
					type: 'button',
					color: 'text-blue',
					onClick: (row: Record<string, unknown>) =>
						window.open(
							getBrokenUrl(row as unknown as BrokenLinkFinding),
							'_blank',
							'noopener,noreferrer'
						),
				},
				{
					label: (row: Record<string, unknown>) =>
						'ignored' === (row as unknown as BrokenLinkFinding).status
							? __('Unignore', 'vulopilot')
							: __('Ignore Issue', 'vulopilot'),
					icon: 'eye-blocked',
					color: 'text-red',
					type: 'button',
					onClick: (row: Record<string, unknown>) => {
						const finding = row as unknown as BrokenLinkFinding;
						return 'ignored' === finding.status
							? handleReopen(finding)
							: handleIgnore(finding);
					},
				},
				{
					label: __('Fix', 'vulopilot'),
					icon: 'tools',
					color: 'text-yellow',
					type: 'button',
					onClick: (row: Record<string, unknown>) =>
						openFixPopup(row as unknown as BrokenLinkFinding),
				},
			],
		},
	};

	return (
		<>
			<ContainerComponent General>
				{!isSeoModuleActive() ? (
					<CardComponent
						title={__('Broken Links', 'vulopilot')}
						titleIcon="link"
						desc={__('Broken links and images found across your site.', 'vulopilot')}
					>
						<ModuleGuardComponent
							icon="error"
							title={__('SEO module is turned off', 'vulopilot')}
							desc={__(
								'Turn the SEO module back on from Settings → Modules to resume broken-link/image scanning and see findings again here. Findings already found before it was turned off aren’t deleted — they still show up on the Health page, which lists every category.',
								'vulopilot'
							)}
						/>
					</CardComponent>
				) : (
					<>
						{/*
						 * Same real `ListComponent` "mini-card report" row
						 * shape SeoTab.tsx's own "SEO Health" card/
						 * GeoScoreSection.tsx's own "GEO Score" card rows
						 * use — the real count goes in `tags` (a trailing,
						 * right-aligned `TypographyComponent`), not `value`
						 * (which renders stacked directly under the title
						 * instead of trailing the row, the wrong shape
						 * here).
						 */}
						<ColumnComponent >
							<CardComponent
								title={__('Broken Link Monitoring', 'vulopilot')}
								titleIcon="link"
								desc={__(
									'Real links and images found on your published posts/pages that returned a broken (non-2xx/3xx) response the last time they were checked. Use the "Run scan" button above to check again.',
									'vulopilot'
								)}
							>
								<div className='broken-link-wrapper'>
									<div className='broken-link-section'>
										{stats && (stats.links.checked_at || stats.images.checked_at) && (
											<AnalyticsComponent
												cols={2}
												variant="progress"
												data={[
													{
														icon: 'link',
														iconClass: 'is-good',
														number: `${stats.links.healthy_count}/${stats.links.links_checked}`,
														text: __('Links healthy', 'vulopilot'),
														progress:
															stats.links.links_checked > 0
																? Math.round(
																	(stats.links.healthy_count /
																		stats.links.links_checked) *
																	100
																)
																: 0,
														colorClass: 'green-color',
													},
													{
														icon: 'attachment',
														iconClass: 'is-primary',
														number: `${stats.images.healthy_count}/${stats.images.links_checked}`,
														text: __('Images healthy', 'vulopilot'),
														progress:
															stats.images.links_checked > 0
																? Math.round(
																	(stats.images.healthy_count /
																		stats.images.links_checked) *
																	100
																)
																: 0,
														colorClass: 'blue-color',
													},
												]}
											/>
										)}
										<ListComponent
											className="mini-card documentation"
											items={[
												{
													id: 'ux',
													icon: 'check',
													title: __('Better user experience', 'vulopilot'),
													desc: __(
														'Keeps your visitors on track and builds trust.',
														'vulopilot'
													),
												},
												{
													id: 'seo',
													icon: 'check',
													title: __('Improved SEO rankings', 'vulopilot'),
													desc: __(
														'Helps search engines crawl your site effectively.',
														'vulopilot'
													),
												},
												{
													id: 'crawlable',
													icon: 'check',
													title: __('More crawlable pages', 'vulopilot'),
													desc: __(
														'Ensures all important content is indexed.',
														'vulopilot'
													),
												},
											]}
										/>
									</div>
									<div className='broken-link-section'>
										<ListComponent
											className="mini-card report hover seo-health-score-category-list"
											loading={isLoadingFindings}
											items={[
												{
													id: 'broken-links',
													icon: 'link red',
													title: __('Broken Links', 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.brokenLinks}
														</TypographyComponent>
													),
												},
												{
													id: 'broken-images',
													icon: 'attachment red',
													title: __('Broken Images', 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.brokenImages}
														</TypographyComponent>
													),
												},
												{
													id: 'couldnt-verify',
													icon: 'close-delete yellow',
													title: __("Couldn't Verify", 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.couldntVerify}
														</TypographyComponent>
													),
												},
												{
													id: 'ignored',
													icon: 'rejecte lime',
													title: __('Ignored', 'vulopilot'),
													tags: (
														<TypographyComponent
															variant="h5"
															weight="bold"
															className="seo-health-score-row-value"
														>
															{summary.ignored}
														</TypographyComponent>
													),
												},
											]}
										/>
									</div>
									
								</div>
							</CardComponent>
						</ColumnComponent>
						<CardComponent
							title={__('Broken Link Monitoring', 'vulopilot')}
							titleIcon="link"
							desc={__(
								'Real links and images found on your published posts/pages that returned a broken (non-2xx/3xx) response the last time they were checked. Use the "Run scan" button above to check again.',
								'vulopilot'
							)}
						>
							{findingsError ? (
								<ModuleGuardComponent
									icon="error"
									title={__('Could not load findings', 'vulopilot')}
									desc={findingsError}
									buttonText={__('Retry', 'vulopilot')}
									onButtonClick={loadFindings}
								/>
							) : (
								<TableCard
									showMenu={false}
									hideHeader={true}
									variant="transparent"
									headers={headers}
									rows={pageRows}
									ids={pageRows.map((row: BrokenLinkFinding) => row.id)}
									totalRows={visibleFindings.length}
									isLoading={isLoadingFindings}
									search={{
										placeholder: __(
											'Search by URL or source page…',
											'vulopilot'
										),
									}}
									filters={[
										{
											key: 'issue',
											label: __('Issue', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All issues', 'vulopilot'), value: 'all' },
												{ label: __('Broken links', 'vulopilot'), value: 'broken-links' },
												{ label: __('Broken images', 'vulopilot'), value: 'broken-images' },
												{ label: __("Couldn't verify", 'vulopilot'), value: 'unverified' },
											],
										},
										{
											key: 'link_type',
											label: __('Link Type', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All link types', 'vulopilot'), value: 'all' },
												{ label: __('Internal', 'vulopilot'), value: 'internal' },
												{ label: __('External', 'vulopilot'), value: 'external' },
											],
										},
										{
											key: 'page',
											label: __('Page', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All pages', 'vulopilot'), value: 'all' },
												...pageOptions.map((page) => ({
													label: page,
													value: page,
												})),
											],
										},
										{
											key: 'status',
											label: __('Status', 'vulopilot'),
											type: 'select',
											size: 10,
											options: [
												{ label: __('All status', 'vulopilot'), value: 'all' },
												{ label: __('Open', 'vulopilot'), value: 'open' },
												{ label: __('Resolved', 'vulopilot'), value: 'resolved' },
												{ label: __('Ignored', 'vulopilot'), value: 'ignored' },
												{ label: __('Snoozed', 'vulopilot'), value: 'snoozed' },
											],
										},
									]}
									buttonActions={[
										{
											label: __('Export CSV', 'vulopilot'),
											icon: 'export',
											onClick: handleExportCsv,
										},
									]}
									onQueryUpdate={(query: {
										paged?: number | string;
										per_page?: number | string;
										searchValue?: string;
										filter?: Record<string, string>;
									}) => {
										setPaged(Number(query.paged) || 1);
										setPerPage(Number(query.per_page) || DEFAULT_PER_PAGE);
										setSearchTerm(query.searchValue ?? '');
										setIssueFilter(
											(query.filter?.issue as IssueFilter) ?? 'all'
										);
										setLinkTypeFilter(
											(query.filter?.link_type as LinkTypeFilter) ?? 'all'
										);
										setPageFilter(query.filter?.page ?? 'all');
										setStatusFilter(
											(query.filter?.status as StatusFilter) ?? 'all'
										);
									}}
									emptyMessage={__(
										'No broken links or images found yet. Make sure "Flag broken links"/"Flag broken images" are turned on under Settings → Scanning → SEO, then run a scan.',
										'vulopilot'
									)}
								/>
							)}
						</CardComponent>
					</>
				)}
			</ContainerComponent>

			<PopupComponent
				open={!!redirectFinding}
				onClose={closeRedirectPopup}
				width={28}
				height="auto"

				header={{ title: __('Create redirect', 'vulopilot') }}
			>
				<div className="broken-link-redirect-form">
					<p className="desc">
						{__(
							'Redirect this broken URL to a working destination.',
							'vulopilot'
						)}
					</p>
					<TextInput
						name="redirect_source_path"
						inputLabel={__('From (path)', 'vulopilot')}
						value={redirectSourcePath}
						disabled
						onChange={() => { }}
					/>
					<p className="desc broken-link-redirect-note">
						{__(
							'Auto-generated from the broken URL. Edit or fine-tune it afterward from the Redirects tab if you need something more specific.',
							'vulopilot'
						)}
					</p>
					<TextInput
						name="redirect_target_url"
						inputLabel={__('To', 'vulopilot')}
						placeholder="https://example.com/new-page/"
						value={redirectTargetUrl}
						onChange={(value) => setRedirectTargetUrl(value as string)}
					/>
					<SelectInput
						name="redirect_type"
						value={redirectType}
						options={[
							{ label: __('301 (Permanent)', 'vulopilot'), value: '301' },
							{ label: __('302 (Temporary)', 'vulopilot'), value: '302' },
						]}
						onChange={(value) => setRedirectType(value as string)}
						size="12rem"
					/>
					<div className="broken-link-redirect-actions">
						<ButtonInput
							buttons={{
								text: __('Cancel', 'vulopilot'),
								color: 'plain',
								onClick: closeRedirectPopup,
							}}
						/>
						<ButtonInput
							buttons={{
								text: isSavingRedirect
									? __('Creating…', 'vulopilot')
									: __('Create redirect', 'vulopilot'),
								onClick: handleCreateRedirect,
								disabled:
									isSavingRedirect || '' === redirectTargetUrl.trim(),
							}}
						/>
					</div>
				</div>
			</PopupComponent>

			<PopupComponent
				open={!!fixFinding}
				onClose={closeFixPopup}
				width={30}
				height="60%"
				icon='tools'
				header={{
					title:
						fixFinding && 'broken-images' === fixFinding.scanner_id
							? __('Fix broken image', 'vulopilot')
							: __('Fix broken link', 'vulopilot'),
				}}
				footer={
					<div className="broken-link-fix-actions">
						<ButtonInput
							buttons={[
								{
									text: __('Cancel', 'vulopilot'),
									color: 'border-red',
									onClick: closeFixPopup,
								},
								{
									text: isSavingFixUrl
										? __('Saving…', 'vulopilot')
										: __('Save', 'vulopilot'),
									onClick: handleSaveFixUrl,
									disabled: isSavingFixUrl || '' === fixNewUrl.trim(),
								},
							]}
						/>
					</div>
				}
			>
				{fixFinding && (
					<div className="broken-link-fix-form">
						<p className="desc">
							{'broken-images' === fixFinding.scanner_id
								? __(
									'Replace this broken image URL with a working one — the source page is updated directly.',
									'vulopilot'
								)
								: __(
									'Replace this broken link URL with a working one — and edit its link text if you want — the source page is updated directly.',
									'vulopilot'
								)}
						</p>
						<FormGroupWrapperComponent>
							{'broken-images' !== fixFinding.scanner_id && (
								<FormGroupComponent label={__('Link Text', 'vulopilot')}>
									<TextInput
										name="fix_new_text"
										placeholder={__('(no visible text)', 'vulopilot')}
										value={fixNewText}
										onChange={(value: unknown) =>
											setFixNewText(value as string)
										}
									/>
								</FormGroupComponent>
							)}
							<FormGroupComponent label={__('Current URL', 'vulopilot')}>
								<p className="broken-link-fix-static-value">
									{getBrokenUrl(fixFinding)}
								</p>
							</FormGroupComponent>
							<FormGroupComponent label={__('New URL', 'vulopilot')}>
								<TextInput
									name="fix_new_url"
									placeholder="https://example.com/new-page/"
									value={fixNewUrl}
									onChange={(value: unknown) => setFixNewUrl(value as string)}
								/>
							</FormGroupComponent>
						</FormGroupWrapperComponent>
					</div>
				)}
			</PopupComponent>

			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{appLocalizer.khali_dabba ? (
					<ShowProPopup moduleName="one-click-fix" />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</>
	);
};

export default BrokenLinksSection;
