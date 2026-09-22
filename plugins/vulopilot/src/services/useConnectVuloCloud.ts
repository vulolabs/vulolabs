/* global appLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { NoticeManager } from '@zyra/components';

/**
 * The real "Connect to VuloCloud" redirect (`GET /vulocloud-ai-connection/broker-
 * authorize-url`, AiCreditsConnection's own docblock) — same passwordless
 * broker flow AiCreditsIndicator.tsx's own dropdown and Settings → AI
 * Providers already use, extracted here so any other "no AI service
 * configured" recovery UI (ConnectVuloCloudPopup.tsx, ContentToolPopup.tsx's
 * own inline error step) can offer the exact same real connect action
 * without duplicating the fetch/notice/loading-state wiring.
 */
export const useConnectVuloCloud = () => {
	const [isConnecting, setIsConnecting] = useState(false);

	const handleConnect = () => {
		setIsConnecting(true);

		getApiResponse<{ url: string }>(
			getApiLink(appLocalizer, 'vulocloud-ai-connection/broker-authorize-url'),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((response) => {
				if (response?.url) {
					window.location.href = response.url;
					return;
				}

				setIsConnecting(false);
				NoticeManager.add({
					uniqueKey: 'vulopilot-connect-broker-unavailable',
					type: 'error',
					position: 'float',
					message: __('VuloCloud isn’t configured for this build yet.', 'vulopilot'),
				});
			})
			.catch(() => setIsConnecting(false));
	};

	return { isConnecting, handleConnect };
};
