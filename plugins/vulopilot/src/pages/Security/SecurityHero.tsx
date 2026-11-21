import { __, _n, sprintf } from '@wordpress/i18n';
import AreaHero, { urgentCount } from '../../components/AreaHero';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import { SECURITY_AREAS } from './securityAreas';

interface SecurityHeroProps {
	score: number | null;
	groups: FindingGroup[];
	isLoading: boolean;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onReview: (area: string) => void;
}

/** Security's opening answer: the security score, open and urgent issues, and every protection area. */
const SecurityHero = ({ score, groups, isLoading, onReview }: SecurityHeroProps) => {
	const urgent = urgentCount(groups);
	const clear = SECURITY_AREAS.filter((area) => !groups.some((group) => area.scannerIds.includes(group.scanner_id))).length;

	let note: { tone: 'up' | 'down' | 'flat'; text: string } = {
		tone: 'up',
		text: __('Every security check passed on the last scan.', 'vulopilot'),
	};

	if (groups.length > 0) {
		note =
			urgent > 0
				? {
						tone: 'down',
						text: sprintf(
							/* translators: %d: number of critical or high issues. */
							_n('%d needs your attention first.', '%d need your attention first.', urgent, 'vulopilot'),
							urgent
						),
				  }
				: { tone: 'flat', text: __('Nothing urgent. Fix the rest when you have a moment.', 'vulopilot') };
	}

	return (
		<AreaHero
			label={__('Security', 'vulopilot')}
			score={score}
			groups={groups}
			areas={SECURITY_AREAS}
			areasTitle={__('Protection by area', 'vulopilot')}
			isLoading={isLoading}
			headline={
				groups.length > 0
					? sprintf(
							/* translators: %d: number of open security issues. */
							_n('%d security issue is open.', '%d security issues are open.', groups.length, 'vulopilot'),
							groups.length
					  )
					: __('No open security issues. Your site is well protected.', 'vulopilot')
			}
			note={note}
			facts={[
				<>
					<strong>
						{clear}/{SECURITY_AREAS.length}
					</strong>{' '}
					{__('areas clear', 'vulopilot')}
				</>,
				<>
					<strong>{urgent}</strong> {__('critical or high', 'vulopilot')}
				</>,
			]}
			onReview={onReview}
		/>
	);
};

export default SecurityHero;
