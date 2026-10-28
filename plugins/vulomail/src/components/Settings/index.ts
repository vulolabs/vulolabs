/* global vulomailAppLocalizer */
import { createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import Connections from '../../pages/Connections';
import AlertMessage, { TEMPLATE_PREFIX } from './AlertMessage';

/**
 * Settings sub-tabs, in zyra's settings-schema format (the same one VuloPilot's Settings uses):
 * `InputRenderer` draws each `modal` and autosaves it to `submitUrl`.
 *
 * On/off settings are `setting-row` toggles. A setting-row field's value is
 * `{ [valueKey]: { enable: boolean } }`; each `valueKey` is the name of the stored setting, and the
 * REST controller (classes/Rest/Settings.php) unpacks it.
 */

const ON_OFF = { on: __('On', 'vulomail'), off: __('Off', 'vulomail') };

const toggle = (valueKey: string, icon: string, title: string, desc: ReactNode) => ({
	valueKey,
	icon,
	title,
	desc,
	control: { toggle: true, toggleStatusLabel: ON_OFF },
});

export interface SettingsField {
	key: string;
	type: string;
	rows?: { valueKey: string }[];
	[key: string]: unknown;
}

export interface SettingsSchema {
	id: string;
	headerTitle: string;
	headerDescription: string;
	headerIcon: string;
	submitUrl?: string;
	hideSettingHeader?: boolean;
	groupBySections?: boolean;
	modal: SettingsField[];
	/** Values the sub-tab keeps besides its fields' own: the alert messages edited inside a row. */
	extraKeys?: string[];
	/** Renders the whole sub-tab itself instead of a generated form. */
	PanelComponent?: ComponentType;
}

export { TEMPLATE_PREFIX };

const connections: SettingsSchema = {
	id: 'connections',
	headerTitle: __('Connections', 'vulomail'),
	headerDescription: __(
		'Connect the email and SMS providers you already use. Credentials are encrypted before they are saved and never shown again.',
		'vulomail'
	),
	headerIcon: 'link',
	hideSettingHeader: true,
	modal: [],
	PanelComponent: Connections,
};

const email: SettingsSchema = {
	id: 'email',
	headerTitle: __('Email', 'vulomail'),
	headerDescription: __('How outgoing email is routed and who it appears to come from.', 'vulomail'),
	headerIcon: 'mail',
	submitUrl: 'settings',
	hideSettingHeader: true,
	groupBySections: true,
	modal: [
		{
			key: 'email-routing-section',
			type: 'section',
			icon: 'send',
			title: __('Routing', 'vulomail'),
			desc: __(
				'Whether VuloMail delivers this site\'s email, and what happens when your connections fail.',
				'vulomail'
			),
		},
		{
			key: 'email_routing',
			type: 'setting-row',
			row: false,
			rows: [
				toggle(
					'email_enabled',
					'mail green',
					__('Send email through VuloMail', 'vulomail'),
					__('When off, WordPress sends email exactly as it would without VuloMail. Your connections are kept.', 'vulomail')
				),
				toggle(
					'fallback_to_default',
					'refresh blue',
					__('Fall back to the WordPress default mailer', 'vulomail'),
					__('If the primary and backup connections both fail, hand the email to WordPress instead of dropping it.', 'vulomail')
				),
			],
		},
		{
			key: 'email-sender-section',
			type: 'section',
			icon: 'profile',
			title: __('Sender', 'vulomail'),
			desc: __('The name and address your email is sent from.', 'vulomail'),
		},
		{
			key: 'from_email',
			type: 'email',
			size: 30,
			label: __('Sender email', 'vulomail'),
			placeholder: vulomailAppLocalizer.default_from,
			settingDescription: __(
				'Replaces the WordPress default sender. Use an address your email provider has verified.',
				'vulomail'
			),
		},
		{
			key: 'from_name',
			type: 'text',
			size: 30,
			label: __('Sender name', 'vulomail'),
			placeholder: 'WordPress',
			settingDescription: __('Replaces the default sender name "WordPress".', 'vulomail'),
		},
		{
			key: 'email_force',
			type: 'setting-row',
			row: false,
			label: __('Override plugins', 'vulomail'),
			rows: [
				toggle(
					'force_from_email',
					'lock purple',
					__('Always use this sender email', 'vulomail'),
					__('Even when a plugin sets its own From address.', 'vulomail')
				),
				toggle(
					'force_from_name',
					'lock purple',
					__('Always use this sender name', 'vulomail'),
					__('Even when a plugin sets its own From name.', 'vulomail')
				),
			],
		},
	],
};

const sms: SettingsSchema = {
	id: 'sms',
	headerTitle: __('SMS', 'vulomail'),
	headerDescription: __('Whether text messages are sent, how phone numbers are read, and where admin alerts go.', 'vulomail'),
	headerIcon: 'send',
	submitUrl: 'settings',
	hideSettingHeader: true,
	groupBySections: true,
	modal: [
		{
			key: 'sms-sending-section',
			type: 'section',
			icon: 'send',
			title: __('Sending', 'vulomail'),
			desc: __('Switch text messages on or off, and set how phone numbers without a country code are read.', 'vulomail'),
		},
		{
			key: 'sms_sending',
			type: 'setting-row',
			row: false,
			rows: [
				toggle(
					'sms_enabled',
					'send green',
					__('Send SMS through VuloMail', 'vulomail'),
					__('When off, no text messages are sent, including alerts and messages from other plugins.', 'vulomail')
				),
			],
		},
		{
			key: 'sms_country_code',
			type: 'text',
			size: 10,
			preText: '+',
			label: __('Default country code', 'vulomail'),
			settingDescription: __('Added to phone numbers written without one. Digits only, for example 1 or 44.', 'vulomail'),
		},
		{
			key: 'sms-admin-section',
			type: 'section',
			icon: 'profile',
			title: __('Admin phone', 'vulomail'),
			desc: __('Where alerts addressed to the site admin are sent.', 'vulomail'),
		},
		{
			key: 'sms_admin_phone',
			type: 'text',
			size: 30,
			label: __('Admin phone number', 'vulomail'),
			placeholder: '+14155550123',
			settingDescription: __('International format, for example +14155550123.', 'vulomail'),
		},
	],
};

const triggers = vulomailAppLocalizer.sms_triggers;

const WOOCOMMERCE = [
	{
		plugin: 'woocommerce',
		name: 'WooCommerce',
		link: vulomailAppLocalizer.plugins_url,
	},
];

/**
 * One group of alerts, one row each: the on/off switch and, while it is on, the message it sends. A group that needs a plugin is
 * still listed when the plugin is missing, locked with a "requires" notice, so the alerts it would
 * add are visible.
 */
const alertFields = (
	groupKey: string,
	requires: string,
	recipient: 'admin' | 'customer',
	section: { key: string; icon: string; title: string; desc: string }
): SettingsField[] => {
	const group = triggers.filter((trigger) => trigger.requires === requires && trigger.recipient === recipient);
	const locked = group.some((trigger) => !trigger.available);
	const dependentPlugin = 'woocommerce' === requires ? { dependentPlugin: WOOCOMMERCE } : {};

	if (0 === group.length) {
		return [];
	}

	return [
		{ ...section, type: 'section' },
		...(locked
			? [
					{
						key: `${groupKey}-requires-notice`,
						type: 'notice',
						noticeType: 'warning',
						title: __('Requires WooCommerce', 'vulomail'),
						message: __('Install and activate WooCommerce to use these alerts.', 'vulomail'),
					},
			  ]
			: []),
		{
			key: groupKey,
			type: 'setting-row',
			row: false,
			...dependentPlugin,
			// Each alert's message is edited inside its own row, and only while the alert is on.
			rows: group.map((trigger) => ({
				...toggle(
					trigger.id,
					'customer' === trigger.recipient ? 'profile blue' : 'notification green',
					trigger.label,
					createElement(AlertMessage, { groupKey, trigger })
				),
				plainDesc: trigger.desc,
			})),
		},
	];
};

const notifications: SettingsSchema = {
	id: 'sms-alerts',
	headerTitle: __('SMS Alerts', 'vulomail'),
	headerDescription: __(
		'Send a text message when something happens on your site. Every alert is off until you switch it on.',
		'vulomail'
	),
	headerIcon: 'notification',
	submitUrl: 'settings',
	hideSettingHeader: true,
	groupBySections: true,
	extraKeys: triggers.map((trigger) => `${TEMPLATE_PREFIX}${trigger.id}`),
	modal: [
		...alertFields('sms_triggers', '', 'admin', {
			key: 'sms-site-alerts-section',
			icon: 'notification',
			title: __('Site alerts', 'vulomail'),
			desc: __('Sent to the admin phone number set under Settings → SMS.', 'vulomail'),
		}),
		...alertFields('sms_triggers_woocommerce', 'woocommerce', 'admin', {
			key: 'sms-woocommerce-alerts-section',
			icon: 'cart',
			title: __('Store alerts', 'vulomail'),
			desc: __('Orders, refunds, stock and reviews. Sent to the admin phone number set under Settings → SMS.', 'vulomail'),
		}),
		...alertFields('sms_triggers_woocommerce_customer', 'woocommerce', 'customer', {
			key: 'sms-customer-alerts-section',
			icon: 'profile',
			title: __('Customer alerts', 'vulomail'),
			desc: __(
				'Sent to the billing phone on the order. Only switch these on if your customers have agreed to receive text messages. A customer gets one text per status change.',
				'vulomail'
			),
		}),
	],
};

const logging: SettingsSchema = {
	id: 'logging',
	headerTitle: __('Logging & Privacy', 'vulomail'),
	headerDescription: __('What the delivery log keeps, and for how long.', 'vulomail'),
	headerIcon: 'clock',
	submitUrl: 'settings',
	hideSettingHeader: true,
	groupBySections: true,
	modal: [
		{
			key: 'logging-section',
			type: 'section',
			icon: 'clock',
			title: __('Delivery log', 'vulomail'),
			desc: __('The log is stored in your own database and never leaves this site.', 'vulomail'),
		},
		{
			key: 'log_options',
			type: 'setting-row',
			row: false,
			rows: [
				toggle(
					'log_enabled',
					'clock green',
					__('Keep a log of sent and failed messages', 'vulomail'),
					__('Records who each message went to, which provider sent it, and any error.', 'vulomail')
				),
				toggle(
					'log_content',
					'document orange',
					__('Store message content', 'vulomail'),
					__('Needed to view or resend a message later. Stored messages can include password reset links and personal details, so leave this off unless you need it.', 'vulomail')
				),
				toggle(
					'mask_recipients',
					'lock purple',
					__('Mask recipients in the log', 'vulomail'),
					__('Stores j•••@example.com instead of the full address or number. Masked entries can\'t be resent.', 'vulomail')
				),
			],
		},
		{
			key: 'log_retention_days',
			type: 'number',
			size: 10,
			minNumber: 0,
			maxNumber: 3650,
			postText: __('days', 'vulomail'),
			label: __('Keep entries for', 'vulomail'),
			settingDescription: __('Older entries are deleted automatically. 0 keeps them until you delete them.', 'vulomail'),
		},
		{
			key: 'tracking-section',
			type: 'section',
			icon: 'analytics',
			title: __('Engagement tracking', 'vulomail'),
			desc: __(
				'See whether HTML emails are opened and their links clicked, in the Logs. Tracking is stored in the delivery log, so it needs the log switched on, and it never applies to plain-text email or text messages. Opens and clicks are estimates: some mail apps block images, others and security scanners load images or follow links on their own.',
				'vulomail'
			),
		},
		{
			key: 'tracking_options',
			type: 'setting-row',
			row: false,
			rows: [
				toggle(
					'track_opens',
					'eye blue',
					__('Open tracking', 'vulomail'),
					__('Adds an invisible 1×1 image to each HTML email and records when it is loaded. No IP address or device details are kept.', 'vulomail')
				),
				toggle(
					'track_clicks',
					'link blue',
					__('Click tracking', 'vulomail'),
					__('Sends links through this site before the reader reaches the page, and records which link was clicked. Unsubscribe, password reset, sign-in, mailto: and tel: links are never changed.', 'vulomail')
				),
			],
		},
	],
};

const uninstall: SettingsSchema = {
	id: 'uninstall',
	headerTitle: __('Uninstall', 'vulomail'),
	headerDescription: __('What happens to your connections, settings and logs when VuloMail is deleted.', 'vulomail'),
	headerIcon: 'database',
	submitUrl: 'settings',
	hideSettingHeader: true,
	groupBySections: true,
	modal: [
		{
			key: 'data-section',
			type: 'section',
			icon: 'database',
			title: __('Your data on uninstall', 'vulomail'),
			desc: __('What happens to connections, settings and logs when VuloMail is deleted.', 'vulomail'),
		},
		{
			key: 'keep_data_uninstall',
			type: 'choice-toggle',
			variant: 'compact',
			defaultValue: 'keep_data',
			label: __('When VuloMail is deleted', 'vulomail'),
			options: [
				{
					key: 'keep_data',
					value: 'keep_data',
					label: __('Keep data', 'vulomail'),
					desc: __('Reinstalling picks up where you left off.', 'vulomail'),
					icon: 'database green',
				},
				{
					key: 'delete_everything',
					value: 'delete_everything',
					label: __('Delete everything', 'vulomail'),
					desc: __('Removes connections, settings and logs.', 'vulomail'),
					icon: 'delete red',
				},
			],
		},
	],
};

/** The SMS Alerts screen's form. It has a submenu tab of its own (pages/SmsAlerts.tsx). */
export const notificationsSchema = notifications;

const schemas: SettingsSchema[] = [connections, email, sms, logging, uninstall];

export default schemas;
