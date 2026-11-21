/* global vulopilotAppLocalizer */
import { FixOutcome } from './showFixOutcome';
import { useFixNotice } from './useFixNotice';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { BadgeComponent, NoticeManager, PopupComponent } from '@zyra/components';
import type { TableCardProps, TableRow } from '@zyra/table';
import { useApiList } from './useApiList';
import { formatWpDate } from './formatWpDate';
import { getSeverityColor } from './getSeverityClass';
import TypographyComponent from '../components/TypographyComponent';
import { columns } from './tableColumns';

/** Categories whose conventional written form isn't plain title-case. */
const CATEGORY_ACRONYMS: Record<string, string> = {
	ssl: 'SSL',
	seo: 'SEO',
	geo: 'GEO',
	aeo: 'AEO',
	wordpress: 'WordPress',
};

/** `Finding.category` is the raw scanner category string ('security', 'wordpress', 'ssl', …). */
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
	/** The scanner's own longer explanation of the finding (Finding:: get_description() server- side). */
	description?: string;
	/** Resolved page path for a per-post finding, or 'Site-wide' for a sitewide check. */
	page?: string;
	/** The real post's own title (`get_the_title()`), added alongside `page` by the same `add_page_field()`. */
	page_title?: string | null;
	fix_action_id?: string | null;
}

export const getFindingFixHandler = () =>
	applyFilters('vulopilot_finding_fix_handler', null);

/**
 * @return
 */
const getFindingBulkFixHandler = () =>
	applyFilters('vulopilot_finding_bulk_fix_handler', null);

export interface UseFindingsTableProps {
	/** Restricts the list to one finding category (e.g. 'seo', 'geo', 'woocommerce'). */
	category?: string;
	/** Further restricts the list to a specific set of scanner ids within `category`. */
	scannerIds?: string[];
	/** Compact layout: each row is one InformationItemComponent with title, page and detected date. */
	layout?: 'default' | 'compact';
	/** Empty-state message - shown by TableCard's own `emptyMessage` when there's nothing to list. */
	description?: string;
	/** Which categorical dimension drives the pill bar above the table. */
	pillDimension?: 'status' | 'priority';
}

export interface UseFindingsTableResult {
	/** Spread straight onto Zyra's `TableCard`. */
	tableCardProps: Omit<TableCardProps, 'title'>;
	/** Real fetch error - render an error state instead of `TableCard` when set. */
	error: string | null;
	/** Retry the fetch - wire to the error state's own retry action. */
	refetch: () => void;
	isProPopupOpen: boolean;
	closeProPopup: () => void;
	/** The outcome of the last Fix (useFixNotice), shown above the list; null when there is none. */
	fixNotice: ReactNode;
	/** The "View" row action's own detail popup, already wired to `viewingFinding`/`closeView`. */
	viewPopup: ReactElement;
}

/** Shared findings-list logic. */
export const useFindingsTable = ({
	category,
	scannerIds,
	layout = 'default',
	description,
	pillDimension = 'status',
}: UseFindingsTableProps): UseFindingsTableResult => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const [viewingFinding, setViewingFinding] = useState<Finding | null>(null);

	/** Every finding status, in display order, for the status-count pill bar. */
	const statusOptions = [
		{ label: __('Open', 'vulopilot'), value: 'open' },
		{ label: __('Resolved', 'vulopilot'), value: 'resolved' },
		{ label: __('Ignored', 'vulopilot'), value: 'ignored' },
		{ label: __('Snoozed', 'vulopilot'), value: 'snoozed' },
	];

	/** Display labels for the high/medium/low priority buckets. */
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
			// Comma-joined, not an array - useApiList's params are plain string|number values.
			scanner_id: scannerIds?.length ? scannerIds.join(',') : undefined,
		},
		pillConfig
	);

	const { show: showFix, fixNotice } = useFixNotice(refetch);

	/** Whether the user currently has a search term typed in. */
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
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, `findings/${row.id}`),
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

	const handleView = (row?: Record<string, unknown>) => {
		if (row) {
			setViewingFinding(row as Finding);
		}
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

	/** Runs through ManualActionRunner rather than a plain status PATCH. */
	const handleSnooze = (row?: Record<string, unknown>) => {
		if (!row) {
			return;
		}

		sendApiResponse<{ success?: boolean; message?: string }>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, `findings/${row.id}/actions/snooze-finding`),
			{}
		).then((response) => {
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

	/** "Fix" is always visible; falls back to the upsell popup with no handler registered. */
	const handleFix = (row?: Record<string, unknown>) => {
		const findingFixHandler = getFindingFixHandler();

		if (typeof findingFixHandler === 'function') {
			Promise.resolve(
				findingFixHandler(row) as Promise<FixOutcome> | undefined
			).then((outcome) => {
				showFix(outcome);
				refetch();
			});
			return;
		}

		setIsProPopupOpen(true);
	};

	const defaultHeaders = columns<Record<string, unknown>>({
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
					label: __('View', 'vulopilot'),
					icon: 'eye',
					onClick: handleView,
				},
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
				// Always visible, even with no fix handler registered.
				{
					label: __('Fix', 'vulopilot'),
					icon: 'tools',
					onClick: handleFix,
				},
			] as any[],
		},
	});

	const compactHeaders = columns<Record<string, unknown>>({
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
	});

	const tableCardProps: Omit<TableCardProps, 'title'> = {
		headers: layout === 'compact' ? compactHeaders : defaultHeaders,
		hideHeader: true,
		format: vulopilotAppLocalizer.date_format_js,
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
				// Color is baked into the icon string (zyra `$color-palette` utility class convention).
				defaultTitleIcon:
					row.severity === 'low' || row.severity === 'info'
						? 'info blue'
						: 'error red',
				defaultTitleBadges: [
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
					{ text: formatWpDate(row.created_at), color: '' },
				],
				// Same icon as defaultTitleIcon, tinted via iconColorKey instead of a baked-in class word.
				compactTitleIcon:
					row.severity === 'low' || row.severity === 'info'
						? 'info'
						: 'error',
				compactTitleIconColor: getSeverityColor(row.severity),
				compactTitleBadges: [
					{ text: humanizeCategory(row.category), color: '' },
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
			{ label: __('Fix selected', 'vulopilot'), value: '__fix__' },
		],
		onBulkActionApply: (action, selectedIds) => {
			// Row ids here are the findings' numeric ids.
			const ids = selectedIds.map(Number);

			if ('__fix__' === action) {
				const bulkFixHandler = getFindingBulkFixHandler();

				if (typeof bulkFixHandler === 'function') {
					Promise.resolve(
						bulkFixHandler(ids) as Promise<FixOutcome> | undefined
					).then((outcome) => {
						showFix(outcome);
						refetch();
					});
					return;
				}

				setIsProPopupOpen(true);
				return;
			}

			sendApiResponse(
				vulopilotAppLocalizer,
				getApiLink(vulopilotAppLocalizer, 'findings/bulk'),
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
			__('No findings here yet - nothing to report.', 'vulopilot'),
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

	const closeView = () => setViewingFinding(null);

	const viewPopup = (
		<PopupComponent
			open={Boolean(viewingFinding)}
			onClose={closeView}
			width={28}
			height="auto"
			header={{
				title: viewingFinding?.title || '',
				icon: 'info',
			}}
		>
			{viewingFinding && (
				<div className="finding-view-popup">
					<TypographyComponent as="p" variant="desc">
						{viewingFinding.description ||
							sprintf(
								/* translators: 1: page path or "Site-wide", 2: formatted date */
								__('%1$s · Detected %2$s', 'vulopilot'),
								viewingFinding.page || __('Site-wide', 'vulopilot'),
								formatWpDate(viewingFinding.created_at)
							)}
					</TypographyComponent>
					<div className="finding-view-popup-badges">
						<BadgeComponent
							text={humanizeCategory(viewingFinding.category)}
							color={`badge-${viewingFinding.category}`}
						/>
						<BadgeComponent text={viewingFinding.severity} color="blue" />
						<BadgeComponent
							text={viewingFinding.status}
							color={`badge-${viewingFinding.status}`}
						/>
					</div>
					{viewingFinding.page && (
						<TypographyComponent as="p" variant="desc">
							{sprintf(
								/* translators: %s: page path or title this finding was detected on. */
								__('Page: %s', 'vulopilot'),
								viewingFinding.page_title || viewingFinding.page
							)}
						</TypographyComponent>
					)}
					<TypographyComponent as="p" variant="desc">
						{sprintf(
							/* translators: %s: formatted date the finding was first detected. */
							__('Detected: %s', 'vulopilot'),
							formatWpDate(viewingFinding.created_at)
						)}
					</TypographyComponent>
				</div>
			)}
		</PopupComponent>
	);

	return {
		tableCardProps,
		error,
		refetch,
		isProPopupOpen,
		closeProPopup: () => setIsProPopupOpen(false),
		fixNotice,
		viewPopup,
	};
};
