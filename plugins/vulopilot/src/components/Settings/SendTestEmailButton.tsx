/* global appLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { NoticeComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { formatWpDate } from '../../services/formatWpDate';

interface TestEmailResult {
	success: boolean;
	message: string;
}

interface StoredSettings {
	email_last_test_sent?: string;
}

const nonceHeaders = { headers: { 'X-WP-Nonce': appLocalizer.nonce } };

/**
 * Settings → Notifications' own "Send Test Email" button — real
 * `POST /settings/test-email` (Controllers\Settings::send_test_email(),
 * which sends through the exact same recipient/From-header logic every
 * other notification email in this codebase already uses), plus the
 * persisted "Last test email sent on ..." line — same hand-built pattern
 * SendTestReportButton.tsx/CrawlerAlertTestPanel.tsx already establish for
 * the exact same "real API call + a value that must survive a page
 * refresh" reason, in place of the old declarative `type: 'button'` field
 * (per direct instruction — "the send test email button design like the
 * send test report button").
 *
 * Unlike SendTestReportButton.tsx, this one has no Pro gate — email
 * notifications are a Free feature (Reports is the Pro one), so this
 * button always calls the real API rather than branching to a
 * `ShowProPopup` first.
 *
 * Reads its own `email_last_test_sent` value directly from `GET /settings`
 * on mount rather than through SettingContext — same reasoning
 * SendTestReportButton.tsx's own docblock gives: this key is system-set,
 * never user-edited, so it's never one of this tab's own `modal[].key`
 * fields SettingContext would otherwise seed.
 */
const SendTestEmailButton = () => {
	const [lastSentAt, setLastSentAt] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [result, setResult] = useState<TestEmailResult | null>(null);

	useEffect(() => {
		getApiResponse<StoredSettings>(getApiLink(appLocalizer, 'settings'), nonceHeaders).then(
			(response) => {
				if (response?.email_last_test_sent) {
					setLastSentAt(response.email_last_test_sent);
				}
			}
		);
	}, []);

	const sendTestEmail = () => {
		setIsSending(true);
		setResult(null);

		sendApiResponse<TestEmailResult>(
			appLocalizer,
			getApiLink(appLocalizer, 'settings/test-email'),
			{}
		)
			.then((response) => {
				if (!response) {
					return;
				}
				setResult(response);
				if (response.success) {
					setLastSentAt(new Date().toISOString());
				}
			})
			.finally(() => setIsSending(false));
	};

	return (
		<div className="send-test-report-button">
			<div className="send-test-report-actions">
				<ButtonInput
					wrapperClass="send-test-report-button-input"
					position="left"
					buttons={{
						text: isSending
							? __('Sending…', 'vulopilot')
							: __('Send Test Email', 'vulopilot'),
						disabled: isSending,
						onClick: sendTestEmail,
					}}
				/>
			</div>

			{result && (
				<NoticeComponent
					displayPosition="inline"
					type={result.success ? 'success' : 'error'}
					message={result.message}
				/>
			)}

			{!result && lastSentAt && (
				<NoticeComponent
					displayPosition="inline"
					type="success"
					message={`${__('Last test email sent on', 'vulopilot')} ${formatWpDate(lastSentAt)}`}
				/>
			)}
		</div>
	);
};

export default SendTestEmailButton;
