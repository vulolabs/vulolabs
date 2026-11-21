/* global vulopilotAppLocalizer */
import { getApiLink, getApiResponse } from '@zyra/core';
import { SEO_SECTIONS } from './seoSections';

/** Truly shared pieces between `SeoSiteWideIssuesTable.tsx` and `SeoIssuesByPageTable.tsx`. */

export const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

/** Every real SEO scanner id either table covers - SeoTab.tsx's own SEO_SECTIONS. */
export const ALL_SEO_SCANNER_IDS = Array.from(
	new Set(SEO_SECTIONS.flatMap((section) => section.scannerIds))
);

const FINDINGS_PAGE_SIZE = 100;
/** Safety ceiling for the pagination loop below. */
const MAX_FINDINGS = 1000;

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type { Priority } from '../../components/Issues/IssuesSummaryCards';

/** Same 3-tier critical→high/info→low fold `SectionedIssuesTable.tsx`'s own local copy and Findings.php's own `PRIORITY_SEVERITY_RANKS` use. */
export const PRIORITY_SEVERITIES: Record<'high' | 'medium' | 'low', FindingSeverity[]> = {
	high: ['critical', 'high'],
	medium: ['medium'],
	low: ['low', 'info'],
};

export interface RawFinding {
	id: number;
	title: string;
	/** The scanner's own longer explanation of the finding. */
	description?: string;
	severity: FindingSeverity;
	status: 'open' | 'resolved' | 'ignored' | 'snoozed';
	scanner_id: string;
	object_type: string;
	object_ref: string;
	/** Real column, already returned by `find_all()`'s own `SELECT *`. */
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

/** `GET /findings` is hard-capped at 100 rows/request server-side. */
export const fetchOpenFindingsFor = async (
	scannerIds: string[]
): Promise<RawFinding[]> => {
	const scannerParam = scannerIds.join(',');
	let page = 1;
	let all: RawFinding[] = [];

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
 * Repeated scans create a new open Finding instead of superseding the previous one, so rows are deduplicated here, keeping the most recent.
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

/** Splits findings into per-page buckets. */
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
	/** Only set when `IssuesSection.tsx` was given a `pageAnalysis` prop (GeoTab.tsx/AeoTab.tsx). */
	visibilityScore?: number | null;
	/** Only set when `IssuesSection.tsx` was given `pageScore: true`. */
	seoScore?: number;
	seoScoreChange?: number;
	/** Only set when `IssuesSection.tsx` was given a `content` config. */
	categoryKey?: string;
	/** Real display label/icon for `categoryKey` above. */
	categoryLabel?: string;
	categoryIcon?: string;
	/** Only set alongside `categoryLabel`. */
	wordCount?: number;
	/** Only set when `IssuesSection.tsx`'s own `content` mode also fetched this row's real readability score. */
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

/** Every published page/post with its real, deterministic visibility %. */
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

/** Shared with what used to be `GeoPageAnalysisTable.tsx`'s own local copy. */
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

/** Fetches only the specific posts/pages that actually have an open finding. */
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
			)
				// A chunk the API answered with nothing adds no posts.
				.then((posts) => posts ?? [])
				.catch(() => [] as WpRestPost[])
		)
	);

	return chunkResults.flat();
};

export const buildEditLink = (postId: number): string =>
	`${vulopilotAppLocalizer.site_url}/wp-admin/post.php?post=${postId}&action=edit`;
