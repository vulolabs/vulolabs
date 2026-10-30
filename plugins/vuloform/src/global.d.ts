import type { FieldType, FormSettings, PaletteGroup } from './services/types';

declare global {
	/**
	 * Shape of the `vuloformAppLocalizer` object localized by FrontendScripts::localize_scripts().
	 */
	interface VuloFormLocalizer {
		apiUrl: string;
		restUrl: string;
		nonce: string;
		plugin_url: string;
		admin_url: string;
		version: string;
		admin_email: string;
		date_format_js: string;
		field_types: FieldType[];
		templates: { id: string; title: string; desc: string; icon: string; plugin?: string; exists?: number; fields: number }[];
		palettes: Record<string, PaletteGroup[]>;
		/** Template id => field key => what is locked about that field. */
		locked: Record<string, Record<string, { required?: boolean; delete?: boolean }>>;
		default_settings: FormSettings;
		file_types: string[];
		name_parts: Record<string, string>;
		address_parts: Record<string, string>;
		has_vulomail: boolean;
		sms_available: boolean;
		vulomail_url: string;
		recaptcha_ready: boolean;
		khali_dabba: boolean;
		active_modules: string[];
	}

	var vuloformAppLocalizer: VuloFormLocalizer;

	interface Window {
		/** Starts any VuloForm form inside the given element (public/js/form.js). */
		// eslint-disable-next-line no-unused-vars
		vuloformInit?: (root?: Element) => void;
		/** Runtime helpers for extension bundles (src/index.tsx). */
		vuloform: {
			apiGet: typeof import('./services/api').apiGet;
			apiPost: typeof import('./services/api').apiPost;
			apiDelete: typeof import('./services/api').apiDelete;
			notify: typeof import('./services/notify').notify;
			errorMessage: typeof import('./services/notify').errorMessage;
		};
	}
}
