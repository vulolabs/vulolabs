/* global vulopilotAppLocalizer */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { TabsComponent, CardComponent } from '@zyra/components';
import { ButtonInput, SelectInput, TextInput } from '@zyra/inputs';
import { Priority } from '../../components/Issues/IssuesSummaryCards';
import {
	FindingSeverity,
	PageRow,
	RawFinding,
	bucketFindingsByPage,
	buildEditLink,
	fetchAllPagesWithScores,
	fetchOpenFindingsFor,
	fetchPagesByIds,
	nonceHeaders,
} from './seoIssuesShared';
import SeoSiteWideIssuesTable from './SeoSiteWideIssuesTable';
import SeoIssuesByPageTable from './SeoIssuesByPageTable';

interface FindingGroupRow {
	scanner_id: string;
	label: string;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	count: number;
}

export interface IssuesSectionCategory {
	key: string;
	title: string;
	scannerIds: string[];
}

/** `content.toolbarFilters`'s own real severity `<select>` labels - same real 5-level set `RecentContentCard.tsx`'s own original `SEVERITY_LABELS` used. */
const SEVERITY_LABELS: Record<FindingSeverity, string> = {
	critical: __('Critical', 'vulopilot'),
	high: __('High', 'vulopilot'),
	medium: __('Medium', 'vulopilot'),
	low: __('Low', 'vulopilot'),
	info: __('Info', 'vulopilot'),
};

/** `GET /findings/groups`' own raw per-scanner counts, summed across whichever scanner ids matter for a given tab/tile - same convention (and the same real duplicate-row caveat) `SectionedIssuesTable.tsx`'s own local copy already documents; kept here rather than shared so this file doesn't reach into Security's own module for one helper. */
const sumGroupCounts = (groups: FindingGroupRow[], scannerIds: string[]): number =>
	groups
		.filter((group) => scannerIds.includes(group.scanner_id))
		.reduce((total, group) => total + group.count, 0);

interface CategoryFocus {
	/** A real category `key` from `categories`, or the literal `'all'` to reset back to the unfiltered view - same "View All" case the AEO/GEO tiles' own "View All"/"Fix Automatically" shortcuts need, which no SEO call site exercises today (every SEO category tile passes its own real key). */
	key: string;
	token: number;
}

export interface ContentRowTab {
	key: string;
	label: string;
	/** Real per-row test - `RecentContentCard.tsx`'s own post-type/meta classification (Blog Post/Landing Page/Product/Other), evaluated against each already-built real row. */
	matches: (row: PageRow) => boolean;
}

/**
 * `RecentContentCard.tsx`'s own real content mode - every recent
 * post/page/product (not just ones with an open finding), a real
 * per-row category badge/word count, and real per-row tabs (`rowTabs`)
 * instead of the scanner-id-based `categories` dimension every other
 * caller uses (SEO/AEO/GEO's 3 content-quality scanner ids don't split
 * by post type at all, so a scanner-id tab bar has nothing real to
 * divide there). Kept as its own opt-in branch of the main fetch effect
 * rather than threaded through the existing `pageAnalysis`/default
 * branches, so SEO's/AEO's/GEO's own real behavior stays provably
 * untouched.
 */
export interface ContentModeConfig {
	/** `GenerateLandingPageAction::META_KEY` - the real page meta flag that tells a landing page apart from any other real `page` post type (see `RecentContentCard.tsx`'s own `LANDING_PAGE_META_KEY` docblock). */
	landingPageMetaKey: string;
	/** Real display label/icon per raw `categoryKey` (`'blog-post'`/`'landing-page'`/`'product'`/`'other'`) - `RecentContentCard.tsx`'s own `CATEGORY_LABELS`/`CATEGORY_ICONS`. */
	categories: Record<string, { label: string; icon: string }>;
	rowTabs: ContentRowTab[];
	/** Real `DELETE` row action (moves to trash) - `undefined` hides it. */
	onDelete?: (row: PageRow) => void;
	/** Which row's real delete request is currently in flight, so that row's own action label can read "Deleting…". */
	deletingId?: number | null;
	/**
	 * `RecentContentCard.tsx`'s own real filter bar - a search box + real
	 * severity/resource `<select>`s + a real "Show ignored" toggle + Export
	 * CSV, replacing the usual `TabsComponent`/`IssuesSummaryCards` pair
	 * entirely for this one real caller (per direct instruction - its own
	 * original bespoke toolbar, restored, rather than that shared tab-bar
	 * shape). `undefined`/`false` for every other real caller, which keeps
	 * the usual tabs/summary-cards structure untouched.
	 */
	toolbarFilters?: boolean;
}

interface IssuesSectionProps {
	/** Every real scanner id this section covers - `SeoTab.tsx` passes SEO_SECTIONS' own ids, AeoTab.tsx/GeoTab.tsx pass their own AEO_SECTIONS/GEO_TOPICS ids, `RecentContentCard.tsx` passes its own 3 content-quality scanner ids. Drives both the findings fetch and the filter pills' own scope. */
	scannerIds: string[];
	/** Only needed if `categoryFocus` is ever set to a real category key (not just `'all'`) - resolves that key down to its own scannerIds, same role `SEO_SECTIONS` plays for SeoTab.tsx's own category tiles. */
	categories?: IssuesSectionCategory[];
	categoryFocus?: CategoryFocus | null;
	/** "SEO Issues" by default - AeoTab.tsx/GeoTab.tsx pass "AEO Issues"/"GEO Issues" so the Pages & Posts table's own issues-count column reads correctly for whichever real check set it's showing. */
	issuesColumnLabel?: string;
	/**
	 * When set, this section also becomes GeoTab.tsx's/AeoTab.tsx's own
	 * standalone "Page-by-page analysis"/"Page-by-Page Answer Readiness"
	 * table, merged into "Pages & Posts" per direct instruction rather than
	 * showing the same pages twice: every published page/post (not just
	 * ones with an open finding right now) via `GET /geo-analysis/pages`,
	 * with a real deterministic visibility % column and an Export CSV
	 * action. Omitted entirely by `SeoTab.tsx`'s own SEO usage,
	 * which keeps its original findings-only scope (only pages that
	 * actually have an open SEO finding, no visibility column, no export).
	 */
	pageAnalysis?: {
		/** Defaults to "AI Visibility". */
		scoreColumnLabel?: string;
		/** Defaults to 'page-analysis.csv'. */
		exportFilename?: string;
	};
	/**
	 * Real `scrollToId()` target for GeoTab.tsx's/AeoTab.tsx's own "View
	 * all"/"View page-by-page breakdown" shortcuts - applied directly to
	 * this section's own root `<div>` rather than left for the host tab to
	 * wrap in its own `<div id="...">`. That wrapping was a real,
	 * confirmed-live layout bug: this section's own outer `.seo-issues-section`
	 * already fills its flex-row parent (see SeoVisibility.scss's own rule
	 * for that class), but an *extra* unstyled wrapper div around it becomes
	 * the actual flex-item instead, and - having no sizing of its own -
	 * only claims its content's natural width, leaving the rest of that row
	 * empty. SeoTab.tsx's own usage never had this problem since it renders
	 * `<IssuesSection>` directly with no such wrapper.
	 */
	id?: string;
	/** Only passed by `SeoTab.tsx`'s own SEO usage - see `SeoIssuesByPageTable.tsx`'s own `onAnalyze` prop docblock. */
	onAnalyze?: (postId: number) => void;
	/** `SeoTab.tsx`'s own `analyzingPostId` - which row's `PageAnalysisPanel` (if any) is currently open, threaded straight through to `SeoIssuesByPageTable.tsx`'s own identical prop so its "Analyze" action can read "Viewing" instead. */
	activePostId?: number | null;
	/**
	 * Only set by `SeoTab.tsx`'s own SEO usage - additionally
	 * fetches `GET /seo/pages-needing-attention` (real per-page SEO score +
	 * week-over-week change, `Seo.php`) and joins it onto each row by `id`,
	 * so `SeoIssuesByPageTable.tsx` can render a real Score ring + Change
	 * column per page. This was `PagesNeedingAttentionTable.tsx`'s own
	 * separate table/fetch before being folded into "Pages & Posts" here
	 * per direct instruction, rather than showing the same pages twice.
	 * `undefined`/`false` for AeoTab.tsx's/GeoTab.tsx's own usage, which has
	 * no equivalent real score endpoint.
	 */
	pageScore?: boolean;
	/** Defaults to "All SEO Findings" (this section's own original real hardcoded title, kept as the default so SEO's/AEO's/GEO's own existing usage is unaffected) - `RecentContentCard.tsx`'s own usage overrides all 3 of `title`/`titleIcon`/`desc`. */
	title?: string;
	titleIcon?: string;
	desc?: string;
	/** `CardComponent`'s own header `action` slot - `undefined` for SEO/AEO/GEO (which have none today); `RecentContentCard.tsx`'s own "View All" button. */
	headerAction?: ReactNode;
	content?: ContentModeConfig;
	/** Bumped by the host after it changes something outside this section's own control (e.g. `RecentContentCard.tsx`'s own real Delete, once the request succeeds) - same `refetchSignal` convention `ManageAutomationsSection.tsx` already establishes, since this section owns its own fetch/row state and has no other way for a parent to ask it to reload. `undefined`/unchanged for every other real caller, which never needs this. */
	reloadSignal?: number;
}

/**
 * Generalized from what used to be `SeoIssuesSection.tsx` (now inlined as
 * a thin SEO-defaults usage directly in SeoTab.tsx, its only consumer) per
 * direct instruction - AEO's and GEO's own "All Issues"
 * tables should have the exact same real structure SEO's already has, not
 * the differently-shaped `SectionedFindingsTab.tsx` those two tabs used
 * before - see AeoTab.tsx's/GeoTab.tsx's own docblocks for exactly what
 * this replaced there. The filter bar itself was rebuilt a *third* time
 * (direct instruction - "I want the table filters like this", pointing at
 * a screenshot of `SectionedIssuesTable.tsx`'s own real filter bar, the
 * same component Security/Accessibility/WooCommerce's own unified issues
 * tables already use): a real `TabsComponent` All/Important/one-per-category
 * tab row, plus `IssuesSummaryCards.tsx` (reused as-is - genuinely generic,
 * no AI-Assistant-specific coupling) for the All Issues/High/Medium/Low
 * priority stat cards, replacing this file's own second version (a search
 * box + a category `<select>` + individual severity pills) so this
 * section's own filter bar matches that established, already-styled
 * pattern exactly rather than a bespoke one. Free-text search and 5-level
 * (not 3-tier-folded) severity are a real loss from that second version -
 * nothing in the reference screenshot has either, so neither survived this
 * pass; say so if you want free-text search back alongside this.
 * `GeoFixTheseFirstCard.tsx`'s/`GeoByTopicGrid.tsx`'s own "View
 * pages"/"View issues" shortcuts still only ever resolve up to a *category*
 * key (see GeoTab.tsx's own `onSelectScanner`), never a bare scanner id, so
 * per-scanner-only filtering remains something nothing here has ever
 * needed.
 *
 * Orchestrates the two real tables `SeoSiteWideIssuesTable.tsx`/
 * `SeoIssuesByPageTable.tsx` render side by side: one real fetch+bucket
 * (findings → `{byPostId, siteWide}` → `rows`) both tables render, passed
 * down as props. The tab bar's/stat cards' own counts are deliberately the
 * raw `GET /findings/groups` counts (`sumGroupCounts()`), not a recount
 * from that bucketed data - same convention (and the same real
 * duplicate-scan-row caveat) `SectionedIssuesTable.tsx`'s own identical tab
 * bar/stat cards already accept, kept consistent here rather than more
 * precise but visually inconsistent with that reference.
 *
 * `categoryFocus` lets the host tab's own topic tiles/"Fix These
 * First"/"View All" shortcuts drive this section from outside: a fresh
 * `{key, token}` (a new `token` even for the same `key` twice in a row, so
 * re-clicking the same tile still re-triggers the scroll+filter) switches
 * the active tab to that category (via `categories`) and scrolls this
 * section into view - `key: 'all'` is the one case with no matching
 * category (resets back to the "All" tab instead of filtering to nothing),
 * which only AEO's/GEO's own "View All"/"Fix Automatically" shortcuts ever
 * pass; no SEO category tile does today.
 */
const IssuesSection = ({
	scannerIds,
	categories = [],
	categoryFocus,
	issuesColumnLabel,
	pageAnalysis,
	id,
	onAnalyze,
	activePostId,
	pageScore,
	title = __('All SEO Findings', 'vulopilot'),
	titleIcon = 'search',
	desc = __('Every open SEO finding, filterable by priority.', 'vulopilot'),
	headerAction,
	content,
	reloadSignal,
}: IssuesSectionProps) => {
	const [rows, setRows] = useState<PageRow[]>([]);
	const [siteWideFindings, setSiteWideFindings] = useState<RawFinding[]>([]);
	const [groups, setGroups] = useState<FindingGroupRow[]>([]);
	const [activeTab, setActiveTab] = useState('all');
	const [activePriority, setActivePriority] = useState<Priority>('all');
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [reloadToken] = useState(0);
	const sectionRef = useRef<HTMLDivElement>(null);
	/** Guards the auto-open effect below so it only ever fires once per mount, not every time `rows` gets a new array reference (e.g. after a refetch) - otherwise re-opening the panel would silently undo a real "close" click. */
	const hasAutoOpenedRef = useRef(false);

	// `content.toolbarFilters`'s own real state - `RecentContentCard.tsx`'s
	// original bespoke toolbar, restored in place of the usual
	// TabsComponent/IssuesSummaryCards pair for this one real caller.
	// `activeTab` above is reused as the resource-type select's own value
	// (`content.rowTabs[].key`) rather than a second, parallel piece of
	// state - nothing else needs `activeTab` when this mode is on, since
	// the tab bar itself never renders.
	const [toolbarSearch, setToolbarSearch] = useState('');
	const [toolbarSeverity, setToolbarSeverity] = useState<'all' | FindingSeverity>('all');

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setHasError(false);

		(async () => {
			try {
				const findings = await fetchOpenFindingsFor(scannerIds);
				const { byPostId, siteWide } = bucketFindingsByPage(findings);

				let builtRows: PageRow[];

				if (content) {
					// `RecentContentCard.tsx`'s own real content mode - every
					// recent post/page/product (not narrowed to `byPostId`'s
					// keys the way the other 2 branches are, since a page
					// with zero open findings is still real, recent content
					// worth listing), fetched with the extra real fields
					// (`content`/`meta`/`description`) neither
					// `fetchPagesByIds()` nor `fetchAllPagesWithScores()`
					// requests, needed here for real word counts and the
					// real landing-page meta check.
					const countWords = (html: string): number => {
						const text = html
							.replace(/<[^>]+>/g, ' ')
							.replace(/&[a-z0-9#]+;/gi, ' ')
							.trim();

						return text ? text.split(/\s+/).length : 0;
					};

					interface RawContentPost {
						id: number;
						title: { rendered: string };
						content: { rendered: string };
						status: string;
						date: string;
						link: string;
						meta?: Record<string, unknown>;
					}

					interface RawContentProduct {
						id: number;
						name: string;
						description: string;
						status: string;
						date_created: string;
						permalink: string;
					}

					const fetchContentPosts = (endpoint: 'posts' | 'pages') =>
						getApiResponse<RawContentPost[]>(
							getApiLink(
								vulopilotAppLocalizer,
								`${endpoint}?per_page=20&orderby=date&order=desc&_fields=id,title,content,status,date,link,meta`,
								'wp/v2'
							),
							nonceHeaders
						)
							.then((response) => response || [])
							.catch(() => [] as RawContentPost[]);

					const fetchContentProducts = () =>
						!vulopilotAppLocalizer.has_woocommerce
							? Promise.resolve([] as RawContentProduct[])
							: getApiResponse<RawContentProduct[]>(
							getApiLink(
								vulopilotAppLocalizer,
								'products?per_page=20&orderby=date&order=desc&_fields=id,name,description,status,date_created,permalink',
								'wc/v3'
							),
							nonceHeaders
						)
							.then((response) => response || [])
							.catch(() => [] as RawContentProduct[]);

					// `toolbarFilters`'s own real "Show ignored" toggle needs
					// real ignored findings to show, not just open ones -
					// `fetchOpenFindingsFor()` above only ever requests
					// `status=open`. Fetched unconditionally (not gated on
					// `toolbarFilters` - a real toggle later needs this data
					// to already be there, same "fetch it up front so
					// toggling is instant" reasoning `RecentContentCard.tsx`'s
					// own original 2-request open+ignored fetch already
					// established) and merged onto the same real
					// `byPostId` findings map, so every row's own
					// `findings` carries both - display-time filtering
					// (open-only vs open+ignored) happens in
					// `SeoIssuesByPageTable.tsx` itself.
					const ignoredFindings = await getApiResponse<{ data: RawFinding[] }>(
						getApiLink(
							vulopilotAppLocalizer,
							`findings?scanner_id=${scannerIds.join(',')}&status=ignored&per_page=100&orderby=id&order=desc`
						),
						nonceHeaders
					)
						.then((response: { data: RawFinding[] } | undefined) => response?.data ?? [])
						.catch(() => [] as RawFinding[]);

					const contentByPostId = new Map(byPostId);

					ignoredFindings.forEach((finding: RawFinding) => {
						if ('post' !== finding.object_type) {
							return;
						}

						const postId = Number(finding.object_ref);
						contentByPostId.set(postId, [
							...(contentByPostId.get(postId) || []),
							finding,
						]);
					});

					const [rawPosts, rawPages, rawProducts] = await Promise.all([
						fetchContentPosts('posts'),
						fetchContentPosts('pages'),
						fetchContentProducts(),
					]);

					const postRows: PageRow[] = rawPosts
						.map((post: RawContentPost) => ({ ...post, categoryKey: 'blog-post' }))
						.concat(
							rawPages.map((post: RawContentPost) => ({
								...post,
								categoryKey:
									true === post.meta?.[content.landingPageMetaKey]
										? 'landing-page'
										: 'other',
							}))
						)
						.map((post: RawContentPost & { categoryKey: string }) => ({
							id: post.id,
							title: post.title.rendered,
							status: post.status,
							date: post.date,
							editLink: buildEditLink(post.id),
							viewLink: 'publish' === post.status ? post.link : null,
							findings: contentByPostId.get(post.id) || [],
							categoryKey: post.categoryKey,
							wordCount: countWords(post.content.rendered),
						}));

					const productRows: PageRow[] = rawProducts.map((product) => ({
						id: product.id,
						title: product.name,
						status: product.status,
						date: product.date_created,
						editLink: buildEditLink(product.id),
						viewLink:
							'publish' === product.status ? product.permalink : null,
						findings: contentByPostId.get(product.id) || [],
						categoryKey: 'product',
						wordCount: countWords(product.description),
					}));

					builtRows = [...postRows, ...productRows].map((row) => {
						const category = content.categories?.[row.categoryKey ?? ''];

						return {
							...row,
							categoryLabel: category?.label,
							categoryIcon: category?.icon,
						};
					});
				} else if (pageAnalysis) {
					// Merged mode (GeoTab.tsx/AeoTab.tsx): every published
					// page/post, not just ones with an open finding right
					// now - same real dataset the old standalone
					// "Page-by-page analysis" table showed.
					const pages = await fetchAllPagesWithScores(scannerIds);

					builtRows = pages.map((page) => ({
						id: page.post_id,
						title: page.title,
						status: page.status,
						date: page.date,
						editLink: page.edit_link,
						viewLink: 'publish' === page.status ? page.permalink : null,
						findings: byPostId.get(page.post_id) || [],
						visibilityScore: page.visibility_score,
					}));
				} else {
					const pageIds = Array.from(byPostId.keys());

					const [posts, pages] = await Promise.all([
						fetchPagesByIds('posts', pageIds),
						fetchPagesByIds('pages', pageIds),
					]);

					builtRows = [...posts, ...pages].map((post) => ({
						id: post.id,
						title: post.title.rendered,
						status: post.status,
						date: post.date,
						editLink: buildEditLink(post.id),
						viewLink: 'publish' === post.status ? post.link : null,
						findings: byPostId.get(post.id) || [],
					}));
				}

				if (pageScore) {
					// Real per-page SEO score/week-over-week change -
					// `PagesNeedingAttentionTable.tsx`'s own former data
					// source, joined onto these same rows by id now that
					// its table is folded into "Pages & Posts" instead of
					// standing on its own (per direct instruction). Only
					// ever returns pages with at least one open finding -
					// the same real set `byPostId` above already scopes
					// `rows` to - so every row here has a real match; a
					// row with no match (this endpoint failing/returning
					// nothing) just keeps `seoScore`/`seoScoreChange`
					// `undefined`, same as before this join existed.
					const scoreResponse = await getApiResponse<{
						data: { post_id: number; score: number; change: number }[];
					}>(getApiLink(vulopilotAppLocalizer, 'seo/pages-needing-attention'), nonceHeaders);

					const scoreByPostId = new Map<number, { score: number; change: number }>(
						(scoreResponse?.data ?? []).map(
							(row: { post_id: number; score: number; change: number }) => [
								row.post_id,
								{ score: row.score, change: row.change },
							]
						)
					);

					builtRows = builtRows.map((row) => {
						const match = scoreByPostId.get(row.id);

						return match
							? { ...row, seoScore: match.score, seoScoreChange: match.change }
							: row;
					});
				}

				if (!cancelled) {
					setRows(
						builtRows.sort(
							(a, b) =>
								new Date(b.date).getTime() - new Date(a.date).getTime()
						)
					);
					setSiteWideFindings(siteWide);
				}
			} catch {
				if (!cancelled) {
					setHasError(true);
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `scannerIds` is a fresh array every render from every real call site (inline `.flatMap()`/literal); re-running on its own reference would refetch every render. Callers never change which scanner ids a given tab covers at runtime, so `reloadToken` (Retry) / `reloadSignal` (a parent-triggered reload, e.g. `RecentContentCard.tsx`'s own real Delete) are the only real triggers this needs.
	}, [reloadToken, reloadSignal]);

	// Default-opens the first row's "More Details" panel (SeoTab.tsx's own
	// PageAnalysisPanel sidebar) once real rows load, same as a click on
	// that first row's own "More Details" action - only for SeoTab.tsx's
	// SEO usage (the only real caller that passes `onAnalyze`), and only
	// once per mount (`hasAutoOpenedRef`), so closing the panel afterward
	// doesn't immediately reopen it.
	useEffect(() => {
		if (!onAnalyze || hasAutoOpenedRef.current || 0 === rows.length) {
			return;
		}

		hasAutoOpenedRef.current = true;
		onAnalyze(rows[0].id);
	}, [rows, onAnalyze]);

	useEffect(() => {
		getApiResponse<{ data: FindingGroupRow[] }>(
			getApiLink(vulopilotAppLocalizer, 'findings/groups?per_page=100'),
			nonceHeaders
		)
			.then((response) =>
				setGroups(
					(response?.data ?? []).filter((group) =>
						scannerIds.includes(group.scanner_id)
					)
				)
			)
			.catch(() => setGroups([]));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- see the fetch effect above.
	}, [reloadToken]);

	/**
	 * `content` mode's own real per-row readability score - same real
	 * `GET /content-intelligence/quality?post_id=` `ContentQualityCard.tsx`'s
	 * own ring already plots, one real request per row (no bulk equivalent
	 * of that endpoint exists - `SeoIssuesByPageTable.tsx`'s own `seoScore`
	 * column instead reads a real bulk endpoint, `pageScore`'s own docblock).
	 * Kept as its own effect, running once real rows exist, so the table
	 * itself renders immediately and each row's score ring fills in as its
	 * own real fetch resolves, rather than blocking the whole table on all
	 * of them finishing first.
	 */
	useEffect(() => {
		if (!content || 0 === rows.length) {
			return;
		}

		let cancelled = false;

		Promise.all(
			rows.map((row) =>
				getApiResponse<{ readability: { score: number } }>(
					getApiLink(vulopilotAppLocalizer, `content-intelligence/quality?post_id=${row.id}`),
					nonceHeaders
				)
					.then(
						(response: { readability: { score: number } } | undefined) =>
							[row.id, response?.readability.score] as [number, number | undefined]
					)
					.catch(() => [row.id, undefined] as [number, number | undefined])
			)
		).then((results) => {
			if (cancelled) {
				return;
			}

			const scoreByPostId = new Map(results);

			setRows((current) =>
				current.map((row) => ({
					...row,
					contentQualityScore: scoreByPostId.get(row.id) ?? row.contentQualityScore,
				}))
			);
		});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `rows.length` (a fresh real fetch/page of rows), not `rows` itself - `rows` gets a new array reference every time this same effect's own `setRows` call above runs, which would otherwise re-trigger it forever.
	}, [content, rows.length, reloadToken, reloadSignal]);

	useEffect(() => {
		if (!categoryFocus) {
			return;
		}

		setActiveTab(categoryFocus.key);
		sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		// Only a fresh external trigger (a new `token` each time) should
		// re-trigger this - not every re-render that happens to pass a new
		// `categoryFocus` object reference.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [categoryFocus?.token]);

	// Resets the priority filter whenever the active tab changes, whether it
	// changed via a click on this section's own tab bar or an external
	// deep-link (the effect above) - same reasoning SectionedIssuesTable.tsx's
	// own identical reset already documents: a stale "High" priority filter
	// left over from a previous tab could otherwise silently hide every row
	// of a tab someone just switched to.
	useEffect(() => {
		setActivePriority('all');
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTab]);

	/** Same CSV shape the old standalone `GeoPageAnalysisTable.tsx` exported - kept identical (header row + escaping) so nothing about the exported file itself changes for anyone already relying on it, just where the button now lives. Also covers `content` mode now (`RecentContentCard.tsx`'s own real client-side export, same real "export exactly what's currently on screen" pattern, just a Title/Category/Status/Words/Open Issues header row instead of Page/Status/Open Issues/Score). `undefined` (not called) unless `pageAnalysis` or `content` is set. */
	const exportCsv =
		pageAnalysis || content
			? () => {
					const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
					const headerRow = content
						? [
								__('Title', 'vulopilot'),
								__('Category', 'vulopilot'),
								__('Status', 'vulopilot'),
								__('Words', 'vulopilot'),
								__('Open Issues', 'vulopilot'),
							]
						: [
								'Page',
								'Status',
								'Open Issues',
								`${pageAnalysis?.scoreColumnLabel || __('AI Visibility', 'vulopilot')} (%)`,
							];
					const lines = [headerRow.map(csvEscape).join(',')];

					(content?.toolbarFilters ? toolbarRows : rows).forEach((row) => {
						const cells = content
							? [
									row.title,
									row.categoryLabel ?? '',
									row.status,
									row.wordCount ?? '',
									row.findings.filter((finding) => 'open' === finding.status)
										.length,
								]
							: [
									row.title,
									row.status,
									row.findings.length,
									row.visibilityScore ?? '',
								];
						lines.push(cells.map((cell) => csvEscape(String(cell))).join(','));
					});

					const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
					const url = URL.createObjectURL(blob);
					const anchor = document.createElement('a');
					anchor.href = url;
					anchor.download = content
						? 'vulopilot-recent-content.csv'
						: pageAnalysis?.exportFilename || 'page-analysis.csv';
					anchor.click();
					URL.revokeObjectURL(url);
				}
			: undefined;

	/** The expanded finding sub-rows' own scanner label (SeoIssuesByPageTable.tsx). */
	const scannerLabelMap = new Map(groups.map((group) => [group.scanner_id, group.label]));

	/** Every real scanner id within this section's own scope whose real severity is critical/high - same "Important" concept, same fold, SectionedIssuesTable.tsx's own tab bar already establishes. */
	const importantScannerIds = groups
		.filter(
			(group) =>
				scannerIds.includes(group.scanner_id) &&
				('critical' === group.severity || 'high' === group.severity)
		)
		.map((group) => group.scanner_id);

	/**
	 * Important/one per real `categories` entry - same real tab bar shape
	 * (and the same raw `GET /findings/groups` counts) SectionedIssuesTable.tsx's
	 * own Security/Accessibility/WooCommerce usage already establishes,
	 * reused here per direct instruction so this section's own filter bar
	 * matches that one exactly. `content.rowTabs` replaces this entirely
	 * for `RecentContentCard.tsx`'s own usage: real per-row counts (not
	 * `/findings/groups` sums - those 3 content-quality scanner ids don't
	 * split by post type at all), since a *category* tab there means
	 * "which post type," not "which scanner flagged it."
	 */
	const tabs: { id: string; label: string; count: number }[] = content
		? content.rowTabs.map((tab) => ({
				id: tab.key,
				label: tab.label,
				count: rows.filter((row) => tab.matches(row)).length,
			}))
		: [
				{
					id: 'important',
					label: __('Important', 'vulopilot'),
					count: sumGroupCounts(groups, importantScannerIds),
				},
				...categories.map((category) => ({
					id: category.key,
					label: category.title,
					count: sumGroupCounts(groups, category.scannerIds),
				})),
			];

	const scannerIdsForTab: Record<string, string[]> = {
		all: scannerIds,
		important: importantScannerIds,
	};
	categories.forEach((category) => {
		scannerIdsForTab[category.key] = category.scannerIds;
	});

	/** Resolves the active tab (`'all'`/`'important'`/a real `categories[].key`) down to the concrete scanner ids both tables - and the priority stat cards below - scope to. Always `'all'` in `content` mode: its tabs split by real post category, a dimension no scanner id carries, so there's nothing real to narrow scanner ids by there. */
	const activeScannerIds: 'all' | string[] = content
		? 'all'
		: 'all' === activeTab
			? 'all'
			: (scannerIdsForTab[activeTab] ?? []);

	/** `content` mode's own real row-level filter - which post-category tab is active, applied to `rows` directly (not `activeScannerIds`, which stays `'all'` above) before `<SeoIssuesByPageTable>` ever sees them. */
	const activeRowTab = content?.rowTabs.find((tab) => tab.key === activeTab);
	const contentRows =
		content && activeRowTab ? rows.filter((row) => activeRowTab.matches(row)) : rows;

	/** Darkest (most severe) to lightest - same real order `RecentContentCard.tsx`'s own original `SEVERITY_RANK` used for its severity `<select>`'s own option order. */
	const SEVERITY_RANK: Record<FindingSeverity, number> = {
		critical: 0,
		high: 1,
		medium: 2,
		low: 3,
		info: 4,
	};

	/** `toolbarFilters`'s own real severity `<select>` options - built from the severities actually present in this section's own real findings (same "no option that can never match a real row" reasoning `RecentContentCard.tsx`'s own original `severityOptions` already documented), not a fixed 5-level list. */
	const toolbarSeverityOptions: { id: 'all' | FindingSeverity; label: string }[] = content
		?.toolbarFilters
		? [
				{ id: 'all', label: __('All issues', 'vulopilot') },
				...Array.from(
					new Set(rows.flatMap((row) => row.findings.map((finding) => finding.severity)))
				)
					.sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])
					.map((severity) => ({
						id: severity,
						label: SEVERITY_LABELS[severity],
					})),
			]
		: [];

	/** A row's findings that are actually relevant to show right now - open always, ignored only while `toolbarShowIgnored` is on - further narrowed by `toolbarSeverity`. Same real logic `RecentContentCard.tsx`'s own original `visibleFindingsFor()` already established. */
	const toolbarVisibleFindingsFor = (row: PageRow) =>
		row.findings.filter(
			(finding) =>
				('open' === finding.status ||
					('ignored' === finding.status)) &&
				('all' === toolbarSeverity || finding.severity === toolbarSeverity)
		);

	/**
	 * `toolbarFilters`'s own final real row set - `contentRows` (already
	 * narrowed to the active resource tab) further narrowed by real
	 * search/severity, with each row's own `findings` replaced by
	 * `toolbarVisibleFindingsFor()`'s real subset so `SeoIssuesByPageTable.tsx`'s
	 * own issue-count badge/expanded findings reflect the same real
	 * open/ignored + severity scope, not the row's full, unfiltered
	 * findings list (that table's own internal `activeScannerIds`/
	 * `activePriority` filtering is a no-op here - both stay `'all'` for
	 * `content` mode, since neither dimension applies to real post-type
	 * tabs/raw severity the way this toolbar's own real filters do).
	 */
	const toolbarRows = content?.toolbarFilters
		? contentRows
				.map((row) => ({ ...row, findings: toolbarVisibleFindingsFor(row) }))
				.filter((row) => {
					if (
						toolbarSearch &&
						!row.title.toLowerCase().includes(toolbarSearch.toLowerCase())
					) {
						return false;
					}

					return 'all' === toolbarSeverity || row.findings.length > 0;
				})
		: contentRows;

	return (
		<div ref={sectionRef} id={id}>
		<CardComponent
			title={title}
			titleIcon={titleIcon}
			desc={desc}
			action={headerAction}
		>
			{content?.toolbarFilters ? (
				<div className="recent-content-toolbar">
					<TextInput
						type="search"
						name="recent-content-search"
						value={toolbarSearch}
						onChange={(value: string) => setToolbarSearch(value)}
						placeholder={__('Search by title or source page…', 'vulopilot')}
						size={20}
						wrapperClass="recent-content-search"
					/>
					<SelectInput
						name="recent-content-severity-filter"
						type="single-select"
						value={toolbarSeverity}
						onChange={(value: string) =>
							setToolbarSeverity(value as 'all' | FindingSeverity)
						}
						options={toolbarSeverityOptions.map((option) => ({
							label: option.label,
							value: option.id,
						}))}
						isClearable={false}
					/>
					<SelectInput
						name="recent-content-resource-filter"
						type="single-select"
						value={activeTab}
						onChange={(value: string) => setActiveTab(value)}
						options={content.rowTabs.map((tab) => ({
							label: tab.label,
							value: tab.key,
						}))}
						isClearable={false}
					/>
					{exportCsv && (
						<ButtonInput
							buttons={{
								text: __('Export CSV', 'vulopilot'),
								icon: 'download',
								onClick: exportCsv,
								disabled: 0 === toolbarRows.length,
							}}
						/>
					)}
				</div>
			) : (
				<>
					<TabsComponent
						className="seo-issues-filter-tabs"
						activeIndex={Math.max(
							tabs.findIndex((tab) => tab.id === activeTab),
							0
						)}
						onTabChange={(index: number) => setActiveTab(tabs[index].id)}
						tabs={tabs.map((tab) => ({
							label: sprintf('%1$s (%2$d)', tab.label, tab.count),
						}))}
					/>
				</>
			)}
			<SeoIssuesByPageTable
				rows={content?.toolbarFilters ? toolbarRows : content ? contentRows : rows}
				activeScannerIds={activeScannerIds}
				activePriority={activePriority}
				scannerLabelMap={scannerLabelMap}
				isLoading={isLoading}
				hasError={hasError}
				issuesColumnLabel={issuesColumnLabel}
				visibilityColumnLabel={pageAnalysis?.scoreColumnLabel || (pageAnalysis ? __('AI Visibility', 'vulopilot') : undefined)}
				onExportCsv={content?.toolbarFilters ? undefined : exportCsv}
				hideSearch={Boolean(content?.toolbarFilters)}
				onAnalyze={onAnalyze}
				activePostId={activePostId}
				showScoreChange={pageScore}
				showContentScore={Boolean(content)}
				onDelete={content?.onDelete}
				deletingId={content?.deletingId}
			/>
			{!content && (
				<SeoSiteWideIssuesTable
					findings={siteWideFindings}
					activeScannerIds={activeScannerIds}
					activePriority={activePriority}
					isLoading={isLoading}
					hasError={hasError}
				/>
			)}
		</CardComponent>
		</div>
	);
};

export default IssuesSection;
