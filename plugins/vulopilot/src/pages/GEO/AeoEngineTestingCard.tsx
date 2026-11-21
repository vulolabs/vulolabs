import { __ } from '@wordpress/i18n';
import { CardComponent } from '@zyra/components';
import { ButtonInput, SelectInput } from '@zyra/inputs';
import { useContentGate } from '../../services/useContentGate';
import { useFilterSlot } from '../../services/useFilterSlot';
import type { ComponentType } from 'react';
import type { AeoPageRow } from './useAeoPageAnalysis';

interface AeoEngineTestingCardProps {
	/** Same "is GeoInsights' Rest.php class even registered" gate AeoCitationCoverageCard.tsx uses. */
	isActive: boolean;
	/** The published-pages list AeoTab.tsx already fetched (useAeoPageAnalysis.ts). */
	pages: AeoPageRow[];
}

/** Card shell only. */
const AeoEngineTestingCard = ({ isActive, pages }: AeoEngineTestingCardProps) => {
	const Panel = useFilterSlot<ComponentType<{ pages: AeoPageRow[] }>>(
		'vulopilot_aeo_engine_testing_panel'
	);

	const { wrap } = useContentGate('answer-engine-optimization', isActive);

	const dummyContent = (
		<div className="aeo-engine-testing-controls">
			<SelectInput
				type="single-select"
				name="engine_testing_post_id_dummy"
				value=""
				placeholder={__('Select a page…', 'vulopilot')}
				options={[]}
				onChange={() => {}}
				size="16rem"
				disabled
			/>
			<ButtonInput
				buttons={{ text: __('Test this page', 'vulopilot'), icon: 'search-discovery', disabled: true, onClick: () => {} }}
			/>
		</div>
	);

	return (
		<CardComponent
			title={__('Engine Testing', 'vulopilot')}
			titleIcon="intelligence"
			desc={
				isActive
					? __(
							'Pick a page you’ve just fixed and re-run the same real citation check against it right now, instead of waiting for the next full scan.',
							'vulopilot'
						)
					: __(
							'Re-verifies a previously-flagged finding against an AI answer engine once you’ve fixed it, instead of waiting for the next full scan.',
							'vulopilot'
						)
			}
		>
			{wrap(Panel ? <Panel pages={pages} /> : dummyContent, dummyContent)}
		</CardComponent>
	);
};

export default AeoEngineTestingCard;
