import { ColumnComponent, ContainerComponent } from '@zyra/components';
import type { SectionedIssuesTab } from './SectionedIssuesTable';
import SecurityStatusCard from './SecurityStatusCard';
import RecentActivityCard from './RecentActivityCard';
import SecurityTrendCard from './SecurityTrendCard';

interface SecurityMockupHeaderProps {
	/**
	 * DOM id of the section the hero card's "Review Issues First" button
	 * should scroll to - SecurityTab.tsx's own "Issues that need
	 * your attention" card. Kept as a prop rather than hardcoded here in
	 * case a future tab reuses this header with a different scroll
	 * target, same as it briefly did while "Old Security" also existed.
	 */
	scrollTargetId: string;
	/** Forwarded to SecurityMetricsGrid.tsx's own scanner-backed tiles' "View" buttons - switches the merged issues table below to that tile's own section. */
	// eslint-disable-next-line no-unused-vars -- named param on a type-only call signature; base no-unused-vars doesn't recognize TS call-signature parameters.
	onViewSection: (tab: SectionedIssuesTab) => void;
}

/**
 * RecentActivityCard/SecurityTrendCard (real daily score history, its own
 * dedicated table - see that component's own docblock) stack
 * directly below SecurityStatusCard in this same grid={4} sidebar column
 * (per direct instruction - one after another, narrow, not a separate
 * full-width 3-column row) rather than living in SecurityTab.tsx
 * as a standalone row.
 */
const SecurityMockupHeader = ({
	scrollTargetId,
	onViewSection,
}: SecurityMockupHeaderProps) => {

	return (
		<ContainerComponent>
			<ColumnComponent grid={7} fullHeight>
				<SecurityStatusCard onViewSection={onViewSection} />
			</ColumnComponent>
			<ColumnComponent grid={5} fullHeight>
				<SecurityTrendCard />
			</ColumnComponent>

			<ColumnComponent fullHeight>
				<RecentActivityCard />
			</ColumnComponent>
		</ContainerComponent>
	);
};

export default SecurityMockupHeader;
