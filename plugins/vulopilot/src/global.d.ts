import type { ComponentType } from 'react';

export {};

declare global {
	/**
	 * Shape of the `vulopilotAppLocalizer` object localized by
	 * FrontendScripts::localize_scripts().
	 */
	interface AppLocalizer {
		apiUrl: string;
		restUrl: string;
		nonce: string;
		plugin_url: string;
		admin_url: string;
		site_url: string;
		/** `get_bloginfo('name')` - Settings → Get Started → Title Formats' own Live Title Preview reads this directly. */
		site_title: string;
		/** `get_bloginfo('description')` - see `site_title` above. */
		site_description: string;
		/** Homepage thumbnail: front page featured image, else custom logo, else site icon. */
		home_preview_image: string;
		/** The real logged-in WP user's own display name (`wp_get_current_user()->display_name`). */
		current_user_display_name: string;
		version: string;
		plugin_slug: string;
		text_domain: string;
		date_format: string;
		/** Settings → General → Date Format, translated into zyra's own token syntax (YYYY/MM/DD/…). */
		date_format_js: string;
		/** Settings → General → Time Format, same real token conversion as `date_format_js` above. */
		time_format_js: string;
		/** Settings → General → Timezone, as this site's current UTC offset in minutes (`wp_timezone()`, DST-aware for a real `timezone_string`). */
		gmt_offset_minutes: number;
		khali_dabba: boolean;
		active_modules: string[];
		vulocloud_connected: boolean;
		vulocloud_account_email: string;
		shop_url: string;
		pro_data: {
			version: string | false;
			manage_plan_url: string;
		};
		/** Every real public post type this site has registered beyond the 4 Settings → Sitemap's own "Post types in sitemap" checkbox list already hardcodes (post/page/attachment/product). */
		sitemap_custom_post_types: { value: string; label: string }[];
		/** Whether WooCommerce is active on this site (`class_exists('WooCommerce')`). */
		has_woocommerce: boolean;
	}


	var vulopilotAppLocalizer: AppLocalizer;

	interface VuloPilotPostSeoLocalizer {
		apiUrl: string;
		nonce: string;
		isPro: boolean;
		shopUrl: string;
		/** Postmeta key strings, keyed by field name. */
		metaKeys: Record<string, string>;
	}

	var vulopilotPostSeo: VuloPilotPostSeoLocalizer;

	 
	interface Window {
		VULOPILOT_ROUTES: {
			tab: string;
			component: ComponentType<Record<string, unknown>>;
		}[];
		// eslint-disable-next-line no-unused-vars
		registerVuloPilotRoute: (route: {
			tab: string;
			component: ComponentType<Record<string, unknown>>;
		}) => void;
		vulopilotPostSeo: VuloPilotPostSeoLocalizer;
	}
	 

	/**
	 * webpack's require.context() extension, untyped in this repo (no @types/webpack-env). Declared here
	 * rather than carrying the gap forward.
	 */
	 
	 
	var require: {
		// eslint-disable-next-line no-unused-vars
		( id: string ): any;
		context: (
			// eslint-disable-next-line no-unused-vars
			directory: string,
			// eslint-disable-next-line no-unused-vars
			useSubdirectories?: boolean,
			// eslint-disable-next-line no-unused-vars
			regExp?: RegExp
		) => {
			keys: () => string[];
			// eslint-disable-next-line no-unused-vars
			( id: string ): any;
		};
	};
}
