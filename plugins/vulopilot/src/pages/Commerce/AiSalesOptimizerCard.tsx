import { __ } from '@wordpress/i18n';
import { CardComponent, AnalyticsComponent, ModuleGuardComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useSalesInsights } from '../../services/useSalesInsights';
import AiCopilotGuard from '../../components/AiCopilotGuard';

interface AiSalesOptimizerCardProps {
	onFindOpportunities: () => void;
}

const AiSalesOptimizerCard = ({
	onFindOpportunities,
}: AiSalesOptimizerCardProps) => {
	const { data, isLoading } = useSalesInsights();

	return (
		<>
			{/* Only shown while this card is still in its locked (`!data`) state below - once the
			 * WooCommerce Intelligence module is actually active and showing real opportunities,
			 * the upgrade label is just noise for a site owner who already has it unlocked. */}
			{!isLoading && !data && (
				<span className="admin-tag pro-tag">
					<i className="adminfont-pro-tag" />
					{__('Pro', 'vulopilot')}
				</span>
			)}
			<CardComponent
				id="ai-sales-optimizer-card"
				className="ai-sales-optimizer-card"
				titleIcon="ai"
				title={__('AI Sales Optimizer', 'vulopilot')}
				desc={__('Real cross-sell, upsell, and bundle opportunities across your store.', 'vulopilot')}
				isLoading={isLoading || undefined}
			>
				<AiCopilotGuard>
					{!isLoading && !data && (
						<ModuleGuardComponent
							icon="lock"
							title={__('Unlock AI Sales Optimizer', 'vulopilot')}
							desc={__(
								'Enable the WooCommerce Intelligence module to find real cross-sell, upsell, and bundle opportunities across your catalog.',
								'vulopilot'
							)}
							buttonText={__('Learn more', 'vulopilot')}
							onButtonClick={onFindOpportunities}
						/>
					)}
					{!isLoading && data && (
						<>
							<div className="desc">
								{__(
									'Find cross-sell, upsell, and bundle opportunities across your store.',
									'vulopilot'
								)}
							</div>
							<AnalyticsComponent
								variant="background-color"
								cols={3}
								data={[
									{
										icon: 'link',
										number: data.cross_sell_count,
										text: __('Cross-sell opportunities', 'vulopilot'),
										colorClass: 'admin-bg-color2',
									},
									{
										icon: 'bar-chart',
										number: data.upsell_count,
										text: __('Upsell opportunities', 'vulopilot'),
										colorClass: 'admin-bg-color3',
									},
									{
										icon: 'refresh',
										number: data.bundle_count,
										text: __('Bundle opportunities', 'vulopilot'),
										colorClass: 'admin-bg-color4',
									},
								]}
							/>
							<ButtonInput
								buttons={{
									text: __('Find Sales Opportunities ', 'vulopilot'),
									icon: 'search',
									color: 'border-purple',
									onClick: onFindOpportunities,
								}}
							/>
						</>
					)}
				</AiCopilotGuard>
			</CardComponent>
		</>
	);
};

export default AiSalesOptimizerCard;
