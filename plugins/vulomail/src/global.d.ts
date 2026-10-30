import type { ProviderDefinition, SmsTriggerDefinition } from './services/types';

/** One `vulomail_email_sources`-filter entry — a plugin that owns its own email templates. */
export interface EmailSource {
	plugin: string;
	label: string;
	rest_namespace: string;
}

declare global {
	/**
	 * Shape of the `vulomailAppLocalizer` object localized by FrontendScripts::localize_scripts().
	 */
	interface VuloMailLocalizer {
		apiUrl: string;
		restUrl: string;
		nonce: string;
		plugin_url: string;
		admin_url: string;
		site_url: string;
		version: string;
		plugin_slug: string;
		text_domain: string;
		admin_email: string;
		default_from: string;
		providers: ProviderDefinition[];
		sms_triggers: SmsTriggerDefinition[];
		/** WordPress's date format in zyra's token syntax. */
		date_format_js: string;
		active_plugins: string[];
		plugins_url: string;
		khali_dabba: boolean;
		active_modules: string[];
		email_sources: EmailSource[];
	}

	var vulomailAppLocalizer: VuloMailLocalizer;
}
