import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { scrollToId } from '@zyra/core';
import {
	ColumnComponent,
	ModuleGuardComponent,
	SectionComponent,
	TabsComponent,
} from '@zyra/components';
import { TableCard } from '@zyra/table';
import IssueDetailPanel from '../../components/Issues/IssueDetailPanel';
import {
	CATEGORY_LABELS,
	formatAffected,
	issueIconFor,
} from '../../components/Issues/issuesTypes';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import {
	PRODUCT_SCANNER_IDS,
	CHECKOUT_SCANNER_IDS,
	STORE_SCANNER_IDS,
} from './CommerceTab.constants';
import { columns, tableRows } from '../../services/tableColumns';

const PER_PAGE = 10;

const sumGroupCounts = (groups: FindingGroup[], scannerIds: string[]): number =>
	groups
		.filter((group) => scannerIds.includes(group.scanner_id))
		.reduce((total, group) => total + group.count, 0);

export type CommerceIssueTab =
	| 'all'
	| 'important'
	| 'products'
	| 'checkout'
	| 'store';

interface CommerceIssuesTableProps {
	groups: FindingGroup[];
	activeTab: CommerceIssueTab;

	// eslint-disable-next-line no-unused-vars
	onTabChange: (tab: CommerceIssueTab) => void;
	/** Re-fetches `groups` after a Resolve/Ignore/Fix below. */
	onGroupsChanged?: () => void;
}

/** "All WooCommerce Issues". */
const CommerceIssuesTable = ({
	groups,
	activeTab,
	onTabChange,
	onGroupsChanged,
}: CommerceIssuesTableProps) => {
	const [selectedGroup, setSelectedGroup] = useState<FindingGroup | null>(null);
	const [paged, setPaged] = useState(1);

	const importantScannerIds = groups
		.filter((group) => 'critical' === group.severity || 'high' === group.severity)
		.map((group) => group.scanner_id);

	const tabs: { id: CommerceIssueTab; label: string; count: number }[] = [
		{
			id: 'important',
			label: __('Important', 'vulopilot'),
			count: sumGroupCounts(groups, importantScannerIds),
		},
		{
			id: 'products',
			label: __('Products', 'vulopilot'),
			count: sumGroupCounts(groups, PRODUCT_SCANNER_IDS),
		},
		{
			id: 'checkout',
			label: __('Checkout', 'vulopilot'),
			count: sumGroupCounts(groups, CHECKOUT_SCANNER_IDS),
		},
		{
			id: 'store',
			label: __('Store', 'vulopilot'),
			count: sumGroupCounts(groups, STORE_SCANNER_IDS),
		},
	];

	const scannerIdsForTab: Record<CommerceIssueTab, string[] | undefined> = {
		all: undefined,
		important: importantScannerIds,
		products: PRODUCT_SCANNER_IDS,
		checkout: CHECKOUT_SCANNER_IDS,
		store: STORE_SCANNER_IDS,
	};
	const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

	const activeScannerIds = scannerIdsForTab[activeTab];
	const tabGroups = activeScannerIds
		? groups.filter((group) => activeScannerIds.includes(group.scanner_id))
		: groups;

	const pageRows = tabGroups.slice((paged - 1) * PER_PAGE, paged * PER_PAGE);

	// Keeps the current selection if it's still visible, else falls back to the first row of this tab.
	useEffect(() => {
		setSelectedGroup((current) => {
			if (
				current &&
				tabGroups.some((group) => group.scanner_id === current.scanner_id)
			) {
				return (
					tabGroups.find((group) => group.scanner_id === current.scanner_id) ??
					current
				);
			}

			return tabGroups[0] ?? null;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [groups, activeTab, paged]);

	/** Same toggle the action cell's own "More Details"/"Showing" button below does. */
	const handleSelectGroup = (group: FindingGroup) => {
		const isDeselecting = group.scanner_id === selectedGroup?.scanner_id;

		setSelectedGroup(isDeselecting ? null : group);

		if (!isDeselecting) {
			scrollToId('woocommerce-issues-detail-panel');
		}
	};

	const handleActionComplete = () => {
		onGroupsChanged?.();
		setSelectedGroup(null);
	};

	return (
		<>
			<ColumnComponent>
				<div id="woocommerce-issues-table" className="woocommerce-issues-table">
					<SectionComponent title={__('All WooCommerce Issues', 'vulopilot')} />
					<TabsComponent
						activeIndex={Math.max(activeIndex, 0)}
						onTabChange={(index: number) => {
							onTabChange(tabs[index].id);
							setPaged(1);
						}}
						tabs={tabs.map((tab) => ({
							label: sprintf('%1$s (%2$d)', tab.label, tab.count),
						}))}
					/>
				</div>
			</ColumnComponent>

			<ColumnComponent grid={8}>
				{0 === tabGroups.length ? (
					<ModuleGuardComponent
						icon="check"
						title={__('Nothing here right now', 'vulopilot')}
						desc={__(
							'No WooCommerce findings in this tab right now.',
							'vulopilot'
						)}
					/>
				) : (
					<TableCard
						showMenu={false}
						hideHeader={true}
						variant="transparent"
						activeRowId={selectedGroup?.scanner_id}
						onRowClick={(row: Record<string, unknown>) => {
							handleSelectGroup(row as unknown as FindingGroup);
						}}
						headers={columns({
							issue: {
								key: 'label',
								type: 'info',
								label: __('Issue', 'vulopilot'),
								width: '65%',
								iconKey: 'issueIcon',
								descriptionKey: 'descriptionText',
								badgesKey: 'issueBadges',
							},
							affected: {
								label: __('Affected', 'vulopilot'),
								render: (row: FindingGroup) =>
									formatAffected(row.count, row.object_type),
							},
							action: {
								label: __('Action', 'vulopilot'),
								type: 'action',
								actions: [
									{
										type: 'button',
										label: (row) =>
											(row as unknown as FindingGroup).scanner_id ===
											selectedGroup?.scanner_id
												? __('Showing', 'vulopilot')
												: __('More Details', 'vulopilot'),
										color: (row) =>
											(row as unknown as FindingGroup).scanner_id ===
											selectedGroup?.scanner_id
												? 'text-green'
												: 'text-purple',
										icon: (row) =>
											(row as unknown as FindingGroup).scanner_id ===
											selectedGroup?.scanner_id
												? 'eye'
												: 'pagination-next-arrow',
										onClick: (row) => {
											handleSelectGroup(row as unknown as FindingGroup);
										},
									},
								],
							},
						})}
						rows={tableRows(pageRows.map((row) => ({
							...row,
							issueIcon: issueIconFor(row.category, row.scanner_id),
							descriptionText:
								(row.sample?.description?.length ?? 0) > 80
									? `${row.sample?.description?.slice(0, 80)}...`
									: row.sample?.description || '',
							issueBadges: [
								{
									text: CATEGORY_LABELS[row.category] ?? row.category,
									color: 'blue',
								},
								{ text: row.severity, color: `badge-${row.severity}` },
							],
						})))}
						ids={pageRows.map((row) => row.scanner_id)}
						totalRows={tabGroups.length}
						isLoading={false}
						onQueryUpdate={(query: { paged?: number | string }) => {
							setPaged(Number(query.paged) || 1);
						}}
						emptyMessage={__(
							'No WooCommerce findings in this tab right now.',
							'vulopilot'
						)}
					/>
				)}
			</ColumnComponent>

			{tabGroups.length > 0 && (
				<ColumnComponent grid={4}>
					<div id="woocommerce-issues-detail-panel">
						<IssueDetailPanel
							group={selectedGroup}
							onActionComplete={handleActionComplete}
						/>
					</div>
				</ColumnComponent>
			)}
		</>
	);
};

export default CommerceIssuesTable;
