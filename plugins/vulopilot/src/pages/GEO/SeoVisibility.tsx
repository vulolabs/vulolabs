import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { useLocation, Link } from 'react-router-dom';
import { NavigatorComponent } from '@zyra/components';
import RunScanHeaderExtra from '../../components/RunScanHeaderExtra';
import OverviewTab from './OverviewTab';
import GeoTab from './GeoTab';
import AeoTab from './AeoTab';
import CrawlUrlsTab, { CrawlUrlsSectionId } from './CrawlUrlsTab';
import BrandVisibilityTab from './BrandVisibilityTab';
import SchemaKnowledgeTab, {
	SchemaKnowledgeSectionId,
} from './SchemaKnowledge/SchemaKnowledgeTab';
import SeoTab from './SeoTab';
import KeywordsTab from './KeywordsTab';

const TAB_IDS = [
	'overview',
	'brand-visibility',
	'seo',
	'geo',
	'aeo',
	'keywords',
	'crawl-urls',
	'schema-knowledge',
] as const;

/** A bookmarked `?subtab=schema` or `?subtab=knowledge-graph` link. */
const SUBTAB_ALIASES: Record<string, (typeof TAB_IDS)[number]> = {
	schema: 'schema-knowledge',
	'knowledge-graph': 'schema-knowledge',
	'crawler-traffic': 'crawl-urls',
	'broken-links': 'crawl-urls',
	redirects: 'crawl-urls',
};

/** `NavigatorComponent`'s own `variant="compact"` icon-over-title tab bar needs a real `headerIcon` per tab. */
const TAB_META: Record<
	(typeof TAB_IDS)[number],
	{ headerTitle: string; headerIcon: string }
> = {
	overview: { headerTitle: __('Overview', 'vulopilot'), headerIcon: 'bar-chart' },
	'brand-visibility': { headerTitle: __('Brand Visibility', 'vulopilot'), headerIcon: 'person' },
	seo: { headerTitle: __('SEO', 'vulopilot'), headerIcon: 'search' },
	geo: { headerTitle: __('GEO', 'vulopilot'), headerIcon: 'search-discovery' },
	aeo: { headerTitle: __('AEO', 'vulopilot'), headerIcon: 'ai' },
	keywords: { headerTitle: __('Keywords', 'vulopilot'), headerIcon: 'vpn-key' },
	'crawl-urls': { headerTitle: __('Crawl & URLs', 'vulopilot'), headerIcon: 'url' },
	'schema-knowledge': {
		headerTitle: __('Business Identity & Schema', 'vulopilot'),
		headerIcon: 'identity-verification',
	},
};

/** "SEO & Visibility" (WP menu slug `seo-visibility`). */
const SeoVisibility = () => {
	const rawSubtab = new URLSearchParams(
		useLocation().hash.substring(1)
	).get('subtab');
	const resolvedSubtab = rawSubtab
		? (SUBTAB_ALIASES[rawSubtab] ?? rawSubtab)
		: null;
	const initialTab = (
		resolvedSubtab && (TAB_IDS as readonly string[]).includes(resolvedSubtab)
			? resolvedSubtab
			: 'overview'
	) as (typeof TAB_IDS)[number];
	const initialInnerSection: SchemaKnowledgeSectionId =
		'schema' === rawSubtab
			? 'structured-data'
			: 'knowledge-graph' === rawSubtab
				? 'knowledge-graph'
				: 'overview';
	const initialCrawlUrlsSection: CrawlUrlsSectionId =
		'crawler-traffic' === rawSubtab
			? 'overview'
			: 'broken-links' === rawSubtab
				? 'broken-links'
				: 'redirects' === rawSubtab
					? 'redirects'
					: 'overview';

	const [activeTab, setActiveTab] = useState<(typeof TAB_IDS)[number]>(
		initialTab
	);
	// Which inner tab `CrawlUrlsTab` should land on the next time it's (re)mounted.
	const [crawlUrlsJumpSection, setCrawlUrlsJumpSection] =
		useState<CrawlUrlsSectionId>(initialCrawlUrlsSection);
	// Scanner whose findings the destination tab should pre-select and scroll to.
	const [jumpScannerId, setJumpScannerId] = useState<string | undefined>();
	/** `crawlUrlsSection` is only meaningful when `tab` is `'crawl-urls'`. */
	const goToTab = (
		tab: string,
		crawlUrlsSection?: CrawlUrlsSectionId,
		scannerId?: string
	) => {
		if (!(TAB_IDS as readonly string[]).includes(tab)) {
			return;
		}

		setJumpScannerId(scannerId);

		if (crawlUrlsSection) {
			setCrawlUrlsJumpSection(crawlUrlsSection);
		}

		setActiveTab(tab as (typeof TAB_IDS)[number]);
	};

	// `NavigatorComponent`'s own flat "one file per tab" shape.
	const settingContent = TAB_IDS.map((tabId) => ({
		type: 'file' as const,
		content: {
			id: tabId,
			headerTitle: TAB_META[tabId].headerTitle,
			headerIcon: TAB_META[tabId].headerIcon,
			hideSettingHeader: true,
		},
	}));

	const getForm = (tabId: string) => {
		switch (tabId) {
			case 'overview':
				return <OverviewTab onNavigateTab={goToTab} />;
			case 'brand-visibility':
				return <BrandVisibilityTab initialScannerId={jumpScannerId} />;
			case 'seo':
				return <SeoTab />;
			case 'geo':
				return <GeoTab />;
			case 'aeo':
				return <AeoTab />;
			case 'keywords':
				return <KeywordsTab />;
			case 'crawl-urls':
				return <CrawlUrlsTab initialSection={crawlUrlsJumpSection} />;
			case 'schema-knowledge':
				return (
					<SchemaKnowledgeTab initialSection={initialInnerSection} />
				);
			default:
				return <div></div>;
		}
	};

	return (
		<>
			<NavigatorComponent
				headerIcon="bar-chart"
				headerTitle={__('SEO & Visibility', 'vulopilot')}
				// headerDescription={__( 'Tell AI what you want to achieve.
				headerCustomContent={
					<RunScanHeaderExtra
						categories={['geo', 'seo', 'images', 'schema', 'links']}
						label={__('Run Visibility Scan', 'vulopilot')}
						settingsSubtab="seo-content"
					/>
				}
				className="seo-visibility-tabs"
				settingContent={settingContent}
				currentSetting={activeTab}
				getForm={getForm}
				prepareUrl={(subTab: string) =>
					`?page=vulopilot#&tab=seo-visibility&subtab=${subTab}`
				}
				Link={Link}
				settingName="SEO Visibility"
				menuIcon
			/>
		</>
	);
};

export default SeoVisibility;