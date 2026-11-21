import { __ } from '@wordpress/i18n';
import { CardComponent, TypographyComponent } from '@zyra/components';
import { useContentGate } from '../../services/useContentGate';
import { useFilterSlot } from '../../services/useFilterSlot';
import type { ComponentType } from 'react';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import type { TrendChange } from './geoTrendChange';
import { ScoreRing } from '../../components/ScoreBreakdown/ScoreBreakdown';

interface AeoTopic {
	key: string;
	title: string;
	titleIcon: string;
	scannerIds: string[];
}

interface AeoScoreSummaryPanelProps {
	isLoading: boolean;
	questionsAnswered: number;
	totalPages: number;
	pagesReady: number;
	trend: TrendChange | null;
	topics: AeoTopic[];
	groups: FindingGroup[];
	// eslint-disable-next-line no-unused-vars
	onSelectTopic?: (topicKey: string) => void;
}

interface AeoScoreSummaryCardProps extends AeoScoreSummaryPanelProps {
	/** Whether the Pro-only `answer-engine-optimization` module is active+licensed. */
	isActive: boolean;
}

/** Inert placeholder ring - real score comes from the `vulopilot_aeo_score_summary_panel` filter. */
const DUMMY_SCORE = 72;

const dummyContent = (
	<div className="aeo-score-summary">
		<div className="aeo-score-summary-gauge">
			<div className="geo-overall-visibility">
				<ScoreRing score={DUMMY_SCORE} label={__('Good', 'vulopilot')} />
				<TypographyComponent variant={'h3'} color="text-green">
					{__('AEO Score', 'vulopilot')}
				</TypographyComponent>
			</div>
		</div>
	</div>
);

/**
 * "AEO Score" - card shell only, same `useContentGate`/`useFilterSlot` pattern AeoCitationCoverageCard.tsx/AeoEngineTestingCard.tsx already use.
 */
const AeoScoreSummaryCard = ({ isActive, ...panelProps }: AeoScoreSummaryCardProps) => {
	const Panel = useFilterSlot<ComponentType<AeoScoreSummaryPanelProps>>(
		'vulopilot_aeo_score_summary_panel'
	);

	const { wrap } = useContentGate('answer-engine-optimization', isActive);

	return (
		<CardComponent
			title={__('AEO Score', 'vulopilot')}
			titleIcon="ai"
			desc={__(
				'How ready your content is to be extracted and quoted directly by AI answer engines.',
				'vulopilot'
			)}
			isLoading={panelProps.isLoading || undefined}
		>
			{wrap(Panel ? <Panel {...panelProps} /> : dummyContent, dummyContent)}
		</CardComponent>
	);
};

export default AeoScoreSummaryCard;
