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

/** Real Settings → Get Started → Business Information subtab id. */
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
	/** Real, owner-provided `entity_business_type` setting. */
	business_type: string;
	/** Real, deterministic check. */
	has_contact_page: boolean;
	contact_page_url: string | null;
	/** The site admin's real account email (`get_option('admin_email')`, matched to a real \WP_User). */
	contact_email: {
		found: boolean;
		edit_url: string | null;
	};
	/** Real, template-built (never AI-generated) candidate relationships. */
	suggested_relationships: string[];
}


/** Same "genuinely gates the underlying data" posture SeoTab.tsx's own isSeoModuleActive() already documents. */
const isEntityExtractionModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes('knowledge-graph') ?? false;





interface KnowledgeGraphSectionProps {
	/** Which Pro card to place: the recommendations beside the diagram, or the history further down. */
	part: 'recommendations' | 'health';
	grid?: number;
}

/** "Knowledge Graph" cards of the "Business Identity & Schema" tab, placed one at a time. */
const KnowledgeGraphSection = ({ part, grid = 6 }: KnowledgeGraphSectionProps) => {
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
		if ('health' === part) {
			return null;
		}
		return (
			<ColumnComponent grid={grid}>
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
		if ('health' === part) {
			return null;
		}
		return (
			<ColumnComponent grid={grid}>
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





	const Card = 'health' === part ? KnowledgeGraphHealthCard : EntityRecommendationsCard;

	return Card ? (
		<ColumnComponent grid={grid} fullHeight>
			<Card />
		</ColumnComponent>
	) : null;
};

export default KnowledgeGraphSection;
