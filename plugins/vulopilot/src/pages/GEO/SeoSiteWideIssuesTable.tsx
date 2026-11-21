/* global vulopilotAppLocalizer */
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
import { TableCard } from '@zyra/table';
import ShowProPopup from '../../components/Popup/Popup';
import { FixOutcome } from '../../services/showFixOutcome';
import { useFixNotice } from '../../services/useFixNotice';
import { PRIORITY_SEVERITIES, Priority, RawFinding } from './seoIssuesShared';
import './SeoVisibility.scss';
import { columns } from '../../services/tableColumns';

const getFindingFixHandler = () => applyFilters('vulopilot_finding_fix_handler', null);

/** Same local helper RecentContentCard.tsx's own `timeAgo` is. */
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
	/** IssuesSection.tsx's own real `IssuesSummaryCards` priority tile. */
	activePriority: Priority;
	isLoading: boolean;
	hasError: boolean;
}

/** "Site-wide Issues". */
const SeoSiteWideIssuesTable = ({
	findings,
	activeScannerIds,
	activePriority,
	isLoading,
	hasError,
}: SeoSiteWideIssuesTableProps) => {
	const [localFindings, setLocalFindings] = useState<RawFinding[]>(findings);
	const [fixingFindingId, setFixingFindingId] = useState<number | null>(null);
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	// An undone fix puts the finding back in the list. Set per fix, since Undo runs later.
	const [undoneFinding, setUndoneFinding] = useState<RawFinding | null>(null);
	const { show: showFix, fixNotice } = useFixNotice(() =>
		setLocalFindings((current) =>
			undoneFinding && !current.some((item) => item.id === undoneFinding.id)
				? [undoneFinding, ...current]
				: current
		)
	);

	useEffect(() => {
		setLocalFindings(findings);
	}, [findings]);

	/** Purely client-side, same as RecentContentCard.tsx's own `removeFindingLocally`. */
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
		setUndoneFinding(finding);

		Promise.resolve(findingFixHandler(finding) as Promise<FixOutcome> | undefined)
			.then((outcome) => {
				showFix(outcome);

				if (outcome?.success) {
					removeFindingLocally(finding.id);
				}
			})
			.finally(() => setFixingFindingId(null));
	};

	/** Resolve/Ignore. */
	const handleStatus = (
		finding: RawFinding,
		status: 'resolved' | 'ignored',
		successMessage: string
	) => {
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, `findings/${finding.id}`), {
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
			</CardComponent>
		);
	}

	// Nothing site-wide to show.
	if (!isLoading && 0 === visibleFindings.length) {
		// Keep the last fix's result (and its Undo) visible even though the table is now empty.
		return fixNotice;
	}

	return (
		<>
			<SectionComponent
				title={__('Site-wide Issues', 'vulopilot')}
				desc={__('Not tied to a specific page - these affect the whole site (e.g. your XML sitemap or robots.txt).', 'vulopilot')}
			/>
			{fixNotice}
			<TableCard
				showMenu={false}
				variant="transparent"
				hideHeader={true}
				headers={columns({
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
									// Was `onClick: undefined` on the raw `BadgeComponent` badge to disable the click while a fix is already running.
									if (fixingFindingId === finding.id) {
										return;
									}
									handleFix(finding);
								},
							},
						],
					},
				})}
				rows={visibleFindings.map((finding) => ({
					...finding,
					titleBadges: [
						{ text: finding.severity, color: `badge-${finding.severity}` },
					],
					descriptionItems: [
						...(finding.description
							? [{ value: finding.description, icon: 'info' }]
							: []),
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
				position="lightbox"
			>
				{vulopilotAppLocalizer.khali_dabba ? (
					<ShowProPopup moduleName="one-click-fix" />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</>
	);
};

export default SeoSiteWideIssuesTable;
