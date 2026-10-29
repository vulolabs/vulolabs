import { __ } from '@wordpress/i18n';
import { escapeHtml, settingsUrl } from './types';

/** Plain-language advice for a delivery error, with the screen that fixes it. */
export interface ErrorHelp {
	text: string;
	/** One short line, for lists where the full advice would crowd the row. */
	short: string;
	linkLabel: string;
	/** Admin URL of the settings screen to open. */
	href: string;
}

/** What failed: a log row, an attempt, or the Dashboard's `cause`. */
export interface Failure {
	provider: string;
	error_code?: string;
	error_message?: string | null;
	/** False for an attempt that isn't the one to explain. */
	is_cause?: boolean;
}

interface Rule {
	// eslint-disable-next-line no-unused-vars
	matches: (code: string, text: string, provider: string) => boolean;
	help: () => ErrorHelp;
}

const CONNECTIONS = settingsUrl('connections');

/**
 * The delivery errors people most often meet, checked in order. Error codes are matched where the
 * adapters set a meaningful one; the text is only read for errors whose code says nothing more
 * (PHPMailer's SMTP and core-mailer errors).
 */
const RULES: Rule[] = [
	{
		// PHPMailer's "Invalid address: (From): wordpress@localhost". Checked first: connecting a
		// service wouldn't fix it.
		matches: (code, text) => /invalid address:?\s*\(from\)/i.test(text),
		help: () => ({
			text: __(
				'The address this email was sent from isn\'t a real email address, so it was refused. Enter a real sender email, ideally one on your own domain or the one your email service uses.',
				'vulomail'
			),
			short: __('The sender address isn\'t a real email address.', 'vulomail'),
			linkLabel: __('Set the sender email', 'vulomail'),
			href: settingsUrl('email'),
		}),
	},
	{
		matches: (code, text) =>
			'network_error' === code ||
			'vulomail_google_network' === code ||
			/could not connect|connection (refused|timed out)|timed? ?out|resolve host|getaddrinfo/i.test(text),
		help: () => ({
			text: __(
				'VuloMail couldn\'t reach the email service. Check the server address and port in your email connection. If they are right, ask your hosting company whether outgoing email is blocked.',
				'vulomail'
			),
			short: __('Couldn\'t reach the email service.', 'vulomail'),
			linkLabel: __('Check your connection', 'vulomail'),
			href: CONNECTIONS,
		}),
	},
	{
		matches: (code) => code.startsWith('vulomail_google_'),
		help: () => ({
			text: __(
				'Google didn\'t accept this connection\'s sign-in. Open the Gmail connection and click "Sign in again".',
				'vulomail'
			),
			short: __('The Google sign-in needs renewing.', 'vulomail'),
			linkLabel: __('Check your connection', 'vulomail'),
			href: CONNECTIONS,
		}),
	},
	{
		// WordPress's built-in mailer failed, usually "Could not instantiate mail function.": the
		// server has no mail program, which is normal on most hosting.
		matches: (code, text, provider) =>
			'wp_mail_failed' === code || 'default' === provider || /instantiate mail function|sendmail/i.test(text),
		help: () => ({
			text: __(
				'Your website\'s server can\'t send email by itself. This is common and nothing is broken. To fix it, connect an email service, such as Gmail, Outlook, your hosting company\'s SMTP or a service like SendGrid, and VuloMail will send your email through it.',
				'vulomail'
			),
			short: __('Your server can\'t send email on its own.', 'vulomail'),
			linkLabel: __('Set up an email connection', 'vulomail'),
			href: CONNECTIONS,
		}),
	},
	{
		matches: (code, text) =>
			'http_401' === code ||
			'http_403' === code ||
			/authenticat|username and password|invalid login|credentials|api key|unauthori[sz]ed|\b535\b/i.test(text),
		help: () => ({
			text: __(
				'The email service didn\'t accept the login details. Check the username and password, or the API key, saved in your email connection.',
				'vulomail'
			),
			short: __('The email service rejected the login details.', 'vulomail'),
			linkLabel: __('Check your connection', 'vulomail'),
			href: CONNECTIONS,
		}),
	},
	{
		matches: (code, text) => /sender|from address|not verified|unverified|domain .*not/i.test(text),
		help: () => ({
			text: __(
				'The email service won\'t send from this sender address. Use an address your email service has verified as the sender email.',
				'vulomail'
			),
			short: __('The email service won\'t send from this address.', 'vulomail'),
			linkLabel: __('Change the sender email', 'vulomail'),
			href: settingsUrl('email'),
		}),
	},
];

/**
 * Explains an email delivery error for someone who doesn't know what SMTP is. Returns null for a
 * text message, an attempt that isn't the cause, or an error none of the rules know, so the
 * provider's own message stands alone.
 *
 * @param failure What failed.
 * @param channel The message's channel.
 */
export const errorHelp = (failure: Failure, channel: string): ErrorHelp | null => {
	if ('email' !== channel || false === failure.is_cause) {
		return null;
	}

	const code = failure.error_code ?? '';
	const text = String(failure.error_message ?? '');

	return RULES.find((rule) => rule.matches(code, text, failure.provider))?.help() ?? null;
};

/**
 * An error and its advice as HTML, for zyra's NoticeComponent (whose message is rendered as HTML).
 * Everything is escaped; only the advice link is markup.
 *
 * @param failure What failed.
 * @param channel The message's channel.
 * @param prefix  Plain text shown before the error.
 */
export const errorNoticeHtml = (failure: Failure, channel: string, prefix = ''): string => {
	const help = errorHelp(failure, channel);
	const error = escapeHtml(`${prefix}${failure.error_message ?? ''}`);

	return help
		? `${error}<br /><br />${escapeHtml(help.text)} <a href="${help.href}">${escapeHtml(help.linkLabel)}</a>`
		: error;
};
