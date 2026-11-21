/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, scrollToId } from '@zyra/core';
import { Delta, Segmented } from '../../components/ui';

interface StatMetric {
	current: number;
	previous: number;
	change_percent: number | null;
}

interface StatsResponse {
	content_created: StatMetric;
	words_generated: StatMetric;
}

interface GroupRow {
	count: number;
}

/** The scanners that flag per-page content quality (the same three the pages list below uses). */
export const CONTENT_SCANNER_IDS = ['thin-content', 'readability', 'heading-structure'];

const PERIODS = [
	{ value: '7', label: __('7D', 'vulopilot') },
	{ value: '30', label: __('30D', 'vulopilot') },
	{ value: '90', label: __('90D', 'vulopilot') },
];

const toYmd = (date: Date): string => date.toISOString().slice(0, 10);

const short = (count: number): string => (count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toLocaleString());

const nonce = () => ({ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } });

/**
 * The Content page's figures: what was created and written with VuloPilot in the period
 * (`GET /content-intelligence/stats`), and the content issues the last audit left open (`GET /findings/groups`).
 */
const ContentStatsCard = () => {
	const [period, setPeriod] = useState('30');
	const [stats, setStats] = useState<StatsResponse | null>(null);
	const [issues, setIssues] = useState<number | null>(null);

	useEffect(() => {
		const to = new Date();
		const from = new Date();
		from.setDate(from.getDate() - (Number(period) - 1));

		setStats(null);
		getApiResponse<StatsResponse>(
			getApiLink(vulopilotAppLocalizer, `content-intelligence/stats?date_from=${toYmd(from)}&date_to=${toYmd(to)}`),
			nonce()
		).then((response) => setStats(response ?? null));
	}, [period]);

	useEffect(() => {
		getApiResponse<{ data?: GroupRow[] }>(
			`${getApiLink(vulopilotAppLocalizer, 'findings/groups')}?per_page=50&scanner_id=${CONTENT_SCANNER_IDS.join(',')}`,
			nonce()
		).then((response) => setIssues((response?.data ?? []).reduce((sum, group) => sum + group.count, 0)));
	}, []);

	return (
		<section className="vp-card vp-rail-card vp-cstats-card" aria-label={__('Your content', 'vulopilot')}>
			<header className="vp-rail-head">
				<div>
					<h3>{__('Your content', 'vulopilot')}</h3>
					<p>
						{sprintf(
							/* translators: %s: number of days. */
							__('Made with VuloPilot, last %s days', 'vulopilot'),
							period
						)}
					</p>
				</div>
				<Segmented size="sm" label={__('Period', 'vulopilot')} value={period} onChange={setPeriod} options={PERIODS} />
			</header>

			<dl className="vp-cstats">
				<div>
					<dt>{__('Pieces created', 'vulopilot')}</dt>
					<dd>
						{stats ? stats.content_created.current.toLocaleString() : '–'}
						<Delta change={stats?.content_created.change_percent ?? null} />
					</dd>
				</div>
				<div>
					<dt>{__('Words written', 'vulopilot')}</dt>
					<dd>
						{stats ? short(stats.words_generated.current) : '–'}
						<Delta change={stats?.words_generated.change_percent ?? null} />
					</dd>
				</div>
			</dl>

			<button
				type="button"
				className={`vp-cstats-issues${issues ? ' is-open' : ''}`}
				disabled={!issues}
				onClick={() => scrollToId('content-audit-section')}
			>
				<i className={`adminfont-${issues ? 'error' : 'check'}`} aria-hidden="true" />
				<span>
					{null === issues
						? __('Checking your pages…', 'vulopilot')
						: issues
						? sprintf(
								/* translators: %d: number of open content issues. */
								_n('%d content issue to fix', '%d content issues to fix', issues, 'vulopilot'),
								issues
						  )
						: __('No content issues open', 'vulopilot')}
				</span>
				{Boolean(issues) && <i className="adminfont-arrow-down" aria-hidden="true" />}
			</button>
		</section>
	);
};

export default ContentStatsCard;
