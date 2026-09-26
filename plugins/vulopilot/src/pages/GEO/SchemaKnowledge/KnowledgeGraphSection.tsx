/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import {
	CardComponent,
	ColumnComponent,
	ModuleGuardComponent,
} from '@zyra/components';
import { useFilterSlot } from '../../../services/useFilterSlot';

/** Real Settings → Get Started → Business Information subtab id (Settings.tsx's own `currentTab === 'business-information'` branch) - where the `entity_business_type`/`entity_service_pages`/`entity_business_locations` fields this section (and BusinessProfileCard.tsx/KnowledgeGraphDiagramCard.tsx, which import this same constant) read actually live. Moved out of Scanning → AI Visibility per direct instruction - see GetStarted/BusinessInformation.ts's own docblock. */
export const ENTITY_SETTINGS_URL = '?page=vulopilot#&tab=settings&subtab=business-information';


export interface Entity {
	id: string;
	type: string;
	name: string;
	url: string | null;
	source_object_type: string;
	source_object_ref: string;
	meta: Record<string, unknown>;
}

export interface EntitiesResponse {
	people: Entity[];
	organizations: Entity[];
	products: Entity[] | null;
	services: Entity[];
	locations: Entity[];
	categories: Entity[];
	/** Real, owner-provided `entity_business_type` setting (Settings → Site Identity → Business Information) - empty string until set, never guessed. */
	business_type: string;
	/** Real, deterministic check - a published page at `/contact/` or `/contact-us/` (Services\EntityExtractor::find_contact_page(), same slug list Scanners\Basic\GeoTrustSignalsScanner's own "missing Contact page" finding already checks). Kept for whatever else still reads it; BusinessProfileCard.tsx's own "Contact details" row reads `contact_email` below instead. */
	has_contact_page: boolean;
	contact_page_url: string | null;
	/** The site admin's real account email (`get_option('admin_email')`, matched to a real \WP_User) - BusinessProfileCard.tsx's own "Contact details" row. `edit_url` (computed per-viewer in EntityExtraction::get_items(), same as `people[].meta.edit_url`) is `user-edit.php?...&highlight=email`, real regardless of `found` so a missing email can be added on the same screen it'd be reviewed on. */
	contact_email: {
		found: boolean;
		edit_url: string | null;
	};
	/** Real, template-built (never AI-generated) candidate relationships - see Services\EntityExtractor::build_suggested_relationships()'s own docblock for why these are "suggested," not "confirmed." */
	suggested_relationships: string[];
}


/**
 * Same "genuinely gates the underlying data" posture SeoTab.tsx's own
 * isSeoModuleActive() already documents - EntityExtractor returns empty
 * groups when this module is inactive (see its own docblock), so this
 * tab tells the site owner why rather than showing empty lists with no
 * explanation.
 */
const isEntityExtractionModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes('knowledge-graph') ?? false;





/**
 * "Knowledge Graph" section of the merged "Business Identity & Schema" tab
 * (moved here unchanged from the standalone KnowledgeGraphTab.tsx as part
 * of the original Schema+Knowledge Graph merge - see SchemaKnowledgeTab.tsx's
 * own docblock; renamed again since, per direct instruction, to match a
 * newer reference mockup - see that same docblock) - Free's own Entity
 * Extraction (6 real, deterministic entity types, KNOWLEDGE-GRAPH-MODULE.md).
 *
 * "What AI & Search Understand" is now a real tabbed card, not just a
 * count list - per direct instruction ("remove the separate
 * Business Locations/Categories/People/Services cards, populate their
 * data inside this card in tabbed format, clicking a row shows that
 * tab"). Each of the 6 count-list rows (Organization/Products/Categories/
 * People/Locations/Services) IS the tab selector - clicking one sets
 * `activeEntityTab` and shows that type's own real detail (the exact same
 * list/empty-state/badge/link content the old standalone cards rendered,
 * via `EntityDetailContent`) in its own panel, inside this same card.
 * Defaults to the "Organization" tab so that panel never starts blank.
 */
const KnowledgeGraphSection = () => {
	const [error, setError] = useState<string | null>(null);

	const EntityRecommendationsCard = useFilterSlot(
		'vulopilot_knowledge_graph_recommendations_card'
	);
	const KnowledgeGraphHealthCard = useFilterSlot(
		'vulopilot_knowledge_graph_health_card'
	);

	const fetchEntities = () => {
		if (!isEntityExtractionModuleActive()) {
			return;
		}

		setError(null);

		getApiResponse<EntitiesResponse>(getApiLink(vulopilotAppLocalizer, 'entities'), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		}).then((response) => {
			if (!response) {
				setError(
					__('Could not load extracted entities.', 'vulopilot')
				);
			}
		});
	};

	useEffect(() => {
		fetchEntities();
	}, []);

	if (!isEntityExtractionModuleActive()) {
		return (
			<ColumnComponent grid={6}>
				<CardComponent
					title={__('Entity Extraction', 'vulopilot')}
					titleIcon="centralized-connections"
					desc={__(
						'What VuloPilot extracts from your site - organizations, products, categories, people, locations, and services - and how they relate.',
						'vulopilot'
					)}
				>
					<ModuleGuardComponent
						icon="error"
						title={__(
							'Entity Extraction module is turned off',
							'vulopilot'
						)}
						desc={__(
							'Turn the Entity Extraction module back on from Settings → Modules to see your site\'s entities here again.',
							'vulopilot'
						)}
					/>
				</CardComponent>
			</ColumnComponent>
		);
	}

	if (error) {
		return (
			<ColumnComponent>
				<CardComponent
					title={__('Knowledge Graph', 'vulopilot')}
					titleIcon="centralized-connections"
					desc={__(
						'These are the main things we detected on your site and how they connect.',
						'vulopilot'
					)}
				>
					<ModuleGuardComponent
						icon="error"
						title={__(
							'Could not load extracted entities',
							'vulopilot'
						)}
						desc={error}
					/>
				</CardComponent>
			</ColumnComponent>
		);
	}





	return (
		<>
			{KnowledgeGraphHealthCard &&
				<ColumnComponent grid={6} fullHeight>
					<KnowledgeGraphHealthCard />
				</ColumnComponent>
			}
			{EntityRecommendationsCard &&
				<ColumnComponent grid={6} fullHeight>
					<EntityRecommendationsCard />
				</ColumnComponent>
			}
		</>
	);
};

export default KnowledgeGraphSection;
