/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { getApiLink, getApiResponse } from '@zyra/core';
import type { FindingGroup } from '../../components/Issues/issuesTypes';

/**
 * GeoTab.tsx's/AeoTab.tsx's own family of small `GET /findings/groups`-
 * shaped and `/geo-visibility-*`-shaped data-fetching hooks - each used to
 * be its own file (`useGeoFindingGroups.ts`, `useAllFindingGroups.ts`,
 * `useGeoTopicAffectedPages.ts`, `useGeoVisibilitySnapshot.ts`); merged
 * here since they're all small, all real siblings of the same "one real
 * call, reused by every card that needs it" pattern, and each one's own
 * docblock already cross-references the others by name.
 */

const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };

/** Real sum of `.count` across every group whose scanner_id is in `scannerIds` - same technique Commerce/CommerceIssuesTable.tsx's own `sumGroupCounts()` already establishes. */
export const sumGroupCounts = (
	groups: FindingGroup[],
	scannerIds: string[]
): number =>
	groups
		.filter((group) => scannerIds.includes(group.scanner_id))
		.reduce((total, group) => total + group.count, 0);

export const useAllFindingGroups = (): {
	groups: FindingGroup[];
	isLoading: boolean;
} => {
	const [groups, setGroups] = useState<FindingGroup[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		getApiResponse<{ data: FindingGroup[] }>(
			getApiLink(vulopilotAppLocalizer, 'findings/groups?per_page=200'),
			nonceHeaders
		)
			.then((response) => setGroups(response?.data ?? []))
			.finally(() => setIsLoading(false));
	}, []);

	return { groups, isLoading };
};

export interface VisibilityAiScores {
	entity_coverage: number;
	question_coverage: number;
	answer_completeness: number;
	llm_readability: number;
	purpose_clarity: number;
	conversation_readiness: number;
	knowledge_graph_coverage: number;
	answer_first_structure: number;
}

export interface VisibilitySubScores {
	retrieval_score: number;
	citation_readiness: number;
}

export interface VisibilitySnapshot {
	sample_size: number;
	ai_scores: VisibilityAiScores | null;
	sub_scores: VisibilitySubScores | null;
}

export interface GeoVisibilityHistoryRow {
	snapshot_date: string;
	sample_size: number;
	overall_score: number | null;
	/** Same per-dimension breakdown `snapshot.ai_scores`/`sub_scores` carries for "today", now also available per historical day - lets a consumer compute its own scoped sub-average trend (e.g. AeoTab.tsx's "AEO Score Over Time") instead of only the one combined `overall_score` above. Null on a day the sample batch found nothing to average, same as `overall_score`. */
	ai_scores: VisibilityAiScores | null;
	sub_scores: VisibilitySubScores | null;
}

export const useGeoVisibilitySnapshot = (): {
	snapshot: VisibilitySnapshot | null;
	history: GeoVisibilityHistoryRow[];
	isLoading: boolean;
} => {
	const [snapshot, setSnapshot] = useState<VisibilitySnapshot | null>(null);
	const [history, setHistory] = useState<GeoVisibilityHistoryRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		if (!vulopilotAppLocalizer.khali_dabba) {
			setIsLoading(false);
			return;
		}

		Promise.all([
			getApiResponse<VisibilitySnapshot>(
				getApiLink(vulopilotAppLocalizer, 'geo-visibility-summary'),
				{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
			),
			getApiResponse<GeoVisibilityHistoryRow[]>(
				getApiLink(vulopilotAppLocalizer, 'geo-visibility-history'),
				{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
			),
		])
			.then(([summaryResponse, historyResponse]) => {
				if (summaryResponse) {
					setSnapshot(summaryResponse);
				}
				if (historyResponse) {
					setHistory(historyResponse);
				}
			})
			.finally(() => setIsLoading(false));
	}, []);

	return { snapshot, history, isLoading };
};
