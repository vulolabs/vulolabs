import { useEffect, useRef } from 'react';
import { __ } from '@wordpress/i18n';
import { FIELD_REGISTRY } from '@zyra/core';
import { SelectInput, TextInput } from '@zyra/inputs';
import { getCountryOptions, toCountryCode } from '../../../services/geo/countries';
import { REGIONS } from '../../../services/geo/regions';

/**
 * Two settings field types for postal addresses, registered with zyra's field registry so a settings modal can use
 * them like any built-in type:
 *
 * - `vp-country`: a searchable country dropdown that stores the ISO 3166-1 alpha-2 code.
 * - `vp-region`: the state/region for the country chosen in `field.countryKey` - a dropdown where VuloPilot knows
 *   that country's regions, a text field everywhere else.
 *
 * Values saved before these were dropdowns are free text; they still show (matched to a country where possible)
 * and are only replaced when the user picks something.
 */

interface FieldProps {
	field: { key: string; placeholder?: string; countryKey?: string; size?: string | number };
	value: unknown;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onChange: (value: string) => void;
	settings?: Record<string, unknown>;
}

const asString = (value: unknown): string => (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''));

const CountryField = ({ field, value, onChange }: FieldProps) => {
	const raw = asString(value);
	const code = toCountryCode(raw);
	const options = getCountryOptions();

	// Free text that matches no country stays visible as its own option, so nothing saved silently disappears.
	const withLegacy = raw && !code ? [{ value: raw, label: raw }, ...options] : options;

	return (
		<SelectInput
			type="single-select"
			name={field.key}
			options={withLegacy}
			value={code ?? raw}
			placeholder={field.placeholder ?? __('Search countries…', 'vulopilot')}
			noOptionsText={__('No country matches that', 'vulopilot')}
			isClearable
			wrapperClass="vp-address-field"
			onChange={(next) => onChange(asString(next))}
		/>
	);
};

const RegionField = ({ field, value, onChange, settings }: FieldProps) => {
	const raw = asString(value);
	const country = toCountryCode(settings?.[field.countryKey ?? ''] ?? '');
	const regions = country ? REGIONS[country] : undefined;

	// A new country makes the old region meaningless: clear it, but only on a change the user made, never on load.
	// Deferred past this commit: zyra's auto-save (SettingsForm) flags a change in the parent's effect, which runs
	// after this child effect in the same commit - a synchronous clear here would be swallowed by the country's save
	// and never stored. A tick later it is a change of its own and gets its own save.
	const previous = useRef(country);
	useEffect(() => {
		if (previous.current === country) {
			return undefined;
		}

		previous.current = country;

		if (!raw || (regions ?? []).includes(raw)) {
			return undefined;
		}

		const timer = window.setTimeout(() => onChange(''), 0);

		return () => window.clearTimeout(timer);
	}, [country]);

	if (!regions) {
		return (
			<TextInput
				name={field.key}
				value={raw}
				placeholder={
					country
						? __('State, province or region', 'vulopilot')
						: __('Choose a country first, or type it', 'vulopilot')
				}
				wrapperClass="vp-address-field"
				onChange={(next) => onChange(String(next))}
			/>
		);
	}

	const options = regions.map((name) => ({ value: name, label: name }));
	const withLegacy = raw && !regions.includes(raw) ? [{ value: raw, label: raw }, ...options] : options;

	return (
		<SelectInput
			type="single-select"
			name={field.key}
			options={withLegacy}
			value={raw}
			placeholder={__('Search…', 'vulopilot')}
			noOptionsText={__('No match', 'vulopilot')}
			isClearable
			wrapperClass="vp-address-field"
			onChange={(next) => onChange(asString(next))}
		/>
	);
};

FIELD_REGISTRY['vp-country'] = { render: (props: FieldProps) => <CountryField {...props} /> };
FIELD_REGISTRY['vp-region'] = { render: (props: FieldProps) => <RegionField {...props} /> };
