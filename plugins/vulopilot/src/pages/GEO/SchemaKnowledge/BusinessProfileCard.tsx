/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { CardComponent, ColumnComponent, ListComponent, ModuleGuardComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import type { EntitiesResponse } from './KnowledgeGraphSection';
import { ENTITY_SETTINGS_URL } from './KnowledgeGraphSection';
import BusinessNameDetailsPanel from './BusinessNameDetailsPanel';
import ProductDetailsPanel from './ProductDetailsPanel';
import { useFilterSlot } from '../../../services/useFilterSlot';
import { KnowledgeGraphDiagram } from './KnowledgeGraphDiagramCard';
import ShowProPopup from '../../../components/Popup/Popup';
import { ScoreRing } from '../../../components/ScoreBreakdown/ScoreBreakdown';

const isBrandModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes('brand-visibility') ?? false;

const isEntityExtractionModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes('knowledge-graph') ?? false;

/** Understanding-language labels for the real `entity_score` gauge. */
const getRating = (score: number): string => {
	if (score >= 90) {
		return __('Excellent', 'vulopilot');
	}

	if (score >= 70) {
		return __('Good', 'vulopilot');
	}

	if (score >= 40) {
		return __('Needs work', 'vulopilot');
	}

	return __('Incomplete', 'vulopilot');
};

interface ProfileRow {
	key: string;
	label: string;
	found: boolean;
	/** True only for Products with no WooCommerce active. */
	notApplicable?: boolean;
	value: string;
	confidence: 'high' | 'medium' | 'n/a';
}

/** Real "confidence" a site owner should place in each row, disclosed here rather than left implicit. */
const buildRows = (entities: EntitiesResponse): ProfileRow[] => {
	const businessName = entities.organizations[0]?.name ?? '';

	return [
		{
			key: 'business_name',
			label: __('Business name', 'vulopilot'),
			found: '' !== businessName,
			value: businessName || __('Not found', 'vulopilot'),
			confidence: '' !== businessName ? 'high' : 'n/a',
		},
		{
			key: 'business_type',
			label: __('Business type', 'vulopilot'),
			found: '' !== entities.business_type,
			value: entities.business_type || __('Not found', 'vulopilot'),
			confidence: '' !== entities.business_type ? 'high' : 'n/a',
		},
		{
			key: 'services',
			label: __('Services', 'vulopilot'),
			found: entities.services.length > 0,
			value:
				entities.services.length > 0
					? sprintf(
						/* translators: %d: real number of detected services. */
						_n('%d service', '%d services', entities.services.length, 'vulopilot'),
						entities.services.length
					)
					: __('Not found', 'vulopilot'),
			confidence: entities.services.length > 0 ? 'high' : 'n/a',
		},
		{
			key: 'locations',
			label: __('Locations', 'vulopilot'),
			found: entities.locations.length > 0,
			value:
				entities.locations.length > 0
					? sprintf(
						/* translators: %d: real number of detected locations. */
						_n('%d location', '%d locations', entities.locations.length, 'vulopilot'),
						entities.locations.length
					)
					: __('Not found', 'vulopilot'),
			confidence: entities.locations.length > 0 ? 'high' : 'n/a',
		},
		{
			key: 'people',
			label: __('People', 'vulopilot'),
			found: entities.people.length > 0,
			value:
				entities.people.length > 0
					? sprintf(
						/* translators: %d: real number of detected people. */
						_n('%d person', '%d people', entities.people.length, 'vulopilot'),
						entities.people.length
					)
					: __('Not found', 'vulopilot'),
			confidence: entities.people.length > 0 ? 'medium' : 'n/a',
		},
		{
			key: 'products',
			label: __('Products', 'vulopilot'),
			found: null !== entities.products && entities.products.length > 0,
			notApplicable: null === entities.products,
			value:
				null === entities.products
					? __('Not applicable', 'vulopilot')
					: entities.products.length > 0
						? sprintf(
							/* translators: %d: real number of detected products. */
							_n('%d product', '%d products', entities.products.length, 'vulopilot'),
							entities.products.length
						)
						: __('Not found', 'vulopilot'),
			confidence: null !== entities.products && entities.products.length > 0 ? 'medium' : 'n/a',
		},
		{
			key: 'categories',
			label: __('Categories', 'vulopilot'),
			found: entities.categories.length > 0,
			value:
				entities.categories.length > 0
					? sprintf(
						/* translators: %d: real number of detected categories. */
						_n('%d category', '%d categories', entities.categories.length, 'vulopilot'),
						entities.categories.length
					)
					: __('Not found', 'vulopilot'),
			confidence: entities.categories.length > 0 ? 'high' : 'n/a',
		},
		{
			key: 'contact_details',
			label: __('Contact details', 'vulopilot'),
			found: entities.contact_email.found,
			value: entities.contact_email.found
				? __('Found', 'vulopilot')
				: __('Not found', 'vulopilot'),
			confidence: entities.contact_email.found ? 'high' : 'n/a',
		},
	];
};

const CONFIDENCE_LABEL: Record<ProfileRow['confidence'], string> = {
	high: __('High', 'vulopilot'),
	medium: __('Medium', 'vulopilot'),
	'n/a': '-',
};

/** Same real per-entity-type icon KnowledgeGraphSection.tsx's own "What AI & Search Understand" card already uses for `organizations`/`categories`/`people`/`locations`/`services`/`products`. */
const ROW_ICON: Record<string, string> = {
	business_name: 'global-community blue',
	business_type: 'module green',
	people: 'person pink',
	services: 'customer-service yellow',
	products: 'product lime',
	categories: 'category orange',
	locations: 'location cyan',
	contact_details: 'mail indigo',
};

/** "Business Information" / "Key Information Found by AI". */
const BusinessProfileCard = () => {
	const [entityScore, setEntityScore] = useState<number | null>(null);
	const [entities, setEntities] = useState<EntitiesResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	// The real "Business Name Details" side panel is the only row here with a real multi-source cross-check behind it.
	const [isNamePanelOpen, setIsNamePanelOpen] = useState(false);
	// The real "Product Details" side panel (ProductDetailsPanel.tsx).
	const [isProductsPanelOpen, setIsProductsPanelOpen] = useState(false);
	const [isCustomSchemaProPopupOpen, setIsCustomSchemaProPopupOpen] = useState(false);
	/** The "People" row's own real popup. */
	const [isPeopleDropdownOpen, setIsPeopleDropdownOpen] = useState(false);
	/** The "Categories" row's own real popup - same pattern as `isPeopleDropdownOpen` above. */
	const [isCategoriesPopupOpen, setIsCategoriesPopupOpen] = useState(false);

	const KnowledgeGraphVisualizationCard = useFilterSlot(
		'vulopilot_knowledge_graph_visualization_card'
	);

	useEffect(() => {
		const requests: Promise<unknown>[] = [];

		if (isBrandModuleActive()) {
			requests.push(
				getApiResponse<{ entity_score: number }>(
					getApiLink(vulopilotAppLocalizer, 'brand-intelligence/score'),
					{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
				).then((response) => {
					if (response) {
						setEntityScore(response.entity_score);
					}
				})
			);
		}

		if (isEntityExtractionModuleActive()) {
			requests.push(
				getApiResponse<EntitiesResponse>(getApiLink(vulopilotAppLocalizer, 'entities'), {
					headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
				}).then((response) => {
					if (response) {
						setEntities(response);
					}
				})
			);
		}

		Promise.all(requests).finally(() => setIsLoading(false));
	}, []);

	const rows = entities ? buildRows(entities) : [];
	// Excludes `notApplicable` rows (Products with no WooCommerce active).
	const missingCount = rows.filter((row) => !row.found && !row.notApplicable).length;
	// The "Products" row's own real "View" action opens `ProductDetailsPanel`, which has nothing real to show without at least 1 real product.
	const visibleRows = rows.filter(
		(row) => 'products' !== row.key || row.found
	);

	if (!isLoading && null === entityScore && null === entities) {
		return (
			<ColumnComponent>
				<CardComponent
					title={__('Business Information', 'vulopilot')}
					titleIcon="info"
					desc={__('Overall completeness and accuracy.', 'vulopilot')}
				>
					<ModuleGuardComponent
						icon="error"
						title={__('Business Identity modules are turned off', 'vulopilot')}
						desc={__(
							'Turn Brand Intelligence and Entity Extraction back on from Settings → Modules to see your real business profile here.',
							'vulopilot'
						)}
					/>
				</CardComponent>
			</ColumnComponent>
		);
	}

	// What each row's button does: open its detail panel or popup, or go to Business Information to add it.
	const actionFor = (row: ProfileRow): { label: string; onClick: () => void } | null => {
		if (row.notApplicable) {
			return null;
		}
		if (!row.found && 'contact_details' !== row.key) {
			return { label: __('Add', 'vulopilot'), onClick: () => window.open(ENTITY_SETTINGS_URL, '_self') };
		}
		switch (row.key) {
			case 'business_name':
				return { label: __('Check', 'vulopilot'), onClick: () => setIsNamePanelOpen(true) };
			case 'products':
				return { label: __('View', 'vulopilot'), onClick: () => setIsProductsPanelOpen(true) };
			case 'people':
				return { label: __('View', 'vulopilot'), onClick: () => setIsPeopleDropdownOpen(true) };
			case 'categories':
				return { label: __('View', 'vulopilot'), onClick: () => setIsCategoriesPopupOpen(true) };
			case 'contact_details':
				return entities?.contact_email.edit_url
					? {
							label: row.found ? __('View', 'vulopilot') : __('Add', 'vulopilot'),
							onClick: () => window.open(entities.contact_email.edit_url as string, '_self'),
						}
					: null;
			default:
				return { label: __('Edit', 'vulopilot'), onClick: () => window.open(ENTITY_SETTINGS_URL, '_self') };
		}
	};

	const applicableRows = rows.filter((row) => !row.notApplicable);
	const foundCount = applicableRows.filter((row) => row.found).length;
	const totalCount = applicableRows.length;
	// Missing details first: they are the next thing to do.
	const orderedRows = [...visibleRows].sort((x, y) => Number(x.found) - Number(y.found));

	return (
		<>
			<ColumnComponent grid={12}>
				<CardComponent
					title={__('Business profile', 'vulopilot')}
					titleIcon="info"
					desc={__('What search engines and AI assistants know about your business, and what they are missing.', 'vulopilot')}
					isLoading={isLoading || undefined}
					action={
						<ButtonInput
							buttons={{
								text: __('Add custom schema', 'vulopilot'),
								icon: 'plus',
								color: 'purple',
								onClick: () => setIsCustomSchemaProPopupOpen(true),
							}}
						/>
					}
				>
					<div className="vp-profile-hero">
						<div className="vp-profile-hero-summary">
							{null !== entityScore && <ScoreRing score={entityScore} label={getRating(entityScore)} />}
							{entities && (
								<>
									<div className="vp-profile-progress">
										<div>
											<strong>
												{sprintf(
													/* translators: 1: details found, 2: details checked. */
													__('%1$d of %2$d details found', 'vulopilot'),
													foundCount,
													totalCount
												)}
											</strong>
										</div>
										<span className="vp-profile-progress-bar" aria-hidden="true">
											<i style={{ width: `${totalCount ? (foundCount / totalCount) * 100 : 0}%` }} />
										</span>
									</div>
									<p>
										{missingCount > 0
											? sprintf(
													/* translators: %d: number of business details not found yet. */
													_n(
														'Add the missing detail so AI can describe your business fully and correctly.',
														'Add the %d missing details so AI can describe your business fully and correctly.',
														missingCount,
														'vulopilot'
													),
													missingCount
												)
											: __('Every detail is in place. AI has a complete picture of your business.', 'vulopilot')}
									</p>
									{missingCount > 0 && (
										<a className="vp-profile-cta" href={ENTITY_SETTINGS_URL}>
											<i className="adminfont-plus" aria-hidden="true" />
											{__('Add missing details', 'vulopilot')}
										</a>
									)}
								</>
							)}
							{null === entityScore && !entities && !isLoading && (
								<ModuleGuardComponent
									icon="error"
									title={__('Brand Intelligence is off', 'vulopilot')}
									desc={__('Turn it back on to see a real score here.', 'vulopilot')}
								/>
							)}
						</div>

						{null === entities ? (
							!isLoading && (
								<ModuleGuardComponent
									icon="error"
									title={__('Entity Extraction is off', 'vulopilot')}
									desc={__('Turn it back on to see real detected fields here.', 'vulopilot')}
								/>
							)
						) : (
							<ul className="vp-profile-checklist">
								{orderedRows.map((row) => {
									const action = actionFor(row);
									const state = row.notApplicable ? 'na' : row.found ? 'found' : 'missing';

									return (
										<li key={row.key} className={`is-${state}`}>
											<span className="vp-profile-check-icon" aria-hidden="true">
												<i className={`adminfont-${ROW_ICON[row.key].split(' ')[0]}`} />
											</span>
											<span className="vp-profile-check-text">
												<strong>{row.label}</strong>
												<span>
													{row.value}
													{row.found && 'n/a' !== row.confidence && (
														<em>
															{' · '}
															{sprintf(
																/* translators: %s: High or Medium. */
																__('%s confidence', 'vulopilot'),
																CONFIDENCE_LABEL[row.confidence]
															)}
														</em>
													)}
												</span>
											</span>
											<span className={`vp-profile-check-state is-${state}`}>
												{'found' === state && __('Found', 'vulopilot')}
												{'missing' === state && __('Missing', 'vulopilot')}
												{'na' === state && __('N/A', 'vulopilot')}
											</span>
											{action && (
												<button type="button" className="vp-profile-check-action" onClick={action.onClick}>
													{action.label}
												</button>
											)}
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</CardComponent>
			</ColumnComponent>

			<ColumnComponent grid={7} fullHeight>
				<CardComponent
					title={__('How AI connects your business', 'vulopilot')}
					titleIcon="centralized-connections"
					desc={__('The things AI reads from your site - your organisation, people, places and topics - and how they link up.', 'vulopilot')}
					isLoading={isLoading || undefined}
				>
					{KnowledgeGraphVisualizationCard ? (
						<KnowledgeGraphVisualizationCard />
					) : (
						entities && <KnowledgeGraphDiagram entities={entities} />
					)}
				</CardComponent>
				<PopupComponent
					open={isPeopleDropdownOpen}
					onClose={() => setIsPeopleDropdownOpen(false)}
					width={28}
					height={"65%"}
					header={{
						title: __('People', 'vulopilot'),
						description: __(
							'Every real Administrator and post author detected on your site.',
							'vulopilot'
						),
					}}
				>

					{entities && 0 === entities.people.length ? (
						<p className="desc">
							{__('No people detected yet.', 'vulopilot')}
						</p>
					) : (
						<ListComponent
							className="mini-card report"
							items={
								entities?.people.map((person) => {

									const editUrl =
										'string' === typeof person.meta?.edit_url
											? person.meta.edit_url
											: null;

									return {
										id: String(person.id),
										title: person.name,
										icon: 'person green',
										tags: (
											<>
												{editUrl && (
													<ButtonInput
														buttons={{
															text: __('Edit', 'vulopilot'),
															rightIcon: 'edit',
															color: 'text-purple',
															onClick: () =>
																window.open(editUrl, '_self'),
														}}
													/>
												)}
											</>
										),
									};
								}) || []
							}
						/>
					)}
				</PopupComponent>
				<PopupComponent
					open={isCategoriesPopupOpen}
					onClose={() => setIsCategoriesPopupOpen(false)}
					width={28}
					height={"65%"}
					header={{
						title: __('Categories', 'vulopilot'),
						description: __(
							'Every real category (and product category, when WooCommerce is active) detected on your site.',
							'vulopilot'
						),
					}}
				>

					{entities && 0 === entities.categories.length ? (
						<p className="desc">
							{__('No categories detected yet.', 'vulopilot')}
						</p>
					) : (
						<ListComponent
							className="mini-card report"
							items={
								entities?.categories.map((category) => {
									const editUrl =
										'string' === typeof category.meta?.edit_url
											? category.meta.edit_url
											: null;

									return {
										id: String(category.id),
										title: category.name,
										tags: (
											<>
												{editUrl && (
													<ButtonInput
														buttons={{
															text: __('Edit', 'vulopilot'),
															rightIcon: 'edit',
															color: 'text-purple',
															onClick: () => window.open(editUrl, '_self'),
														}}
													/>
												)}
											</>
										),
									};
								}) || []
							}
						/>
					)}
				</PopupComponent>
				<BusinessNameDetailsPanel
					open={isNamePanelOpen}
					onClose={() => setIsNamePanelOpen(false)}
				/>
				<ProductDetailsPanel
					open={isProductsPanelOpen}
					onClose={() => setIsProductsPanelOpen(false)}
				/>
				<PopupComponent
					open={isCustomSchemaProPopupOpen}
					onClose={() => setIsCustomSchemaProPopupOpen(false)}
					width={31.25}
					height="auto"
					position="lightbox"
				>
					<ShowProPopup />
				</PopupComponent>
			</ColumnComponent>
		</>
	);
};

export default BusinessProfileCard;
