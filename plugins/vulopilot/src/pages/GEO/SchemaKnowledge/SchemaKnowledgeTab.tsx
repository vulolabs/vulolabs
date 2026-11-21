import { useEffect, useState } from 'react';
import { scrollToId } from '@zyra/core';
import { ColumnComponent, ContainerComponent } from '@zyra/components';
import { __ } from '@wordpress/i18n';
import '../SeoVisibility.scss';
import BusinessProfileCard from './BusinessProfileCard';
import KnowledgeGraphSection from './KnowledgeGraphSection';
import StructuredDataSection from './StructuredDataSection';
import InspectorSection from './InspectorSection';
import { useSchemaCoverage } from './useSchemaCoverage';
import type { SchemaPageFilter } from './useSchemaCoverage';

export type SchemaKnowledgeSectionId =
	| 'overview'
	| 'structured-data'
	| 'knowledge-graph'
	| 'inspector'
	| 'issues';

interface SchemaKnowledgeTabProps {
	initialSection?: SchemaKnowledgeSectionId;
}

/** A numbered heading between the page's two halves. */
const SectionTitle = ({ step, title, desc }: { step: number; title: string; desc: string }) => (
	<div className="vp-schema-section">
		<span className="vp-schema-section-step" aria-hidden="true">
			{step}
		</span>
		<div>
			<h2>{title}</h2>
			<p>{desc}</p>
		</div>
	</div>
);

/** "Business Identity & Schema" tab of "SEO & Visibility". */
const SchemaKnowledgeTab = ({
	initialSection = 'overview',
}: SchemaKnowledgeTabProps) => {
	const coverage = useSchemaCoverage();
	const [pageFilter, setPageFilter] = useState<SchemaPageFilter>('all');

	useEffect(() => {
		if ('overview' !== initialSection) {
			scrollToId(`schema-knowledge-${initialSection}`);
		}
		// Only the initial mount-time value matters.
	}, []);

	return (
		<ContainerComponent>
			<ColumnComponent>
				<SectionTitle
					step={1}
					title={__('Who you are', 'vulopilot')}
					desc={__('The business details AI assistants and search engines use to describe you.', 'vulopilot')}
				/>
			</ColumnComponent>

			<BusinessProfileCard />
			<KnowledgeGraphSection part="recommendations" grid={5} />

			<ColumnComponent>
				<SectionTitle
					step={2}
					title={__('How your pages describe it', 'vulopilot')}
					desc={__('The structured data (schema) on your pages, and exactly what each page sends.', 'vulopilot')}
				/>
			</ColumnComponent>

			<StructuredDataSection coverage={coverage} />

			<InspectorSection
				snapshot={coverage.snapshot}
				pageFilter={pageFilter}
				onPageFilterChange={setPageFilter}
			/>

			<KnowledgeGraphSection part="health" grid={12} />
		</ContainerComponent>
	);
};

export default SchemaKnowledgeTab;
