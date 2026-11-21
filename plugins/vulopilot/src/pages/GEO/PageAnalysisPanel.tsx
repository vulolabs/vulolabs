/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { ButtonInput } from '@zyra/inputs';
import { EmptyState, Skeleton } from '../../components/ui';
import { buildEditLink } from './seoIssuesShared';
import { PAGE_ANALYSIS_CHECK_QUERY_PARAM } from '../../services/seoIssueEditorTarget';
import { formatWpDate, formatWpTime } from '../../services/formatWpDate';
import './PageAnalysisPanel.scss';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface PageCheck {
	key: string;
	label: string;
	status: CheckStatus;
	message: string;
}

interface PageAnalysisResponse {
	post_id: number;
	title: string;
	permalink: string;
	meta_description: string;
	analyzed_at: string;
	checks: PageCheck[];
}

interface PageAnalysisPanelProps {
	postId: number;
}

const GROUPS: { status: CheckStatus; title: string }[] = [
	{ status: 'fail', title: __('Fix these', 'vulopilot') },
	{ status: 'warn', title: __('Worth improving', 'vulopilot') },
	{ status: 'pass', title: __('Passing', 'vulopilot') },
];

const STATUS_WORD: Record<CheckStatus, string> = {
	fail: __('Failed', 'vulopilot'),
	warn: __('Needs work', 'vulopilot'),
	pass: __('Passed', 'vulopilot'),
};

/** The editor, opened at the field this check is about. */
const buildCheckEditLink = (postId: number, checkKey: string): string =>
	`${buildEditLink(postId)}&${PAGE_ANALYSIS_CHECK_QUERY_PARAM}=${encodeURIComponent(checkKey)}`;

/** "localhost:8888 › 2026 › 11 › hello-world", the way Google shows a result's address. */
const breadcrumb = (permalink: string): { host: string; path: string } => {
	try {
		const url = new URL(permalink);
		const parts = url.pathname.split('/').filter(Boolean);

		return { host: url.host, path: parts.length ? ` › ${parts.join(' › ')}` : '' };
	} catch {
		return { host: permalink, path: '' };
	}
};

/** A Google-like snippet length: titles near 60 characters, descriptions near 160. */
const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * "Page analysis" for one post or page (`GET /seo/analyze-page`): how many checks pass, how it would look in Google,
 * and every check grouped by what to do - fix, improve, or nothing (folded away). A check opens the editor at its
 * field.
 */
const PageAnalysisPanel = ({ postId }: PageAnalysisPanelProps) => {
	const [data, setData] = useState<PageAnalysisResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState(0);
	const [showPassing, setShowPassing] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		getApiResponse<PageAnalysisResponse>(getApiLink(vulopilotAppLocalizer, `seo/analyze-page?post_id=${postId}`), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				if (cancelled) {
					return;
				}

				if (response) {
					setData(response);
				} else {
					setError(__('Could not analyze this page. Please try again.', 'vulopilot'));
				}
			})
			.catch(() => !cancelled && setError(__('Could not analyze this page. Please try again.', 'vulopilot')))
			.finally(() => !cancelled && setIsLoading(false));

		return () => {
			cancelled = true;
		};
	}, [postId, reloadToken]);

	// A different page starts with its passing checks folded again.
	useEffect(() => setShowPassing(false), [postId]);

	const page = data && data.post_id === postId ? data : null;
	const checks = page ? page.checks : [];
	const count = (status: CheckStatus) => checks.filter((check) => check.status === status).length;
	const counts = { fail: count('fail'), warn: count('warn'), pass: count('pass') };
	const total = checks.length;
	const firstToFix = checks.find((check) => 'fail' === check.status) ?? checks.find((check) => 'warn' === check.status) ?? null;

	let body;

	if (error) {
		body = (
			<EmptyState
				compact
				icon="error"
				tone="red"
				title={__('Something went wrong', 'vulopilot')}
				text={error}
				action={
					<ButtonInput
						buttons={{ text: __('Try again', 'vulopilot'), color: 'purple', onClick: () => setReloadToken((n) => n + 1) }}
					/>
				}
			/>
		);
	} else if (!page) {
		body = (
			<>
				<Skeleton size="block" />
				<Skeleton />
				<Skeleton />
				<Skeleton />
			</>
		);
	} else {
		const { host, path } = breadcrumb(page.permalink);

		body = (
			<>
				{/* How the page scores: passed of total, then a bar split by status. */}
				<div className="vp-pa-summary">
					<div className="vp-pa-score">
						<strong>{counts.pass}</strong>
						<span>
							{sprintf(
								/* translators: %d: total number of checks. */
								__('of %d checks passed', 'vulopilot'),
								total
							)}
						</span>
					</div>
					<div className="vp-pa-bar" aria-hidden="true">
						{(['fail', 'warn', 'pass'] as CheckStatus[]).map(
							(status) => counts[status] > 0 && <i key={status} className={`is-${status}`} style={{ flexGrow: counts[status] }} />
						)}
					</div>
					<ul className="vp-pa-counts">
						{(['fail', 'warn', 'pass'] as CheckStatus[]).map((status) => (
							<li key={status} className={`is-${status}`}>
								<b>{counts[status]}</b> {STATUS_WORD[status].toLowerCase()}
							</li>
						))}
					</ul>
				</div>

				{/* Google's view of the page. */}
				<div className="vp-pa-serp">
					<span className="vp-pa-serp-label">{__('Google preview', 'vulopilot')}</span>
					<div className="vp-pa-serp-site">
						<span className="vp-pa-serp-favicon" aria-hidden="true">
							{host.charAt(0).toUpperCase()}
						</span>
						<span>
							<b>{host}</b>
							<em>
								{host}
								{path}
							</em>
						</span>
					</div>
					<a className="vp-pa-serp-title" href={page.permalink} target="_blank" rel="noreferrer">
						{clip(page.title || __('(no title)', 'vulopilot'), 60)}
					</a>
					{page.meta_description ? (
						<p className="vp-pa-serp-desc">{clip(page.meta_description, 160)}</p>
					) : (
						<p className="vp-pa-serp-desc is-missing">
							<i className="adminfont-error" aria-hidden="true" />
							{__('No meta description - Google will pick a snippet from the page for you.', 'vulopilot')}
						</p>
					)}
				</div>

				{/* The checks, grouped by what to do. */}
				{GROUPS.map(({ status, title }) => {
					const rows = checks.filter((check) => check.status === status);

					if (0 === rows.length) {
						return null;
					}

					const folded = 'pass' === status && !showPassing;

					return (
						<section key={status} className={`vp-pa-group is-${status}`}>
							<header>
								{'pass' === status ? (
									<button type="button" onClick={() => setShowPassing((open) => !open)} aria-expanded={!folded}>
										{title}
										<span className="vp-pa-n">{rows.length}</span>
										<i className={`vp-pa-fold adminfont-keyboard-arrow-down${folded ? '' : ' is-open'}`} aria-hidden="true" />
									</button>
								) : (
									<h4>
										{title}
										<span className="vp-pa-n">{rows.length}</span>
									</h4>
								)}
							</header>
							{!folded && (
								<ul>
									{rows.map((check) => (
										<li key={check.key}>
											<a
												className={`vp-pa-check is-${check.status}`}
												href={buildCheckEditLink(page.post_id, check.key)}
												target="_blank"
												rel="noopener noreferrer"
											>
												<span className="vp-pa-mark" aria-hidden="true">
													<i className={`adminfont-${'pass' === status ? 'check' : 'fail' === status ? 'close' : 'error'}`} />
												</span>
												<span className="vp-pa-check-text">
													<strong>{check.label}</strong>
													<span>{check.message}</span>
												</span>
												<span className="vp-pa-check-go">
													{'pass' === status ? __('View', 'vulopilot') : __('Fix', 'vulopilot')}
													<i className="adminfont-arrow-right" aria-hidden="true" />
												</span>
											</a>
										</li>
									))}
								</ul>
							)}
						</section>
					);
				})}
			</>
		);
	}

	return (
		<section className="vp-card vp-pa" aria-busy={isLoading} aria-label={__('Page analysis', 'vulopilot')}>
			<header className="vp-card-head">
				<div className="vp-card-title">
					<span className="vp-card-icon" aria-hidden="true">
						<i className="adminfont-search" />
					</span>
					<div>
						<h3>{__('Page analysis', 'vulopilot')}</h3>
						<p>
							{page
								? sprintf(
										/* translators: 1: date, 2: time. */
										__('Checked live · %1$s, %2$s', 'vulopilot'),
										formatWpDate(page.analyzed_at),
										formatWpTime(page.analyzed_at)
								  )
								: __('Checking this page’s SEO and AI-search signals…', 'vulopilot')}
						</p>
					</div>
				</div>
				<button
					type="button"
					className="vp-pa-recheck"
					onClick={() => setReloadToken((n) => n + 1)}
					disabled={isLoading}
					aria-label={__('Check again', 'vulopilot')}
					title={__('Check again', 'vulopilot')}
				>
					<i className={`adminfont-refresh${isLoading ? ' vp-spin' : ''}`} aria-hidden="true" />
				</button>
			</header>

			<div className="vp-card-body vp-pa-body">{body}</div>

			{page && (
				<footer className="vp-pa-foot">
					<ButtonInput
						position="full-width"
						buttons={{
							icon: 'ai',
							color: 'purple-bg',
							text: firstToFix
								? sprintf(
										/* translators: %d: number of checks to fix. */
										_n('Fix %d check with AI', 'Fix %d checks with AI', counts.fail + counts.warn, 'vulopilot'),
										counts.fail + counts.warn
								  )
								: __('Nothing to fix', 'vulopilot'),
							disabled: !firstToFix,
							onClick: () => {
								if (firstToFix) {
									window.location.href = buildCheckEditLink(postId, firstToFix.key);
								}
							},
						}}
					/>
					<div className="vp-pa-links">
						<a href={buildEditLink(postId)}>
							<i className="adminfont-edit" aria-hidden="true" />
							{__('Edit page', 'vulopilot')}
						</a>
						{page.permalink && (
							<a href={page.permalink} target="_blank" rel="noreferrer">
								<i className="adminfont-eye" aria-hidden="true" />
								{__('View page', 'vulopilot')}
							</a>
						)}
					</div>
				</footer>
			)}
		</section>
	);
};

export default PageAnalysisPanel;
