import { __ } from '@wordpress/i18n';
import {
	CardComponent,
	ListComponent,
	ModuleGuardComponent,
	TooltipComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useApiList } from '../../services/useApiList';
import { formatWpDate } from '../../services/formatWpDate';
import AiCopilotGuard from '../../components/AiCopilotGuard';
import { ChatMessage } from '../../components/ChatComposerCard';
import './SeoVisibility.scss';

interface AiHistoryRow {
	id: number;
	provider: string;
	model: string;
	status: 'success' | 'failure';
	created_at: string;
}

/**
 * "AI Recommendations" sidebar — the mockup's own copy includes a
 * fabricated "+18%" projection; rewritten to a generic, honest message
 * instead. "Let AI Optimize My Site" has no real bulk-fix backend (same
 * reasoning as AiOpportunitiesCard's "Fix Everything with AI"), so it's
 * honestly disabled with a tooltip. "Review Changes First" is a real
 * navigation to AI Copilot's Issues tab — the actual
 * findings-backed list already built there. "Recent AI Wins" reuses the
 * real `GET /ai-history` endpoint (same one AI Copilot's History tab
 * uses) filtered to successful runs — a real, if sparse, entry when
 * Free's own built-in AI actions have logged any, honest empty state
 * otherwise (no "+23% increase in organic clicks"-style outcome tracking
 * exists, so entries show provider/model/when, not a fabricated result).
 */
const AiRecommendationsSidebar = () => {
	const { data, isLoading } = useApiList<AiHistoryRow>('ai-history', {
		status: 'success',
		per_page: 3,
	});

	return (
		<AiCopilotGuard>
			<CardComponent>
				<ChatMessage sender="ai" avatarIcon="person">
					{__(
						"I'm continuously monitoring your site's SEO, GEO, and brand visibility signals.",
						'vulopilot'
					)}
				</ChatMessage>
				<TooltipComponent
					text={__(
						"Bulk auto-fix isn't available yet — there's no AI action-trigger engine wired up.",
						'vulopilot'
					)}
				>
					<ButtonInput
						buttons={{
							text: __('Let AI Optimize My Site', 'vulopilot'),
							icon: 'ai',
							color: 'orange-bg',
							disabled: true,
							onClick: () => {},
						}}
					/>
				</TooltipComponent>
				<a
					className="ai-recommendations-review"
					href="?page=vulopilot#&tab=ai-assistant"
				>
					{__('Review Changes First', 'vulopilot')}
				</a>
			</CardComponent>

			<CardComponent
				className="ai-card"
				title={__('Recent AI Wins', 'vulopilot')}
				titleIcon="ai"
				desc={__('Your last 3 successful AI actions.', 'vulopilot')}
				isLoading={isLoading}
				action={
					<a href="?page=vulopilot#&tab=ai-assistant">
						{__('View all', 'vulopilot')}{' '}
						<i className="adminfont-arrow-right" />
					</a>
				}
			>
				{!isLoading && data.length === 0 ? (
					<ModuleGuardComponent
						icon="check"
						title={__('No AI wins yet', 'vulopilot')}
						desc={__(
							'Successful AI actions will show up here.',
							'vulopilot'
						)}
					/>
				) : (
					<ListComponent
						className="mini-card report"
						items={data.map((row) => ({
							id: String(row.id),
							title: `${row.provider} · ${row.model}`,
							tags: (
								<span className="ai-recommendations-win-time">
									{formatWpDate(row.created_at)}
								</span>
							),
						}))}
					/>
				)}
			</CardComponent>
		</AiCopilotGuard>
	);
};

export default AiRecommendationsSidebar;
