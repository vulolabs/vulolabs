/* global appLocalizer */
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import { getApiLink, sendApiResponse } from '@zyra/core';
import {
	CardComponent,
	ModuleGuardComponent,
	NoticeManager,
	PopupComponent,
	SectionComponent
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import ShowProPopup from '../../components/Popup/Popup';
import { PRIORITY_SEVERITIES, Priority, RawFinding } from './seoIssuesShared';
import './SeoVisibility.scss';

/** What a registered fix handler resolves to — same shape RecentContentCard.tsx's own FixOutcome uses. */
interface FixOutcome {
	success: boolean;
	message: string;
}

/**
 * Real, immediate AI-apply "Fix" handler — the SAME `vulopilot_finding_fix_handler`
 * filter RecentContentCard.tsx/FindingsTable.tsx already read (registered by
 * vulopilot-pro's OneClickFix module when active, `null` otherwise). Used
 * here because these findings aren't tied to any one page — the navigate-
 * to-editor-and-highlight "Fix with AI" `SeoIssuesByPageTable.tsx` uses has
 * no page to navigate to for a sitemap/robots.txt finding. Read fresh on
 * every click rather than cached, same reasoning as those call sites.
 */
const getFindingFixHandler = () => applyFilters('vulopilot_finding_fix_handler', null);

/** Same local helper RecentContentCard.tsx's own `timeAgo` is — kept per-file rather than shared since this is the only real date this page renders. */
const timeAgo = (dateString: string): string => {
	const seconds = Math.max(
		0,
		Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
	);

	if (seconds < 60) {
		return __('just now', 'vulopilot');
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
};

interface SeoSiteWideIssuesTableProps {
	findings: RawFinding[];
	activeScannerIds: 'all' | string[];
	/** IssuesSection.tsx's own real `IssuesSummaryCards` priority tile — `'all'`/`'high'`/`'medium'`/`'low'`, folded against each finding's own real severity via `PRIORITY_SEVERITIES`. */
	activePriority: Priority;
	isLoading: boolean;
	hasError: boolean;
	onRetry: () => void;
}

/**
 * "Site-wide Issues" — one of the two real tables that replace the old
 * combined "All SEO Issues" card, split apart per direct instruction.
 * Covers only findings NOT tied to a specific page (SitemapScanner/
 * RobotsTxtScanner's own `object_type: 'url'`, plus anything with an
 * unresolvable `object_ref`) — `SeoIssuesByPageTable.tsx` owns everything
 * page/post-scoped. Purely presentational for its data: `findings` comes
 * from SeoTab.tsx's own single fetch (so this table's counts
 * always agree with the shared filter pills above it) — this component
 * only mirrors that prop into local state so Resolve/Ignore/Fix can
 * optimistically remove a row without waiting on a full section refetch.
 */
const SeoSiteWideIssuesTable = ({
	findings,
	activeScannerIds,
	activePriority,
	isLoading,
	hasError,
	onRetry,
}: SeoSiteWideIssuesTableProps) => {
	const [localFindings, setLocalFindings] = useState<RawFinding[]>(findings);
	const [fixingFindingId, setFixingFindingId] = useState<number | null>(null);
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	useEffect(() => {
		setLocalFindings(findings);
	}, [findings]);

	/** Purely client-side, same as RecentContentCard.tsx's own `removeFindingLocally` — filters the flat list by finding id directly, since these findings aren't nested under a page row. Optimistic only: the next real `onRetry()`/section refetch resyncs from the server. */
	const removeFindingLocally = (findingId: number) => {
		setLocalFindings((current) => current.filter((finding) => finding.id !== findingId));
	};

	const handleFix = (finding: RawFinding) => {
		const findingFixHandler = getFindingFixHandler();

		if ('function' !== typeof findingFixHandler) {
			setIsProPopupOpen(true);
			return;
		}

		setFixingFindingId(finding.id);

		Promise.resolve(findingFixHandler(finding) as Promise<FixOutcome> | undefined)
			.then((outcome) => {
				if (outcome?.message) {
					NoticeManager.add({
						uniqueKey: `seo-sitewide-fix-${finding.id}`,
						type: outcome.success ? 'success' : 'error',
						position: 'float',
						message: outcome.message,
					});
				}

				if (outcome?.success) {
					removeFindingLocally(finding.id);
				}
			})
			.finally(() => setFixingFindingId(null));
	};

	/** Resolve/Ignore — the same real `POST /findings/{id} {status}` RecentContentCard.tsx's own `handleFindingStatus` calls (Findings.php::update_item() has no `object_type` restriction, so this works unmodified here). Every finding here is fetched with `status=open`, so there's no "Reopen" case — Resolve/Ignore are both one-way, removing the row locally on success. */
	const handleStatus = (
		finding: RawFinding,
		status: 'resolved' | 'ignored',
		successMessage: string
	) => {
		sendApiResponse(appLocalizer, getApiLink(appLocalizer, `findings/${finding.id}`), {
			status,
		}).then((response: unknown) => {
			if (response) {
				NoticeManager.add({
					uniqueKey: `seo-sitewide-${status}-${finding.id}`,
					type: 'success',
					position: 'float',
					message: successMessage,
				});
				removeFindingLocally(finding.id);
			} else {
				NoticeManager.add({
					uniqueKey: `seo-sitewide-${status}-failed-${finding.id}`,
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

	const visibleFindings = localFindings.filter(
		(finding) =>
			('all' === activeScannerIds || activeScannerIds.includes(finding.scanner_id)) &&
			('all' === activePriority || PRIORITY_SEVERITIES[activePriority].includes(finding.severity))
	);

	if (hasError) {
		return (
			<CardComponent
				title={__('Site-wide Issues', 'vulopilot')}
				titleIcon="error"
				desc={__('SEO issues that affect the whole site rather than one page.', 'vulopilot')}
			>
				<ModuleGuardComponent
					icon="error"
					title={__('Could not load site-wide issues', 'vulopilot')}
					desc={__(
						'Something went wrong fetching this data. Please try again.',
						'vulopilot'
					)}
				/>
				<ButtonInput
					buttons={{ text: __('Retry', 'vulopilot'), icon: 'refresh', onClick: onRetry }}
				/>
			</CardComponent>
		);
	}

	// Nothing site-wide to show (either genuinely clean, or filtered out by
	// an active category/scanner filter that has no site-wide matches) —
	// SeoIssuesByPageTable.tsx's own empty state already covers "all clean"
	// for the section as a whole, so this table just steps aside rather
	// than showing a second, redundant empty card.
	if (!isLoading && 0 === visibleFindings.length) {
		return null;
	}

	return (
		<>
			<SectionComponent
				title={__('Site-wide Issues', 'vulopilot')}
				desc={__('Not tied to a specific page — these affect the whole site (e.g. your XML sitemap or robots.txt).', 'vulopilot')}
			/>
			<TableCard
				showMenu={false}
				variant="transparent"
				hideHeader={true}
				headers={{
					title: {
						key: 'title',
						type: 'info',
						label: __('Issue', 'vulopilot'),
						width: '55%',
						descriptionKey: 'descriptionItems',
						badgesKey: 'titleBadges',
					},
					action: {
						label: __('Action', 'vulopilot'),
						type: 'action',
						actions: [
							{
								label: __('Mark as Fixed', 'vulopilot'),
								icon: 'check',
								color: 'text-blue',
								onClick: (row) =>
									handleStatus(
										row as unknown as RawFinding,
										'resolved',
										__(
											'Finding marked as resolved.',
											'vulopilot'
										)
									),
							},
							{
								label: __('Ignore Issue', 'vulopilot'),
								color: 'text-red',
								icon: 'eye-blocked',
								onClick: (row) =>
									handleStatus(
										row as unknown as RawFinding,
										'ignored',
										__('Finding ignored.', 'vulopilot')
									),
							},
							{
								type: 'button',
								label: (row) =>
									fixingFindingId ===
									(row as unknown as RawFinding)?.id
										? __('Fixing…', 'vulopilot')
										: __('Fix with AI', 'vulopilot'),
								icon: 'ai',
								color: 'orange-bg',
								onClick: (row) => {
									const finding = row as unknown as RawFinding;
									// Was `onClick: undefined` on the raw
									// `<BadgeComponent>` badge to disable the
									// click while a fix is already running —
									// `ActionItem.onClick` is required here, so
									// a no-op stands in for that same "ignore
									// clicks mid-fix" behavior instead.
									if (fixingFindingId === finding.id) {
										return;
									}
									handleFix(finding);
								},
							},
						],
					},
				}}
				rows={visibleFindings.map((finding) => ({
					...finding,
					titleBadges: [
						{ text: finding.severity, color: `badge-${finding.severity}` },
					],
					descriptionItems: [
						{ value: finding.scanner_id, icon: 'category' },
						{ value: timeAgo(finding.created_at), icon: 'clock' },
					],
				}))}
				ids={visibleFindings.map((finding) => finding.id)}
				totalRows={visibleFindings.length}
				isLoading={isLoading}
				emptyMessage={__('No site-wide issues match this filter.', 'vulopilot')}
			/>

			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				
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

export default SeoSiteWideIssuesTable;
