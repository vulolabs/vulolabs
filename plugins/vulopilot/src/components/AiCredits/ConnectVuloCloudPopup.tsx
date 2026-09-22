import { __ } from '@wordpress/i18n';
import { CardComponent, NoticeComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { useConnectVuloCloud } from '../../services/useConnectVuloCloud';
import { useAiCredits } from '../../services/useAiCredits';

interface ConnectVuloCloudPopupProps {
	open: boolean;
	onClose: () => void;
}

interface ConnectVuloCloudPromptContentProps {
	/**
	 * `'card'` (default) — a full `CardComponent` with its own title row,
	 * for a bare popup with no header chrome of its own (`ConnectVuloCloudPopup`
	 * below). `'inline-notice'` — the same real title/desc/action, as a
	 * `NoticeComponent` instead, for a caller embedding this inside a popup
	 * that already has its own header (ContentToolPopup.tsx's own
	 * `PopupComponent` `header={{title, icon, description}}`,
	 * AiCreditsIndicator.tsx's own credit-balance popup) — a second full
	 * card title there would duplicate that chrome rather than reading as
	 * one real message.
	 */
	variant?: 'card' | 'inline-notice';
}

/**
 * "Connect to VuloCloud / claim free AI credits" — the real content shown
 * for this popup, split out from the self-contained `ConnectVuloCloudPopup`
 * below so `useContentGate.tsx` can render it directly inside its own
 * existing `PopupComponent` (the same "bare content component" convention
 * `ShowProPopup` already follows there), rather than nesting two popups.
 *
 * Same real passwordless broker redirect (`useConnectVuloCloud.ts`)
 * AiCreditsIndicator.tsx's own dropdown and Settings → Connections'
 * "Connect to VuloCloud" button already use. This replaces the former
 * `VuloCloudConnectPopup.tsx` (a real embedded email/password + 2FA login
 * form) everywhere that component used to render, per direct instruction
 * ("remove the image 2 popup ... replace all image 2 popup to image 1") —
 * one real "Connect to VuloCloud" flow/design now, not two different ones.
 * `useContentGate.tsx`'s own lock condition was switched to match (real AI
 * credits `connected` status, the same flag this broker redirect sets) so
 * completing this flow actually clears that gate, rather than leaving it
 * checking a different, unrelated "VuloCloud account login" flag this
 * flow never touches.
 */
export const ConnectVuloCloudPromptContent = ({
	variant = 'card',
}: ConnectVuloCloudPromptContentProps) => {
	const { isConnecting, handleConnect } = useConnectVuloCloud();

	if ('inline-notice' === variant) {
		return (
			<NoticeComponent
				displayPosition="inline-notice"
				type="info"
				title={__('Connect to VuloCloud', 'vulopilot')}
				message={__(
					'Claim 100 Free AI Credits — no credit card required — to use this feature.',
					'vulopilot'
				)}
				actionLabel={
					isConnecting
						? __('Connecting…', 'vulopilot')
						: __('Connect to VuloCloud', 'vulopilot')
				}
				onAction={handleConnect}
			/>
		);
	}

	return (
		<CardComponent
			title={__('Connect to VuloCloud', 'vulopilot')}
			titleIcon="lock"
			desc={__(
				'Claim 100 Free AI Credits — no credit card required — to use this feature.',
				'vulopilot'
			)}
		>
			<ButtonInput
				position="left"
				buttons={{
					text: isConnecting
						? __('Connecting…', 'vulopilot')
						: __('Connect to VuloCloud', 'vulopilot'),
					disabled: isConnecting,
					onClick: handleConnect,
				}}
			/>
		</CardComponent>
	);
};

/**
 * Self-contained popup wrapper around `ConnectVuloCloudPromptContent` above
 * — the shape every other call site of this component already expects
 * (ChatTab.tsx, ContentToolsGrid.tsx, AiContentAssistantSidebar.tsx: a
 * plain `open`/`onClose`-controlled popup, no external `PopupComponent` of
 * their own to nest it in). Uses the default `'card'` variant — this popup
 * has no header chrome of its own for the content to duplicate — and no
 * separate `footer` of its own: the card variant already renders its own
 * "Connect to VuloCloud" button in its body, so a second one here would
 * just be a duplicate (and, since `isConnecting`/`handleConnect` live
 * inside `ConnectVuloCloudPromptContent`'s own `useConnectVuloCloud()`
 * call, not this wrapper, weren't actually reachable from here anyway).
 */
const ConnectVuloCloudPopup = ({ open, onClose }: ConnectVuloCloudPopupProps) => {
	// Already connected (has credits) — this prompt has nothing to offer,
	// so no caller can ever surface it in that state, whatever error it hit.
	const { status } = useAiCredits();

	return (
	<PopupComponent
		open={open && !status?.connected}
		onClose={onClose}
		width={22}
		height="auto"
		position="lightbox"
	>
		<ConnectVuloCloudPromptContent />
	</PopupComponent>
	);
};

export default ConnectVuloCloudPopup;
