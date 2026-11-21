/* global vulopilotAppLocalizer */
import React, { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import DashboardWidget from './DashboardWidget';
import { scoreTone } from '../components/ui';
import { useGeoScore } from '../pages/GEO/useGeoScore';
import type { GeoSignalScore } from '../pages/GEO/useGeoScore';
import type { EntitiesResponse } from '../pages/GEO/SchemaKnowledge/KnowledgeGraphSection';
import { WidgetProps } from './types';

/** Same gate BusinessProfileCard.tsx uses. */
const isKnowledgeGraphActive = () => vulopilotAppLocalizer.active_modules?.includes('knowledge-graph') ?? false;

const page = (hash: string) => `?page=vulopilot#&tab=${hash}`;
const BUSINESS_SETTINGS = page('settings&subtab=business-information');
const GEO_PAGE = page('seo-visibility&subtab=geo');

/** A public site's homepage screenshot from WordPress.com's mShots service; none for a local or private host. */
const getHomeScreenshotUrl = (siteUrl: string): string => {
	try {
		const { hostname } = new URL(siteUrl);
		const isPrivate =
			'localhost' === hostname ||
			/\.(local|localhost|test|invalid|example)$/i.test(hostname) ||
			/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname) ||
			!hostname.includes('.');

		return isPrivate ? '' : `https://s0.wp.com/mshots/v1/${encodeURIComponent(siteUrl)}?w=560&h=350`;
	} catch {
		return '';
	}
};

interface Signal {
	key: string;
	label: string;
	hint: string;
	/** A 0–100 score, or an open-item count. */
	kind: 'score' | 'count';
	data: GeoSignalScore | null;
	action: string;
}

/**
 * "Site profile": who the site is, how AI engines read it, and what is missing from its identity - each gap with
 * the link that fills it. Content and technology figures close the card as one quiet line.
 */
const SiteSnapshotWidget: React.FC<WidgetProps> = ({ summary, isLoading, onHide, isCustomizing }) => {
	const snapshot = summary.site_snapshot;
	const graphActive = isKnowledgeGraphActive();
	const [entities, setEntities] = useState<EntitiesResponse | null>(null);
	const { score: geo } = useGeoScore();

	useEffect(() => {
		if (!graphActive) {
			return;
		}

		getApiResponse<EntitiesResponse>(getApiLink(vulopilotAppLocalizer, 'entities'), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		}).then((response) => {
			if (response) {
				setEntities(response);
			}
		});
	}, [graphActive]);

	const siteUrl = vulopilotAppLocalizer.site_url as string;
	const screenshotUrl = getHomeScreenshotUrl(siteUrl);
	const [screenshotFailed, setScreenshotFailed] = useState(false);
	const previewImage = screenshotUrl && !screenshotFailed ? screenshotUrl : vulopilotAppLocalizer.home_preview_image;
	const siteName = vulopilotAppLocalizer.site_title || entities?.organizations[0]?.name || '';
	const tagline = vulopilotAppLocalizer.site_description as string | undefined;
	const generalSettings = vulopilotAppLocalizer.admin_url.replace(/admin\.php.*$/, 'options-general.php');

	// ---- How AI engines read the site ----
	const signals: Signal[] = [
		{
			key: 'expertise',
			label: __('Expertise signals', 'vulopilot'),
			hint: __('Author, credentials and first-hand experience AI can credit.', 'vulopilot'),
			kind: 'score',
			data: geo?.signals['other-geo-signals'] ?? null,
			action: __('Improve', 'vulopilot'),
		},
		{
			key: 'entity',
			label: __('Entity confidence', 'vulopilot'),
			hint: __('How sure AI engines are about who is behind the site.', 'vulopilot'),
			kind: 'score',
			data: geo?.signals['entity-clarity'] ?? null,
			action: __('Improve', 'vulopilot'),
		},
		{
			key: 'citations',
			label: __('Citation opportunities', 'vulopilot'),
			hint: __('Claims that would be quoted more with a source beside them.', 'vulopilot'),
			kind: 'count',
			data: geo?.signals['evidence-citations'] ?? null,
			action: __('Add sources', 'vulopilot'),
		},
		{
			key: 'gaps',
			label: __('Content gaps', 'vulopilot'),
			hint: __('Questions your visitors ask that no page answers yet.', 'vulopilot'),
			kind: 'count',
			data: geo?.signals['question-coverage'] ?? null,
			action: __('Answer them', 'vulopilot'),
		},
	];

	// ---- Business identity: what AI needs to name, place and describe the business ----
	const identity = entities
		? [
				{ key: 'type', label: __('Business type', 'vulopilot'), value: entities.business_type || '', count: entities.business_type ? 1 : 0 },
				{ key: 'org', label: __('Organization', 'vulopilot'), value: entities.organizations.map((e) => e.name).join(', '), count: entities.organizations.length },
				{ key: 'locations', label: __('Locations', 'vulopilot'), value: entities.locations.map((e) => e.name).join(', '), count: entities.locations.length },
				{ key: 'services', label: __('Services', 'vulopilot'), value: entities.services.map((e) => e.name).join(', '), count: entities.services.length },
				{ key: 'products', label: __('Products', 'vulopilot'), value: (entities.products ?? []).map((e) => e.name).join(', '), count: entities.products?.length ?? 0 },
				{ key: 'people', label: __('People', 'vulopilot'), value: entities.people.map((e) => e.name).join(', '), count: entities.people.length },
				{ key: 'categories', label: __('Categories', 'vulopilot'), value: entities.categories.map((e) => e.name).join(', '), count: entities.categories.length },
		  ]
		: [];
	const known = identity.filter((item) => item.count > 0).length;
	const completeness = identity.length ? Math.round((known / identity.length) * 100) : 0;

	const facts = [
		{ key: 'posts', label: _n('post', 'posts', snapshot.posts, 'vulopilot'), value: snapshot.posts, href: vulopilotAppLocalizer.admin_url.replace(/admin\.php.*$/, 'edit.php') },
		{ key: 'pages', label: _n('page', 'pages', snapshot.pages, 'vulopilot'), value: snapshot.pages, href: vulopilotAppLocalizer.admin_url.replace(/admin\.php.*$/, 'edit.php?post_type=page') },
		{ key: 'comments', label: _n('comment', 'comments', snapshot.comments, 'vulopilot'), value: snapshot.comments, href: vulopilotAppLocalizer.admin_url.replace(/admin\.php.*$/, 'edit-comments.php') },
		{ key: 'users', label: _n('user', 'users', snapshot.users, 'vulopilot'), value: snapshot.users, href: vulopilotAppLocalizer.admin_url.replace(/admin\.php.*$/, 'users.php') },
	];

	return (
		<DashboardWidget
			title={__('Site profile', 'vulopilot')}
			desc={__('Who your site is, and how clearly AI engines can tell.', 'vulopilot')}
			icon="website"
			isLoading={isLoading}
			onHide={onHide}
			isCustomizing={isCustomizing}
			headerAction={
				<a className="vp-card-link" href={BUSINESS_SETTINGS}>
					{__('Edit business details', 'vulopilot')}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			}
		>
			<div className="vp-profile">
				{/* Who you are */}
				<div className="vp-profile-id">
					<a className="vp-profile-shot" href={siteUrl} target="_blank" rel="noreferrer">
						{previewImage ? (
							<img src={previewImage} alt={__('Your homepage', 'vulopilot')} onError={() => setScreenshotFailed(true)} />
						) : (
							<i className="adminfont-website" aria-hidden="true" />
						)}
					</a>
					<div className="vp-profile-name">
						<strong>{siteName || __('Untitled site', 'vulopilot')}</strong>
						<a href={siteUrl} target="_blank" rel="noreferrer">
							{siteUrl.replace(/^https?:\/\//, '')}
							<i className="adminfont-external" aria-hidden="true" />
						</a>
						{tagline ? (
							<p>{tagline}</p>
						) : (
							<p className="is-missing">
								{__('No tagline. AI engines use it to sum up your site in one line.', 'vulopilot')}{' '}
								<a href={generalSettings}>{__('Add one', 'vulopilot')}</a>
							</p>
						)}
					</div>
					<ul className="vp-profile-tech" aria-label={__('Technology', 'vulopilot')}>
						<li>
							<i className="adminfont-wordpress" aria-hidden="true" />
							{sprintf(/* translators: %s: WordPress version. */ __('WordPress %s', 'vulopilot'), snapshot.wp_version || '-')}
						</li>
						<li>
							<i className="adminfont-coding" aria-hidden="true" />
							{sprintf(/* translators: %s: PHP version. */ __('PHP %s', 'vulopilot'), snapshot.php_version || '-')}
						</li>
						<li>
							<i className="adminfont-module" aria-hidden="true" />
							<a href={vulopilotAppLocalizer.admin_url.replace(/admin\.php.*$/, 'plugins.php')}>
								{sprintf(
									/* translators: 1: active plugins, 2: installed plugins. */
									__('%1$d of %2$d plugins active', 'vulopilot'),
									snapshot.plugins_active,
									snapshot.plugins_total
								)}
							</a>
						</li>
					</ul>
				</div>

				{/* How AI engines read the site */}
				<section className="vp-profile-section">
					<header>
						<h4>{__('How AI engines read your site', 'vulopilot')}</h4>
						{geo && (
							<a className="vp-card-link" href={GEO_PAGE}>
								{sprintf(/* translators: %d: GEO score out of 100. */ __('GEO score %d/100', 'vulopilot'), geo.geo_score)}
								<i className="adminfont-arrow-right" aria-hidden="true" />
							</a>
						)}
					</header>
					<ul className="vp-signals">
						{signals.map((signal) => {
							const value = 'score' === signal.kind ? signal.data?.score ?? null : signal.data?.open_count ?? null;
							const measured = null !== value;
							const tone = !measured
								? 'off'
								: 'score' === signal.kind
									? scoreTone(value)
									: 0 === value
										? 'green'
										: 'amber';
							const needsWork = measured && ('score' === signal.kind ? value < 70 : value > 0);

							return (
								<li key={signal.key} className={`vp-signal is-${tone}`}>
									<span className="vp-signal-label">{signal.label}</span>
									<span className="vp-signal-value">
										{measured ? value : '-'}
										{measured && 'score' === signal.kind && <small>/100</small>}
										{measured && 'count' === signal.kind && (
											<small>{_n('open', 'open', value as number, 'vulopilot')}</small>
										)}
									</span>
									{'score' === signal.kind && (
										<span className="vp-signal-bar" aria-hidden="true">
											<i style={{ width: `${measured ? Math.max(0, Math.min(100, value as number)) : 0}%` }} />
										</span>
									)}
									<span className="vp-signal-hint">
										{measured ? signal.hint : __('Not measured yet. Run a scan to check.', 'vulopilot')}
									</span>
									{needsWork ? (
										<a className="vp-signal-cta" href={GEO_PAGE}>
											{signal.action}
											<i className="adminfont-arrow-right" aria-hidden="true" />
										</a>
									) : (
										measured && (
											<span className="vp-signal-ok">
												<i className="adminfont-check" aria-hidden="true" />
												{__('Looks good', 'vulopilot')}
											</span>
										)
									)}
								</li>
							);
						})}
					</ul>
				</section>

				{/* Business identity */}
				<section className="vp-profile-section">
					<header>
						<h4>{__('Business identity', 'vulopilot')}</h4>
						{entities && (
							<span className="vp-profile-meter">
								<span aria-hidden="true">
									<i style={{ width: `${completeness}%` }} />
								</span>
								{sprintf(
									/* translators: 1: details found, 2: details in total. */
									__('%1$d of %2$d details found', 'vulopilot'),
									known,
									identity.length
								)}
							</span>
						)}
					</header>

					{!graphActive && (
						<div className="vp-profile-prompt">
							<i className="adminfont-knowledge-graph" aria-hidden="true" />
							<span>
								<strong>{__('Let VuloPilot find your business identity', 'vulopilot')}</strong>
								{__('Turn on Knowledge Graph to detect your organization, locations, services and people from your content.', 'vulopilot')}
							</span>
							<a className="vp-signal-cta" href={page('settings&subtab=modules&module=knowledge-graph')}>
								{__('Turn on', 'vulopilot')}
								<i className="adminfont-arrow-right" aria-hidden="true" />
							</a>
						</div>
					)}

					{graphActive && !entities && <p className="vp-profile-note">{__('Reading your business details…', 'vulopilot')}</p>}

					{entities && (
						<ul className="vp-identity">
							{identity.map((item) => (
								<li key={item.key} className={item.count > 0 ? 'is-set' : 'is-missing'}>
									<i className={`adminfont-${item.count > 0 ? 'check' : 'plus'}`} aria-hidden="true" />
									<span className="vp-identity-label">{item.label}</span>
									{item.count > 0 ? (
										<span className="vp-identity-value" title={item.value}>
											{item.value}
										</span>
									) : (
										<a href={BUSINESS_SETTINGS}>{__('Add', 'vulopilot')}</a>
									)}
								</li>
							))}
						</ul>
					)}
				</section>

				{/* Content */}
				<ul className="vp-profile-facts" aria-label={__('Content', 'vulopilot')}>
					{facts.map((fact) => (
						<li key={fact.key}>
							<a href={fact.href}>
								<strong>{fact.value.toLocaleString()}</strong> {fact.label}
							</a>
						</li>
					))}
				</ul>
			</div>
		</DashboardWidget>
	);
};

export default SiteSnapshotWidget;
