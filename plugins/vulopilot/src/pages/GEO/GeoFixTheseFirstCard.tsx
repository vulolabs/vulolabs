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

/** Uses the `close` and `error` glyphs, the only ones zyra's icon font offers for open findings. */
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
	// eslint-disable-next-line no-unused-vars
	onSelectScanner: (scannerId: string) => void;
	/** Defaults to "Fix These First". */
	title?: string;
	emptyMessage?: string;
}

/** "Fix These First". */
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
			isLoading={isLoading || undefined}
			badges={[{ text: String(total), color: 'red' }]}
			action={
				<ButtonInput
					buttons={{
						text: `${__('View all', 'vulopilot')} ›`,
						icon: 'eye',
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
							'No open GEO findings right now - nothing to fix.',
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
									icon: 'eye',
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
