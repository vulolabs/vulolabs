import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { Link, useLocation } from 'react-router-dom';
import { NavigatorComponent } from '@zyra/components';
import CrawlOverviewSection from './CrawlOverviewSection';
import BrokenLinksSection from './BrokenLinksSection';
import RedirectsSection from './RedirectsSection';
import NotFoundLogSection from './NotFoundLogSection';
import CrawlRobotsSitemapSection from './CrawlRobotsSitemapSection';

export type CrawlUrlsSectionId =
	| 'overview'
	| 'broken-links'
	| 'redirects'
	| '404s'
	| 'robots-sitemap';

const SECTION_IDS: CrawlUrlsSectionId[] = [
	'overview',
	'broken-links',
	'redirects',
	'404s',
	'robots-sitemap',
];

/** `NavigatorComponent`'s own compact icon-over-title tab bar needs a real `headerIcon` per section. */
const SECTION_META: Record<
	CrawlUrlsSectionId,
	{ headerTitle: string; headerIcon: string }
> = {
	overview: { headerTitle: __('Overview', 'vulopilot'), headerIcon: 'bar-chart' },
	'broken-links': { headerTitle: __('Broken Links', 'vulopilot'), headerIcon: 'error' },
	redirects: { headerTitle: __('Redirects', 'vulopilot'), headerIcon: 'refresh' },
	'404s': { headerTitle: __('404s', 'vulopilot'), headerIcon: 'close' },
	'robots-sitemap': { headerTitle: __('Robots & Sitemap', 'vulopilot'), headerIcon: 'link' },
};

interface CrawlUrlsTabProps {
	/** Which inner tab to land on when this whole "Crawl & URLs" tab is first mounted. */
	initialSection?: CrawlUrlsSectionId;
}

/** "Crawl & URLs" tab of "SEO & Visibility". */
const CrawlUrlsTab = ({ initialSection = 'overview' }: CrawlUrlsTabProps) => {
	// Same real `currentSetting`/`onNavigate` wiring SiteHealth.tsx's own tab bar already uses.
	const location = useLocation();
	const section = new URLSearchParams(location.hash.substring(1)).get(
		'section'
	);
	const resolvedInitialSection: CrawlUrlsSectionId =
		section && (SECTION_IDS as readonly string[]).includes(section)
			? (section as CrawlUrlsSectionId)
			: initialSection;

	const [activeSection, setActiveSection] = useState<CrawlUrlsSectionId>(
		resolvedInitialSection
	);

	const prepareUrl = (sectionId: string) =>
		`?page=vulopilot#&tab=seo-visibility&subtab=crawl-urls&section=${sectionId}`;

	// Same real `window.history.pushState` + hash-parse pattern SiteHealth.tsx's own `handleNavigate` already uses for an identical `NavigatorComponent` tab bar.
	const handleNavigate = (url: string) => {
		window.history.pushState(null, '', url);

		const hashIndex = url.indexOf('#');
		const nextSection = new URLSearchParams(
			hashIndex >= 0 ? url.slice(hashIndex + 1) : ''
		).get('section');

		if (nextSection && (SECTION_IDS as readonly string[]).includes(nextSection)) {
			setActiveSection(nextSection as CrawlUrlsSectionId);
		}
	};

	const settingContent = SECTION_IDS.map((sectionId) => ({
		type: 'file' as const,
		content: {
			id: sectionId,
			headerTitle: SECTION_META[sectionId].headerTitle,
			headerIcon: SECTION_META[sectionId].headerIcon,
			hideSettingHeader: true,
		},
	}));

	const getForm = (sectionId: string) => {
		switch (sectionId) {
			case 'overview':
				return <CrawlOverviewSection />;
			case 'broken-links':
				return <BrokenLinksSection />;
			case 'redirects':
				return <RedirectsSection />;
			case '404s':
				return <NotFoundLogSection />;
			case 'robots-sitemap':
				return <CrawlRobotsSitemapSection />;
			default:
				return <div></div>;
		}
	};

	return (
		<NavigatorComponent
			className="settings-sub-tabs"
			// zyra styles `[data-template=tabs]`; its types only list "tab".
			variant={'tabs' as 'tab'}
			settingContent={settingContent}
			currentSetting={activeSection}
			getForm={getForm}
			prepareUrl={prepareUrl}
			onNavigate={handleNavigate}
			Link={Link}
			settingName="CrawlUrls"
			menuIcon
		/>
	);
};

export default CrawlUrlsTab;
