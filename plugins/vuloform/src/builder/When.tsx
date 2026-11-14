import { __ } from '@wordpress/i18n';
import { NoticeComponent } from '@zyra/components';
import { ButtonInput, SelectInput, TextInput, ToggleInput } from '@zyra/inputs';
import type { Field, Rule, When as WhenValue } from '../services/types';
import { fieldType } from './fields';

export const OPERATORS = [
	{ value: 'is', label: __('is', 'vuloform') },
	{ value: 'is_not', label: __('is not', 'vuloform') },
	{ value: 'contains', label: __('contains', 'vuloform') },
	{ value: 'not_contains', label: __('does not contain', 'vuloform') },
	{ value: 'empty', label: __('is empty', 'vuloform') },
	{ value: 'not_empty', label: __('is filled in', 'vuloform') },
	{ value: 'gt', label: __('is greater than', 'vuloform') },
	{ value: 'lt', label: __('is less than', 'vuloform') },
];

export const NO_CONDITIONS: WhenValue = { enabled: false, match: 'all', rules: [] };

interface WhenProps {
	/** Unique within the screen; prefixes the inputs' names. */
	name: string;
	value: WhenValue | undefined;
	fields: Field[];
	// eslint-disable-next-line no-unused-vars
	onChange: (value: WhenValue) => void;
}

/**
 * The rules that decide whether a notification, a webhook or an alternative confirmation applies
 * to a submission: one or more "this answer is that" lines. The server evaluates them
 * (classes/Forms/Conditions.php); a field hidden by its own conditional logic counts as empty.
 */
const When = ({ name, value, fields, onChange }: WhenProps) => {
	const when = value ?? NO_CONDITIONS;
	// A rule can read any field that collects an answer, except an uploaded file.
	const targets = fields
		.filter((field) => fieldType(field.type)?.input && 'file' !== field.type)
		.map((field) => ({ value: field.key, label: field.label || field.key }));
	const setRule = (index: number, patch: Partial<Rule>) =>
		onChange({ ...when, rules: when.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });

	if (0 === targets.length) {
		return (
			<NoticeComponent
				displayPosition="inline-notice"
				type="info"
				message={__('Add a field to the form first; a rule needs an answer to look at.', 'vuloform')}
			/>
		);
	}

	return (
		<div className="vuloform-when">
			{when.rules.length > 1 && (
				<ToggleInput
					value={when.match}
					options={[
						{ key: 'all', value: 'all', label: __('All of these are true', 'vuloform') },
						{ key: 'any', value: 'any', label: __('Any of these is true', 'vuloform') },
					]}
					onChange={(match) => onChange({ ...when, match: match as 'all' | 'any' })}
				/>
			)}
			{when.rules.map((rule, index) => (
				<div className="vuloform-when-rule" key={index}>
					<SelectInput
						type="single-select"
						name={`${name}-field-${index}`}
						isClearable={false}
						options={targets}
						value={rule.field}
						onChange={(field) => setRule(index, { field: field as string })}
					/>
					<SelectInput
						type="single-select"
						name={`${name}-operator-${index}`}
						isClearable={false}
						options={OPERATORS}
						value={rule.operator}
						onChange={(operator) => setRule(index, { operator: operator as string })}
					/>
					{'empty' !== rule.operator && 'not_empty' !== rule.operator ? (
						<TextInput
							name={`${name}-value-${index}`}
							value={rule.value}
							placeholder={__('Answer', 'vuloform')}
							onChange={(text) => setRule(index, { value: String(text) })}
						/>
					) : (
						<span />
					)}
					<button
						type="button"
						className="vuloform-icon-button is-danger"
						aria-label={__('Remove this rule', 'vuloform')}
						onClick={() => onChange({ ...when, rules: when.rules.filter((_, i) => i !== index) })}
					>
						<i className="adminfont-delete" aria-hidden="true" />
					</button>
				</div>
			))}
			<ButtonInput
				buttons={{
					text: when.rules.length ? __('Add another rule', 'vuloform') : __('Add a rule', 'vuloform'),
					icon: 'plus',
					color: 'purple',
					onClick: () => onChange({ ...when, rules: [...when.rules, { field: targets[0].value, operator: 'is', value: '' }] }),
				}}
			/>
		</div>
	);
};

export default When;
