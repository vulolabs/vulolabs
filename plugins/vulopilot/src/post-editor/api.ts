
export interface AnalysisResult {
	id: string;
	group: 'basic' | 'additional' | 'title_readability';
	status: 'pass' | 'warning' | 'fail';
	message: string;
	fixable: boolean;
	action_id: string | null;
}

/** One row of `Seo::get_page_analysis()`'s real `checks` array. */
export interface PageAnalysisCheck {
	key: string;
	label: string;
	status: 'pass' | 'warn' | 'fail';
	message: string;
}

export interface PageAnalysisResponse {
	post_id: number;
	title: string;
	permalink: string;
	meta_description: string;
	analyzed_at: string;
	checks: PageAnalysisCheck[];
}

export interface FixResponse {
	success: boolean;
	message?: string;
	post?: {
		title: string;
		excerpt: string;
		content_changed: boolean;
		/** The saved post_content after a content-mutating action (empty otherwise). */
		content?: string;
		schema_json: string;
		/** Only set by the 'set-featured-image-from-content' mechanical fix. */
		featured_media_id?: number | null;
	};
}

/** Same real shape `seoIssuesShared.tsx`'s own `RawFinding` (dashboard bundle) already establishes. */
export interface RawFinding {
	id: number;
	title: string;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	status: 'open' | 'resolved' | 'ignored' | 'snoozed';
	scanner_id: string;
	object_type: string;
	object_ref: string;
}

interface FindingsResponse {
	data: RawFinding[];
	total: number;
}

const FINDINGS_PAGE_SIZE = 100;
/** Same safety ceiling `seoIssuesShared.tsx`'s own `fetchOpenFindingsFor()` uses. */
const MAX_FINDINGS = 1000;

/**
 * Same real `GET /findings` pagination loop `seoIssuesShared.tsx`'s own `fetchOpenFindingsFor()`
 * already establishes for the dashboard bundle.
 */
export async function fetchOpenFindings( scannerIds: string[] ): Promise< RawFinding[] > {
	const scannerParam = scannerIds.join( ',' );
	let page = 1;
	let all: RawFinding[] = [];

	while ( true ) {
		const response = await request< FindingsResponse >(
			`findings?scanner_id=${ scannerParam }&status=open&per_page=${ FINDINGS_PAGE_SIZE }&page=${ page }&orderby=id&order=desc`
		);

		all = all.concat( response.data ?? [] );

		const gotFullPage = ( response.data ?? [] ).length === FINDINGS_PAGE_SIZE;
		const moreRemain = all.length < ( response.total ?? 0 );

		if ( ! gotFullPage || ! moreRemain || all.length >= MAX_FINDINGS ) {
			break;
		}

		page += 1;
	}

	return all;
}

/**
 * Same real pagination loop as `fetchOpenFindings()`, but with no `status` filter at all - the
 * findings REST endpoint only applies a status filter when the param is present/non-empty
 * (`FindingRepository::find_all()`), so omitting it returns every status (open, resolved,
 * ignored, snoozed). Used to tell "this post has never been scanned by these scanners" (zero
 * rows, any status) apart from "it was scanned and nothing is open" (at least one row exists,
 * just none currently open) - `fetchOpenFindings()` alone can't distinguish those two states.
 */
export async function fetchAllFindings( scannerIds: string[] ): Promise< RawFinding[] > {
	const scannerParam = scannerIds.join( ',' );
	let page = 1;
	let all: RawFinding[] = [];

	while ( true ) {
		const response = await request< FindingsResponse >(
			`findings?scanner_id=${ scannerParam }&per_page=${ FINDINGS_PAGE_SIZE }&page=${ page }&orderby=id&order=desc`
		);

		all = all.concat( response.data ?? [] );

		const gotFullPage = ( response.data ?? [] ).length === FINDINGS_PAGE_SIZE;
		const moreRemain = all.length < ( response.total ?? 0 );

		if ( ! gotFullPage || ! moreRemain || all.length >= MAX_FINDINGS ) {
			break;
		}

		page += 1;
	}

	return all;
}

async function request< T >( path: string, options: NonNullable< Parameters< typeof fetch >[ 1 ] > = {} ): Promise< T > {
	const config = window.vulopilotPostSeo;

	const response = await fetch( `${ config.apiUrl }/${ path }`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			'X-WP-Nonce': config.nonce,
			...( options.headers || {} ),
		},
	} );

	const body = await response.json().catch( () => null );

	if ( ! response.ok ) {
		throw new Error( body?.message || `Request failed (${ response.status })` );
	}

	return body as T;
}

export function analyzePost(
	postId: number,
	payload: {
		title: string;
		content: string;
		excerpt: string;
		slug: string;
		focus_keyword: string;
	}
): Promise< { results: AnalysisResult[] } > {
	return request( `post-seo/${ postId }/analyze`, {
		method: 'POST',
		body: JSON.stringify( payload ),
	} );
}

export function analyzePage( postId: number ): Promise< PageAnalysisResponse > {
	return request( `seo/analyze-page?post_id=${ postId }`, { method: 'GET' } );
}

/** One row of `SeoScoreEngine::evaluate()`'s own return value. */
export interface SeoScoreRule {
	rule_id: string;
	category: string;
	status: 'pass' | 'warning' | 'fail' | 'not_applicable' | 'unknown';
	max_points: number;
	earned_points: number;
	reason: string;
	evidence: Record< string, unknown >;
	recommendation: string | null;
	data_source: string;
}

export interface SeoScoreResponse {
	score: number;
	ruleset_version: string;
	insufficient_data: boolean;
	coverage_percent: number;
	evaluated_count: number;
	unknown_count: number;
	not_applicable_count: number;
	categories: Record< string, { max: number; earned: number; applicable: number } >;
	rules: SeoScoreRule[];
}

/**
 * Real per-post SEO score (`Seo::get_post_score()`), computed from the saved post plus - when
 * given - the editor's own live (possibly-unsaved) field values, so the toolbar/sidebar score
 * pill reacts to typing the same way the Page Analysis tab's own live checklist does, not just
 * to the last save.
 */
export function getPostSeoScore(
	postId: number,
	live?: { title: string; content: string; excerpt: string; slug: string; focus_keyword: string },
	/** True for a debounced-on-keystroke call - skips the engine's one real HTTP self-fetch (http_status/canonical/structured_data), so typing doesn't queue up a network round trip behind itself every ~600ms. */
	liveOnly = false
): Promise< SeoScoreResponse > {
	return request( `seo/post-score?post_id=${ postId }${ liveOnly ? '&live_only=1' : '' }`, {
		method: 'POST',
		body: JSON.stringify( live ?? {} ),
	} );
}

/** Same real `POST /findings/{id}/fix` the dashboard's own "Fix with AI" buttons call. */
export function fixFinding( findingId: number ): Promise< FixResponse > {
	return request( `findings/${ findingId }/fix`, { method: 'POST' } );
}

export function fixWithAi( postId: number, actionId: string ): Promise< FixResponse > {
	return request( `post-seo/${ postId }/fix`, {
		method: 'POST',
		body: JSON.stringify( { action_id: actionId } ),
	} );
}

export interface AutoFixScoreResult {
	rule_id: string;
	status: 'fixed' | 'failed' | 'skipped';
	message: string;
}

export interface AutoFixScoreResponse {
	before_score: number | null;
	after_score: number | null;
	results: AutoFixScoreResult[];
}

/**
 * `ScoreImprovementCard.tsx`'s own "Upgrade to Pro to Auto-Fix" button (Pro-active state) -
 * `VuloPilotPro\OneClickFix\SeoScoreAutoFixRunner::run_all()`, Pro-only (vulopilot-pro's own
 * route; 404s on free).
 */
export function autoFixScore( postId: number ): Promise< AutoFixScoreResponse > {
	return request( `post-seo/${ postId }/auto-fix-score`, { method: 'POST' } );
}

/** `GeoScore::to_array()`'s own real shape - same one `VuloPilotPro\GeoAnalysis\Rest::get_item()`/`create_item()` both return. */
export interface GeoScoreResponse {
	post_id: number;
	deterministic_score: number | null;
	ai_scores: {
		entity_coverage: number;
		question_coverage: number;
		answer_completeness: number;
		llm_readability: number;
		purpose_clarity: number;
		conversation_readiness: number;
		knowledge_graph_coverage: number;
		answer_first_structure: number;
	};
	sub_scores: {
		retrieval_score: number;
		citation_readiness: number;
		ai_summary_qa_detection: number;
		entity_naming_consistency: number;
		content_freshness: number;
		data_point_evidence_density: number;
	};
	overall_score: number;
	suggestions: string[];
	generated_at: string;
}

/**
 * `AiVisibilityCard.tsx`'s own "load the last stored analysis" - reads cached postmeta, no AI
 * call. Pro-only route (404s on free, same as `autoFixScore()`).
 */
export function getGeoScore( postId: number ): Promise< GeoScoreResponse > {
	return request( `geo-analysis/${ postId }`, { method: 'GET' } );
}

/**
 * `AiVisibilityCard.tsx`'s own "Analyze" button - runs a real, fresh AI-backed analysis
 * (`GeoAnalyzer::analyze()`) and persists it. Costs a real AI call - never call this on a
 * debounce/keystroke, only on explicit user action.
 */
export function analyzeGeoScore( postId: number ): Promise< GeoScoreResponse > {
	return request( `geo-analysis/${ postId }`, { method: 'POST' } );
}

/** `CitationCoverageChecker::check_one_post()`'s own real flat result shape. */
export interface AeoCitationResult {
	post_id: number;
	title: string;
	question: string;
	from_content: boolean;
	cited: boolean;
	answer: string;
}

/**
 * Real AEO citation check for this one post - asks the configured AI provider the post's own
 * question (from an FAQ heading, or a deterministic title-based question) without naming this
 * site, then checks whether the answer cites it. Costs a real AI call - explicit button only.
 */
export function checkAeoCitationForPost( postId: number ): Promise< AeoCitationResult > {
	return request( `aeo-citation-coverage/${ postId }`, { method: 'POST' } );
}

/** `KeywordRepository`'s own real row shape (`vulopilot_keywords`). */
export interface KeywordRecord {
	id: number;
	phrase: string;
	keyword_list: string | null;
	tags: string | null;
	search_intent: string | null;
	priority_score: number | null;
	source: string;
}

/** One row of `KeywordAssignmentRepository::get_for_post()`'s joined result. */
export interface KeywordAssignment extends KeywordRecord {
	keyword_id: number;
	role: 'primary' | 'related';
	other_posts?: Array< { post_id: number; title: string; status: string; edit_link: string; view_link: string | null } >;
}

export interface KeywordAssignmentsResponse {
	primary: KeywordAssignment | null;
	related: KeywordAssignment[];
}

/** `GET /keywords?search=` - saved-keyword search/autocomplete, never hardcoded examples. */
export function searchKeywords( search: string ): Promise< { data: KeywordRecord[]; total: number } > {
	return request( `keywords?search=${ encodeURIComponent( search ) }` );
}

export interface CreateKeywordPayload {
	phrase: string;
	keyword_list?: string;
	tags?: string;
	search_intent?: string;
	priority_score?: number;
}

/** `POST /keywords` - creates, or returns the existing record if the phrase already exists. */
export function createKeyword( payload: CreateKeywordPayload ): Promise< { keyword: KeywordRecord; created: boolean } > {
	return request( 'keywords', { method: 'POST', body: JSON.stringify( payload ) } );
}

/** `GET /keywords/post/{postId}` - this post's primary/related assignments. */
export function getKeywordAssignments( postId: number ): Promise< KeywordAssignmentsResponse > {
	return request( `keywords/post/${ postId }` );
}

export interface AssignKeywordPayload extends Partial< CreateKeywordPayload > {
	keyword_id?: number;
	role: 'primary' | 'related';
}

/** `POST /keywords/post/{postId}/assign` - either `keyword_id` (existing) or a new `phrase`. */
export function assignKeyword( postId: number, payload: AssignKeywordPayload ): Promise< KeywordAssignmentsResponse > {
	return request( `keywords/post/${ postId }/assign`, { method: 'POST', body: JSON.stringify( payload ) } );
}

/** `DELETE /keywords/post/{postId}/assign/{keywordId}`. */
export function unassignKeyword( postId: number, keywordId: number ): Promise< KeywordAssignmentsResponse > {
	return request( `keywords/post/${ postId }/assign/${ keywordId }`, { method: 'DELETE' } );
}

export interface KeywordSuggestion {
	phrase: string;
	already_saved: boolean;
	keyword_id: number | null;
	used_by_others: Array< { post_id: number; title: string; status: string; edit_link: string; view_link: string | null } >;
}

export interface KeywordSuggestionsResponse {
	notes: string;
	researched_at: string | null;
	suggestions: KeywordSuggestion[];
}

/**
 * `POST /keywords/post/{postId}/suggestions` - runs the real `KeywordResearchAction` AI action.
 * Costs a real AI call - explicit button only, never on load/debounce.
 */
export function getKeywordSuggestions( postId: number ): Promise< KeywordSuggestionsResponse > {
	return request( `keywords/post/${ postId }/suggestions`, { method: 'POST' } );
}

/** `AnalyzeTopicAction::execute()`'s own stored shape. */
export interface TopicProfile {
	main_topic: string;
	search_intent: string;
	target_audience: string;
	subtopics: string[];
	entities: string[];
	topic_cluster: string;
	coverage_observations: string;
	analyzed_at: string;
}

/** `GET /topic-intelligence/post/{postId}` - stored profile, no AI call. Null if never analyzed. */
export function getTopicProfile( postId: number ): Promise< TopicProfile | null > {
	return request( `topic-intelligence/post/${ postId }` );
}

/** `POST /topic-intelligence/post/{postId}` - a real AI call. Explicit button only. */
export function analyzeTopic( postId: number ): Promise< TopicProfile > {
	return request( `topic-intelligence/post/${ postId }`, { method: 'POST' } );
}

/** `RelatedPostFinder::find()`'s own real row shape. */
export interface RelatedArticle {
	post_id: number;
	title: string;
	post_type: string;
	status: string;
	permalink: string | null;
	edit_link: string;
	shared_terms: string[];
	has_existing_link: boolean;
}

/** `GET /topic-intelligence/post/{postId}/related-articles` - deterministic, no AI call. */
export function getRelatedArticles( postId: number ): Promise< RelatedArticle[] > {
	return request( `topic-intelligence/post/${ postId }/related-articles` );
}

/** One row of `SuggestLinkOpportunitiesAction::execute()`'s own stored shape. */
export interface LinkOpportunity {
	destination_post_id: number;
	destination_title: string;
	destination_url: string;
	anchor_text: string;
	reason: string;
	status: 'suggested' | 'applied' | 'dismissed' | 'needs_review';
	review_reason?: string;
}

/** `GET /topic-intelligence/post/{postId}/link-opportunities` - stored list, no AI call. */
export function getLinkOpportunities( postId: number ): Promise< LinkOpportunity[] > {
	return request( `topic-intelligence/post/${ postId }/link-opportunities` );
}

/** `POST /topic-intelligence/post/{postId}/link-opportunities` - a real AI call. Explicit button only. */
export function suggestLinkOpportunities( postId: number ): Promise< LinkOpportunity[] > {
	return request( `topic-intelligence/post/${ postId }/link-opportunities`, { method: 'POST' } );
}

/**
 * `POST /topic-intelligence/post/{postId}/link-opportunities/{index}/insert` - the deterministic,
 * block-safe insertion step. Can reject with a 409 (`needs_review`) if the anchor text can't be
 * safely located in the current content - the caller should surface that message, not retry blindly.
 */
export function insertLinkOpportunity( postId: number, index: number ): Promise< LinkOpportunity[] > {
	return request( `topic-intelligence/post/${ postId }/link-opportunities/${ index }/insert`, { method: 'POST' } );
}

export function dismissLinkOpportunity( postId: number, index: number ): Promise< LinkOpportunity[] > {
	return request( `topic-intelligence/post/${ postId }/link-opportunities/${ index }/dismiss`, { method: 'POST' } );
}

/** One row of `ContentGapFinder::find()`'s own real shape. */
export interface ContentGap {
	subtopic: string;
	action: 'update_or_link' | 'improve_current';
	reason: string;
	related_post_id: number | null;
	related_post_title: string | null;
}

export interface ContentGapsResponse {
	gaps: ContentGap[];
	needs_topic_analysis: boolean;
}

/** `GET /topic-intelligence/post/{postId}/content-gaps` - deterministic heuristic, no AI call. */
export function getContentGaps( postId: number ): Promise< ContentGapsResponse > {
	return request( `topic-intelligence/post/${ postId }/content-gaps` );
}

/** `ContentBriefBuilder::build()`'s own real shape. */
export interface ContentBrief {
	proposed_title: string;
	main_topic: string;
	primary_keyword: string;
	related_keywords: string[];
	search_intent: string;
	target_audience: string;
	suggested_headings: string[];
	relevant_entities: string[];
	questions_to_answer: string[];
	relevant_existing_articles: Array< { title: string; url: string } >;
	recommended_internal_links: LinkOpportunity[];
	generated_at: string;
	generated_from: { topic_profile_available: boolean; link_opportunities_available: boolean };
}

/**
 * `POST /topic-intelligence/post/{postId}/content-brief` - pure assembly of already-gathered
 * data (topic profile, keywords, link opportunities); never auto-publishes anything.
 */
export function createContentBrief( postId: number, proposedTitle?: string, gapSubtopic?: string ): Promise< ContentBrief > {
	return request( `topic-intelligence/post/${ postId }/content-brief`, {
		method: 'POST',
		body: JSON.stringify( { proposed_title: proposedTitle ?? '', gap_subtopic: gapSubtopic ?? '' } ),
	} );
}

/** `TextSelectionAction::execute()`'s own real stored shape. */
export interface TextActionResult {
	mode: 'improve' | 'expand' | 'explain' | 'keywords';
	selected_text: string;
	proposed_text: string | null;
	explanation: string;
	suggested_keywords: string[];
}

/**
 * `POST /topic-intelligence/post/{postId}/text-action` - a real AI call (Improve/Expand/Explain/
 * Suggest Keywords on a text selection). Explicit action only, never on selection alone. Never
 * writes to the post - the caller applies `proposed_text` itself through Gutenberg's own RichText
 * APIs after the user reviews it.
 */
export function requestTextAction(
	postId: number,
	mode: TextActionResult[ 'mode' ],
	selectedText: string,
	contextBefore: string,
	contextAfter: string
): Promise< TextActionResult > {
	return request( `topic-intelligence/post/${ postId }/text-action`, {
		method: 'POST',
		body: JSON.stringify( { mode, selected_text: selectedText, context_before: contextBefore, context_after: contextAfter } ),
	} );
}

/** `WebsiteProfileRepository::get()`'s own real shape. */
export interface WebsiteProfile {
	profile_version: string;
	generated_at: string;
	verified: {
		site_name: string;
		site_tagline: string;
		home_url: string;
		language: string;
		business_name: string;
		business_type: string;
		products: Array< { name: string } >;
		services: string[];
		locations: string[];
		categories: Array< { name: string; count: number } >;
		total_published_posts: number;
		total_published_pages: number;
		commercial_pages: Array< { title: string; url: string; post_id: number } >;
		pillar_pages: Array< { post_id: number; title: string; url: string; inbound_links: number } >;
		woocommerce_active: boolean;
	};
	inferred: {
		niche: string;
		business_type_summary: string;
		target_audience: string;
		target_market: string;
		brand_terminology: string[];
		business_goals: string[];
		geographic_targeting: string;
	};
}

export function getWebsiteProfile(): Promise< WebsiteProfile | null > {
	return request( 'topic-finder/website-profile' );
}

/** A real AI call. Explicit button only. */
export function analyzeWebsite(): Promise< WebsiteProfile > {
	return request( 'topic-finder/website-profile', { method: 'POST' } );
}

/** One row of `ContentInventoryService::get_inventory()`'s own real shape. */
export interface ContentInventoryRow {
	post_id: number;
	title: string;
	url: string | null;
	post_type: string;
	status: string;
	published_at: string | null;
	modified_at: string;
	categories: string[];
	tags: string[];
	main_topic: string | null;
	search_intent: string | null;
	topic_cluster: string | null;
	primary_keyword: string | null;
	related_keywords: string[];
	content_summary: string | null;
	entities: string[];
	gsc: { keyword_count: number; total_clicks: number; total_impressions: number; avg_position: number } | null;
	has_topic_analysis: boolean;
}

export function getContentInventory( args: { post_type?: string; category?: string; status?: string; topic_cluster?: string; page?: number; per_page?: number } = {} ): Promise< { data: ContentInventoryRow[]; total: number } > {
	const params = new URLSearchParams( Object.entries( args ).filter( ( [ , v ] ) => undefined !== v ).map( ( [ k, v ] ) => [ k, String( v ) ] ) );
	return request( `topic-finder/content-inventory?${ params.toString() }` );
}

/** One row of `DiscoverTopicOpportunitiesAction::execute()`'s own stored shape. */
export interface TopicOpportunity {
	id: string;
	title: string;
	main_topic: string;
	primary_keyword: string;
	related_keywords: string[];
	search_intent: string;
	target_audience: string;
	funnel_stage: string;
	content_type: string;
	existing_overlaps: Array< { post_id: number; title: string; url: string | null; overlap_type: string; evidence: string; recommended_action: string } >;
	opportunity_score: number | null;
	coverage_percent: number;
	insufficient_data: boolean;
	score_factors: Array< { id: string; weight: number; score: number | null; evidence: string } >;
	evidence_source: string;
	confidence: string;
	status: string;
	generated_at: string;
}

export function getTopicOpportunities(): Promise< TopicOpportunity[] > {
	return request( 'topic-finder/topic-opportunities' );
}

/** A real AI call. Explicit button only. */
export function discoverTopicOpportunities(): Promise< TopicOpportunity[] > {
	return request( 'topic-finder/topic-opportunities', { method: 'POST' } );
}

export function dismissTopicOpportunity( id: string ): Promise< TopicOpportunity > {
	return request( `topic-finder/topic-opportunities/${ id }/dismiss`, { method: 'POST' } );
}

export interface KeywordResearchResult {
	query: string;
	search_console: { total_clicks: number; total_impressions: number; avg_position: number } | null;
	search_console_synced_at: string | null;
	search_volume: number | null;
	keyword_difficulty: number | null;
	competition: string | null;
	demand_data_available: boolean;
	demand_data_source: string;
	external_provider_configured: boolean;
}

export function getKeywordResearch( query: string ): Promise< KeywordResearchResult > {
	return request( `topic-finder/keyword-research?query=${ encodeURIComponent( query ) }` );
}

/** `ContentPlannerRest`'s own real item shape, extended with Topic Finder's optional fields. */
export interface ContentPlanItem {
	id: string;
	title: string;
	post_type: string;
	planned_date: string;
	notes: string;
	main_topic: string;
	primary_keyword: string;
	related_keywords: string[];
	topic_cluster: string;
	opportunity_score: number | null;
	rationale: string;
	is_pillar: boolean;
	dismissed: boolean;
	post_id: number;
	status: 'planned' | 'drafted' | 'published' | 'dismissed';
	is_overdue: boolean;
	edit_url: string | null;
}

export function getContentPlan(): Promise< ContentPlanItem[] > {
	return request( 'content-planner' );
}

export function createContentPlanItem( item: Partial< ContentPlanItem > ): Promise< ContentPlanItem > {
	return request( 'content-planner', { method: 'POST', body: JSON.stringify( item ) } );
}

export function updateContentPlanItem( id: string, item: Partial< ContentPlanItem > ): Promise< ContentPlanItem > {
	return request( `content-planner/${ id }`, { method: 'PUT', body: JSON.stringify( item ) } );
}

export function deleteContentPlanItem( id: string ): Promise< { deleted: boolean } > {
	return request( `content-planner/${ id }`, { method: 'DELETE' } );
}

export function createDraftFromPlanItem( id: string ): Promise< ContentPlanItem > {
	return request( `content-planner/${ id }/draft`, { method: 'POST' } );
}

/** `ContentIntelligenceDecisionService::decide()`'s own real shape. */
export interface ContentIntelligenceDecision {
	decision: 'create_new' | 'improve_existing' | 'rethink_topic' | 'not_enough_input';
	matched_post: ContentInventoryRow | null;
	overlaps: Array< { post_id: number; title: string; url: string | null; overlap_type: string; evidence: string; recommended_action: string } >;
	score: { score: number | null; coverage_percent: number; insufficient_data: boolean; factors: Array< { id: string; weight: number; score: number | null; evidence: string } > };
	reason: string;
}

/**
 * `GET /topic-finder/title-decision?title=...&post_id=...` - deterministic, no AI call, safe to
 * call on every debounced title keystroke (same "no AI on every keystroke" rule as the rest of
 * this editor sidebar's live checks).
 */
export function getContentIntelligenceDecision( title: string, postId: number ): Promise< ContentIntelligenceDecision > {
	return request( `topic-finder/title-decision?title=${ encodeURIComponent( title ) }&post_id=${ postId }` );
}

/** `CrawlerVisitRepository::get_stats_for_url()`'s own real shape. */
export interface CrawlerPostStatsResponse {
	total: number;
	by_bot: Array< { bot_name: string; total: number; last_seen_at: string } >;
	is_404_rate_percent: number | null;
}

/**
 * Real logged AI-bot visits to this post's own permalink - distinct from the content-derived
 * GEO/AI-Readiness scores above, since this reflects whether AI crawlers have actually fetched
 * the page, not how well-structured it is for them to understand.
 */
export function getCrawlerStatsForPost( postId: number, days = 90 ): Promise< CrawlerPostStatsResponse > {
	return request( `crawler-traffic/post/${ postId }?days=${ days }`, { method: 'GET' } );
}
