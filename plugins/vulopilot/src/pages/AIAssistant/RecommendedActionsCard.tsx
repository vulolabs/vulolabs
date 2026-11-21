/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import type { ComponentType, FC } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { PopupComponent } from '@zyra/components';
import ShowProPopup from '../../components/Popup/Popup';
import { useFilterSlot } from '../../services/useFilterSlot';
import { formatAffected } from '../../components/Issues/issuesTypes';
import { Card, IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';
import type { IssuesFilter } from './types';

interface RecommendedActionsCardProps {
	// eslint-disable-next-line no-unused-vars
	onNavigateTab: (tab: string, filter?: IssuesFilter) => void;
}

interface Recommendation {
	bucket: 'security' | 'performance' | 'ai-visibility';
	scanner_id: string;
	category: string;
	severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	count: number;
	object_type: string | null;
	label: string;
}

interface AttentionSummaryResponse {
	recommendations: Recommendation[];
}

const BUCKET_META: Record<Recommendation['bucket'], { icon: string; tone: Tone; label: string }> = {
	security: { icon: 'security', tone: 'amber', label: __('Security', 'vulopilot') },
	performance: { icon: 'bar-chart', tone: 'green', label: __('Performance', 'vulopilot') },
	'ai-visibility': { icon: 'geo-location', tone: 'blue', label: __('AI Visibility', 'vulopilot') },
};

const isUrgent = (severity: Recommendation['severity']): boolean =>
	'critical' === severity || 'high' === severity;

const RecommendedActionsFreeCard: FC<RecommendedActionsCardProps> = () => {
	const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	useEffect(() => {
		getApiResponse<AttentionSummaryResponse>(getApiLink(vulopilotAppLocalizer, 'findings/attention-summary'), {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				if (response) {
					setRecommendations(response.recommendations ?? []);
				}
			})
			.finally(() => setIsLoading(false));
	}, []);

	if (isLoading || 0 === recommendations.length) {
		return null;
	}

	return (
		<Card
			className="vp-suggest-card"
			icon="ai"
			title={__('Suggested by VuloPilot', 'vulopilot')}
			desc={__('The highest-impact fix in each area, ready for the AI to work on with VuloPilot Pro.', 'vulopilot')}
		>
			<div className="vp-suggest">
				{recommendations.map((rec) => {
					const meta = BUCKET_META[rec.bucket];
					const urgent = isUrgent(rec.severity);

					return (
						<button
							type="button"
							key={rec.bucket}
							className={`vp-suggest-tile is-${urgent ? 'red' : meta.tone}`}
							onClick={() => setIsProPopupOpen(true)}
						>
							<span className="vp-suggest-eyebrow">
								<IconTile icon={meta.icon} tone={urgent ? 'red' : meta.tone} size="sm" />
								{urgent ? __('Critical', 'vulopilot') : meta.label}
								<span className="vp-pro-tag">
									<i className="adminfont-pro-tag" aria-hidden="true" />
									{__('Pro', 'vulopilot')}
								</span>
							</span>
							<strong>{rec.label}</strong>
							<span className="vp-suggest-detail">{formatAffected(rec.count, rec.object_type)}</span>
							<span className="vp-suggest-cta">
								<i className="adminfont-ai" aria-hidden="true" />
								{urgent ? __('Investigate with AI', 'vulopilot') : __('Improve with AI', 'vulopilot')}
							</span>
						</button>
					);
				})}
			</div>
			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{vulopilotAppLocalizer.khali_dabba ? <ShowProPopup moduleName="copilot-chat" /> : <ShowProPopup />}
			</PopupComponent>
		</Card>
	);
};

const RecommendedActionsCard: FC<RecommendedActionsCardProps> = ({ onNavigateTab }) => {
	const ProRecommendedActionsCard = useFilterSlot<
		ComponentType<RecommendedActionsCardProps>
	>('vulopilot_ai_copilot_recommended_actions');

	if (ProRecommendedActionsCard) {
		return <ProRecommendedActionsCard onNavigateTab={onNavigateTab} />;
	}

	return <RecommendedActionsFreeCard onNavigateTab={onNavigateTab} />;
};

export default RecommendedActionsCard;
