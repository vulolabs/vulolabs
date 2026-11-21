/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { PopupComponent } from '@zyra/components';
import ShowProPopup from '../../components/Popup/Popup';
import { IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import type { EfficiencyChecksResponse } from '../Security/efficiencyChecks';

type Impact = 'high' | 'medium' | 'low';

interface Fix {
	id: string;
	icon: string;
	tone: Tone;
	title: string;
	/** What it does, in one plain line. */
	desc: string;
	impact: Impact;
	button: string;
	/** Changes files or deletes data: asks first. */
	confirm?: string;
	/** Recommended when one of these scanners has open issues… */
	scanners?: string[];
	/** …or one of these server checks (`GET /efficiency-checks`) needs attention. */
	checks?: string[];
}

interface FixGroup {
	key: string;
	title: string;
	note: string;
	fixes: Fix[];
}

/** Each runs `POST /performance-actions/{id}` (classes/Performance/Rest/PerformanceActions.php). */
const GROUPS: FixGroup[] = [
	{
		key: 'once',
		title: __('Turn on once', 'vulopilot'),
		note: __('Settings that stay on and speed up every page.', 'vulopilot'),
		fixes: [
			{
				id: 'lazy-loading',
				scanners: ['lazy-loading'],
				icon: 'eye',
				tone: 'blue',
				title: __('Lazy-load images', 'vulopilot'),
				desc: __('Images below the fold load only when visitors scroll to them.', 'vulopilot'),
				impact: 'high',
				button: __('Turn on', 'vulopilot'),
			},
			{
				id: 'browser-caching',
				scanners: ['cache-detection'],
				checks: ['browser-caching'],
				icon: 'global-community',
				tone: 'green',
				title: __('Browser caching', 'vulopilot'),
				desc: __('Returning visitors reuse styles, scripts and images instead of downloading them again.', 'vulopilot'),
				impact: 'high',
				button: __('Turn on', 'vulopilot'),
			},
			{
				id: 'preload-resources',
				scanners: ['fonts'],
				icon: 'cloud-upload',
				tone: 'violet',
				title: __('Preload key files', 'vulopilot'),
				desc: __('Your logo and main stylesheet start loading first, so pages appear sooner.', 'vulopilot'),
				impact: 'medium',
				button: __('Turn on', 'vulopilot'),
			},
		],
	},
	{
		key: 'anytime',
		title: __('Run any time', 'vulopilot'),
		note: __('Safe and instant - nothing is removed.', 'vulopilot'),
		fixes: [
			{
				id: 'clear-caches',
				icon: 'refresh-bold',
				tone: 'blue',
				title: __('Clear all caches', 'vulopilot'),
				desc: __('Visitors see your latest changes. Use it after editing your theme or plugins.', 'vulopilot'),
				impact: 'low',
				button: __('Clear', 'vulopilot'),
			},
			{
				id: 'minify-css-js',
				scanners: ['css-optimization', 'javascript-optimization'],
				icon: 'coding',
				tone: 'violet',
				title: __('Minify CSS & JS', 'vulopilot'),
				desc: __('Rebuilds smaller style and script files through your optimization plugin.', 'vulopilot'),
				impact: 'medium',
				button: __('Minify', 'vulopilot'),
			},
		],
	},
	{
		key: 'cleanup',
		title: __('Clean-ups', 'vulopilot'),
		note: __('These change files or delete data, so they ask first. A recent backup is a good idea.', 'vulopilot'),
		fixes: [
			{
				id: 'optimize-images',
				scanners: ['large-images'],
				icon: 'image',
				tone: 'green',
				title: __('Optimize images', 'vulopilot'),
				desc: __('Shrinks oversized uploads so pages download less.', 'vulopilot'),
				impact: 'high',
				button: __('Optimize', 'vulopilot'),
				confirm: __('This resizes and recompresses your oversized image files in place.', 'vulopilot'),
			},
			{
				id: 'database-cleanup',
				scanners: ['database-cleanup'],
				icon: 'database',
				tone: 'amber',
				title: __('Clean the database', 'vulopilot'),
				desc: __('Removes expired temporary data and old post revisions.', 'vulopilot'),
				impact: 'medium',
				button: __('Clean up', 'vulopilot'),
				confirm: __('This permanently deletes expired transients and old post revisions.', 'vulopilot'),
			},
			{
				id: 'image-cleanup',
				icon: 'delete',
				tone: 'red',
				title: __('Remove unused images', 'vulopilot'),
				desc: __('Deletes media that no post, page or setting uses, to free up space.', 'vulopilot'),
				impact: 'low',
				button: __('Remove', 'vulopilot'),
				confirm: __('This permanently deletes images nothing on your site links to. It cannot be undone without a backup.', 'vulopilot'),
			},
		],
	},
];

const IMPACT: Record<Impact, string> = {
	high: __('Big impact', 'vulopilot'),
	medium: __('Some impact', 'vulopilot'),
	low: __('Housekeeping', 'vulopilot'),
};

interface Result {
	ok: boolean;
	message: string;
}

const ALL_FIXES = GROUPS.flatMap((group) => group.fixes);

/** What kind of fix it is, as a tag on its card. */
const KIND: Record<string, { label: string; tone: string }> = {
	once: { label: __('Stays on', 'vulopilot'), tone: 'is-once' },
	anytime: { label: __('Instant', 'vulopilot'), tone: 'is-anytime' },
	cleanup: { label: __('Asks first', 'vulopilot'), tone: 'is-cleanup' },
};

const kindOf = (fix: Fix) => KIND[GROUPS.find((group) => group.fixes.includes(fix))?.key ?? 'anytime'];

/** Why this site needs a fix: the open finding or server check behind it, or null. */
const reasonFor = (fix: Fix, groups: FindingGroup[], efficiency: EfficiencyChecksResponse | null): string | null => {
	const finding = groups.find((group) => fix.scanners?.includes(group.scanner_id));

	if (finding) {
		return sprintf(
			/* translators: 1: check name, 2: number of issues. */
			_n('%1$s found %2$d issue', '%1$s found %2$d issues', finding.count, 'vulopilot'),
			finding.label,
			finding.count
		);
	}

	const check = efficiency?.sections
		.flatMap((section) => section.checks)
		.find((item) => fix.checks?.includes(item.id) && 'attention' === item.status);

	return check ? `${check.title}: ${check.badge}` : null;
};

interface QuickActionsCardProps {
	/** The page's open performance issue groups. */
	groups: FindingGroup[];
	efficiency: EfficiencyChecksResponse | null;
}

/**
 * "What to do next": the one-click fixes this site actually needs - each says why (the open issue or server check
 * behind it) - then every other speed tool, folded. Settings stay on once turned on; clean-ups ask first. Each keeps
 * its result on the card.
 */
const QuickActionsCard = ({ groups, efficiency }: QuickActionsCardProps) => {
	const [runningId, setRunningId] = useState<string | null>(null);
	const [results, setResults] = useState<Record<string, Result>>({});
	const [confirming, setConfirming] = useState<Fix | null>(null);

	const run = (fix: Fix) => {
		if (runningId) {
			return;
		}

		setConfirming(null);
		setRunningId(fix.id);

		sendApiResponse<{ success: boolean; message: string }>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, `performance-actions/${fix.id}`),
			{}
		)
			.then((response) =>
				setResults((current) => ({
					...current,
					[fix.id]: {
						ok: Boolean(response?.success),
						message: response?.message ?? __('Could not run this fix - please try again.', 'vulopilot'),
					},
				}))
			)
			.finally(() => setRunningId(null));
	};

	const impactRank: Record<Impact, number> = { high: 0, medium: 1, low: 2 };
	const recommended = ALL_FIXES.map((fix) => ({ fix, reason: reasonFor(fix, groups, efficiency) }))
		.filter((item) => item.reason)
		.sort((a, b) => impactRank[a.fix.impact] - impactRank[b.fix.impact]);
	const others = ALL_FIXES.filter((fix) => !recommended.some((item) => item.fix.id === fix.id));

	const button = (fix: Fix, result?: Result) => (
		<button
			type="button"
			className={`vp-fix-btn${fix.confirm ? ' is-careful' : ''}`}
			disabled={Boolean(runningId)}
			onClick={() => (fix.confirm ? setConfirming(fix) : run(fix))}
		>
			{runningId === fix.id ? (
				<>
					<i className="adminfont-refresh vp-spin" aria-hidden="true" />
					{__('Working…', 'vulopilot')}
				</>
			) : result?.ok ? (
				__('Run again', 'vulopilot')
			) : (
				fix.button
			)}
		</button>
	);

	/** One fix as a row: icon, name with its tags, what it does (or just did), why it is recommended, its button. */
	const tile = (fix: Fix, reason: string | null = null) => {
		const result = results[fix.id];
		const kind = kindOf(fix);

		return (
			<li
				key={fix.id}
				className={`vp-action${reason ? ' is-recommended' : ''}${result ? (result.ok ? ' is-done' : ' is-info') : ''}`}
			>
				<IconTile icon={result?.ok ? 'check' : fix.icon} tone={result?.ok ? 'green' : fix.tone} size="sm" />
				<div className="vp-action-main">
					<div className="vp-action-name">
						<strong className="vp-action-title">{fix.title}</strong>
						<span className={`vp-action-impact is-${fix.impact}`}>{IMPACT[fix.impact]}</span>
						<span className={`vp-action-kind ${kind.tone}`}>{kind.label}</span>
					</div>
					{result ? (
						<p className={`vp-action-result${result.ok ? '' : ' is-info'}`}>{result.message}</p>
					) : (
						<p>{fix.desc}</p>
					)}
					{reason && !result && (
						<span className="vp-action-why">
							<i className="adminfont-error" aria-hidden="true" />
							{sprintf(
								/* translators: %s: what the last scan found, e.g. "CSS Optimization found 1 issue". */
								__('Why: %s', 'vulopilot'),
								reason
							)}
						</span>
					)}
				</div>
				{button(fix, result)}
			</li>
		);
	};

	return (
		<section className="vp-card vp-fixes" id="performance-quick-actions-card">
			<header className="vp-card-head">
				<div className="vp-card-title">
					<span className="vp-card-icon" aria-hidden="true">
						<i className="adminfont-speed" />
					</span>
					<div>
						<h3>{__('What to do next', 'vulopilot')}</h3>
						<p>
							{__('Every one-click speed fix, the ones your site needs first.', 'vulopilot')}
						</p>
					</div>
				</div>
			</header>

			<div className="vp-card-body vp-fixes-body">
				{recommended.length > 0 ? (
					<section className="vp-fixes-group is-recommended">
						<div className="vp-fixes-group-head">
							<h4>{__('Recommended for your site', 'vulopilot')}</h4>
							<p>{__('Your last scan found an issue each of these fixes solves.', 'vulopilot')}</p>
						</div>
						<ul className="vp-actions">{recommended.map(({ fix, reason }) => tile(fix, reason))}</ul>
					</section>
				) : (
					<p className="vp-fixes-clear">
						<i className="adminfont-check" aria-hidden="true" />
						{__('Your last scan found nothing these fixes are needed for. Every tool is still here below.', 'vulopilot')}
					</p>
				)}

				{others.length > 0 && (
					<section className="vp-fixes-group">
						<div className="vp-fixes-group-head">
							<h4>{recommended.length ? __('More speed tools', 'vulopilot') : __('Speed tools', 'vulopilot')}</h4>
							<p>
								{__('“Stays on” settings work on every page, “Instant” ones are safe to run any time, “Asks first” ones change files.', 'vulopilot')}
							</p>
						</div>
						<ul className="vp-actions">{others.map((fix) => tile(fix))}</ul>
					</section>
				)}
			</div>

			<PopupComponent open={Boolean(confirming)} onClose={() => setConfirming(null)} width={28} height="auto" position="lightbox">
				{confirming && (
					<ShowProPopup
						confirmMode
						title={confirming.title}
						confirmMessage={
							<>
								{confirming.confirm}{' '}
								<a href="#&tab=site-health&subtab=backups">{__('Make a backup first', 'vulopilot')}</a>
							</>
						}
						confirmYesText={confirming.button}
						confirmNoText={__('Cancel', 'vulopilot')}
						onConfirm={() => run(confirming)}
						onCancel={() => setConfirming(null)}
					/>
				)}
			</PopupComponent>
		</section>
	);
};

export default QuickActionsCard;
