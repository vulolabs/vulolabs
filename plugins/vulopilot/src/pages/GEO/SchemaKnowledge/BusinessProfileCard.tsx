/* global appLocalizer */
import { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, COLOR_PALETTE } from '@zyra/core';
import { CardComponent, ChartComponent, ColumnComponent, ListComponent, ModuleGuardComponent, PopupComponent, TypographyComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import type { EntitiesResponse } from './KnowledgeGraphSection';
import { ENTITY_SETTINGS_URL } from './KnowledgeGraphSection';
import BusinessNameDetailsPanel from './BusinessNameDetailsPanel';
import ProductDetailsPanel from './ProductDetailsPanel';
import { ratingColor } from '../seoRating';
import { useFilterSlot } from '../../../services/useFilterSlot';
import { KnowledgeGraphDiagram } from './KnowledgeGraphDiagramCard';
import ShowProPopup from '../../../components/Popup/Popup';

const isBrandModuleActive = () =>
	appLocalizer.active_modules?.includes('brand-intelligence') ?? false;

const isEntityExtractionModuleActive = () =>
	appLocalizer.active_modules?.includes('entity-extraction') ?? false;

/**
 * Understanding-language labels for the real `entity_score` gauge —
 * BusinessUnderstandingCard.tsx's own former "Good"/"Needs Work"/"Poor"
 * labels, renamed to match the reference mockup's own "Mostly understood"
 * phrasing (same real 0-100 score, same real thresholds otherwise — only
 * a >=90 "Fully understood" tier is new, since the mockup's own single
 * real example (76) only ever showed the >=70 tier and never a perfect
 * score to infer that top tier's own real wording from).
 */
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
	/** True only for Products with no WooCommerce active — a real "doesn't apply to this site" state, told apart from `found: false` (a real, fixable gap) so the gauge's own "N details missing" caption below doesn't count a row nobody can actually fill in. */
	notApplicable?: boolean;
	value: string;
	confidence: 'high' | 'medium' | 'n/a';
}

/**
 * Real "confidence" a site owner should place in each row, disclosed here
 * rather than left implicit:
 * - Business name: always "high" — Services\EntityExtractor::extract_organizations()
 *   always returns a real value (the site's own title, at minimum).
 * - Business type: "high" once set — a real, owner-typed value (Settings →
 *   Get Started → Business Information), never guessed.
 * - People: "medium" — real, but auto-detected from post authorship, not
 *   an explicit "these are our team" declaration.
 * - Services/Locations: "high" once set — real, owner-curated lists
 *   (same settings tab), a deliberate confirmation, not an inference.
 * - Products: "medium" — real WooCommerce data, but auto-detected, not
 *   explicitly confirmed as public-facing "what we sell" copy.
 * - Categories: "high" once present — real taxonomy terms already
 *   attached to at least one published post/product, same deterministic
 *   `hide_empty` read `Services\EntityExtractor::extract_categories()`
 *   already uses.
 * - Contact details: "high" once set — a real, deterministic check of the
 *   site admin's own account email (`get_option('admin_email')`, matched
 *   to a real \WP_User), not the published-page check
 *   (Services\EntityExtractor::find_contact_page()) this row used to read.
 */
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
	'n/a': '—',
};

/** Same real per-entity-type icon KnowledgeGraphSection.tsx's own "What AI & Search Understand" card already uses for `organizations`/`categories`/`people`/`locations`/`services`/`products` — reused here so the same real entity type reads with the same icon everywhere on this tab, not a second, different icon choice for the identical real data. `business_type`/`contact_details` have no equivalent row there (not one of that card's 6 entity-type groups), so those 2 get their own real closest-fit icon instead. */
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

/**
 * "Business Information" / "Key Information Found by AI" — 2 real cards
 * (grid 4 + grid 8, one row) matching a newer reference mockup: the same
 * real `entity_score` gauge (`GET /brand-intelligence/score`, unchanged)
 * on its own now, beside a real per-field table of what
 * Services\EntityExtractor actually found (`GET /entities`, the same real
 * endpoint KnowledgeGraphSection.tsx already uses) with a real per-row
 * action — "View" opens `ENTITY_SETTINGS_URL` for every row except
 * "Business name" (which opens `BusinessNameDetailsPanel.tsx`'s own real
 * multi-source cross-check instead — see that file's own docblock for why
 * only this one row gets that), "Add Details" for a genuinely missing
 * field. Formerly one combined card (`BusinessProfileCard`'s own former
 * 3-up layout) — split into 2 to match the mockup's own visual weighting,
 * same real data either way. Nothing here is fabricated — a "Not found"
 * row is a real absence of data, not a placeholder; see `buildRows()`'s
 * own docblock for exactly what each row's "confidence" is based on.
 *
 * The "Business Information" card also now renders the real Graph
 * Visualization pane below its own score ring — moved here from
 * KnowledgeGraphSection.tsx per direct instruction (that file's own
 * docblock has the real reasoning for why it moved and why that card
 * widened to fill its own row afterward). Same real
 * `vulopilot_knowledge_graph_visualization_card` Pro slot / free
 * `KnowledgeGraphDiagram` fallback either way, just reusing this card's
 * own already-fetched `entities` instead of a 2nd fetch.
 */
const BusinessProfileCard = () => {
	const [entityScore, setEntityScore] = useState<number | null>(null);
	const [entities, setEntities] = useState<EntitiesResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	// The real "Business Name Details" side panel (BusinessNameDetailsPanel.tsx)
	// is the only row here with a real multi-source cross-check behind it —
	// see that file's own docblock for why the other rows don't get an
	// equivalent panel.
	const [isNamePanelOpen, setIsNamePanelOpen] = useState(false);
	// The real "Product Details" side panel (ProductDetailsPanel.tsx) —
	// same reasoning as `isNamePanelOpen` above, just for the "Products"
	// row instead of "Business name".
	const [isProductsPanelOpen, setIsProductsPanelOpen] = useState(false);
	/** "Add custom schema" — real Pro popup instead of a real editor (nothing implemented yet, Free or Pro, to gate here); opens in place of the button's own previous `window.location.href = 'edit.php'` dead-end. */
	const [isCustomSchemaProPopupOpen, setIsCustomSchemaProPopupOpen] = useState(false);
	/** The "People" row's own real popup — same `PopupComponent` pattern `business_name`/`products` already use, listing every real Administrator + post author (Services\EntityExtractor::extract_people()), each with its own real role and, for whoever the viewing admin can actually edit, a real `get_edit_user_link()` destination. */
	const [isPeopleDropdownOpen, setIsPeopleDropdownOpen] = useState(false);
	/** The "Categories" row's own real popup — same pattern as `isPeopleDropdownOpen` above, listing every real `category` + (when WooCommerce is active) `product_cat` term (Services\EntityExtractor::extract_categories()), each with its own real taxonomy and, for whoever the viewing admin can actually edit, a real `get_edit_term_link()` destination. */
	const [isCategoriesPopupOpen, setIsCategoriesPopupOpen] = useState(false);

	// Called unconditionally, before the early return below, per the rules
	// of hooks — same reasoning KnowledgeGraphSection.tsx's own identical
	// call already documents (a Pro slot resolving is irrelevant on the
	// "modules off" branch anyway).
	const KnowledgeGraphVisualizationCard = useFilterSlot(
		'vulopilot_knowledge_graph_visualization_card'
	);

	useEffect(() => {
		const requests: Promise<unknown>[] = [];

		if (isBrandModuleActive()) {
			requests.push(
				getApiResponse<{ entity_score: number }>(
					getApiLink(appLocalizer, 'brand-intelligence/score'),
					{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
				).then((response) => {
					if (response) {
						setEntityScore(response.entity_score);
					}
				})
			);
		}

		if (isEntityExtractionModuleActive()) {
			requests.push(
				getApiResponse<EntitiesResponse>(getApiLink(appLocalizer, 'entities'), {
					headers: { 'X-WP-Nonce': appLocalizer.nonce },
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
	// Excludes `notApplicable` rows (Products with no WooCommerce active) —
	// those aren't a real, fixable gap, so counting them here would
	// overstate how much is actually missing.
	const missingCount = rows.filter((row) => !row.found && !row.notApplicable).length;
	// The "Products" row's own real "View" action opens `ProductDetailsPanel`,
	// which has nothing real to show without at least 1 real product — so
	// the row itself is dropped from this table entirely (not shown as a
	// dead "Not found"/"Not applicable" line) whenever there's no real
	// product to report on, whether that's WooCommerce being off
	// (`notApplicable`) or WooCommerce being on with zero published
	// products (`!found`). `missingCount` above still counts a real "0
	// products" gap toward the donut's own overall completeness caption —
	// hiding the row here is about this table having nothing real to show,
	// not about that gap ceasing to be real.
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

	return (
		<>
			<ColumnComponent grid={5} fullHeight>
				<CardComponent
					title={__('Business Information', 'vulopilot')}
					titleIcon="info"
					desc={__('Overall completeness and accuracy.', 'vulopilot')}
					isLoading={isLoading}
				>
					{null === entityScore ? (
						<ModuleGuardComponent
							icon="error"
							title={__('Brand Intelligence is off', 'vulopilot')}
							desc={__('Turn it back on to see a real score here.', 'vulopilot')}
						/>
					) : (
						<div className="business-score-gauge">
							<ChartComponent
								type="ring"
								height={200}
								color={
									COLOR_PALETTE[
									ratingColor(entityScore) as keyof typeof COLOR_PALETTE
									]
								}
								// Same `TypographyComponent` h1/h4 centerLabel shape
								// every other real score ring in this plugin uses
								// (OverallScoreWidget.tsx/SeoTab.tsx/
								// GeoScoreSection.tsx/etc.) — replacing this ring's
								// own raw `<span>` pair, which read its number/
								// label colors from `.score-ring-number`/
								// `.geo-overall-rating.is-*` (SeoVisibility.scss)
								// instead of the real `ratingColor()` palette name
								// `TypographyComponent`'s own `color` prop already
								// resolves everywhere else.
								centerLabel={
									<>
										<TypographyComponent
											variant={'h1'}
											color={ratingColor(entityScore)}
										>
											{entityScore}
										</TypographyComponent>
										<TypographyComponent variant={'h4'}>
											{getRating(entityScore)}
										</TypographyComponent>
									</>
								}
								data={[
									{
										label: __('Score', 'vulopilot'),
										value: entityScore,
										// Same real rating color the ring's own
										// label above already uses
										// (`ratingColor()`/`getRating()`) —
										// resolved through `COLOR_PALETTE` for
										// the real hex `ratingColor()`'s own
										// palette name stands for, rather than a
										// fixed brand purple unrelated to the
										// actual score. `ChartComponent`'s own
										// `type="ring"` only ever reads the top-
										// level `color` prop above for its actual
										// stroke (not a per-row `color` the way
										// `type="pie"` does) — kept here too so
										// this data shape matches the real one
										// `type="ring"` reads `rows[0][dataKey]`
										// from either way.
										color: COLOR_PALETTE[
											ratingColor(entityScore) as keyof typeof COLOR_PALETTE
										],
									},
									{
										label: __('Remaining', 'vulopilot'),
										value: 100 - entityScore,
										color: '#e5e7eb',
									},
								]}
							/>
							<div className="desc">
								{missingCount > 0
									? sprintf(
										/* translators: %d is how many of the 7 real profile fields below have no real data yet. */
										_n(
											'Your business information is mostly complete, but %d important detail is missing.',
											'Your business information is mostly complete, but %d important details are missing.',
											missingCount,
											'vulopilot'
										),
										missingCount
									)
									: __('Your business information is fully filled in.', 'vulopilot')}
							</div>
						</div>
					)}
					{KnowledgeGraphVisualizationCard ? (
						<KnowledgeGraphVisualizationCard />
					) : (
						// `entities` is still null for a real, guaranteed-to-happen
						// window on every load (this state's own initial value, before
						// `GET /entities` resolves) — KnowledgeGraphDiagram's own props
						// type requires a real EntitiesResponse and dereferences it
						// immediately (`entities.organizations[0]`), so rendering it
						// unguarded would crash this whole card on every single load
						// whenever Pro's own KnowledgeGraphVisualizationCard isn't
						// available. Same real `entities &&` guard
						// KnowledgeGraphSection.tsx's own former render site for this
						// same diagram already used.
						entities && <KnowledgeGraphDiagram entities={entities} />
					)}
				</CardComponent>
			</ColumnComponent>

			<ColumnComponent grid={7} fullHeight>
				<CardComponent
					title={__('Key Information Found by AI', 'vulopilot')}
					titleIcon="module"
					desc={__(
						'Here’s what we found about your business and what needs attention.',
						'vulopilot'
					)}
					isLoading={isLoading}
					action={
						<ButtonInput
							buttons={{
								text: __('Add custom schema', 'vulopilot'),
								icon: 'plus',
								onClick: () => setIsCustomSchemaProPopupOpen(true),
							}}
						/>
					}
				>
					{null === entities ? (
						<ModuleGuardComponent
							icon="error"
							title={__('Entity Extraction is off', 'vulopilot')}
							desc={__('Turn it back on to see real detected fields here.', 'vulopilot')}
						/>
					) : (
						<ListComponent
							className="mini-card report business-profile-list"
							items={visibleRows.map((row) => ({
								id: row.key,
								icon: ROW_ICON[row.key],
								title: row.label,
								desc: row.value,
								tags: (
									<div className="business-profile-list-tags">
										{'n/a' !== row.confidence && (
											<span className={`admin-badge ${row.notApplicable ? 'info' : row.found ? 'green' : 'red'}`}>
												{CONFIDENCE_LABEL[row.confidence]}
											</span>
										)}

										{row.notApplicable ? (
											<span className="business-profile-na">—</span>
										) : 'business_name' === row.key ? (
											<ButtonInput
												buttons={{
													text: __('View', 'vulopilot'),
													color: 'text-blue',
													icon: 'eye',
													onClick: () => setIsNamePanelOpen(true),
												}}
											/>
										) : 'products' === row.key && row.found ? (
											<ButtonInput
												buttons={{
													text: __('View', 'vulopilot'),
													color: 'text-blue',
													icon: 'eye',
													onClick: () => setIsProductsPanelOpen(true),
												}}
											/>
										) : 'people' === row.key && row.found ? (
											<ButtonInput
												buttons={{
													text: __('View', 'vulopilot'),
													color: 'text-blue',
													icon: 'eye',
													onClick: () => setIsPeopleDropdownOpen(true),
												}}
											/>
										) : 'categories' === row.key && row.found ? (
											<ButtonInput
												buttons={{
													text: __('View', 'vulopilot'),
													icon: 'eye',
													color: 'text-blue',
													onClick: () => setIsCategoriesPopupOpen(true),
												}}
											/>
										) : 'contact_details' === row.key ? (
											// Always "View" (never "Add Details") regardless
											// of `row.found` — same real admin edit-user
											// screen either way, so a missing email is added
											// right where it'd otherwise just be reviewed,
											// per direct instruction for this one row.
											entities.contact_email.edit_url && (
												<ButtonInput
													buttons={{
														text: __('View', 'vulopilot'),
														color: 'text-blue',
														icon: 'eye',
														onClick: () =>
															window.open(
																entities.contact_email.edit_url as string,
																'_self'
															),
													}}
												/>
											)
										) : (
											<ButtonInput
												buttons={{
													text: row.found
														? __('View', 'vulopilot')
														: __('Add Details', 'vulopilot'),
													icon: row.found
														? __('eye', 'vulopilot')
														: __('plus', 'vulopilot'),
													// Was 'text-purple' — the only 3 rows that fall
													// through to this default branch (Business type,
													// Services, Locations) rendered a visibly darker
													// blue than every other row's own explicit branch
													// above, all of which use 'text-blue'. Confirmed
													// live: `btn-text-purple` computed to
													// rgb(0, 41, 145) here vs `btn-text-blue`'s
													// rgb(2, 132, 199) elsewhere on this same list.
													color: 'text-blue',
													onClick: () =>
														window.open(ENTITY_SETTINGS_URL, '_self'),
												}}
											/>
										)}
									</div>
								),
							}))}
						/>
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
									const roleLabel =
										'string' === typeof person.meta?.role_label
											? person.meta.role_label
											: '';

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
