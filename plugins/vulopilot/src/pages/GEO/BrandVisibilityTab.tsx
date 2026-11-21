/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import {
	CardComponent,
	ColumnComponent,
	ModuleGuardComponent,
	ContainerComponent,
	PopupComponent
} from '@zyra/components';
import BrandScoreCard from './BrandScoreCard';
import SectionedFindingsTab, { SECTIONED_FINDINGS_TABLE_ID } from '../Security/SectionedFindingsTab';
import type { FindingsSection } from '../Security/SectionedFindingsTab';
import type { SectionedIssuesTab } from '../Security/SectionedIssuesTable';
import { useFilterSlot } from '../../services/useFilterSlot';
import ShowProPopup from '../../components/Popup/Popup';
import {
	AuthorityTrendsDummy,
	KnowledgePanelDummy,
	OffSiteMentionsDummy,
	CompetitorComparisonDummy,
} from './BrandVisibilityProDummies';

/** Real backend module id - same id `isBrandModuleActive()` below checks and `MODULE_CATALOG_BY_ID` resolves to a real display name/icon for. */
const BRAND_MODULE_ID = 'brand-visibility';

/** Section → scanner_id grouping for Brand Intelligence's 7 scanners. */
const BRAND_SECTIONS: FindingsSection[] = [
	{
		key: 'trust',
		title: __('Trust Signals', 'vulopilot'),
		description: __(
			'Whether this site has the baseline pages (About/Contact) AI engines expect before treating it as citable, and whether those pages have real substance.',
			'vulopilot'
		),
		emptyMessage: __(
			'No trust-signal findings yet - run a scan to check.',
			'vulopilot'
		),
		scannerIds: ['geo-trust-signals', 'about-page-analysis'],
	},
	{
		key: 'authority',
		title: __('Authority Signals', 'vulopilot'),
		description: __(
			'Author expertise and freshness signals - bio text, content updates, and machine-readable Person schema.',
			'vulopilot'
		),
		emptyMessage: __(
			'No authority findings yet - run a scan to check.',
			'vulopilot'
		),
		scannerIds: ['geo-eeat-signals', 'geo-author-info', 'author-schema'],
	},
	{
		key: 'entity',
		title: __('Entity Consistency', 'vulopilot'),
		description: __(
			'Whether this site\'s brand name is written consistently, and whether Organization schema exists to help AI engines resolve it as a real-world entity.',
			'vulopilot'
		),
		emptyMessage: __(
			'No entity findings yet - run a scan to check.',
			'vulopilot'
		),
		scannerIds: ['geo-entity-naming-consistency', 'organization-schema'],
	},
];

/** Whether the Brand Intelligence module (Settings → Modules) is active. */
const isBrandModuleActive = () =>
	vulopilotAppLocalizer.active_modules?.includes(BRAND_MODULE_ID) ?? false;

interface BrandVisibilityTabProps {
	/** Scanner to pre-select and scroll to on mount. */
	initialScannerId?: string;
}

const BrandVisibilityTab = ({ initialScannerId }: BrandVisibilityTabProps) => {
	const initialSection = initialScannerId
		? BRAND_SECTIONS.find((section) =>
				section.scannerIds.includes(initialScannerId)
			)
		: undefined;
	const [activeTab, setActiveTab] = useState<SectionedIssuesTab>(
		initialSection?.key ?? 'all'
	);

	useEffect(() => {
		if (!initialSection) {
			return;
		}
		const timer = setTimeout(
			() =>
				document
					.getElementById(SECTIONED_FINDINGS_TABLE_ID)
					?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
			300
		);
		return () => clearTimeout(timer);
		// Mount-time value only.
	}, []);

	const AuthorityTrendsCard = useFilterSlot(
		'vulopilot_brand_authority_trends_card'
	);
	const CompetitorComparisonCard = useFilterSlot(
		'vulopilot_brand_competitor_comparison_card'
	);
	const KnowledgePanelCard = useFilterSlot(
		'vulopilot_brand_knowledge_panel_card'
	);
	const OffSiteMentionsCard = useFilterSlot(
		'vulopilot_brand_offsite_mentions_card'
	);

	const isModuleGate = Boolean(vulopilotAppLocalizer.khali_dabba);

	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const openProPopup = () => setIsProPopupOpen(true);

	if (!isBrandModuleActive()) {
		return (
			<ColumnComponent>
				<CardComponent
					title={__('Brand', 'vulopilot')}
					titleIcon="module"
					desc={__('Trust, authority, and entity signals across your site.', 'vulopilot')}
				>
					<ModuleGuardComponent
						icon="error"
						title={__(
							'Brand Intelligence module is turned off',
							'vulopilot'
						)}
						desc={__(
							'Turn the Brand Intelligence module back on from Settings → Modules to resume trust/authority/entity scanning and see its findings again here. Findings already found before it was turned off aren’t deleted - they still show up on the Health page.',
							'vulopilot'
						)}
						buttonText={__('Go to Settings → Modules', 'vulopilot')}
						buttonLink={`${vulopilotAppLocalizer.admin_url}#&tab=settings&subtab=modules&module=${BRAND_MODULE_ID}`}
					/>
				</CardComponent>
			</ColumnComponent>
		);
	}

	return (
		<>
			<SectionedFindingsTab
				title={__('All Brand Visibility Issues', 'vulopilot')}
				sections={BRAND_SECTIONS}
				activeTab={activeTab}
				onTabChange={setActiveTab}
				header={
					<>
						<BrandScoreCard />
						<ContainerComponent>
							<ColumnComponent grid={6} fullHeight>
								{AuthorityTrendsCard ? (
									<AuthorityTrendsCard />
								) : (
									<AuthorityTrendsDummy
										onClick={openProPopup}
									/>
								)}
							</ColumnComponent>
							<ColumnComponent grid={6} fullHeight>
								{KnowledgePanelCard ? (
									<KnowledgePanelCard />
								) : (
									<KnowledgePanelDummy
										onClick={openProPopup}
									/>
								)}
							</ColumnComponent>
						</ContainerComponent>
						{CompetitorComparisonCard ? (
							<CompetitorComparisonCard />
						) : (
							<CompetitorComparisonDummy
								onClick={openProPopup}
							/>
						)}
					</>
				}
				footer={
					<>
						{OffSiteMentionsCard ? (
							<OffSiteMentionsCard />
						) : (
							<OffSiteMentionsDummy
								onClick={openProPopup}
							/>
						)}
					</>
				}
			/>
			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{isModuleGate ? (
					<ShowProPopup moduleName={BRAND_MODULE_ID} />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</>
	);
};

export default BrandVisibilityTab;
