import React, { type ComponentProps } from 'react';
import { __ } from '@wordpress/i18n';
import { AnalyticsComponent } from '@zyra/components';

// `'all'` has no tile of its own; it's kept only as a state value.
export type Priority = 'all' | 'high' | 'medium' | 'low';

interface IssuesSummaryCardsProps {
	priorityCounts: { high: number; medium: number; low: number };
	isLoading: boolean;
	activePriority: Priority;
	// eslint-disable-next-line no-unused-vars
	onSelectPriority: (priority: Priority) => void;
}

interface SummaryTile {
	priority: Priority;
	colorClass: string;
	icon: string;
	number: number;
	text: string;
	linkText: string;
}

const IssuesSummaryCards: React.FC<IssuesSummaryCardsProps> = ({
	priorityCounts,
	isLoading,
	activePriority,
	onSelectPriority,
}) => {
	const handleClick = (item: SummaryTile) => {
		onSelectPriority(item.priority);
	};

	// eslint-disable-next-line no-unused-vars
	const data: (SummaryTile & { onClick?: (item: SummaryTile) => void })[] = [
		{
			priority: 'high',
			colorClass: 'red',
			icon: 'error',
			number: priorityCounts.high,
			text: __('High priority', 'vulopilot'),
			linkText: __('View issues', 'vulopilot'),
			onClick: isLoading ? undefined : handleClick,
		},
		{
			priority: 'medium',
			colorClass: 'orange',
			icon: 'error',
			number: priorityCounts.medium,
			text: __('Medium priority', 'vulopilot'),
			linkText: __('View issues', 'vulopilot'),
			onClick: isLoading ? undefined : handleClick,
		},
		{
			priority: 'low',
			colorClass: 'green',
			icon: 'check',
			number: priorityCounts.low,
			text: __('Low priority', 'vulopilot'),
			linkText: __('View issues', 'vulopilot'),
			onClick: isLoading ? undefined : handleClick,
		},
	];

	const activeIndex = data.findIndex((tile) => tile.priority === activePriority);

	return (
		<div className="issues-summary-cards">
			<div className="details-wrapper">
				<div className="title">{__('Filter by priority', 'vulopilot')}</div>
				<div className="desc">{__('Click a priority level to view matching issues', 'vulopilot')}</div>
			</div>
			<AnalyticsComponent
				// zyra calls a tile's onClick with the tile it was given, so SummaryTile's handler receives a SummaryTile.
				data={data as ComponentProps<typeof AnalyticsComponent>['data']}
				activeIndex={activeIndex}
				variant="small-card"
				cols={3}
				isLoading={isLoading}
			/>
		</div>
	);
};

export default IssuesSummaryCards;