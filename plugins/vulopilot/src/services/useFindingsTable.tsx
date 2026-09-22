/* global appLocalizer */
import { useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { NoticeManager } from '@zyra/components';
import type { TableCardProps, TableRow } from '@zyra/table';
import { useApiList } from './useApiList';
import { formatWpDate } from './formatWpDate';
import { getSeverityColor } from './getSeverityClass';

/** Categories whose conventional written form isn't plain title-case. */
const CATEGORY_ACRONYMS: Record<string, string> = {
	ssl: 'SSL',
	seo: 'SEO',
	geo: 'GEO',
	aeo: 'AEO',
	wordpress: 'WordPress',
};

/**
 * `Finding.category` is the raw scanner category string ('security',
 * 'wordpress', 'ssl', …) — this turns it into the same kind of short
 * label the mockup's per-row category tag shows ('WordPress', 'SSL'); no
 * category string in this codebase is more than one hyphenated word.
 * Exported so other per-row category tags (e.g. Reports'
 * NextPrioritiesList.tsx) can reuse the identical humanization instead of
 * a second copy.
 */
export const humanizeCategory = (category: string): string =>
	category
		.split('-')
		.map(
			(word) =>
				CATEGORY_ACRONYMS[word] ||
				word.charAt(0).toUpperCase() + word.slice(1)
		)
		.join(' ');

export interface Finding extends TableRow {
	id: number;
	title: string;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	category: string;
	status: 'open' | 'resolved' | 'ignored' | 'snoozed';
	created_at: string;
	/**
	 * The scanner's own longer explanation of the finding (Finding::
	 * get_description() server-side) — already returned by GET /findings
	 * (FindingRepository's `SELECT *`), just not previously surfaced in the
	 * UI. `layout="compact"` shows this as the row's description line when
	 * present, falling back to the `page`/`created_at` line below when a
	 * finding has none.
	 */
	description?: string;
	/**
	 * Resolved page path (e.g. '/pricing') for a per-post finding, or
	 * 'Site-wide' for a sitewide check — added server-side by
	 * Controllers/Findings.php's `add_page_field()` from the row's raw
	 * `object_type`/`object_ref` columns. Only used by `layout="compact"`'s
	 * name-column description line.
	 */
	page?: string;
	/**
	 * The real post's own title (`get_the_title()`), added alongside
	 * `page` by the same `add_page_field()` — `null` when this finding
	 * has no real post behind it (a sitewide check, or an external/raw
	 * URL object_ref), never a fabricated title. Callers that want a
	 * human-readable page name instead of the raw path (e.g.
	 * BrokenLinksSection.tsx's own "Source page" column) fall back to
	 * `page` itself when this is null.
	 */
	page_title?: string | null;
	/**
	 * Which AI action can fix this finding, e.g. 'generate-alt' — null/
	 * undefined when this finding's scanner has no mapped fix, or when
	 * vulopilot-pro's OneClickFix module isn't active (in which case this
	 * field is never added to the response at all). Read by the fix
	 * handler getFindingFixHandler() below reads — see its own docblock.
	 * See VuloPilotPro\OneClickFix\ScannerFixMap.
	 */
	fix_action_id?: string | null;
}

/**
 * What a registered fix handler resolves to — Free displays this itself
 * (see getFindingFixHandler's own docblock for why the handler can't just
 * show its own notice) rather than caring what actually happened.
 */
interface FixOutcome {
	success: boolean;
	message: string;
}

/**
 * The "Fix" row action's actual behavior — registered by vulopilot-pro's
 * OneClickFix module (modules/OneClickFix/src/index.tsx) via this filter,
 * replacing the `null` default with a function that calls
 * `POST /findings/{id}/fix` and resolves what happened. Free never contains
 * that REST call or any AI-action-to-scanner mapping itself: the "Fix"
 * action below is always visible (register a source, don't modify the
 * host — same pattern as vulopilot_woocommerce_ai_panel/
 * vulopilot_pro_dashboard_component), but its onClick only ever does one of
 * two things — call this handler, or open the Pro popup when it's null
 * (Pro not installed/active, or Pro's OneClickFix module specifically
 * isn't enabled — this module's own JS entry is itself gated on
 * appLocalizer.active_modules, so a null handler covers both cases without
 * Free needing to know which).
 *
 * The handler resolves a { success, message } outcome rather than showing
 * its own notice: @multivendorx/zyra isn't in webpack's `externals` (only
 * react/react-dom/@wordpress/* are — tools/webpack/create-config.js), so
 * it's bundled separately per plugin. Free's and Pro's NoticeManager are
 * two different in-memory singletons — a notice added from Pro's bundle is
 * invisible to the NoticeReceiverComponent Free's own HeaderComponent
 * mounted from Free's bundle. Free's onClick below shows the notice itself
 * using ITS OWN NoticeManager, which the receiver actually subscribes to.
 *
 * Read fresh on every click rather than cached in a module-level constant:
 * Pro's own script (vulopilot-pro-admin-script) is a separate, later
 * <script> tag that depends on this one (it reads the `appLocalizer` global
 * this script localizes), so it hasn't registered its addFilter() callback
 * yet at the moment this module first evaluates — caching the result here
 * would permanently capture `null` and always show the popup, active
 * module or not. By click time both scripts have long finished running.
 *
 * Exported (this was module-private until BrokenLinksTab.tsx's own
 * page-grouped table needed the exact same Pro-gated "Fix" behavior on its
 * expanded finding sub-rows without pulling in this whole hook — that
 * table builds its own grouped `rows`/`headers` rather than rendering
 * `tableCardProps` directly, so it can't just read the bound handler off
 * `tableCardProps.headers.actions.actions` the way every flat
 * findings-table caller does).
 */
export const getFindingFixHandler = () =>
	applyFilters('vulopilot_finding_fix_handler', null);

/**
 * "Bulk Fixes" (AI-VISIBILITY-MODULE.md) — same registration pattern as
 * getFindingFixHandler() above, one level up: vulopilot-pro's OneClickFix
 * module replaces this `null` default with a function that calls
 * `POST /findings/bulk-fix` for a whole selected batch at once and
 * resolves a summary outcome, rather than Free looping the single-row
 * handler itself (a real batch REST call, not N sequential requests).
 *
 * @return unknown A function(ids: number[]): Promise<FixOutcome>, or null when Pro's OneClickFix isn't active.
 */
const getFindingBulkFixHandler = () =>
	applyFilters('vulopilot_finding_bulk_fix_handler', null);

export interface UseFindingsTableProps {
	/** Restricts the list to one finding category (e.g. 'seo', 'geo', 'woocommerce'). Omit to show every category (Health). */
	category?: string;
	/**
	 * Further restricts the list to a specific set of scanner ids within
	 * `category` — what SEO.tsx's per-section tables (e.g. "Titles & meta"
	 * vs. "Images") use to split one category's findings into several
	 * independent tables without duplicating this hook's fetch/filter/
	 * bulk-action/fix-action wiring per section. Omit to show every scanner
	 * in `category` (every other page's single-table usage).
	 */
	scannerIds?: string[];
	/**
	 * 'compact' renders each row as a single InformationItemComponent
	 * (title + "$page · Detected $date" description line, same shape as
	 * zyra's own TableCard "Transparent" story) with inline admin-badge
	 * row actions, instead of the default multi-column table — GEO.tsx's
	 * per-section tables opt into this; every other page keeps the default.
	 */
	layout?: 'default' | 'compact';
	/** Empty-state message — shown by TableCard's own `emptyMessage` when there's nothing to list. */
	description?: string;
	/**
	 * Which categorical dimension drives the pill bar above the table —
	 * `'status'` (Open/Resolved/Ignored/Snoozed, every existing caller's
	 * default) or `'priority'` (Critical/Important/Minor, the "Schema &
	 * Knowledge" tab's Issues section — see Findings.php's own
	 * `priority`/`priority_counts` handling). Real severity values
	 * underneath either way (`high`/`medium`/`low`) — only the pill
	 * labels and which REST param they drive change.
	 */
	pillDimension?: 'status' | 'priority';
}

export interface UseFindingsTableResult {
	/**
	 * Spread straight onto Zyra's `<TableCard />` — every prop this hook
	 * derives from `/findings` plus the row actions/bulk actions/filters.
	 * Omits `title`: `hideHeader: true` below means TableCard never
	 * renders its own header/title bar, and the original FindingsTable
	 * component never actually passed one through either — each caller's
	 * own surrounding CardComponent/NavigatorHeaderComponent already
	 * supplies the visible title.
	 */
	tableCardProps: Omit<TableCardProps, 'title'>;
	/** Real fetch error (`useApiList`'s own) — render an error state (e.g. ModuleGuardComponent) instead of `<TableCard />` when set, same as FindingsTable.tsx used to. */
	error: string | null;
	/** Retry the fetch — wire to the error state's own retry action. */
	refetch: () => void;
	/** Whether the "OneClickFix isn't active" Pro popup should be open — render `<PopupComponent open={isProPopupOpen} onClose={closeProPopup}>` alongside `<TableCard />`. */
	isProPopupOpen: boolean;
	closeProPopup: () => void;
}

/**
 * Shared findings-list logic — the Health, SEO, GEO, and WooCommerce pages
 * are all "vulopilot_scan_findings filtered to a category" (DATABASE.md),
 * so this one hook serves all of them rather than duplicating the same
 * table/filter/state wiring per page. Each caller renders the real
 * `<TableCard />` (and a `<PopupComponent>` for `isProPopupOpen`) itself —
 * this hook owns no JSX beyond each row's own `render()` cell content,
 * matching TableCard's own `headers[key].render` contract. Replaces the
 * former `FindingsTable` component (removed) — callers used to render
 * `<FindingsTable {...props} />` and get TableCard for free internally;
 * now they call this hook and render `<TableCard {...tableCardProps} />`
 * themselves, so `<TableCard />` is the one real table implementation
 * everywhere, not a component wrapping it a second time.
 */
export const useFindingsTable = ({
	category,
	scannerIds,
	layout = 'default',
	description,
	pillDimension = 'status',
}: UseFindingsTableProps): UseFindingsTableResult => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	/** Every finding status, in display order — reused for both the status-count pill bar and (previously) the status dropdown filter it now replaces. */
	const statusOptions = [
		{ label: __('Open', 'vulopilot'), value: 'open' },
		{ label: __('Resolved', 'vulopilot'), value: 'resolved' },
		{ label: __('Ignored', 'vulopilot'), value: 'ignored' },
		{ label: __('Snoozed', 'vulopilot'), value: 'snoozed' },
	];

	/**
	 * Critical/Important/Minor — a display-only relabeling of the same
	 * real `high`/`medium`/`low` priority buckets `get_finding_groups()`'s
	 * own stat tiles already use elsewhere; the underlying `severity`
	 * column/value object is untouched (Findings.php's own
	 * `PRIORITY_SEVERITY_LABELS`).
	 */
	const priorityOptions = [
		{ label: __('Critical', 'vulopilot'), value: 'high' },
		{ label: __('Important', 'vulopilot'), value: 'medium' },
		{ label: __('Minor', 'vulopilot'), value: 'low' },
	];

	const pillConfig =
		'priority' === pillDimension
			? { key: 'priority', options: priorityOptions }
			: { key: 'status', options: statusOptions };

	const {
		data,
		total,
		categoryCounts,
		isLoading,
		error,
		refetch,
		onQueryUpdate,
	} = useApiList<Finding>(
		'findings',
		{
			category,
			// Comma-joined, not an array — useApiList's params are plain
			// string|number values (see its own JSDoc); Findings::get_items()
			// on the backend splits this back into a scanner_id list
			// (see parse_scanner_ids()).
			scanner_id: scannerIds?.length ? scannerIds.join(',') : undefined,
		},
		pillConfig
	);

	/**
	 * Whether the user currently has a search term typed in — tracked so
	 * the `search` box below can hide itself when there's nothing to
	 * search (`total === 0`), without also hiding it out from under
	 * someone whose own search just happens to match nothing: `total`
	 * reflects the *current* (possibly search-filtered) result count, not
	 * "has this table ever had any rows," so gating on `total === 0` alone
	 * would make the box vanish mid-search with no way left to clear it.
	 */
	const [hasSearchTerm, setHasSearchTerm] = useState(false);

	const handleQueryUpdate: typeof onQueryUpdate = (query) => {
		setHasSearchTerm(Boolean(query.searchValue));
		onQueryUpdate(query);
	};

	const handleSetStatus = (
		row: Record<string, unknown> | undefined,
		status: 'resolved' | 'ignored' | 'open',
		successMessage: string
	) => {
		if (!row) {
			return;
		}

		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, `findings/${row.id}`),
			{ status }
		).then((response) => {
			if (response) {
				NoticeManager.add({
					uniqueKey: `finding-${status}-${row.id}`,
					type: 'success',
					position: 'float',
					message: successMessage,
				});
				refetch();
			} else {
				NoticeManager.add({
					uniqueKey: `finding-${status}-failed-${row.id}`,
					type: 'error',
					position: 'float',
					message: __(
						'Could not update this finding. Please try again.',
						'vulopilot'
					),
				});
			}
		});
	};

	const handleResolve = (row?: Record<string, unknown>) =>
		handleSetStatus(
			row,
			'resolved',
			__('Finding marked as resolved.', 'vulopilot')
		);

	const handleIgnore = (row?: Record<string, unknown>) =>
		handleSetStatus(row, 'ignored', __('Finding ignored.', 'vulopilot'));

	const handleReopen = (row?: Record<string, unknown>) =>
		handleSetStatus(row, 'open', __('Finding reopened.', 'vulopilot'));

	/**
	 * "Manual Actions Only" (readme.txt) — goes through the
	 * Automation\ActionRegistry/ManualActionRunner abstraction
	 * (`POST /findings/{id}/actions/snooze-finding`) rather than a plain
	 * `PATCH /findings/{id} {status: 'snoozed'}`, unlike handleResolve/
	 * handleIgnore/handleReopen above — those predate this feature and set
	 * status directly; this is Free's one built-in manual action.
	 */
	const handleSnooze = (row?: Record<string, unknown>) => {
		if (!row) {
			return;
		}

		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, `findings/${row.id}/actions/snooze-finding`),
			{}
		).then((response: { success?: boolean; message?: string } | undefined) => {
			NoticeManager.add({
				uniqueKey: `finding-snooze-${row.id}`,
				type: response?.success ? 'success' : 'error',
				position: 'float',
				message:
					response?.message ||
					__('Could not snooze this finding. Please try again.', 'vulopilot'),
			});

			if (response?.success) {
				refetch();
			}
		});
	};

	/**
	 * "Fix" — always visible (register a source, don't modify the host —
	 * see getFindingFixHandler's own docblock above); shared by both the
	 * default table's row action and compact layout's inline badge.
	 */
	const handleFix = (row?: Record<string, unknown>) => {
		const findingFixHandler = getFindingFixHandler();

		if (typeof findingFixHandler === 'function') {
			Promise.resolve(
				findingFixHandler(row) as Promise<FixOutcome> | undefined
			).then((outcome) => {
				if (outcome?.message) {
					NoticeManager.add({
						uniqueKey: `finding-fix-${row?.id}`,
						type: outcome.success ? 'success' : 'error',
						position: 'float',
						message: outcome.message,
					});
				}

				refetch();
			});
			return;
		}

		setIsProPopupOpen(true);
	};

	const defaultHeaders: Record<string, any> = {
		title: {
			key: 'title',
			type: 'info',
			label: __('Finding', 'vulopilot'),
			iconKey: 'defaultTitleIcon',
			descriptionKey: 'descriptionText',
			badgesKey: 'defaultTitleBadges',
			width: '75%',
		},
		actions: {
			label: __('Actions', 'vulopilot'),
			type: 'action',
			actions: [
				{
					label: (row?: Record<string, unknown>) =>
						row?.status === 'open'
							? __('Mark as Fixed', 'vulopilot')
							: __('Fixed', 'vulopilot'),
					icon: 'check',
					onClick: handleResolve,
				},
				{
					label: (row?: Record<string, unknown>) =>
						row?.status === 'ignored'
							? __('Ignored', 'vulopilot')
							: __('Ignore Issue', 'vulopilot'),
					icon: 'eye-blocked',
					onClick: handleIgnore,
				},
				{
					label: __('Reopen', 'vulopilot'),
					icon: 'toggle',
					onClick: handleReopen,
				},
				{
					label: (row?: Record<string, unknown>) =>
						row?.status === 'snoozed'
							? __('Snoozed', 'vulopilot')
							: __('Snooze', 'vulopilot'),
					icon: 'clock',
					onClick: handleSnooze,
				},
				// Always visible — Free itself has no AI-action-to-scanner
				// mapping or fix REST call (see getFindingFixHandler's own
				// docblock above); this is only ever the entry point + gate.
				{
					label: __('Fix', 'vulopilot'),
					icon: 'tools',
					onClick: handleFix,
				},
			] as any[],
		},
	};

	/**
	 * "Transparent" TableCard story shape (zyra Storybook, `table-tablecard
	 * --transparent`) — one InformationItemComponent per row (icon, title,
	 * a category + severity badge, then a description line) with inline
	 * admin-badge row actions on the right, instead of separate category/
	 * severity/status/date columns. Originally GEO.tsx's per-section
	 * tables only; "Protect My Site"'s SectionedFindingsTab (Security/Site
	 * Health/Files & Plugins/Accessibility) now uses this same layout too,
	 * matching the "Issues that need your attention" list-row design the
	 * Overview tab's own OpenIssuesGlimpse already established, rather
	 * than a spreadsheet-style grid — same underlying `/findings` data and
	 * row actions either way, just presented as a list.
	 */
	const compactHeaders: Record<string, any> = {
		title: {
			key: 'title',
			type: 'info',
			label: __('issue', 'vulopilot'),
			iconKey: 'compactTitleIcon',
			iconColorKey: 'compactTitleIconColor',
			descriptionKey: 'descriptionText',
			badgesKey: 'compactTitleBadges',
		},
		action: {
			label: __('Action', 'vulopilot'),
			// Native `type: 'action'` + `type: 'button'` actions
			// (TableRowActions.tsx) instead of a hand-built
			// `<BadgeComponent>` in `render` — same real Fix/Resolve/
			// Ignore/Reopen actions. Fix/Resolve/Ignore only apply to an
			// open finding, Reopen only to a resolved/ignored/snoozed one
			// — `hidden` (zyra's own real per-row action visibility) drops
			// whichever set doesn't apply to this row's own `status`,
			// same real either/or the old `row.status === 'open' ? … : …`
			// branch enforced.
			type: 'action',
			actions: [
				{
					type: 'button',
					label: __('Fix', 'vulopilot'),
					hidden: (row) => 'open' !== (row as Finding | undefined)?.status,
					onClick: (row) => handleFix(row),
				},
				{
					type: 'button',
					label: __('Mark as Fixed', 'vulopilot'),
					hidden: (row) => 'open' !== (row as Finding | undefined)?.status,
					onClick: (row) => handleResolve(row),
				},
				{
					type: 'button',
					label: __('Ignore Issue', 'vulopilot'),
					hidden: (row) => 'open' !== (row as Finding | undefined)?.status,
					onClick: (row) => handleIgnore(row),
				},
				{
					type: 'button',
					label: __('Reopen', 'vulopilot'),
					hidden: (row) => 'open' === (row as Finding | undefined)?.status,
					onClick: (row) => handleReopen(row),
				},
			],
		},
	};

	const tableCardProps: Omit<TableCardProps, 'title'> = {
		headers: layout === 'compact' ? compactHeaders : defaultHeaders,
		hideHeader: true,
		format: appLocalizer.date_format_js,
		showMenu: false,
		variant: 'transparent',
		rows: data.map((row) => {
			const descriptionText =
				row.description ||
				sprintf(
					/* translators: 1: page path or "Site-wide", 2: formatted date */
					__('%1$s · Detected %2$s', 'vulopilot'),
					row.page || __('Site-wide', 'vulopilot'),
					formatWpDate(row.created_at)
				);

			return {
				...row,
				descriptionText,
				// `defaultHeaders.title`'s own avatar — color baked into the
				// icon string (real zyra `$color-palette` utility class, see
				// SeoTab.tsx's own `icon: 'name colorword'` convention).
				defaultTitleIcon:
					row.severity === 'low' || row.severity === 'info'
						? 'info blue'
						: 'error red',
				defaultTitleBadges: [
					// Same real category tag the compact layout's own
					// `compactTitleBadges` already shows — folded in here
					// instead of the separate, now-removed standalone
					// "Category" column, only when this table itself spans
					// more than one category (a `category`-scoped caller's
					// own rows are all the same one already, so repeating
					// it per row would just be noise). Same real
					// `badge-{value}` convention the status/severity badges
					// right below already use — not the uncolored `color: ''`
					// `compactTitleBadges` uses for this same tag, which
					// renders as a real, styled color for every category that
					// has one (`badge-seo`/`badge-geo`/`badge-security`, see
					// BadgeComponent.scss) instead of always plain/uncolored.
					...(category
						? []
						: [
								{
									text: humanizeCategory(row.category),
									color: `badge-${row.category}`,
								},
							]),
					{ text: row.status, color: `badge-${row.status}` },
					{ text: row.severity, color: `blue` },
					// Replaces the now-removed standalone "Detected" date
					// column — same real `created_at` value, just folded
					// into the title's own badge row instead of its own
					// column, freeing that column width for `title` itself
					// (see `defaultHeaders.title`'s own `width: '75%'`).
					{ text: formatWpDate(row.created_at), color: '' },
				],
				// `compactHeaders.title`'s own avatar — same real icon, but
				// tinted via a real color (`iconColorKey`) instead of a
				// baked-in class word.
				compactTitleIcon:
					row.severity === 'low' || row.severity === 'info'
						? 'info'
						: 'error',
				compactTitleIconColor: getSeverityColor(row.severity),
				compactTitleBadges: [
					// Plain, uncolored — zyra's `admin-badge` base style
					// alone (no color modifier class exists for a neutral
					// tag), same idea as the section card's own
					// already-plain title, just repeated per row for the
					// mockup's category tag.
					{ text: humanizeCategory(row.category), color: '' },
					// `badge-{severity}` is a real zyra-defined modifier
					// (badge-critical/high/medium/low/info — confirmed in
					// its shipped styles), the same one TableCard's own
					// Severity column already renders via `statusClass` in
					// the default layout — kept identical here for a
					// compact row's severity badge to color the same way.
					{ text: row.severity, color: `badge-${row.severity}` },
				],
			};
		}),
		ids: data.map((row) => row.id),
		totalRows: total,
		categoryCounts,
		isLoading,
		onQueryUpdate: handleQueryUpdate,
		search:
			total > 0 || hasSearchTerm
				? { placeholder: __('Search findings…', 'vulopilot') }
				: undefined,
		bulkActions: [
			{
				label: __('Mark as Fixed', 'vulopilot'),
				value: 'resolved',
			},
			{ label: __('Ignore Issue', 'vulopilot'), value: 'ignored' },
			// Always visible, same "register a source, don't modify
			// the host" reasoning as the per-row "Fix" action above —
			// its onClick below only ever calls the Pro-registered
			// handler or opens the Pro popup.
			{ label: __('Fix selected', 'vulopilot'), value: '__fix__' },
		],
		onBulkActionApply: (action: string, ids: number[]) => {
			if ('__fix__' === action) {
				const bulkFixHandler = getFindingBulkFixHandler();

				if (typeof bulkFixHandler === 'function') {
					Promise.resolve(
						bulkFixHandler(ids) as Promise<FixOutcome> | undefined
					).then((outcome) => {
						if (outcome?.message) {
							NoticeManager.add({
								uniqueKey: 'findings-bulk-fix',
								type: outcome.success ? 'success' : 'error',
								position: 'float',
								message: outcome.message,
							});
						}

						refetch();
					});
					return;
				}

				setIsProPopupOpen(true);
				return;
			}

			sendApiResponse(
				appLocalizer,
				getApiLink(appLocalizer, 'findings/bulk'),
				{ ids, status: action }
			).then((response: unknown) => {
				if (response) {
					NoticeManager.add({
						uniqueKey: 'findings-bulk-update',
						type: 'success',
						position: 'float',
						message: __(
							'Selected findings updated.',
							'vulopilot'
						),
					});
					refetch();
				} else {
					NoticeManager.add({
						uniqueKey: 'findings-bulk-update-failed',
						type: 'error',
						position: 'float',
						message: __(
							'Could not update the selected findings. Please try again.',
							'vulopilot'
						),
					});
				}
			});
		},
		emptyMessage:
			description ||
			__('No findings here yet — nothing to report.', 'vulopilot'),
		filters: [
			{
				key: 'severity',
				label: __('Severity', 'vulopilot'),
				type: 'select',
				size: 10,
				options: [
					{ label: __('Critical', 'vulopilot'), value: 'critical' },
					{ label: __('High', 'vulopilot'), value: 'high' },
					{ label: __('Medium', 'vulopilot'), value: 'medium' },
					{ label: __('Low', 'vulopilot'), value: 'low' },
					{ label: __('Info', 'vulopilot'), value: 'info' },
				],
			},
		],
	};

	return {
		tableCardProps,
		error,
		refetch,
		isProPopupOpen,
		closeProPopup: () => setIsProPopupOpen(false),
	};
};
