import { __ } from '@wordpress/i18n';
import { CardComponent, ListComponent, BadgeComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import AiCopilotGuard from '../../components/AiCopilotGuard';
import { formatAffected } from '../../components/Issues/issuesTypes';
import type { FindingGroup } from '../../components/Issues/issuesTypes';

const SEVERITY_RANK: Record<FindingGroup['severity'], number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4,
};

const MAX_ROWS = 4;

/**
 * Same real "zyra's icon font only ever ships `check`/`error`/`close`/
 * `close-delete` glyphs" constraint `GeoAeoPageAnalysisPanel.tsx`'s own
 * identical `SEVERITY_ICON` already established — `close red`/`close red`
 * for critical/high, `error orange` for medium/low, since every row here is
 * already a real open finding (no "passed" state to reuse `check` for).
 */
const SEVERITY_ICON: Record<FindingGroup['severity'], string> = {
	critical: 'close red',
	high: 'close red',
	medium: 'error orange',
	low: 'error orange',
	info: 'error',
};

interface GeoFixTheseFirstCardProps {
	groups: FindingGroup[];
	isLoading: boolean;
	total: number;
	onViewAll: () => void;
	onSelectScanner: (scannerId: string) => void;
	/** Defaults to "Fix These First" (GEO tab) — AeoTab.tsx passes "What Needs Your Attention" instead, reusing this same real ranking rather than a second copy of it. */
	title?: string;
	emptyMessage?: string;
}

/**
 * "Fix These First" — the real, worst-severity-first (ties broken by real
 * affected count) findings, same ranking SectionedIssuesTable.tsx's own
 * `sortedGroups` already uses for its own unified table. Reuses whatever
 * `groups` the caller already fetched (GeoTab.tsx's own useGeoFindingGroups hook, useGeoTabData.ts,
 * shared with GeoByTopicGrid.tsx; AeoTab.tsx's own AEO-scanner-scoped groups)
 * rather than fetching its own copy. "View pages" switches the unified
 * table's own active tab to that scanner's section (`onSelectScanner`,
 * owned by the caller) instead of a same-page scroll-and-highlight — the
 * unified table doesn't have a dedicated DOM anchor per scanner anymore
 * (see GeoTab.tsx's own docblock on why the old `#geo-section-*` anchors
 * are gone).
 */
const GeoFixTheseFirstCard = ({
	groups,
	isLoading,
	total,
	onViewAll,
	onSelectScanner,
	title,
	emptyMessage,
}: GeoFixTheseFirstCardProps) => {
	const sorted = [...groups].sort((a, b) => {
		const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
		return 0 !== severityDiff ? severityDiff : b.count - a.count;
	});

	const topRows = sorted.slice(0, MAX_ROWS);

	return (
		<CardComponent
			title={title || __('Fix These First', 'vulopilot')}
			titleIcon="error"
			desc={__('The worst-severity open findings, ranked first.', 'vulopilot')}
			isLoading={isLoading}
			badges={[{ text: String(total), color: 'red' }]}
			action={
				<ButtonInput
					buttons={{
						text: `${__('View all', 'vulopilot')} ›`,
						color: 'text-purple',
						onClick: onViewAll,
					}}
				/>
			}
		>
			{!isLoading && 0 === topRows.length ? (
				<div className="desc">
					{emptyMessage ||
						__(
							'No open GEO findings right now — nothing to fix.',
							'vulopilot'
						)}
				</div>
			) : (
				<ListComponent
					className="mini-card report geo-fix-first-list"
					items={topRows.map((group) => ({
						id: group.scanner_id,
						icon: SEVERITY_ICON[group.severity],
						title: group.label,
						desc: group.sample?.description || '',
						action: () => onSelectScanner(group.scanner_id),
						titleTag: (
							<BadgeComponent
								color='blue'
								text={formatAffected(group.count, group.object_type)}
							/>
						),
						tags: (
							<ButtonInput
								buttons={{
									text: __('View', 'vulopilot'),
									color: 'text-purple',
									onClick: () => onSelectScanner(group.scanner_id),
								}}
							/>
						),
					}))}
				/>
			)}
			<AiCopilotGuard
				title={__('AI Copilot is turned off', 'vulopilot')}
				desc={__(
					'Turn the AI Copilot module back on from Settings → Modules to ask it about these issues.',
					'vulopilot'
				)}
			>
				<a
					href="?page=vulopilot#&tab=ai-assistant"
					className="geo-fix-first-copilot-banner"
				>
					<i className="adminfont-ai" />
					{__(
						'Need help understanding these issues? Ask AI Copilot to explain and suggest fixes.',
						'vulopilot'
					)}
				</a>
			</AiCopilotGuard>
		</CardComponent>
	);
};

export default GeoFixTheseFirstCard;
