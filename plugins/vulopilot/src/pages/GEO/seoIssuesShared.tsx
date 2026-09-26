/* global vulopilotAppLocalizer */
import { getApiLink, getApiResponse } from '@zyra/core';
import { SEO_SECTIONS } from './seoSections';

/**
 * Truly shared pieces between `SeoSiteWideIssuesTable.tsx` and
 * `SeoIssuesByPageTable.tsx` - the two real tables SeoTab.tsx's own SEO
 * usage of `IssuesSection.tsx` renders side by side (split apart from one
 * combined "All SEO Issues" table per direct instruction). Only what BOTH
 * genuinely need lives here;
 * each table's own page/post-specific or immediate-AI-apply-specific
 * pieces stay local to that table's own file.
 */

export const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

/** Every real SEO scanner id either table covers - SeoTab.tsx's own SEO_SECTIONS, the same source of truth its category tiles/score already agree with. */
export const ALL_SEO_SCANNER_IDS = Array.from(
	new Set(SEO_SECTIONS.flatMap((section) => section.scannerIds))
);

const FINDINGS_PAGE_SIZE = 100;
/** Safety ceiling for the pagination loop below - a real site would need >1,000 open SEO findings to ever hit this. */
const MAX_FINDINGS = 1000;

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type { Priority } from '../../components/Issues/IssuesSummaryCards';

/** Same 3-tier critical→high/info→low fold `SectionedIssuesTable.tsx`'s own local copy (Security/Accessibility/WooCommerce's shared issues table) and Findings.php's own `PRIORITY_SEVERITY_RANKS` use - kept here too so `IssuesSection.tsx`'s own priority stat cards (reusing `IssuesSummaryCards.tsx` as-is, per direct instruction to match that same real filter bar) and its two tables filter findings the exact same way that component already does. */
export const PRIORITY_SEVERITIES: Record<'high' | 'medium' | 'low', FindingSeverity[]> = {
	high: ['critical', 'high'],
	medium: ['medium'],
	low: ['low', 'info'],
};

export interface RawFinding {
	id: number;
	title: string;
	severity: FindingSeverity;
	status: 'open' | 'resolved' | 'ignored' | 'snoozed';
	scanner_id: string;
	object_type: string;
	object_ref: string;
	/** Real column (`FindingRepository`'s table), already returned by `find_all()`'s own `SELECT *` - just not typed here until `SeoSiteWideIssuesTable.tsx` needed it for a real "found on" date, same "narrow type widened once a real field is actually needed" pattern `RecentContentCard.tsx`'s own `RawFinding` docblock documents for `object_type`/`object_ref`. */
	created_at: string;
}

interface FindingsResponse {
	data: RawFinding[];
	total: number;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4,
};

export const worstFinding = (findings: RawFinding[]): RawFinding =>
	findings.reduce(
		(worst, finding) =>
			SEVERITY_RANK[finding.severity] < SEVERITY_RANK[worst.severity]
				? finding
				: worst,
		findings[0]
	);

/**
 * `GET /findings` is hard-capped at 100 rows/request server-side
 * (AbstractRepository::find_all()) - loops on the response's own `total`
 * rather than assuming a larger per_page is honored, so a site with >100
 * real open findings for the given scanner ids doesn't silently
 * under-report. Generalized from the original SEO-only
 * `fetchAllOpenSeoFindings()` (kept below as a thin wrapper) so
 * `IssuesSection.tsx` can scope this same real fetch to AEO's/GEO's own
 * scanner ids too, not just SEO's.
 */
export const fetchOpenFindingsFor = async (
	scannerIds: string[]
): Promise<RawFinding[]> => {
	const scannerParam = scannerIds.join(',');
	let page = 1;
	let all: RawFinding[] = [];

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const response = await getApiResponse<FindingsResponse>(
			getApiLink(
				vulopilotAppLocalizer,
				`findings?scanner_id=${scannerParam}&status=open&per_page=${FINDINGS_PAGE_SIZE}&page=${page}&orderby=id&order=desc`
			),
			nonceHeaders
		);

		if (!response) {
			throw new Error('findings fetch failed');
		}

		all = all.concat(response.data ?? []);

		const gotFullPage = (response.data ?? []).length === FINDINGS_PAGE_SIZE;
		const moreRemain = all.length < (response.total ?? 0);

		if (!gotFullPage || !moreRemain || all.length >= MAX_FINDINGS) {
			break;
		}

		page += 1;
	}

	return all;
};

/**
 * Repeated scans create a new "open" Finding row instead of superseding the
 * prior one for the same scanner_id+object_ref (a real, pre-existing gap in
 * the scan/rescan pipeline, confirmed via direct DB query - e.g. the same
 * "No canonical URL tag found" row existing 7+ times with different `id`s).
 * Site-wide findings are the most visibly affected (only ~6 real distinct
 * site-wide checks exist, so duplicates repeat densely in a short list) -
 * deduped here per direct instruction, keeping the most recent (highest
 * `id`) copy of each distinct `scanner_id`+`title` pair so a real status
 * change action (Resolve/Ignore/Fix) targets the current row, not a stale
 * one. Per-page findings aren't deduped here - out of scope for this
 * instruction, and the underlying data-quality issue is unchanged.
 */
const dedupeSiteWideFindings = (findings: RawFinding[]): RawFinding[] => {
	const byKey = new Map<string, RawFinding>();

	findings.forEach((finding) => {
		const key = `${finding.scanner_id}:${finding.title}`;
		const existing = byKey.get(key);

		if (!existing || finding.id > existing.id) {
			byKey.set(key, finding);
		}
	});

	return Array.from(byKey.values());
};

/**
 * Splits findings into per-page buckets (keyed by real numeric post/page
 * id) and a `siteWide` bucket (deduped, see `dedupeSiteWideFindings`) for
 * anything not tied to one specific page. DuplicateContentScanner's own
 * `object_ref` is a comma-joined list of post ids (one duplicate-title
 * finding genuinely spans multiple posts) - split and attached to EACH
 * matching page here, which is more correct than
 * Findings.php::add_page_field()'s own `is_numeric()` check (which fails
 * on a comma string and falls back to "Site-wide" - a real, pre-existing
 * quirk in that shared controller, not fixed here since it backs other
 * tables too). SitemapScanner/RobotsTxtScanner write `object_type: 'url'`
 * - genuinely site-wide, never forced onto a page.
 */
export const bucketFindingsByPage = (
	findings: RawFinding[]
): { byPostId: Map<number, RawFinding[]>; siteWide: RawFinding[] } => {
	const byPostId = new Map<number, RawFinding[]>();
	const siteWide: RawFinding[] = [];

	findings.forEach((finding) => {
		if ('post' !== finding.object_type) {
			siteWide.push(finding);
			return;
		}

		const postIds = finding.object_ref
			.split(',')
			.map((part) => Number(part.trim()))
			.filter((id) => Number.isFinite(id) && id > 0);

		if (0 === postIds.length) {
			siteWide.push(finding);
			return;
		}

		postIds.forEach((postId) => {
			byPostId.set(postId, [...(byPostId.get(postId) || []), finding]);
		});
	});

	return { byPostId, siteWide: dedupeSiteWideFindings(siteWide) };
};

export interface WpRestPost {
	id: number;
	title: { rendered: string };
	status: string;
	date: string;
	link: string;
}

export interface PageRow {
	id: number;
	isFinding?: false;
	title: string;
	status: string;
	date: string;
	editLink: string;
	viewLink: string | null;
	findings: RawFinding[];
	/** Only set when `IssuesSection.tsx` was given a `pageAnalysis` prop (GeoTab.tsx/AeoTab.tsx) - the real, deterministic `GET /geo-analysis/pages` score (`GeoAnalyzer::score_from_failures()`), `null` for a site with no scan history yet. Undefined (not just null) for SeoTab.tsx's own SEO usage, which never fetches this. */
	visibilityScore?: number | null;
	/** Only set when `IssuesSection.tsx` was given `pageScore: true` (SeoTab.tsx's own SEO usage) - the real per-page SEO score/week-over-week change `GET /seo/pages-needing-attention` (Seo.php) already computes, joined onto this row by `id` (was `PagesNeedingAttentionTable.tsx`'s own standalone data source before that table was folded into this one - see `IssuesSection.tsx`'s own `pageScore` docblock). `undefined` for any row that endpoint didn't return (a page with no open finding, or a non-SEO caller). */
	seoScore?: number;
	seoScoreChange?: number;
	/** Only set when `IssuesSection.tsx` was given a `content` config (`RecentContentCard.tsx`'s own real Blog Post/Landing Page/Product Description/Other split) - the raw category key (e.g. `'blog-post'`), used by `ContentModeConfig.rowTabs[].matches()` to filter rows per tab. */
	categoryKey?: string;
	/** Real display label/icon for `categoryKey` above - the same real category badge/icon that table's own hand-rolled `InformationItemComponent` used to render. Undefined for every other real caller, which has no row-based category dimension. */
	categoryLabel?: string;
	categoryIcon?: string;
	/** Only set alongside `categoryLabel` - real client-computed word count (`RecentContentCard.tsx`'s own `countWords()`), shown as an extra description line. */
	wordCount?: number;
	/** Only set when `IssuesSection.tsx`'s own `content` mode also fetched this row's real readability score (`GET /content-intelligence/quality?post_id=`'s own `readability.score` - the same real Flesch Reading Ease number `ContentQualityCard.tsx`'s own ring plots) - one real request per row, since no bulk equivalent of that endpoint exists. `undefined` while that row's own fetch hasn't resolved yet, or for any non-`content` caller. */
	contentQualityScore?: number;
}

export interface GeoAnalysisPageRow {
	post_id: number;
	title: string;
	edit_link: string;
	permalink: string;
	status: string;
	date: string;
	open_findings: number;
	visibility_score: number | null;
}

/**
 * Every published page/post with its real, deterministic visibility % -
 * `GET /geo-analysis/pages`, the same real endpoint `GeoPageAnalysisTable.tsx`
 * used to fetch independently. One unpaginated call (bounded by that
 * endpoint's own `MAX_PAGES_QUERY` safety cap server-side, same "generous
 * but not truly unlimited" posture `fetchOpenFindingsFor()`'s own
 * `MAX_FINDINGS` takes) rather than a paginated loop, since `IssuesSection.tsx`
 * filters/sorts this client-side same as its own findings-only fetch already
 * does.
 */
export const fetchAllPagesWithScores = async (
	scannerIds: string[]
): Promise<GeoAnalysisPageRow[]> => {
	const response = await getApiResponse<{ data: GeoAnalysisPageRow[]; total: number }>(
		getApiLink(
			vulopilotAppLocalizer,
			`geo-analysis/pages?per_page=1000&scanner_ids=${scannerIds.join(',')}`
		),
		nonceHeaders
	);

	return response?.data ?? [];
};

const ratingClass = (score: number): string => {
	if (score >= 70) {
		return 'is-good';
	}
	if (score >= 40) {
		return 'is-attention';
	}
	return 'is-poor';
};

/** Shared with what used to be `GeoPageAnalysisTable.tsx`'s own local copy - same real bar + `%`/`-` rendering, now also used by `SeoIssuesByPageTable.tsx`'s merged "AI Visibility"/"Answer Readiness" column. */
export const VisibilityCell = ({ score }: { score: number | null | undefined }) => {
	if (null === score || undefined === score) {
		return <span className="geo-page-visibility-empty">-</span>;
	}

	return (
		<div className={`geo-page-visibility-bar ${ratingClass(score)}`}>
			<div className="geo-page-visibility-track">
				<div className="geo-page-visibility-fill" style={{ width: `${score}%` }} />
			</div>
			<span className="geo-page-visibility-value">{score}%</span>
		</div>
	);
};

/** Fetches only the specific posts/pages that actually have an open finding (via WP core's own `include` param), rather than every post/page on the site - this table's scope is bounded by real issue count, not total site content. */
export const fetchPagesByIds = async (
	endpoint: 'posts' | 'pages',
	ids: number[]
): Promise<WpRestPost[]> => {
	if (0 === ids.length) {
		return [];
	}

	const chunks: number[][] = [];
	for (let i = 0; i < ids.length; i += 100) {
		chunks.push(ids.slice(i, i + 100));
	}

	const chunkResults = await Promise.all(
		chunks.map((chunk) =>
			getApiResponse<WpRestPost[]>(
				getApiLink(
					vulopilotAppLocalizer,
					`${endpoint}?include=${chunk.join(',')}&per_page=100&_fields=id,title,status,date,link`,
					'wp/v2'
				),
				nonceHeaders
			).catch(() => [] as WpRestPost[])
		)
	);

	return chunkResults.flat();
};

export const buildEditLink = (postId: number): string =>
	`${vulopilotAppLocalizer.site_url}/wp-admin/post.php?post=${postId}&action=edit`;
