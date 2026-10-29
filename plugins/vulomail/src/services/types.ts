/* global vulomailAppLocalizer */
export interface ProviderField {
	key: string;
	label: string;
	type: 'text' | 'password' | 'number' | 'select' | 'toggle';
	required?: boolean;
	secret?: boolean;
	default?: string | number | boolean;
	help?: string;
	options?: {
		value: string;
		label: string;
		desc?: string;
		icon?: string;
		badgeText?: string;
		badgeColor?: string;
	}[];
	/** 'cards': a select drawn as a row of option cards, across the whole form. */
	display?: 'cards';
	/** Field => required value, or a list of allowed values. */
	show_if?: Record<string, string | number | boolean | (string | number)[]>;
	/** Filled by a sign-in flow, never typed: not drawn as an input. */
	hidden?: boolean;
	/** Drawn inside the sign-in panel's collapsed "Advanced" section instead of the field list. */
	advanced?: boolean;
}

export interface ProviderDefinition {
	id: string;
	channel: 'email' | 'sms';
	label: string;
	desc: string;
	fields: ProviderField[];
	/** Set when the provider signs in with an OAuth flow instead of a typed credential. */
	oauth?: 'google';
}

export interface SmsTriggerDefinition {
	id: string;
	label: string;
	desc: string;
	recipient: 'admin' | 'customer';
	template: string;
	placeholders: string[];
	available: boolean;
	/** Slug of a plugin this alert needs, or ''. */
	requires: string;
}

export interface Connection {
	id: string;
	channel: 'email' | 'sms';
	provider: string;
	provider_label: string;
	label: string;
	enabled: boolean;
	settings: Record<string, string | number | boolean>;
	/** Labels of required fields that are empty or can no longer be decrypted. */
	missing: string[];
}

export interface Routing {
	email_primary: string;
	email_backup: string;
	sms_primary: string;
	sms_backup: string;
}

export interface ConnectionsPayload {
	connections: Connection[];
	routing: Routing;
}

export interface Settings {
	email_enabled: boolean;
	from_email: string;
	from_name: string;
	force_from_email: boolean;
	force_from_name: boolean;
	email_primary: string;
	email_backup: string;
	fallback_to_default: boolean;
	sms_enabled: boolean;
	sms_primary: string;
	sms_backup: string;
	sms_country_code: string;
	sms_admin_phone: string;
	sms_triggers: Record<string, { enabled: boolean; template: string }>;
	log_enabled: boolean;
	log_content: boolean;
	mask_recipients: boolean;
	log_retention_days: number;
	track_opens: boolean;
	track_clicks: boolean;
	keep_data_uninstall: 'keep_data' | 'delete_everything';
}

export interface Attempt {
	success: boolean;
	provider: string;
	connection_id: string;
	message_id: string;
	error_code: string;
	error_message: string;
	/** Set by the log detail: whether this failure is the one to explain (see Rest\Controller::with_causes()). */
	is_cause?: boolean;
}

export interface TestResult {
	success: boolean;
	provider: string;
	message: string;
	attempts: Attempt[];
}

/** Display name for a provider id, including the built-in WordPress mailer. */
export const providerLabel = (id: string): string => {
	if ('default' === id) {
		return 'WordPress';
	}

	return (
		vulomailAppLocalizer.providers.find((provider) => provider.id === id)
			?.label ?? id
	);
};

/** Admin address of one Settings sub-tab. */
export const settingsUrl = (subtab: string): string => `?page=vulomail#&tab=settings&subtab=${subtab}`;

/**
 * A log row's date as the site is set up to show it. The server formats `created_at_display` with
 * WordPress's own date format, time format and timezone (Settings → General); the raw UTC value is
 * only a fallback.
 */
export const displayDate = (row: { created_at: string; created_at_display?: string }): string =>
	row.created_at_display || row.created_at;

/**
 * Escapes text for a zyra prop that is rendered as HTML (list item titles, for one), so a logged
 * subject or a provider's error text can never inject markup.
 */
export const escapeHtml = (value: string): string =>
	String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
