/* global vulopilotAppLocalizer */
import React, { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { IconTile, Pill } from '../components/ui';
import DashboardWidget from './DashboardWidget';
import { formatWpDate } from '../services/formatWpDate';
import { WidgetProps } from './types';

interface BotLastSeen {
	bot_name: string;
	last_seen_at: string;
}

interface CrawlerSummaryResponse {
	bot_last_seen: BotLastSeen[];
	most_crawled_pages: { requested_url: string; total: number }[];
	daily_volume: { date: string; total: number }[];
}

/** The AI crawlers people ask about first; listed as "not seen yet" until each one visits. */
const KNOWN_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot'];

const REPORT = '?page=vulopilot#&tab=seo-visibility&subtab=crawler-traffic';

/** `/blog/post-name/` from a full or relative URL, for a compact page list. */
const shortPath = (url: string): string => {
	try {
		return new URL(url, vulopilotAppLocalizer.site_url).pathname || '/';
	} catch {
		return url;
	}
};

/**
 * "AI crawler traffic": which AI crawlers visit, when each last came, and the pages they read most. Before any
 * visit it says so plainly - the crawlers it is watching for, each "Not seen yet" - instead of showing made-up rows.
 */
const CrawlerTrafficWidget: React.FC<WidgetProps> = ({ onHide, isCustomizing }) => {
	const [summary, setSummary] = useState<CrawlerSummaryResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		getApiResponse<CrawlerSummaryResponse>(getApiLink(vulopilotAppLocalizer, 'crawler-traffic/summary'), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				if (response) {
					setSummary(response);
				}
			})
			.finally(() => setIsLoading(false));
	}, []);

	const visits = summary?.daily_volume?.reduce((sum, day) => sum + day.total, 0) ?? 0;
	const seen = (summary?.bot_last_seen ?? []).slice(0, 4);
	const pages = (summary?.most_crawled_pages ?? []).slice(0, 3);
	const hasVisits = seen.length > 0;

	// Before any visit: the crawlers being watched for, none seen yet.
	const rows = hasVisits
		? seen
		: KNOWN_BOTS.map((name) => ({ bot_name: name, last_seen_at: '' }));

	return (
		<DashboardWidget
			title={__('AI crawler traffic', 'vulopilot')}
			desc={__('Visits from GPTBot, ClaudeBot, PerplexityBot, and other AI crawlers.', 'vulopilot')}
			icon="global-community"
			isLoading={isLoading}
			onHide={onHide}
			isCustomizing={isCustomizing}
			headerAction={
				<a className="vp-card-link" href={REPORT}>
					{__('Full report', 'vulopilot')}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			}
		>
			<div className="vp-crawler-total">
				<strong>{visits.toLocaleString()}</strong>
				<span>{_n('visit from AI crawlers', 'visits from AI crawlers', visits, 'vulopilot')}</span>
			</div>

			<ul className="vp-list">
				{rows.map((bot) => (
					<li key={bot.bot_name}>
						<IconTile icon="ai" tone={bot.last_seen_at ? 'violet' : 'neutral'} size="sm" />
						<div className="vp-list-main">
							<strong>{bot.bot_name}</strong>
						</div>
						{bot.last_seen_at ? (
							<span className="vp-list-meta">
								{sprintf(
									/* translators: %s: date the crawler was last seen. */
									__('Last seen %s', 'vulopilot'),
									formatWpDate(bot.last_seen_at)
								)}
							</span>
						) : (
							<Pill status="off">{__('Not seen yet', 'vulopilot')}</Pill>
						)}
					</li>
				))}
			</ul>

			{hasVisits && pages.length > 0 && (
				<div className="vp-crawler-pages">
					<h4>{__('Most read by AI', 'vulopilot')}</h4>
					<ol>
						{pages.map((page) => (
							<li key={page.requested_url}>
								<span title={page.requested_url}>{shortPath(page.requested_url)}</span>
								<b>
									{sprintf(
										/* translators: %d: number of crawler visits to a page. */
										_n('%d visit', '%d visits', page.total, 'vulopilot'),
										page.total
									)}
								</b>
							</li>
						))}
					</ol>
				</div>
			)}

			{!hasVisits && (
				<p className="vp-crawler-tip">
					<i className="adminfont-info" aria-hidden="true" />
					<span>
						{__('AI crawlers find sites over time. VuloPilot logs each visit from here on; check that robots.txt does not block them.', 'vulopilot')}{' '}
						<a href={REPORT}>{__('Check access', 'vulopilot')}</a>
					</span>
				</p>
			)}
		</DashboardWidget>
	);
};

export default CrawlerTrafficWidget;
