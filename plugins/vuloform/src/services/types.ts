export interface FieldType {
	id: string;
	label: string;
	icon: string;
	group: 'basic' | 'layout' | 'advanced';
	input: boolean;
	supports: string[];
}

/** A ready-made field in a template's field library. */
export interface PaletteItem {
	id: string;
	type: string;
	label: string;
	icon: string;
	key?: string;
	placeholder?: string;
	/** Can be added only once. */
	unique?: boolean;
	/** Added as a required field. */
	required?: boolean;
	/** Kept at the top or bottom of the form, and not movable. Needs `key`. */
	pin?: 'top' | 'bottom';
}

export interface PaletteGroup {
	id: string;
	label: string;
	items: (PaletteItem | string)[];
}

export interface Option {
	label: string;
	value: string;
}

export interface Rule {
	field: string;
	operator: string;
	value: string;
}

export interface Conditions {
	enabled: boolean;
	action: 'show' | 'hide' | 'require';
	match: 'all' | 'any';
	rules: Rule[];
}

/** One field of a form. Mirrors what Forms\Schema stores; the server rebuilds it on save. */
export interface Field {
	id: string;
	key: string;
	type: string;
	label: string;
	description: string;
	placeholder: string;
	required: boolean;
	default: string;
	width: number;
	css_class: string;
	hide_label: boolean;
	options: Option[];
	conditions: Conditions;
	[extra: string]: unknown;
}

/** Rules that limit a notification, a webhook or an alternative confirmation to certain answers. */
export interface When {
	enabled: boolean;
	match: 'all' | 'any';
	rules: Rule[];
}

/** A confirmation used instead of the form's usual one when its rules match. */
export interface ConfirmationRule {
	id: string;
	type: string;
	message: string;
	redirect_url: string;
	conditions: When;
}

export interface Notification {
	id: string;
	name: string;
	enabled: boolean;
	channel: 'email' | 'sms' | 'both';
	to: string;
	subject: string;
	message: string;
	reply_to: string;
	/** For `both`: the number and text of the text message; `to` and `message` are the email's. */
	sms_to?: string;
	sms_message?: string;
	/** Sent only when these match; always, when absent or switched off. */
	conditions?: When;
}

export interface Webhook {
	id: string;
	name: string;
	enabled: boolean;
	url: string;
	secret: string;
	fields: string[];
	/** Sent only when these match; always, when absent or switched off. */
	conditions?: When;
}

export interface FormSettings {
	/** Id of the template the form was started from; picks the field library. */
	template?: string;
	submit_label: string;
	next_label: string;
	previous_label: string;
	progress: string;
	store_submissions: boolean;
	confirmation: { type: string; message: string; redirect_url: string; rules?: ConfirmationRule[] };
	messages: { required: string; invalid: string; error: string };
	style: Record<string, string>;
	spam: { recaptcha?: boolean };
	notifications: Notification[];
	webhooks: Webhook[];
	/** Per-form settings of extensions, keyed by extension id. */
	extensions?: Record<string, Record<string, unknown>>;
}

export interface Schema {
	version: number;
	fields: Field[];
	settings: FormSettings;
}

export interface Form {
	id: number;
	title: string;
	status: 'draft' | 'published';
	schema: Schema;
	shortcode: string;
	embed: string;
	problems?: string[];
	/** The problems with where to fix each: a field id, or a group of the form's settings. */
	issues?: { message: string; field: string; group: string }[];
}

/** A short random id. Final ids are checked for uniqueness by the server. */
export const makeId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

/** Escapes text for a zyra prop that is rendered as HTML. */
export const escapeHtml = (value: string): string =>
	String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
