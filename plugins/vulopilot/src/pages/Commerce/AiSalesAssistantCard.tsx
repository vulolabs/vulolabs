import { __, sprintf, _n } from '@wordpress/i18n';
import { CardComponent, ColumnComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import AiCopilotGuard from '../../components/AiCopilotGuard';
import { ChatMessage } from '../../components/ChatComposerCard';
import { useApiList } from '../../services/useApiList';

interface FindingRow {
	id: number;
}

interface AiSalesAssistantCardProps {
	onOptimizeStore: () => void;
	onReviewIssues: () => void;
}

/**
 * "AI Sales Assistant" — moved here from the Overview tab (OverviewTab.tsx)
 * so its two actions point at destinations that actually live on this same
 * tab. The mockup's own copy claimed 4 specific insights (18% conversion
 * increase, $2,420 cart recovery, 15 product pages, 42 products missing
 * schema) with no real backing anywhere in this codebase — replaced with a
 * real, dynamic open-finding count for category 'woocommerce' (same
 * `useApiList('findings', ...)` real-count pattern AiInsightBanner.tsx/
 * StoreHealthBanner.tsx already use). "Let AI Optimize My Store" used to
 * be permanently disabled ("bulk auto-optimize isn't connected yet") — it
 * wasn't, then: WooCommerceAi's own `BulkOptimizePanel.tsx`
 * (`#woocommerce-bulk-ai`, real product search + 9 AI actions + real
 * `POST /woocommerce-ai/bulk-optimize`) already existed. Now a real,
 * functional scroll-to-panel action, same `onOptimizeStore` destination
 * AiSalesOptimizerCard.tsx's "Find Sales Opportunities →" and
 * StoreIntelligenceSummaryCard.tsx's "Create cross-sell →" already use —
 * that panel's own honest locked/unlicensed state (WooCommerceAiLockedCard)
 * still applies for sites where it isn't reachable. "Review Suggestions
 * First" now scrolls to this tab's own Issues table rather than
 * navigating to itself. Gated on the real AI Copilot module
 * (AiCopilotGuard).
 */
const AiSalesAssistantCard = ({
	onOptimizeStore,
	onReviewIssues,
}: AiSalesAssistantCardProps) => {
	const { total, isLoading } = useApiList<FindingRow>('findings', {
		category: 'woocommerce',
		status: 'open',
		per_page: 1,
	});

	return (
		<ColumnComponent fullHeight grid={4}>
			<CardComponent
				title={__('AI Sales Assistant', 'vulopilot')}
				titleIcon="ai"
				desc={__('Real open WooCommerce findings, summarized.', 'vulopilot')}
				isLoading={isLoading}
			>
				<AiCopilotGuard>
					{!isLoading && (
						<ChatMessage sender="ai" avatarIcon="person">
							{total > 0
								? sprintf(
										/* translators: %d is the number of open WooCommerce findings. */
										_n(
											"I found %d open finding in your store. I can help you understand it, or optimize a batch with AI.",
											"I found %d open findings in your store. I can help you understand them, or optimize a batch with AI.",
											total,
											'vulopilot'
										),
										total
									)
								: __(
										"You're all caught up — no open findings need your attention right now. I can still help you optimize a batch of products with AI.",
										'vulopilot'
									)}
						</ChatMessage>
					)}
					<ButtonInput
						position="full-width"
						buttons={[
							{
								text: __('Let AI Optimize My Store', 'vulopilot'),
								icon: 'ai',
								color: 'orange-bg',
								onClick: onOptimizeStore,
							},
							{
								text: __('Review Suggestions First', 'vulopilot'),
								color: 'border-purple',
								onClick: onReviewIssues,
							},
						]}
					/>
				</AiCopilotGuard>
			</CardComponent>
		</ColumnComponent>
	);
};

export default AiSalesAssistantCard;
