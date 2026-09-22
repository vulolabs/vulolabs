/* global appLocalizer */
import { useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { NoticeComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useAiCredits } from '../../services/useAiCredits';
import { ConnectVuloCloudPromptContent } from './ConnectVuloCloudPopup';
import './AiCreditsIndicator.scss';

/**
 * The persistent "⚡ N AI Credits" indicator (architecture plan §21) —
 * mounted once, via zyra's own `HeaderComponent`'s `beforeSearch` prop in
 * app.tsx, which renders it inline in the header's right-section row,
 * immediately before the "Modules & Settings" search box (not through
 * that component's own `utilityList` prop: that prop's `toggleIcon` only
 * ever renders a plain icon-font glyph — see PopupComponent's own real
 * toggle-icon behavior — so it has nowhere to put the live number itself;
 * this component drives its own `PopupComponent` in fully-controlled mode
 * instead, with the credit count as its own custom, always-visible
 * trigger).
 *
 * Three real states, all driven by useAiCredits()'s own live
 * `GET /ai-credits/status` read — never a fabricated number:
 * - Not connected: "Claim your 100 Free AI Credits" — opens the same
 *   passwordless "Connect to VuloCloud" redirect Settings → Connections'
 *   own button uses (AiCreditsConnection::get_broker_authorize_url()'s own
 *   docblock for the full sequence) rather than a second, separate
 *   embedded login/signup form — one connect flow in the whole plugin, not
 *   two that could drift.
 * - Connected: the real credit count, click-through to balance/usage +
 *   "Buy More Credits"/"Explore VuloPilot Pro" (both external, same
 *   `appLocalizer.shop_url` link Popup.tsx's own generic Pro upsell
 *   already uses — this pass doesn't build a real purchase flow, see the
 *   architecture plan's own "Explicitly out of scope").
 * - Loading: renders nothing rather than a placeholder number — there's
 *   no honest "0" or "—" to show before the real value is known.
 */
const AiCreditsIndicator = () => {
	const { status, isLoading, refresh } = useAiCredits();
	const [isOpen, setIsOpen] = useState(false);

	if (isLoading || !status) {
		return null;
	}

	return (
		<div className="ai-credits-indicator">
			<ButtonInput
				buttons={{
					text: `⚡ ${status.connected
							? sprintf(
								/* translators: %d: real remaining AI Credit balance. */
								__('%d AI Credits', 'vulopilot'),
								status.credits
							)
							: __('Claim free AI Credits', 'vulopilot')
						}`,
					color: 'orange-bg',
					onClick: () => setIsOpen(!isOpen),
				}}
			/>

			<PopupComponent
				width={35}
				height="fit-content"
				open={isOpen}
				onClose={() => setIsOpen(false)}
			>
				{status.connected ? (
					<AiCreditsBalancePanel
						status={status}
						onRefresh={refresh}
					/>
				) : (
					// Same one real "Connect to VuloCloud" component every
					// other real caller of this flow now shares
					// (ConnectVuloCloudPopup.tsx's own docblock) — this
					// already renders its own title/desc/button, so there's
					// no separate footer button to duplicate here anymore
					// (the previous footer button rendered unconditionally,
					// even in the `status.connected` branch above, where a
					// "Connect to VuloCloud" action made no sense — a real
					// bug this consolidation also fixes).
					<ConnectVuloCloudPromptContent variant="inline-notice" />
				)}
			</PopupComponent>
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
	const exhausted = 0 === status.credits;
	// Depletion meter — how much of what's ever been earned is still
	// available, not how much has been used (an all-time-earned account
	// with nothing spent yet reads as "full", same intuition as "remaining"
	// being this panel's own headline number). Earned starts at 0 for a
	// brand-new connection, so this guards the same divide-by-zero every
	// other real percentage in this codebase already does.
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
				{status.credits}
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
						/* translators: %d: real lifetime-earned credit count. */
						__('%d earned', 'vulopilot'),
						status.lifetime_earned
					)}
				</span>
				<span>
					{sprintf(
						/* translators: %d: real lifetime-used credit count. */
						__('%d used', 'vulopilot'),
						status.lifetime_used
					)}
				</span>
			</div>

			{exhausted ? (
				<NoticeComponent
					displayPosition="inline-notice"
					type="warning"
					title={__(
						"You've used all your AI Credits.",
						'vulopilot'
					)}
					message={__(
						'Free AI: use your credits for manual AI assistance. Pro: unlock automation, AI fixing, and advanced intelligence.',
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
						text: __('Buy More Credits', 'vulopilot'),
						leftIcon: 'cart',
						rightIcon: 'arrow-right',
						color: 'purple-bg',
						onClick: () => {
							window.open(appLocalizer.shop_url, '_blank', 'noopener,noreferrer');
						},
					},
					{
						text: __('Explore VuloPilot Pro', 'vulopilot'),
						leftIcon: 'pro-tag',
						rightIcon: 'arrow-right',
						color: 'border-purple',
						onClick: () => {
							window.open(appLocalizer.shop_url, '_blank', 'noopener,noreferrer');
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
