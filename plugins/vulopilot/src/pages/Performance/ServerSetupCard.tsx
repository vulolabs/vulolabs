import { __, _n, sprintf } from '@wordpress/i18n';
import { Card, IconTile, Skeleton } from '../../components/ui';
import type { Tone } from '../../components/ui';
import type { EfficiencyChecksResponse } from '../Security/efficiencyChecks';

const TONE: Record<string, Tone> = { good: 'green', attention: 'amber', not_applicable: 'neutral' };

/**
 * "Server setup": whether pages, files, database queries and PHP are cached (`GET /efficiency-checks`), each with
 * what it means and the details behind it.
 */
const ServerSetupCard = ({ data, isLoading }: { data: EfficiencyChecksResponse | null; isLoading: boolean }) => {
	const checks = data?.sections.flatMap((section) => section.checks) ?? [];
	const attention = data?.summary.need_attention ?? 0;

	return (
		<Card
			className="vp-server-setup"
			icon="setting"
			title={__('Server setup', 'vulopilot')}
			desc={
				data
					? attention > 0
						? sprintf(
								/* translators: %d: number of checks that need attention. */
								_n('%d setting could make every page faster.', '%d settings could make every page faster.', attention, 'vulopilot'),
								attention
						  )
						: __('Caching is set up well.', 'vulopilot')
					: __('How your server saves work between visits.', 'vulopilot')
			}
		>
			{isLoading && !data ? (
				<Skeleton size="block" />
			) : (
				<ul className="vp-setup-checks">
					{checks.map((check) => (
						<li key={check.id} className={`is-${check.status.replace('_', '-')}`}>
							<IconTile icon={(check.icon || 'setting').split(' ')[0]} tone={TONE[check.status] ?? 'neutral'} size="sm" />
							<div>
								<strong>
									{check.title}
									<span className={`vp-setup-badge is-${check.status.replace('_', '-')}`}>{check.badge}</span>
								</strong>
								<span>{check.description}</span>
								{check.technical_details.length > 0 && (
									<ul className="vp-setup-details">
										{check.technical_details.map((detail) => (
											<li key={detail.label} className={`is-${detail.status}`}>
												{detail.label}: <b>{detail.value}</b>
											</li>
										))}
									</ul>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
};

export default ServerSetupCard;
