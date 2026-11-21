import { __ } from '@wordpress/i18n';
import type { HeroArea } from '../../components/AreaHero';

/**
 * The Security page's areas: what the hero rates and what the issue list's tabs filter by. Each is a set of real
 * scanner ids (the security scanners' `get_id()`).
 */
export const SECURITY_AREAS: HeroArea[] = [
	{
		id: 'login-accounts',
		label: __('Logins & accounts', 'vulopilot'),
		icon: 'vpn-key',
		scannerIds: ['weak-passwords', 'login-protection'],
	},
	{
		id: 'vulnerabilities',
		label: __('Plugins & themes', 'vulopilot'),
		icon: 'module',
		scannerIds: ['basic-vulnerabilities', 'advanced-vulnerabilities', 'theme-vulnerabilities'],
	},
	{
		id: 'website-exposure',
		label: __('Exposed files & settings', 'vulopilot'),
		icon: 'eye',
		scannerIds: ['rest-api', 'xmlrpc-exposure', 'exposed-files', 'debug-mode', 'file-editor'],
	},
	{
		id: 'malware-intrusion',
		label: __('Malware & firewall', 'vulopilot'),
		icon: 'malware',
		scannerIds: ['malware', 'firewall'],
	},
	{
		id: 'suspicious-file-changes',
		label: __('File changes', 'vulopilot'),
		icon: 'version-control',
		scannerIds: ['core-file-integrity', 'integrity-monitoring'],
	},
	{
		id: 'ssl-connection',
		label: __('SSL certificate', 'vulopilot'),
		icon: 'lock',
		scannerIds: ['ssl-monitoring'],
	},
	{
		id: 'browser-protection',
		label: __('Security headers', 'vulopilot'),
		icon: 'privacy',
		scannerIds: ['security-headers'],
	},
];

/** Every scanner the page covers: the areas plus the general security check and backup health. */
export const SECURITY_SCANNER_IDS = [
	...SECURITY_AREAS.flatMap((area) => area.scannerIds),
	'security',
	'backup-health',
];
