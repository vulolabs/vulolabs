/* global appLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { CardComponent, ModuleGuardComponent, ListComponent, BadgeComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { buildEditLink } from './seoIssuesShared';
import { PAGE_ANALYSIS_CHECK_QUERY_PARAM } from '../../services/seoIssueEditorTarget';
import { formatWpDate } from '../../services/formatWpDate';
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
	onClose: () => void;
}

/**
 * zyra's own icon font only ever ships glyphs for 4 classes — confirmed by
 * reading its actual runtime-injected CSS (`.adminfont-check`/`-error`/
 * `-close`/`-close-delete`, nothing else) — `adminfont-warning` doesn't
 * exist there and silently renders no glyph at all, same "referenced in
 * this codebase's source but not in the installed zyra package" class of
 * bug `TypographyComponent` was. `adminfont-error` is the closest real
 * glyph to "needs attention" among the 4 that actually exist.
 */
const STATUS_ICON: Record<CheckStatus, string> = {
	pass: 'check green',
	warn: 'error red',
	fail: 'close red',
};

/** Real per-check status pill (reference mockup) — reuses `BadgeComponent`'s own `border` outline look, same real pass/warn/fail 3-way this row's own `STATUS_ICON` above already keys off. */
const STATUS_BADGE: Record<CheckStatus, { text: string; color: string }> = {
	pass: { text: __('Passed', 'vulopilot'), color: 'green' },
	warn: { text: __('Needs work', 'vulopilot'), color: 'orange' },
	fail: { text: __('Failed', 'vulopilot'), color: 'red' },
};

/** Worst-first — same real "what actually needs attention floats to the top" ordering `WhatShouldIFixFirstCard.tsx`/`SEVERITY_RANK` elsewhere in this plugin already use, applied to this endpoint's own real `fail`/`warn`/`pass` 3-way instead of a 4-tier severity: every real Failed check first, then Needs Work, then Passed last — rather than `get_page_analysis()`'s own fixed check order (Title Tag, Meta Description, …), which mixes all 3 together with no regard for which ones actually need fixing. */
const STATUS_RANK: Record<CheckStatus, number> = {
	fail: 0,
	warn: 1,
	pass: 2,
};

const sortByStatus = (checks: PageCheck[]): PageCheck[] =>
	[...checks].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);

/**
 * Real navigate-and-highlight deep link — this endpoint's own check `key`
 * (`Seo.php::get_page_analysis()`, e.g. `broken_links`/`indexability`) goes
 * straight through as `PAGE_ANALYSIS_CHECK_QUERY_PARAM`'s value, which the
 * editor's own "Page Analysis" tab (`post-editor/tabs/PageAnalysisTab.tsx`)
 * renders as the exact same real checklist and highlights by matching
 * `key` — no scanner-id translation layer needed (that only covers a
 * different, smaller vocabulary several of these 13 checks — Featured
 * Image, Broken Links, Orphan Page, Indexability — have no member of at
 * all; see `PAGE_ANALYSIS_CHECK_QUERY_PARAM`'s own docblock).
 */
const buildCheckEditLink = (postId: number, checkKey: string): string =>
	`${buildEditLink(postId)}&${PAGE_ANALYSIS_CHECK_QUERY_PARAM}=${encodeURIComponent(checkKey)}`;

/**
 * "Page Analysis" (SEO & Visibility → SEO's own "Pages & Posts" table, a new
 * "Analyze" row action) — `GET /seo/analyze-page?post_id=…`
 * (Controllers\Seo::get_page_analysis(), Free). Every one of these checks
 * (up to 12 — "Featured Image" only appears when Settings → Scanning → SEO's
 * own "Flag missing featured image" toggle is on, same real gate
 * SeoImagesScanner itself respects) is real and computed fresh for THIS one
 * page at request time (see that endpoint's own docblock) — a Title Tag/H1/
 * Images/Featured Image/Indexability check with no existing scanner at all
 * (Featured Image reuses SeoImagesScanner's own `has_post_thumbnail()`
 * check, just scoped live to one page), reused real logic from
 * MetaDescriptionScanner/HeadingStructureScanner/ThinContentScanner/
 * CanonicalUrlScanner/SchemaScanner/OpenGraphScanner for the rest, and the
 * real, already-stored Broken Links findings for this page for "Internal
 * Links." Nothing here is estimated or sampled.
 */
const PageAnalysisPanel = ({ postId, onClose }: PageAnalysisPanelProps) => {
	const [data, setData] = useState<PageAnalysisResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setIsLoading(true);
		setError(null);
		setData(null);

		getApiResponse<PageAnalysisResponse>(
			getApiLink(appLocalizer, `seo/analyze-page?post_id=${postId}`),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setData(response);
				} else {
					setError(
						__('Could not analyze this page. Please try again.', 'vulopilot')
					);
				}
			})
			.catch(() =>
				setError(
					__('Could not analyze this page. Please try again.', 'vulopilot')
				)
			)
			.finally(() => setIsLoading(false));
	}, [postId]);

	/**
	 * "Fix with AI" for this whole page — same real "pick the worst one"
	 * posture `SeoIssuesByPageTable.tsx`'s own now-removed per-row action
	 * used (`worstFinding()`), just over this endpoint's own real `checks`
	 * instead of stored findings: the first real `fail`, or the first real
	 * `warn` if nothing's outright failing, or `null` when every check
	 * already passes (button disabled rather than linking nowhere).
	 */
	const primaryFixCheck =
		data?.checks.find((check: PageCheck) => 'fail' === check.status) ??
		data?.checks.find((check: PageCheck) => 'warn' === check.status) ??
		null;

	return (
		<CardComponent
			className="page-analysis-panel"
			title={__('Page Analysis', 'vulopilot')}
			titleIcon="search"
			desc={__('A single page\'s real SEO/GEO signals, checked live.', 'vulopilot')}
			isLoading={isLoading}
		>
			{error && (
				<ModuleGuardComponent
					icon="error"
					title={__('Something went wrong', 'vulopilot')}
					desc={error}
				/>
			)}
			{data && (
				<>
					<div className="page-analysis-search-preview">
						<div className="page-analysis-search-preview-meta">
							{sprintf(
								/* translators: %s: this site's own Settings → General → Date Format, e.g. "10/09/2026". */
								__('Analyzed %s', 'vulopilot'),
								formatWpDate(data.analyzed_at)
							)}
						</div>
						<div className="page-analysis-search-preview-title">
							{data.title}
						</div>
						<div className="page-analysis-search-preview-url">
							{data.permalink}
						</div>
						<div className="page-analysis-search-preview-desc">
							{data.meta_description ||
								__('No meta description set.', 'vulopilot')}
						</div>
					</div>

					<ListComponent
						className="mini-card report hover"
						items={sortByStatus(data.checks).map((template) => ({
							id: template.key,
							icon: STATUS_ICON[template.status],
							title: template.label,
							desc: template.message,
							action: () => {
								window.open(
									buildCheckEditLink(data.post_id, template.key),
									'_blank',
									'noopener,noreferrer'
								);
							},
							tags: (
								<>
									<BadgeComponent
										color={STATUS_BADGE[template.status].color}
										text={STATUS_BADGE[template.status].text}
									/>
									<i className="adminfont-pagination-right-arrow ai-copilot-row-arrow" />
								</>
							),
						}))}
					/>

					<ButtonInput
						position="full-width"
						buttons={[
							{
								icon: 'edit',
								color: 'border-green',
								text: __('Edit page', 'vulopilot'),
								onClick: () => {
									window.location.href = buildEditLink(postId);
								},
							},
							{
								icon: 'eye',
								color: 'border-blue',
								text: __('View page', 'vulopilot'),
								disabled: !data?.permalink,
								onClick: () => {
									if (data?.permalink) {
										window.open(data.permalink, '_blank', 'noreferrer');
									}
								},
							},
							{
								icon: 'ai',
								color: 'orange-bg',
								text: __('Fix with AI', 'vulopilot'),
								disabled: !primaryFixCheck,
								onClick: () => {
									if (primaryFixCheck) {
										window.location.href = buildCheckEditLink(
											postId,
											primaryFixCheck.key
										);
									}
								},
							},
						]}
					/>
				</>
			)}
		</CardComponent>
	);
};

export default PageAnalysisPanel;
