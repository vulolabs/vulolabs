/**
 * Countries for address fields, as ISO 3166-1 alpha-2 codes - the form schema.org recommends for
 * `PostalAddress.addressCountry`. Names come from the browser (`Intl.DisplayNames`) in the admin's own language,
 * so no translated name table ships with the plugin.
 */
export const COUNTRY_CODES = [
	'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
	'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
	'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
	'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
	'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
	'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
	'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
	'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
	'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
	'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
	'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
	'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
	'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
	'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
	'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
	'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

export interface CountryOption {
	value: string;
	label: string;
}

/** The admin's language for country names: WordPress's `<html lang>`, else the browser's. */
const adminLocale = (): string => document.documentElement.lang || navigator.language || 'en';

const displayNames = (locale: string): Intl.DisplayNames | null => {
	try {
		return new Intl.DisplayNames([locale, 'en'], { type: 'region' });
	} catch {
		return null;
	}
};

let cached: CountryOption[] | null = null;

/** Every country as `{ value: code, label: name }`, sorted by name in the admin's language. */
export const getCountryOptions = (): CountryOption[] => {
	if (cached) {
		return cached;
	}

	const locale = adminLocale();
	const names = displayNames(locale);

	cached = COUNTRY_CODES.map((code) => ({ value: code, label: names?.of(code) ?? code })).sort((a, b) =>
		a.label.localeCompare(b.label, locale)
	);

	return cached;
};

/**
 * The ISO code for a stored country value. Settings saved before the dropdown hold free text ("United States",
 * "us", "Deutschland"), so a code is matched directly and a name against the localized and English names.
 * Returns null when nothing matches.
 */
export const toCountryCode = (value: unknown): string | null => {
	const raw = String(value ?? '').trim();

	if (!raw) {
		return null;
	}

	const upper = raw.toUpperCase();

	if ((COUNTRY_CODES as readonly string[]).includes(upper)) {
		return upper;
	}

	const wanted = raw.toLocaleLowerCase();
	const english = displayNames('en');
	const match = getCountryOptions().find(
		(option) =>
			option.label.toLocaleLowerCase() === wanted || english?.of(option.value)?.toLocaleLowerCase() === wanted
	);

	return match?.value ?? null;
};
