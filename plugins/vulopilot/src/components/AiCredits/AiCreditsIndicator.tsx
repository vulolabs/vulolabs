/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { NoticeComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { formatCredits, useAiCredits } from '../../services/useAiCredits';
import { CREDITS_SPENT_EVENT, INSUFFICIENT_CREDITS_EVENT } from './insufficientCredits';
import { useConnectVuloCloud } from '../../services/useConnectVuloCloud';
import './AiCreditsIndicator.scss';

/** The persistent "⚡ N AI Credits" indicator (architecture plan §21). */
const AiCreditsIndicator = () => {
	const { status, isLoading, refresh } = useAiCredits();
	const { isConnecting, handleConnect } = useConnectVuloCloud();
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		const onInsufficient = () => refresh();
		window.addEventListener(INSUFFICIENT_CREDITS_EVENT, onInsufficient);
		window.addEventListener(CREDITS_SPENT_EVENT, onInsufficient);
		return () => {
			window.removeEventListener(INSUFFICIENT_CREDITS_EVENT, onInsufficient);
			window.removeEventListener(CREDITS_SPENT_EVENT, onInsufficient);
		};
	}, [refresh]);

	if (isLoading || !status) {
		return null;
	}

	// The chip's state: an offer before connecting, then the balance - amber when low, red when spent.
	let state = 'claim';
	let label = __('Get 100 free AI credits', 'vulopilot');

	if (isConnecting) {
		state = 'busy';
		label = __('Connecting…', 'vulopilot');
	} else if (status.connected) {
		state = status.credits <= 0 ? 'empty' : status.credits < 10 ? 'low' : 'ok';
		label = sprintf(
			/* translators: %s: remaining AI credit balance, e.g. "76.550". */
			__('%s credits', 'vulopilot'),
			formatCredits(status.credits)
		);
	}

	return (
		<div className="ai-credits-indicator">
			<button
				type="button"
				className={`vp-credits is-${state}`}
				disabled={isConnecting}
				aria-haspopup={status.connected ? 'dialog' : undefined}
				title={status.connected ? __('AI credits balance', 'vulopilot') : __('Connect to VuloCloud and claim free AI credits', 'vulopilot')}
				onClick={status.connected ? () => setIsOpen(!isOpen) : handleConnect}
			>
				<span className="vp-credits-bolt" aria-hidden="true">
					<svg viewBox="0 0 16 16" width="12" height="12">
						<path d="M9.2 1 3 9.2h4.3L6.6 15 13 6.6H8.6L9.2 1Z" fill="currentColor" />
					</svg>
				</span>
				<span className="vp-credits-text">{label}</span>
				{status.connected && <i className="adminfont-keyboard-arrow-down" aria-hidden="true" />}
			</button>

			{status.connected && (
				<PopupComponent
					width={35}
					height="fit-content"
					position="slide-right-to-left"
					open={isOpen}
					onClose={() => setIsOpen(false)}
				>
					<AiCreditsBalancePanel
						status={status}
						onRefresh={refresh}
					/>
				</PopupComponent>
			)}
		</div>
	);
};

const AiCreditsBalancePanel = ({
	status,
	onRefresh,
}: {
	status: import('../../services/useAiCredits').AiCreditsStatus;
	onRefresh: () => void;
}) => {
	const exhausted = status.credits <= 0;
	// Depletion meter - how much of what's ever been earned is still available.
	const remainingPercent =
		status.lifetime_earned > 0
			? Math.min(100, Math.round((status.credits / status.lifetime_earned) * 100))
			: 0;

	return (
		<div className="ai-credits-balance-panel">
			<div className="ai-credits-balance-panel-icon">
				<i className="adminfont-wallet" />
			</div>
			<div className="ai-credits-balance-panel-count">
				{formatCredits(status.credits)}
			</div>
			<div className="ai-credits-balance-panel-label">
				{__('AI Credits remaining', 'vulopilot')}
			</div>

			<div className="ai-credits-balance-panel-progress">
				<div
					className="ai-credits-balance-panel-progress-fill"
					style={{ width: `${remainingPercent}%` }}
				/>
			</div>
			<div className="ai-credits-balance-panel-stats">
				<span>
					{sprintf(
						/* translators: %s: real lifetime-earned credit count. */
						__('%s earned', 'vulopilot'),
						formatCredits(status.lifetime_earned)
					)}
				</span>
				<span>
					{sprintf(
						/* translators: %s: real lifetime-used credit count. */
						__('%s used', 'vulopilot'),
						formatCredits(status.lifetime_used)
					)}
				</span>
			</div>

			{exhausted ? (
				<NoticeComponent
					displayPosition="inline-notice"
					type="warning"
					title={__(
						"You've used all your available AI credits.",
						'vulopilot'
					)}
					message={__(
						'AI requests are paused until you add more credits. Buy Credits to continue.',
						'vulopilot'
					)}
				/>
			) : (
				<div className="ai-credits-balance-panel-tip">
					<div className="ai-credits-balance-panel-tip-icon">
						<i className="adminfont-ai" />
					</div>
					<div className="ai-credits-balance-panel-tip-text">
						<div className="ai-credits-balance-panel-tip-title">
							{__(
								'Use AI credits to generate content, improve text, create titles, and more.',
								'vulopilot'
							)}
						</div>
						<div className="ai-credits-balance-panel-tip-desc">
							{__(
								'Get the most out of VuloPilot with AI.',
								'vulopilot'
							)}
						</div>
					</div>
				</div>
			)}


			<ButtonInput
				wrapperClass="credits-button"
				position="left"
				buttons={[
					{
						text: exhausted
							? __('Buy Credits', 'vulopilot')
							: __('Buy More Credits', 'vulopilot'),
						leftIcon: 'cart',
						rightIcon: 'arrow-right',
						color: 'purple-bg',
						onClick: () => {
							window.open(vulopilotAppLocalizer.shop_url, '_blank', 'noopener,noreferrer');
						},
					},
					{
						text: __('Explore VuloPilot Pro', 'vulopilot'),
						leftIcon: 'pro-tag',
						rightIcon: 'arrow-right',
						color: 'border-purple',
						onClick: () => {
							window.open(vulopilotAppLocalizer.shop_url, '_blank', 'noopener,noreferrer');
						},
					},
				]}
			/>

			<button
				type="button"
				className="ai-credits-balance-panel-refresh"
				onClick={onRefresh}
			>
				<i className="adminfont-refresh" />
				{__('Refresh balance', 'vulopilot')}
			</button>
		</div>
	);
};

export default AiCreditsIndicator;
