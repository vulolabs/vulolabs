import { __, sprintf, _n } from '@wordpress/i18n';
import { ButtonInput } from '@zyra/inputs';
import { ListComponent, TypographyComponent } from '@zyra/components';
import { useApiList } from '../../services/useApiList';
import { ACCESSIBILITY_CHECKS } from './accessibilityChecks';

interface AccessibilityFinding {
	id: number;
	page?: string;
}

/** Real distinct-pages-affected count from one check's own open-findings rows — same `Set` technique this file's own previous `CheckTile` sub-component already used. */
const pagesAffectedIn = (rows: AccessibilityFinding[]): number =>
	new Set(rows.map((row) => row.page).filter(Boolean)).size;

interface AccessibilityChecksGridProps {
	/** Switches the merged issues table (SectionedIssuesTable.tsx, further down this tab) to this check's own tab and scrolls to it. */
	onReview: (checkKey: string) => void;
}

/**
 * The mockup's "Accessibility Checks" 5-tile grid, plus a real 6th "All
 * Checks" tile (direct instruction) combining the other 5 — one real
 * scanner_id-scoped open-findings count + distinct-pages-affected count
 * per tile (ACCESSIBILITY_CHECKS.tsx's own shared definitions), each
 * "Review" switching the merged issues table further down this tab to
 * that check's own tab.
 *
 * Now rendered through `<ListComponent>`'s own real `mini-card report`
 * row shape — one real row per check (icon + title + issue count +
 * description + "Review" action) — matching the same row shape
 * `LiveSiteInsightsCard.tsx`'s own real per-signal rows already use,
 * rather than `MetricTileComponent`'s grid tiles. Same real per-check
 * numbers, same real `onReview` action, just one shared row layout.
 *
 * `useApiList()` is called once per real check below, unrolled rather
 * than inside `ACCESSIBILITY_CHECKS.map()` — same fixed-list pattern
 * SecurityMetricsGrid.tsx's own `useSectionStatus()` calls already use,
 * since a hook call inside a `.map()` callback is a real rules-of-hooks
 * violation regardless of the array being static. This also gives every
 * row its own real per-check loading state, which this row list needs
 * (one row's count can be ready while another's is still fetching).
 */
const AccessibilityChecksGrid = ({ onReview }: AccessibilityChecksGridProps) => {
	const pageStructure = useApiList<AccessibilityFinding>('findings', {
		scanner_id: ACCESSIBILITY_CHECKS[0].scannerIds.join(','),
		status: 'open',
		per_page: 100,
	});
	const imagesMedia = useApiList<AccessibilityFinding>('findings', {
		scanner_id: ACCESSIBILITY_CHECKS[1].scannerIds.join(','),
		status: 'open',
		per_page: 100,
	});
	const linksForms = useApiList<AccessibilityFinding>('findings', {
		scanner_id: ACCESSIBILITY_CHECKS[2].scannerIds.join(','),
		status: 'open',
		per_page: 100,
	});
	const keyboardUse = useApiList<AccessibilityFinding>('findings', {
		scanner_id: ACCESSIBILITY_CHECKS[3].scannerIds.join(','),
		status: 'open',
		per_page: 100,
	});
	const visualReadability = useApiList<AccessibilityFinding>('findings', {
		scanner_id: ACCESSIBILITY_CHECKS[4].scannerIds.join(','),
		status: 'open',
		per_page: 100,
	});
	const allChecks = useApiList<AccessibilityFinding>('findings', {
		scanner_id: ACCESSIBILITY_CHECKS[5].scannerIds.join(','),
		status: 'open',
		per_page: 100,
	});

	const results = [
		pageStructure,
		imagesMedia,
		linksForms,
		keyboardUse,
		visualReadability,
		allChecks,
	];
	const isLoading = results.some((result) => result.isLoading);

	return (
		<ListComponent
			className="mini-card report list"
			loading={isLoading}
			skeletonCount={ACCESSIBILITY_CHECKS.length}
			items={ACCESSIBILITY_CHECKS.map((check, index) => {
				const result = results[index];
				const pagesAffected = pagesAffectedIn(result.data);

				return {
					id: check.key,
					icon: check.icon,
					title: check.title,
					tags: (
						<TypographyComponent
							variant="desc"
							// style={{ color: check.color }}
						>
							{sprintf(
								/* translators: %d is the number of open findings. */
								_n('%d issue', '%d issues', result.total, 'vulopilot'),
								result.total
							)}
						</TypographyComponent>
					),
					desc:
						result.total > 0
							? sprintf(
									/* translators: %d is the number of distinct pages affected. */
									_n(
										'%d page affected',
										'%d pages affected',
										pagesAffected,
										'vulopilot'
									),
									pagesAffected
								)
							: check.description,
					action: () => onReview(check.key),
				};
			})}
		/>
	);
};

export default AccessibilityChecksGrid;