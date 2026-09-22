import { __, _n, sprintf } from '@wordpress/i18n';
import { BadgeComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import {
	HistoryRow,
	groupByDay,
	rowIcon,
	rowStatusBadge,
	rowTag,
	rowTime,
	rowTitle,
} from '../../services/historyTypes';

interface HistoryTimelineProps {
	rows: HistoryRow[];
	total: number;
	selectedRow: HistoryRow | null;
	onSelectRow: (row: HistoryRow) => void;
	isLoadingMore: boolean;
	onLoadMore: () => void;
	/** Overrides what the trailing arrow does — HistoryTab.tsx's own real use (select the row, open the side detail panel) is the default when this is omitted. The compact "recent activity" widgets that share this component (RecentActivityCard.tsx and friends) have no such panel, so they pass a real navigation instead — e.g. jumping to the full History tab. */
	onArrowClick?: (row: HistoryRow) => void;
	/** A real `HistoryRow['id']` (as a string, matching every other `pulsingId`/`pulsingKey` convention already in this codebase) to scroll to and briefly pulse-highlight once it renders — HistoryTab.tsx's own real `?vulopilot_history_id=` deep link from RecentActivityWidget.tsx/RecentActivityCard.tsx/AutomationsActivityCard.tsx. `undefined` for every caller that isn't handling that deep link. */
	pulsingRowId?: string | null;
}

/**
 * The real, day-grouped activity timeline HistoryTab.tsx's own "History"
 * tab renders — extracted here verbatim so it's a real, reusable component
 * rather than markup only that one tab can render, per direct instruction.
 * Still HistoryRow-shaped (`historyTypes.ts`'s own `GET /history` row —
 * scan/change objects, a real `tag`/status per row) — every real per-row
 * field (`rowTag`/`rowStatusBadge`/`rowIcon`/`rowTitle`/`rowTime`,
 * `row.scan`/`row.change`) still comes from that same shape, so this only
 * ever renders `HistoryRow[]`, not an arbitrary activity feed.
 *
 * Also now the shared component behind 4 real "recent activity" widgets
 * that used to render their own hand-rolled flat `.activity-log`/`.activity`
 * list instead (RecentActivityCard.tsx, RecentActivityWidget.tsx,
 * AutomationsActivityCard.tsx, GEO's OverviewTab.tsx), per direct
 * instruction — see each of those files' own docblock for the real
 * `ActivityLogRow`/`AutomationRunRow` → `HistoryRow` mapping each uses
 * (`category` inferred from the row's own real `event_type` prefix:
 * `scan.*` → 'scan', everything else → 'change', the same fallback
 * `rowTag`/`rowIcon` below already apply to any change-category row whose
 * specific `event_type` isn't one of the few they special-case). None of
 * those 4 widgets has a real per-row `scan`/`change` detail object the way
 * `GET /history` rows do (that endpoint doesn't join to those source
 * tables), so every row there renders with `scan: null, change: null` —
 * an honest, already-supported state (`rowTitle()` already falls back to
 * `row.message`, the "N issues found"/before-after meta lines already
 * only render `row.scan`/`row.change` when actually present) rather than
 * fabricated detail. `ActivityTab.tsx`'s own flat `TableCard` (real
 * search/sort/pagination/actor filter) stays separate — HistoryTab.tsx's
 * own docblock already documents it as "a different, narrower view, kept
 * as its own separate tab rather than merged with this one", a past
 * direct instruction this file doesn't reverse.
 */
const HistoryTimeline = ({
	rows,
	total,
	selectedRow,
	onSelectRow,
	isLoadingMore,
	onLoadMore,
	onArrowClick,
	pulsingRowId,
}: HistoryTimelineProps) => {
	const dayGroups = groupByDay(rows);

	return (
		<div className="history-timeline">
			{dayGroups.map((group) => (
				<div
					className="history-day-group"
					key={group.rows[0]?.id ?? group.label}
				>
					<div className="history-day title">{group.label}</div>
					{group.rows.map((row) => {
						const tag = rowTag(row);
						const statusBadge = rowStatusBadge(row);
						const title = rowTitle(row);
						// `rowTitle()` already falls back to `row.message`
						// when there's no real `scan`/`change` detail to
						// title itself with — a row in that state (every
						// row the "recent activity" widgets feed through
						// this component, none of which has a real
						// scan/change join) would otherwise show the exact
						// same real text twice: once as the title, once
						// again as this desc line right under it.
						const showDesc = row.message !== title;
						const showBeforeAfter =
							row.change &&
							null !== row.change.after &&
							row.change.after.length <= 40 &&
							(null === row.change.before ||
								row.change.before.length <= 40);

						const isPulsing = pulsingRowId === String(row.id);

						return (
							<div
								key={row.id}
								id={`vulopilot-history-row-${row.id}`}
								className={`history-row ${selectedRow?.id === row.id ? 'selected' : ''}`}
								role="button"
								tabIndex={0}
								onClick={() => onSelectRow(row)}
							>
								<span className="history-row-time">
									{rowTime(row.created_at)}
								</span>

								<div className="history-details">
									<i
										className={`history-row-icon adminfont-${rowIcon(row)}`}
									/>
									<div className="history-row-text">
										<div className="history-row-title-wrapper">
											<span className='history-row-title'>{title}</span>
											<BadgeComponent
												color={tag.className}
												text={tag.text}
											/>
										</div>
										{showDesc && (
											<div className="desc">
												{row.message}
											</div>
										)}
									</div>
									<div className="history-row-issue-details">
										{row.scan && (
											<span className="history-row-meta-value">
												{sprintf(
													_n(
														'%d issue found',
														'%d issues found',
														row.scan.total,
														'vulopilot'
													),
													row.scan.total
												)}
											</span>
										)}
										{showBeforeAfter && (
											<span className="history-row-meta-value">
												{sprintf(
													__(
														'Before: %1$s · After: %2$s',
														'vulopilot'
													),
													row.change?.before ||
														__(
															'(new content)',
															'vulopilot'
														),
													row.change?.after
												)}
											</span>
										)}
										{statusBadge && (
											<BadgeComponent
												color={statusBadge.className}
												text={statusBadge.text}
											/>
										)}
									</div>
									{/* Same "More Details" / "Viewing" toggle the issues tables use for their row action; the click still selects the row (or runs `onArrowClick`). */}
									<span
										className="history-row-action"
										onClick={(event) => event.stopPropagation()}
									>
										<ButtonInput
											buttons={
												selectedRow?.id === row.id
													? {
															text: __('Viewing', 'vulopilot'),
															icon: 'eye',
															color: 'text-green',
															onClick: () => (onArrowClick ?? onSelectRow)(row),
														}
													: {
															text: __('More Details', 'vulopilot'),
															rightIcon: 'pagination-next-arrow',
															color: 'text-purple',
															onClick: () => (onArrowClick ?? onSelectRow)(row),
													}
											}
										/>
									</span>
								</div>
							</div>
						);
					})}
				</div>
			))}

			{rows.length < total && (
				<ButtonInput
					position="center"
					buttons={{
						rightIcon:  'arrow-right',
						text: isLoadingMore
							? __('Loading…', 'vulopilot')
							: __('Load more', 'vulopilot'),
						color: 'text-purple',
						onClick: onLoadMore,
						disabled: isLoadingMore,
					}}
				/>
			)}
		</div>
	);
};

export default HistoryTimeline;
