/* global appLocalizer */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { NoticeComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { formatWpDate } from '../../services/formatWpDate';
import ShowProPopup from '../Popup/Popup';

interface TestReportResult {
	success: boolean;
	message: string;
}

interface StoredSettings {
	report_last_test_sent?: string;
}

const nonceHeaders = { headers: { 'X-WP-Nonce': appLocalizer.nonce } };

/**
 * Settings → Reports' own "Send Test Report" button — real
 * `POST /settings/test-report` (Controllers\Settings::send_test_report(),
 * which generates a real report using this tab's own `default_report_format`/
 * `default_report_period_days` and emails it to `notification_email`/the
 * site admin), plus the persisted "Last test report sent on ..." line — same
 * hand-built pattern CrawlerAlertTestPanel.tsx already establishes for the
 * exact same "real API call + a value that must survive a page refresh"
 * reason, in place of the old declarative `type: 'button'` field (moved
 * per direct instruction).
 *
 * Wired in as Reports.ts's own top-level `settingAction` (same real
 * `NavigatorComponent`/`SectionComponent` header-action slot
 * CrawlerAlertTestPanel.tsx/SecurityRestoreDefaultsHeader.tsx already use),
 * so it sits next to "Reports" itself instead of at the bottom of the tab.
 *
 * Reads its own `report_last_test_sent` value directly from `GET /settings`
 * on mount rather than through SettingContext — same reasoning
 * CrawlerAlertTestPanel.tsx's own docblock gives: this key is system-set,
 * never user-edited, so it's never one of Reports.ts's own `modal[].key`
 * fields SettingContext would otherwise seed.
 *
 * The whole Reports tab is a Pro feature (see Reports.ts's own docblock).
 * Reports.ts's declarative fields get zyra's Pro tag + popup from
 * `proSetting: true`; this button isn't a declarative field, so without Pro
 * it shows the same "Pro" tag itself and opens `ShowProPopup` on click
 * instead of calling the API.
 */
const SendTestReportButton = () => {
	const isPro = Boolean(appLocalizer.khali_dabba);
	const [lastSentAt, setLastSentAt] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [result, setResult] = useState<TestReportResult | null>(null);
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	useEffect(() => {
		getApiResponse<StoredSettings>(getApiLink(appLocalizer, 'settings'), nonceHeaders).then(
			(response) => {
				if (response?.report_last_test_sent) {
					setLastSentAt(response.report_last_test_sent);
				}
			}
		);
	}, []);

	const sendTestReport = () => {
		setIsSending(true);
		setResult(null);

		sendApiResponse<TestReportResult>(
			appLocalizer,
			getApiLink(appLocalizer, 'settings/test-report'),
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
				{!isPro && (
					<span className="admin-tag pro-tag pro-tag-inline">
						<i className="adminfont-pro-tag" />
						{__('Pro', 'vulopilot')}
					</span>
				)}
				<ButtonInput
					wrapperClass="send-test-report-button-input"
					position="left"
					buttons={{
						text: isSending
							? __('Sending…', 'vulopilot')
							: __('Send Test Report', 'vulopilot'),
						disabled: isSending,
						onClick: isPro ? sendTestReport : () => setIsProPopupOpen(true),
					}}
				/>
			</div>

			{/*
			 * Portaled straight to <body> — this button is rendered as
			 * Reports.ts's `settingAction` (zyra's own `.right-content`
			 * header slot, `translateY(-50%)`-centered). zyra's
			 * PopupComponent doesn't portal itself (renders wherever it
			 * sits in the tree), so left inline here it would mount as a
			 * DESCENDANT of that `transform`-ed `.right-content` — which
			 * CSS spec makes the containing block for any `position:
			 * fixed` element inside it, so the popup's fixed backdrop/
			 * content would size themselves to that small header row
			 * instead of the viewport (confirmed live: a squashed sliver
			 * instead of a real lightbox). Portaling out from under that
			 * transformed ancestor is the fix; the button itself stays
			 * right where it is.
			 */}
			{createPortal(
				<PopupComponent
					open={isProPopupOpen}
					onClose={() => setIsProPopupOpen(false)}
					width={31.25}
					height="auto"
					position="lightbox"
				>
					<ShowProPopup />
				</PopupComponent>,
				document.body
			)}

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
					message={`${__('Last test report sent on', 'vulopilot')} ${formatWpDate(lastSentAt)}`}
				/>
			)}
		</div>
	);
};

export default SendTestReportButton;
