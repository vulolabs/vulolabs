/* global vuloformAppLocalizer */
import { __ } from '@wordpress/i18n';
import type { Field, FieldType, PaletteGroup, PaletteItem } from '../services/types';
import { makeId } from '../services/types';

export const fieldTypes = (): FieldType[] => vuloformAppLocalizer.field_types;

export const fieldType = (id: string): FieldType | undefined => fieldTypes().find((type) => type.id === id);

export const supports = (field: Field, feature: string): boolean => Boolean(fieldType(field.type)?.supports.includes(feature));

/** Turns a label into a field key: lower case letters, digits and underscores. */
export const slug = (text: string): string =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 40);

/** A key no other field uses. */
export const uniqueKey = (wanted: string, fields: Field[], ownId = ''): string => {
	const taken = new Set(fields.filter((field) => field.id !== ownId).map((field) => field.key));
	const base = wanted || 'field';
	let key = base;
	let n = 2;

	while (taken.has(key)) {
		key = `${base}_${n}`;
		n++;
	}

	return key;
};

/**
 * The field library for a form: its template's own, when the template has one, otherwise the
 * standard groups. Every item is resolved to a ready-made field (a plain type id becomes one that
 * takes its label and icon from the type).
 */
export const paletteGroups = (template: string | undefined, standard: { id: string; label: string }[]): { id: string; label: string; items: PaletteItem[] }[] => {
	const own: PaletteGroup[] | undefined = template ? vuloformAppLocalizer.palettes?.[template] : undefined;

	if (own?.length) {
		return own.map((group) => ({
			id: group.id,
			label: group.label,
			items: group.items.flatMap((item): PaletteItem[] => {
				if ('string' !== typeof item) {
					return fieldType(item.type) ? [item] : [];
				}

				const type = fieldType(item);

				return type ? [{ id: type.id, type: type.id, label: type.label, icon: type.icon }] : [];
			}),
		}));
	}

	return standard.map((group) => ({
		id: group.id,
		label: group.label,
		items: fieldTypes()
			.filter((type) => type.group === group.id)
			.map((type) => ({ id: type.id, type: type.id, label: type.label, icon: type.icon })),
	}));
};

/** What the form's template locks about a field: it is always required, and/or can't be deleted. */
export const lockOf = (template: string | undefined, field: Field): { required?: boolean; delete?: boolean } =>
	(template && vuloformAppLocalizer.locked?.[template]?.[field.key]) || {};

/** A new field of the given type, with sensible starting values. A preset also sets its own label, key and placeholder. */
export const createField = (type: string, fields: Field[], preset?: PaletteItem): Field => {
	const definition = fieldType(type);
	const label = definition?.label ?? type;

	const field: Field = {
		id: makeId('f'),
		key: uniqueKey(slug(label), fields),
		type,
		label,
		description: '',
		placeholder: '',
		required: false,
		default: '',
		width: 100,
		css_class: '',
		hide_label: false,
		options: [],
		conditions: { enabled: false, action: 'show', match: 'all', rules: [] },
	};

	if (definition?.supports.includes('options')) {
		field.options = [1, 2, 3].map((n) => {
			/* translators: %d: option number. */
			const text = __('Option %d', 'vuloform').replace('%d', String(n));

			return { label: text, value: text };
		});
	}

	if ('file' === type) {
		field.allowed_types = ['jpg', 'jpeg', 'png', 'pdf'];
		field.max_size_mb = 5;
		field.max_files = 1;
	}

	if ('heading' === type) {
		field.level = 3;
	}

	if ('html' === type) {
		field.content = `<p>${__('Add your text here.', 'vuloform')}</p>`;
	}

	if ('consent' === type) {
		field.required = true;
		field.consent_text = __('I agree to my details being stored so you can reply to me.', 'vuloform');
	}

	if ('calculation' === type) {
		field.formula = '';
		field.decimals = 2;
		field.prefix = '';
	}

	if ('name' === type) {
		field.parts = Object.keys(vuloformAppLocalizer.name_parts);
	}

	if ('address' === type) {
		field.parts = Object.keys(vuloformAppLocalizer.address_parts);
	}

	if (preset) {
		field.label = preset.label;
		field.key = uniqueKey(preset.key || slug(preset.label), fields);
		field.placeholder = preset.placeholder ?? field.placeholder;
		field.required = preset.required ?? field.required;
	}

	return field;
};

/** A copy of a field with its own id and key. */
export const duplicateField = (field: Field, fields: Field[]): Field => ({
	...JSON.parse(JSON.stringify(field)),
	id: makeId('f'),
	key: uniqueKey(field.key, fields),
});

/**
 * Checks a calculation the way the server will (numbers, `{field}` names, + - * /, brackets) and
 * says it back in words, so a formula can be read by someone who would never write one.
 *
 * @param formula What was typed, such as `{qty} * 12.5`.
 * @param names   Field key => label, for the number fields of the form.
 */
export const explainFormula = (formula: string, names: Record<string, string>): { ok: boolean; text: string } => {
	const source = formula.trim();

	if ('' === source) {
		return { ok: false, text: '' };
	}

	const tokens = source.match(/\{[a-z0-9_]+\}|\d+(?:\.\d+)?|[-+*/()]|\S/gi) ?? [];
	const unknown = tokens.find((token) => token.startsWith('{') && !(token.slice(1, -1) in names));

	if (unknown) {
		/* translators: %s: placeholder such as {price}. */
		return { ok: false, text: __('%s is not a number field of this form.', 'vuloform').replace('%s', unknown) };
	}

	// expression := term (('+' | '-') term)* ; term := factor (('*' | '/') factor)* ;
	// factor := '-' factor | number | {field} | '(' expression ')'
	let position = 0;

	const factor = (): boolean => {
		const token = tokens[position];

		if ('-' === token) {
			position++;
			return factor();
		}

		if ('(' === token) {
			position++;

			if (!expression() || ')' !== tokens[position]) {
				return false;
			}

			position++;
			return true;
		}

		if (undefined !== token && /^(\{[a-z0-9_]+\}|\d+(\.\d+)?)$/i.test(token)) {
			position++;
			return true;
		}

		return false;
	};

	const sequence = (operand: () => boolean, operators: string[]) => (): boolean => {
		if (!operand()) {
			return false;
		}

		while (operators.includes(tokens[position])) {
			position++;

			if (!operand()) {
				return false;
			}
		}

		return true;
	};

	const term = sequence(factor, ['*', '/']);
	const expression: () => boolean = sequence(term, ['+', '-']);

	if (!expression() || position !== tokens.length) {
		return { ok: false, text: __('This can\'t be worked out yet. Check that every bracket is closed and nothing is missing between two values.', 'vuloform') };
	}

	const words: Record<string, string> = { '*': '×', '/': '÷', '-': '−' };

	return {
		ok: true,
		text: tokens.map((token) => (token.startsWith('{') ? names[token.slice(1, -1)] : words[token] ?? token)).join(' ').replace(/\( /g, '(').replace(/ \)/g, ')'),
	};
};
