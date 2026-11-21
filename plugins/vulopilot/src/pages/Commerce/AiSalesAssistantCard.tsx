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
				id="ai-sales-assistant-card"
				title={__('AI Sales Assistant', 'vulopilot')}
				titleIcon="ai"
				desc={__('Real open WooCommerce findings, summarized.', 'vulopilot')}
				isLoading={isLoading || undefined}
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
										"You're all caught up - no open findings need your attention right now. I can still help you optimize a batch of products with AI.",
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
