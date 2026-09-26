import { useEffect, useState } from 'react';
import { scrollToId } from '@zyra/core';
import { ContainerComponent } from '@zyra/components';
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

/**
 * "Business Identity & Schema" tab of "SEO & Visibility" (renamed from
 * "Schema & Knowledge" - direct instruction, rebuilt to match a newer
 * reference mockup's own information architecture). Every section here
 * still renders on one continuous scrolling page under its own anchored
 * heading, same "no inner tab switcher" precedent this merge already
 * established (see this file's own earlier history) - the mockup's own
 * layout doesn't call for real inner tabs the way "Crawl & URLs" needed
 * them (CrawlUrlsTab.tsx), just a clearer visual order:
 *
 * An "In plain English" `NoticeComponent` intro banner and a 5th
 * `IssuesSection.tsx` section (`SchemaKnowledgeSectionId`'s own `'issues'`
 * member, and this file's own `IssuesSection` import, both still reflect
 * it) are described by older layers of this docblock and by this file's
 * own types as if still present, but neither is actually rendered below -
 * confirmed via lint (both totally unreferenced) and by reading the
 * current return value, not just this comment. Unlike every other section
 * change documented here, there's no "removed per direct instruction" note
 * for either, so this reads as an unintentional gap rather than a
 * deliberate one - flagged rather than silently deleted (`IssuesSection`
 * is a real, substantial, working component, same "leave real code before
 * assuming it should be deleted" posture BrokenLinksSection.tsx's own
 * docblocks establish elsewhere in this folder) or silently re-added
 * (restoring a whole missing tab section is a product call, not a
 * lint-cleanup one).
 *
 * `initialSection` - set only when a bookmarked `?subtab=schema`/
 * `?subtab=knowledge-graph` link landed here (GEO.tsx's own
 * `SUBTAB_ALIASES`) - scrolls to the matching section on mount;
 * `'overview'` (the default) means "land at the top of the page."
 */
const SchemaKnowledgeTab = ({
	initialSection = 'overview',
}: SchemaKnowledgeTabProps) => {
	const coverage = useSchemaCoverage();
	const [pageFilter, setPageFilter] = useState<SchemaPageFilter>('all');

	useEffect(() => {
		if ('overview' !== initialSection) {
			scrollToId(`schema-knowledge-${initialSection}`);
		}
		// Only the initial mount-time value matters - this never re-runs
		// on a later, unrelated re-render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<ContainerComponent>
			<BusinessProfileCard />

			<KnowledgeGraphSection />

			<StructuredDataSection coverage={coverage} />

			<InspectorSection
				snapshot={coverage.snapshot}
				pageFilter={pageFilter}
				onPageFilterChange={setPageFilter}
			/>
		</ContainerComponent>
	);
};

export default SchemaKnowledgeTab;
