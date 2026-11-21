/* global vulopilotAppLocalizer */
import { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { __ } from '@wordpress/i18n';
import { Spinner } from '@wordpress/components';
import { HeaderComponent } from '@zyra/components';
import { scrollToId } from '@zyra/core';
import Brand from './assets/images/brand-logo.png';
import { searchIndex, SearchItem } from './searchIndex';
import AiCreditsIndicator from './components/AiCredits/AiCreditsIndicator';
import InsufficientCreditsNotice from './components/AiCredits/InsufficientCreditsNotice';
import { CONSULTATION_URL, CONTACT_URL, DOCS_URL } from './services/links';
import './routeRegistry';
import './routes';

// Forces initializeModules() to actually fetch active modules from the server on every load.
localStorage.setItem('force_vulopilot_context_reload', 'true');

/** Reads the active tab from the URL hash. */
const Route = () => {
	const location = useLocation();
	const [routes, setRoutes] = useState([...window.VULOPILOT_ROUTES]);

	useEffect(() => {
		const updateRoutes = () => setRoutes([...window.VULOPILOT_ROUTES]);

		window.addEventListener('vulopilot-routes', updateRoutes);

		return () =>
			window.removeEventListener('vulopilot-routes', updateRoutes);
	}, []);

	const tab = new URLSearchParams(location.hash).get('tab') || 'dashboard';
	// The last registration for a tab wins, so VuloPilot Pro (whose script runs after this one) can replace a page
	// that free shows as a preview - e.g. Automations, where free has only its two built-ins and samples.
	const route = [...routes].reverse().find((r) => r.tab === tab);
	const Component = route?.component;

	if (!Component) {
		return null;
	}

	return (
		<Suspense fallback={<Spinner />}>
			<Component />
		</Suspense>
	);
};

const App = () => {
	const currentTabParams = new URLSearchParams(useLocation().hash);
	const currentTab = currentTabParams.get('tab') || 'dashboard';
	const [results, setResults] = useState<SearchItem[]>([]);

	const handleQueryUpdate = ({
		searchValue,
		searchAction,
	}: {
		searchValue: string;
		searchAction?: string;
	}) => {
		if (!searchValue.trim()) {
			setResults([]);
			return;
		}

		const lower = searchValue.toLowerCase();

		const filtered = searchIndex.filter((item) => {
			// Real dropdown category ('modules'/'settings'/'sections').
			if (
				searchAction &&
				searchAction !== 'all' &&
				item.category !== searchAction
			) {
				return false;
			}

			return (
				item.name?.toLowerCase().includes(lower) ||
				item.desc?.toLowerCase().includes(lower)
			);
		});

		setResults(filtered);
	};

	/** A page-section result's target tab may not be mounted yet at click time. */
	const scrollToSectionWhenReady = (sectionId: string, attempt = 0) => {
		if (document.getElementById(sectionId)) {
			scrollToId(sectionId);
			return;
		}

		if (attempt < 20) {
			setTimeout(
				() => scrollToSectionWhenReady(sectionId, attempt + 1),
				100
			);
		}
	};

	const handleResultClick = (item: SearchItem) => {
		window.location.hash = item.link;

		if (item.sectionId) {
			scrollToSectionWhenReady(item.sectionId);
		}
	};

	// Highlight the active tab in the sidebar; Content Planner (no menu entry) highlights Content.
	useEffect(() => {
		const menuTab = currentTab === 'content-planner' ? 'content' : currentTab;

		document
			.querySelectorAll('#toplevel_page_vulopilot > ul > li > a')
			.forEach((menuItem) => {
				const menuItemUrl = new URL(
					(menuItem as HTMLAnchorElement).href
				);
				const menuItemHashParams = new URLSearchParams(
					menuItemUrl.hash.substring(1)
				);

				if (menuItem.parentNode) {
					(menuItem.parentNode as HTMLElement).classList.remove(
						'current'
					);
				}

				if (menuItemHashParams.get('tab') === menuTab) {
					(menuItem.parentNode as HTMLElement).classList.add(
						'current'
					);
				}
			});
	}, [currentTab]);

	// The account menu in the header's top-right corner, as on MooWoodle and MultiVendorX: help links, each in a new tab.
	const utilityList = [
		{
			toggleIcon: 'admin-icon adminfont-user-circle',
			tooltipName: __('Account', 'vulopilot'),
			// Anchored to the icon's right edge: centred, the tooltip ran past the window at the header's far right.
			tooltipPosition: 'bottom-right' as const,
			items: [
				{
					title: __('Explore docs', 'vulopilot'),
					icon: 'document',
					link: DOCS_URL,
					targetBlank: true,
				},
				{
					title: __('Book a consultation', 'vulopilot'),
					icon: 'live-chat',
					link: CONSULTATION_URL,
					targetBlank: true,
				},
				{
					title: __('Contact us', 'vulopilot'),
					icon: 'global-community',
					link: CONTACT_URL,
					targetBlank: true,
				},
			],
		},
	];

	return (
		<>
			<InsufficientCreditsNotice />
			<HeaderComponent
				brandImg={Brand}
				logoAlt={__('VuloPilot', 'vulopilot')}
				freePrefix={__('Free:', 'vulopilot')}
				// zyra prints the Pro label as plain text right against the version; the space keeps "Pro: 1.0.1" like "Free: 1.0.1".
				proPrefix={`${__('Pro:', 'vulopilot')} `}
				results={results}
				beforeSearch={<AiCreditsIndicator />}
				search={{
					placeholder: __('Search…', 'vulopilot'),
					options: [
						{
							value: 'all',
							label: __('Everything', 'vulopilot'),
						},
						{
							value: 'modules',
							label: __('Modules', 'vulopilot'),
						},
						{
							value: 'settings',
							label: __('Settings', 'vulopilot'),
						},
						{
							value: 'sections',
							label: __('Sections', 'vulopilot'),
						},
					],
				}}
				onQueryUpdate={handleQueryUpdate}
				// zyra hands back the result object it was given: one of this app's SearchItems.
				onResultClick={(item) => handleResultClick(item as SearchItem)}
				free={vulopilotAppLocalizer.version}
				pro={vulopilotAppLocalizer.pro_data.version || undefined}
				utilityList={utilityList}
				searchSize={7}
			/>
			<Route />
		</>
	);
};

export default App;
