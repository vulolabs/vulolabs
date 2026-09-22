import type { ComponentType } from 'react';

export {};

declare global {
	/**
	 * Shape of the `appLocalizer` object localized by
	 * FrontendScripts::localize_scripts() — keep this in sync with that
	 * method's wp_localize_script() payload.
	 */
	interface AppLocalizer {
		apiUrl: string;
		restUrl: string;
		nonce: string;
		plugin_url: string;
		admin_url: string;
		site_url: string;
		/** `get_bloginfo('name')` — Settings → Get Started → Title Formats' own Live Title Preview reads this directly rather than round-tripping a REST call. */
		site_title: string;
		/** `get_bloginfo('description')` — see `site_title` above. */
		site_description: string;
		/** Homepage thumbnail: front page featured image, else custom logo, else site icon — `''` when none exist (FrontendScripts::get_home_preview_image()). */
		home_preview_image: string;
		/** The real logged-in WP user's own display name (`wp_get_current_user()->display_name`) — e.g. AiContentAssistantSidebar.tsx's own "Hi {name}!" greeting. */
		current_user_display_name: string;
		version: string;
		plugin_slug: string;
		text_domain: string;
		date_format: string;
		/** Settings → General → Date Format, translated into zyra's own token syntax (YYYY/MM/DD/…) — pass this as TableCard's `format` prop, or through services/formatWpDate.ts for a raw date string outside a table. */
		date_format_js: string;
		/** Settings → General → Time Format, same real token conversion as `date_format_js` above — use through services/formatWpDate.ts's own `formatWpTime()`. No am/pm token exists in zyra's syntax, so a 12-hour format renders without the AM/PM suffix, same already-accepted limitation `date_format_js` itself carries. */
		time_format_js: string;
		/** Settings → General → Timezone, as this site's current UTC offset in minutes (`wp_timezone()`, DST-aware for a real `timezone_string`) — every raw timestamp this plugin's REST layer returns is UTC, so services/formatWpDate.ts's own `formatWpDate()`/`formatWpTime()` add this before reading date/time parts, rather than leaving the browser to guess (and silently apply its own local zone instead of this site's configured one). */
		gmt_offset_minutes: number;
		/** Whether VuloPilot Pro is installed, active, and license-active — feeds zyra's configureZyra()/ZyraVariable.khali_dabba. */
		khali_dabba: boolean;
		/** Kebab-case ids of every currently-active module (Free's own + any active vulopilot-pro modules) — feeds zyra's `moduleEnabled` settings-field gate and vulopilot-pro/src/index.tsx's per-module JS loading. */
		active_modules: string[];
		/** Whether this WP admin has a personal VuloCloud account connected (VuloCloudAccountConnection.php) — a *person* logged into VuloCloud, not this site's own Pro license (`khali_dabba` above), and not the same thing as AiCreditsStatus's own `connected` (useAiCredits.ts) that useContentGate.tsx's "log in" tier now checks instead. No current TS consumer since that switch — kept localized as a real, accurate field in case a future surface needs this specific account-level flag back. */
		vulocloud_connected: boolean;
		/** The connected VuloCloud account's own email, empty string when not connected — see `vulocloud_connected`'s own docblock above. */
		vulocloud_account_email: string;
		/** Where to send a user who wants to buy VuloPilot Pro — feeds zyra's configureZyra()/ZyraVariable.shop_url and the generic "Upgrade to Pro" popup's CTA link. */
		shop_url: string;
		/** VuloPilot Pro's own reported version/account-management link — `version: false` when Pro isn't installed/registered, populated via the `vulopilot_update_pro_data` filter Pro's own bootstrap hooks. Feeds the header's "Pro: …" version tag. */
		pro_data: {
			version: string | false;
			manage_plan_url: string;
		};
	}


	var appLocalizer: AppLocalizer;

	/**
	 * Shape of the `vulopilotPostSeo` object localized by
	 * Services\PostEditorAssets::enqueue_assets() — the post-editor SEO
	 * metabox's own script handle, separate from `appLocalizer` since the
	 * Block Editor screen doesn't guarantee the dashboard's own localized
	 * script has run.
	 */
	interface VuloPilotPostSeoLocalizer {
		apiUrl: string;
		nonce: string;
		/** Whether VuloPilot Pro is installed, active, and license-active — gates "Fix with AI"/"Generate with AI" buttons. */
		isPro: boolean;
		shopUrl: string;
		/** Postmeta key strings, keyed by field name — Services\PostSeoMetaFields::META_KEYS plus 'schema_json' (AIActions\Actions\GenerateSchemaAction::META_KEY), so this bundle never hand-copies the literal strings. */
		metaKeys: Record<string, string>;
	}

	var vulopilotPostSeo: VuloPilotPostSeoLocalizer;

	/* eslint-disable no-unused-vars */
	interface Window {
		VULOPILOT_ROUTES: {
			tab: string;
			component: ComponentType<Record<string, unknown>>;
		}[];
		registerVuloPilotRoute: (route: {
			tab: string;
			component: ComponentType<Record<string, unknown>>;
		}) => void;
		vulopilotPostSeo: VuloPilotPostSeoLocalizer;
	}
	/* eslint-enable no-unused-vars */
}
