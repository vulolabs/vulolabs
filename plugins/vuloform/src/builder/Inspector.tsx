/* global vuloformAppLocalizer */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { NoticeComponent } from '@zyra/components';
import {
	ButtonInput,
	SelectInput,
	TextAreaInput,
	TextInput,
} from '@zyra/inputs';
import type { Field, Option, Rule } from '../services/types';
import { explainFormula, fieldType, lockOf, slug, supports, uniqueKey } from './fields';
import { inspectorSections } from '../services/slots';

// Tags a starting value may contain; the form replaces them when it is shown (DynamicValues.php).
const DYNAMIC_TAGS = [
	{ value: '{query:utm_source}', title: __('A value from the page address, here ?utm_source=… Change the name after the colon to read another one.', 'vuloform') },
	{ value: '{user:email}', title: __('The logged-in visitor\'s email address. Also: {user:name}, {user:first_name}, {user:last_name}, {user:username}, {user:id}.', 'vuloform') },
	{ value: '{user:name}', title: __('The logged-in visitor\'s name. Empty for visitors who are not logged in.', 'vuloform') },
	{ value: '{page:title}', title: __('The title of the page the form is on. Also: {page:id}.', 'vuloform') },
	{ value: '{page:url}', title: __('The address of the page the form is on.', 'vuloform') },
	{ value: '{date}', title: __('Today\'s date, written as 2026-12-31. Also: {site:name}, {site:url}.', 'vuloform') },
];

interface InspectorProps {
	/** Id of the form's template, which can lock fields. */
	template?: string;
	field: Field | undefined;
	fields: Field[];
	// eslint-disable-next-line no-unused-vars
	onChange: (field: Field) => void;
	/** Adds a field just before the selected one and changes the selected one, as a single step. */
	// eslint-disable-next-line no-unused-vars
	onAddField?: (type: string, label: string, key: string, patch: Partial<Field>) => void;
}

// Four choices that are always worth seeing at once, so they are buttons rather than a dropdown.
const WIDTHS = [
	{
		value: '100',
		label: __('Full', 'vuloform'),
		title: __('Full width', 'vuloform'),
	},
	{ value: '66', label: '2/3', title: __('Two thirds', 'vuloform') },
	{ value: '50', label: '1/2', title: __('Half', 'vuloform') },
	{ value: '33', label: '1/3', title: __('One third', 'vuloform') },
];

const OPERATORS = [
	{ value: 'is', label: __('is', 'vuloform') },
	{ value: 'is_not', label: __('is not', 'vuloform') },
	{ value: 'contains', label: __('contains', 'vuloform') },
	{ value: 'not_contains', label: __('does not contain', 'vuloform') },
	{ value: 'empty', label: __('is empty', 'vuloform') },
	{ value: 'not_empty', label: __('is filled in', 'vuloform') },
	{ value: 'gt', label: __('is greater than', 'vuloform') },
	{ value: 'lt', label: __('is less than', 'vuloform') },
];

const ACTIONS = [
	{ value: 'show', label: __('Shown', 'vuloform') },
	{ value: 'hide', label: __('Hidden', 'vuloform') },
	{ value: 'require', label: __('Required', 'vuloform') },
];

// Which sections are open is remembered, so the panel looks the same from one field to the next.
const OPEN_KEY = 'vuloform_inspector_open';
// The settings most people change are open to begin with; the rest are one click away.
const OPEN_BY_DEFAULT = ['general', 'choices', 'calculation', 'files', 'parts'];

const storedOpen = (): string[] => {
	try {
		const stored = JSON.parse(
			window.localStorage.getItem(OPEN_KEY) ?? 'null'
		);

		return Array.isArray(stored) ? stored : OPEN_BY_DEFAULT;
	} catch {
		return OPEN_BY_DEFAULT;
	}
};

/** One setting: a small label, its control, and an optional hint underneath. */
/** Text as it is typed, not as HTML stores it: `&amp;` shows as `&`. The server cleans the saved value. */
const decodeEntities = (value: string): string => {
	const area = document.createElement('textarea');

	area.innerHTML = value;

	return area.value;
};

const escapeHtml = (value: string): string =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Adds a link to a text without typing HTML: select the words in the text above (or type them here),
 * give the address, and the link is put in place of the selection.
 */
const AddLink = ({
	textareaId,
	value,
	onChange,
}: {
	textareaId: string;
	value: string;
	// eslint-disable-next-line no-unused-vars
	onChange: (value: string) => void;
}) => {
	const [words, setWords] = useState('');
	const [address, setAddress] = useState('');

	const insert = () => {
		const area = document.getElementById(textareaId) as HTMLTextAreaElement | null;
		const start = area?.selectionStart ?? value.length;
		const end = area?.selectionEnd ?? value.length;
		const label = (words.trim() || value.slice(start, end)).trim();
		let href = address.trim();

		if (!label || !href) {
			return;
		}

		// A bare address such as example.com/terms becomes https://example.com/terms.
		if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href)) {
			href = `https://${href}`;
		}

		const link = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;

		onChange(value.slice(0, start) + link + value.slice(end));
		setWords('');
		setAddress('');
	};

	return (
		<>
			<TextInput
				id="vuloform-inspector-link-words"
				name="link_words"
				value={words}
				placeholder={__('Words to link, or select them above', 'vuloform')}
				onChange={(next) => setWords(String(next))}
			/>
			<TextInput
				id="vuloform-inspector-link-address"
				name="link_address"
				value={address}
				placeholder={__('Address, for example example.com/terms', 'vuloform')}
				onChange={(next) => setAddress(String(next))}
			/>
			<ButtonInput
				buttons={{
					text: __('Add link', 'vuloform'),
					icon: 'link',
					color: 'purple',
					onClick: insert,
				}}
			/>
		</>
	);
};

const Control = ({
	label,
	desc,
	name,
	inline,
	children,
}: {
	label?: string;
	desc?: ReactNode;
	name?: string;
	/** Label and control on one line, for short single-line settings. */
	inline?: boolean;
	children: ReactNode;
}) => (
	<div className={`vuloform-control${inline ? ' is-inline' : ''}`}>
		{label && (
			<label
				className="vuloform-control-label"
				htmlFor={name ? `vuloform-inspector-${name}` : undefined}
			>
				{label}
			</label>
		)}
		{children}
		{desc && <span className="vuloform-control-desc">{desc}</span>}
	</div>
);

/** Two short controls side by side, such as a minimum and a maximum. */
const Pair = ({ children }: { children: ReactNode }) => (
	<div className="vuloform-control-pair">{children}</div>
);

/** An on/off setting: what it does on the left, the switch on the right. */
const SwitchRow = ({
	label,
	desc,
	checked,
	locked,
	onChange,
}: {
	label: string;
	desc?: string;
	checked: boolean;
	/** The setting can't be changed. */
	locked?: boolean;
	// eslint-disable-next-line no-unused-vars
	onChange: (checked: boolean) => void;
}) => (
	<label className="vuloform-switch-row">
		<span className="vuloform-switch-text">
			<span className="vuloform-control-label">{label}</span>
			{desc && <span className="vuloform-control-desc">{desc}</span>}
		</span>
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			className={`vuloform-switch${checked ? ' is-on' : ''}`}
			disabled={locked}
			onClick={() => onChange(!checked)}
		>
			<span aria-hidden="true" />
		</button>
	</label>
);

/** A few mutually exclusive choices shown as one row of buttons. */
const Segmented = ({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: { value: string; label: string; title?: string }[];
	value: string;
	// eslint-disable-next-line no-unused-vars
	onChange: (value: string) => void;
}) => (
	<div className="vuloform-segmented" role="radiogroup" aria-label={label}>
		{options.map((option) => (
			<button
				type="button"
				role="radio"
				key={option.value}
				aria-checked={option.value === value}
				title={option.title}
				className={option.value === value ? 'is-active' : ''}
				onClick={() => onChange(option.value)}
			>
				{option.label}
			</button>
		))}
	</div>
);

/**
 * Settings for the selected field. Only the controls that apply to its type are shown.
 */
const Inspector = ({ template, field, fields, onChange, onAddField }: InspectorProps) => {
	const [open, setOpen] = useState<string[]>(storedOpen);

	const toggle = (id: string) => {
		const next = open.includes(id)
			? open.filter((item) => item !== id)
			: [...open, id];

		setOpen(next);

		try {
			window.localStorage.setItem(OPEN_KEY, JSON.stringify(next));
		} catch {
			// Private browsing: the choice just isn't remembered.
		}
	};

	/**
	 * A collapsible group of settings. Closed, its header still says what is set inside, so nothing
	 * has to be opened just to check it.
	 */
	const section = (
		id: string,
		title: string,
		summary: string,
		children: ReactNode
	) => {
		const isOpen = open.includes(id);

		return (
			<div
				className={`vuloform-inspector-section${isOpen ? ' is-open' : ''}`}
				key={id}
			>
				<button
					type="button"
					className="vuloform-inspector-section-head"
					aria-expanded={isOpen}
					aria-controls={`vuloform-inspector-section-${id}`}
					onClick={() => toggle(id)}
				>
					<span className="vuloform-inspector-section-title">
						{title}
					</span>
					{!isOpen && summary && (
						<span className="vuloform-inspector-section-summary">
							{summary}
						</span>
					)}
					<i
						className={`adminfont-${isOpen ? 'keyboard-arrow-down' : 'pagination-right-arrow'}`}
						aria-hidden="true"
					/>
				</button>
				{isOpen && (
					<div
						className="vuloform-inspector-section-body"
						id={`vuloform-inspector-section-${id}`}
					>
						{children}
					</div>
				)}
			</div>
		);
	};

	if (!field) {
		return (
			<aside
				className="vuloform-inspector"
				aria-label={__('Field settings', 'vuloform')}
			>
				<div className="vuloform-inspector-empty">
					<i className="adminfont-setting" aria-hidden="true" />
					<strong>{__('No field selected', 'vuloform')}</strong>
					<span>
						{__(
							'Select a field in the form to change its label, limits and when it is shown.',
							'vuloform'
						)}
					</span>
				</div>
			</aside>
		);
	}

	const type = fieldType(field.type);
	const set = (patch: Partial<Field>) => onChange({ ...field, ...patch });
	const text = (key: string) => String(field[key] ?? '');

	const options = field.options ?? [];
	const setOption = (index: number, patch: Partial<Option>) =>
		set({
			options: options.map((option, i) =>
				i === index ? { ...option, ...patch } : option
			),
		});

	const conditions = field.conditions;
	const setConditions = (patch: Partial<Field['conditions']>) =>
		set({ conditions: { ...conditions, ...patch } });
	const setRule = (index: number, patch: Partial<Rule>) =>
		setConditions({
			rules: conditions.rules.map((rule, i) =>
				i === index ? { ...rule, ...patch } : rule
			),
		});

	// A rule can read any other field that collects a value.
	const ruleTargets = fields
		.filter(
			(item) =>
				item.id !== field.id &&
				fieldType(item.type)?.input &&
				'file' !== item.type
		)
		.map((item) => ({ value: item.key, label: item.label || item.key }));

	const parts =
		'name' === field.type
			? vuloformAppLocalizer.name_parts
			: vuloformAppLocalizer.address_parts;
	const shownParts = (field.parts as string[] | undefined) ?? [];
	const allowedTypes = (field.allowed_types as string[] | undefined) ?? [];
	const isLayout = !type?.input;

	const id = (name: string) => `vuloform-inspector-${name}`;

	// The same setting means something slightly different on each kind of field; say what it
	// means for this one.
	const byType = (texts: Record<string, string>, fallback: string) =>
		texts[field.type] ?? fallback;
	const requiredDesc = byType(
		{
			consent: __(
				"The form can't be sent unless this is ticked.",
				'vuloform'
			),
			checkboxes: __('At least one choice must be ticked.', 'vuloform'),
			select: __('A choice must be made.', 'vuloform'),
			radio: __('A choice must be made.', 'vuloform'),
			file: __("The form can't be sent without a file.", 'vuloform'),
		},
		__("The form can't be sent while this is empty.", 'vuloform')
	);
	const labelDesc = byType(
		{
			hidden: __(
				'Only you see this, in submissions and emails.',
				'vuloform'
			),
			consent: __(
				'Names this answer in submissions and emails. Shown beside the checkbox if the text below is empty.',
				'vuloform'
			),
			calculation: __('Shown above the result.', 'vuloform'),
		},
		__('The question or name visitors see above the field.', 'vuloform')
	);
	const defaultDesc = byType(
		{
			hidden: __(
				'Sent with every submission. Visitors do not see it.',
				'vuloform'
			),
			date: __(
				'Written as 2026-12-31. Visitors can change it.',
				'vuloform'
			),
			time: __('Written as 14:30. Visitors can change it.', 'vuloform'),
		},
		__(
			'Already in the field when the form opens. Visitors can change it.',
			'vuloform'
		)
	);
	const isChoice = 'select' === field.type || 'radio' === field.type;
	// What a calculation can use: the fields whose answer is a number. That is every Number and
	// Calculation field, a choice field whose choices are all numbers (a dropdown of prices), and a
	// hidden field holding a number. A "Subject" or an email has no place in a sum.
	const isNumber = (value: unknown) => '' !== String(value ?? '').trim() && !Number.isNaN(Number(value));
	const numberFields = fields.filter((item) => {
		if (item.id === field.id) {
			return false;
		}

		if ('number' === item.type || 'calculation' === item.type) {
			return true;
		}

		if (['select', 'radio', 'checkboxes'].includes(item.type)) {
			return (item.options ?? []).length > 0 && (item.options ?? []).every((option) => isNumber(option.value || option.label));
		}

		return 'hidden' === item.type && isNumber(item.default);
	});
	// Number fields most calculations start from, offered until the form has them.
	const suggestions = [
		{ key: 'quantity', label: __('Quantity', 'vuloform') },
		{ key: 'price', label: __('Price', 'vuloform') },
	].filter((item) => !fields.some((other) => other.key === item.key));
	const formulaMeaning = explainFormula(text('formula'), Object.fromEntries(numberFields.map((item) => [item.key, item.label || item.key])));
	const withPiece = (piece: string) => {
		const formula = text('formula');

		return `${formula}${'' !== formula && !formula.endsWith(' ') ? ' ' : ''}${piece}`;
	};
	const addToFormula = (piece: string) => set({ formula: withPiece(piece) });

	const width = WIDTHS.find((item) => item.value === String(field.width));
	const hasLimits =
		['min', 'max'].some((key) => '' !== text(key)) ||
		Number(field.minlength ?? 0) > 0 ||
		Number(field.maxlength ?? 0) > 0;
	const hasGeneral = 'divider' !== field.type && 'page_break' !== field.type;
	const hasAppearance =
		'page_break' !== field.type && 'hidden' !== field.type;

	return (
		<aside
			className="vuloform-inspector"
			aria-label={__('Field settings', 'vuloform')}
		>
			<div className="vuloform-inspector-title">
				<i
					className={`adminfont-${type?.icon ?? 'lock'}`}
					aria-hidden="true"
				/>
				<span className="vuloform-inspector-title-text">
					<strong>{field.label || type?.label || field.type}</strong>
					<span>{type?.label ?? field.type}</span>
				</span>
			</div>

			<div className="vuloform-inspector-body">
				{!type && (
					<NoticeComponent
						displayPosition="inline-notice"
						type="warning"
						message={__(
							'This field was added by an extension that is not active on this site. It is kept with the form, but visitors do not see it and it collects nothing until the extension is active again.',
							'vuloform'
						)}
					/>
				)}

				{'page_break' === field.type && (
					<NoticeComponent
						displayPosition="inline-notice"
						type="info"
						message={__(
							'Everything after this starts a new step. Visitors move between steps with the Next and Back buttons; change their text under Settings.',
							'vuloform'
						)}
					/>
				)}

				{/* Its own line, always in view: the setting people change most, not one among the texts. */}
				{supports(field, 'required') && (
					<div className="vuloform-inspector-section vuloform-inspector-required">
						<SwitchRow
							label={__('Required', 'vuloform')}
							desc={lockOf(template, field).required ? __('This field is always required.', 'vuloform') : requiredDesc}
							checked={field.required || Boolean(lockOf(template, field).required)}
							locked={Boolean(lockOf(template, field).required)}
							onChange={(required) => set({ required })}
						/>
					</div>
				)}

				{hasGeneral &&
					section(
						'general',
						__('Label and hints', 'vuloform'),
						'',
						<>
							{'html' !== field.type && (
								<Control
									label={byType(
										{
											heading: __(
												'Heading text',
												'vuloform'
											),
											hidden: __('Name', 'vuloform'),
										},
										__('Field label', 'vuloform')
									)}
									name="label"
									desc={
										'heading' === field.type
											? undefined
											: labelDesc
									}
								>
									<TextInput
										id={id('label')}
										name="label"
										value={field.label}
										onChange={(value) => {
											const label = String(value);
											// The key follows the label until someone sets it by hand.
											const follows =
												field.key ===
												uniqueKey(
													slug(field.label),
													fields,
													field.id
												);

											set(
												follows
													? {
															label,
															key: uniqueKey(
																slug(label),
																fields,
																field.id
															),
														}
													: { label }
											);
										}}
									/>
								</Control>
							)}
							{'html' === field.type && (
								<Control
									label={__('Text to show', 'vuloform')}
									name="content"
									desc={__(
										'Text and basic HTML such as links, bold and lists. Scripts are removed.',
										'vuloform'
									)}
								>
									<TextAreaInput
										id={id('content')}
										name="content"
										rowNumber={6}
										usePlainText
										value={text('content')}
										onChange={(value) =>
											set({ content: value })
										}
									/>
								</Control>
							)}
							{'heading' === field.type && (
								<Control
									label={__('Heading size', 'vuloform')}
									desc={__(
										"H2 is the largest. Pick the level that fits your page's outline.",
										'vuloform'
									)}
								>
									<Segmented
										label={__('Heading size', 'vuloform')}
										options={[2, 3, 4, 5, 6].map(
											(level) => ({
												value: String(level),
												label: `H${level}`,
											})
										)}
										value={String(field.level ?? 3)}
										onChange={(value) =>
											set({ level: Number(value) })
										}
									/>
								</Control>
							)}
							{'consent' === field.type && (
								<Control
									label={__(
										'Text beside the checkbox',
										'vuloform'
									)}
									name="consent_text"
									desc={__(
										'Links are allowed, for example to your privacy policy.',
										'vuloform'
									)}
								>
									<TextAreaInput
										id={id('consent_text')}
										name="consent_text"
										rowNumber={3}
										usePlainText
										value={decodeEntities(text('consent_text'))}
										onChange={(value) =>
											set({ consent_text: value })
										}
									/>
								</Control>
							)}
							{'consent' === field.type && (
								<Control
									label={__('Add a link', 'vuloform')}
									desc={__(
										'Select words in the text above, or type them here, then give the address they should open. The link opens in a new tab.',
										'vuloform'
									)}
								>
									<AddLink
										textareaId={id('consent_text')}
										value={decodeEntities(text('consent_text'))}
										onChange={(value) =>
											set({ consent_text: value })
										}
									/>
								</Control>
							)}
							{supports(field, 'placeholder') && (
								<Control
									label={
										'select' === field.type
											? __(
													'Text before a choice is made',
													'vuloform'
												)
											: __(
													'Example inside the field',
													'vuloform'
												)
									}
									name="placeholder"
									desc={
										'select' === field.type
											? __(
													'Shown in the dropdown until the visitor picks, such as "Choose one".',
													'vuloform'
												)
											: __(
													'Grey sample text that disappears when the visitor starts typing.',
													'vuloform'
												)
									}
								>
									<TextInput
										id={id('placeholder')}
										name="placeholder"
										value={field.placeholder}
										onChange={(value) =>
											set({ placeholder: String(value) })
										}
									/>
								</Control>
							)}
							{supports(field, 'description') && (
								<Control
									label={byType(
										{
											heading: __(
												'Text under the heading',
												'vuloform'
											),
											consent: __(
												'Small print under the checkbox',
												'vuloform'
											),
										},
										__('Hint under the field', 'vuloform')
									)}
									name="description"
									desc={byType(
										{
											heading: __(
												'An optional line that introduces the section.',
												'vuloform'
											),
											consent: __(
												'Optional. For example how to withdraw consent.',
												'vuloform'
											),
											file: __(
												'Optional. The allowed file types and size are shown to visitors automatically.',
												'vuloform'
											),
										},
										__(
											'Extra guidance for the visitor, such as the format you expect.',
											'vuloform'
										)
									)}
								>
									<TextInput
										id={id('description')}
										name="description"
										value={field.description}
										onChange={(value) =>
											set({ description: String(value) })
										}
									/>
								</Control>
							)}
							{supports(field, 'default') && (
								<Control
									label={
										isChoice
											? __(
													'Choice selected at the start',
													'vuloform'
												)
											: byType(
													{
														hidden: __(
															'Value to send',
															'vuloform'
														),
													},
													__(
														'Pre-filled answer',
														'vuloform'
													)
												)
									}
									name="default"
									desc={
										isChoice
											? __(
													'Visitors can pick another.',
													'vuloform'
												)
											: (
												<>
													{defaultDesc}
													<span className="vuloform-chips vuloform-dynamic-tags">
														{__('Fill it in automatically:', 'vuloform')}
														{DYNAMIC_TAGS.map((tag) => (
															<button
																type="button"
																key={tag.value}
																title={tag.title}
																onClick={() => set({ default: `${field.default ?? ''}${tag.value}` })}
															>
																{tag.value}
															</button>
														))}
													</span>
												</>
											)
									}
								>
									{isChoice ? (
										<SelectInput
											type="single-select"
											name="default"
											isClearable={false}
											// zyra's select shows its placeholder for an empty value, so "none" needs one of its own.
											options={[
												{
													value: '__none',
													label: __(
														'None',
														'vuloform'
													),
												},
												...options
													.filter(
														(option) =>
															'' !==
																option.value ||
															'' !== option.label
													)
													.map((option) => ({
														value:
															option.value ||
															option.label,
														label:
															option.label ||
															option.value,
													})),
											]}
											value={
												options.some(
													(option) =>
														(option.value ||
															option.label) ===
														field.default
												)
													? field.default
													: '__none'
											}
											onChange={(value) =>
												set({
													default:
														'__none' === value
															? ''
															: String(value),
												})
											}
										/>
									) : (
										<TextInput
											id={id('default')}
											name="default"
											value={field.default}
											onChange={(value) =>
												set({ default: String(value) })
											}
										/>
									)}
								</Control>
							)}
						</>
					)}

				{supports(field, 'options') &&
					section(
						'choices',
						__('Choices', 'vuloform'),
						sprintf(
							/* translators: %d: number of choices. */
							_n(
								'%d choice',
								'%d choices',
								options.length,
								'vuloform'
							),
							options.length
						),
						<>
							{options.map((option, index) => (
								<div className="vuloform-option" key={index}>
									<TextInput
										name={`option-${index}`}
										value={option.label}
										placeholder={__('Choice', 'vuloform')}
										onChange={(value) => {
											const label = String(value);

											// The stored value follows the label unless it was set separately.
											setOption(
												index,
												option.value === option.label
													? { label, value: label }
													: { label }
											);
										}}
									/>
									<button
										type="button"
										className="vuloform-icon-button is-danger"
										aria-label={__(
											'Remove this choice',
											'vuloform'
										)}
										onClick={() =>
											set({
												options: options.filter(
													(_, i) => i !== index
												),
											})
										}
									>
										<i
											className="adminfont-delete"
											aria-hidden="true"
										/>
									</button>
								</div>
							))}
							<ButtonInput
								buttons={{
									text: __('Add a choice', 'vuloform'),
									icon: 'plus',
									color: 'purple',
									onClick: () =>
										set({
											options: [
												...options,
												{ label: '', value: '' },
											],
										}),
								}}
							/>
							<span className="vuloform-control-desc">
								{__(
									'One choice per row. Visitors can only answer with one of these.',
									'vuloform'
								)}
							</span>
						</>
					)}

				{'calculation' === field.type &&
					section(
						'calculation',
						__('What to calculate', 'vuloform'),
						formulaMeaning.ok ? formulaMeaning.text : text('formula'),
						<>
							<Control
								label={__('Calculation', 'vuloform')}
								name="formula"
								desc={
									numberFields.length > 0
										? __('Select a tag to add it. The tags are this form\'s number fields; use as many as you need.', 'vuloform')
										: __('Select a tag to add it. A tag for a field the form does not have yet adds that number field to the form.', 'vuloform')
								}
							>
								<TextInput
									id={id('formula')}
									name="formula"
									value={text('formula')}
									placeholder={
										// An example with the form's own fields, two of them when there are two.
										numberFields.length > 1
											? `{${numberFields[0].key}} * {${numberFields[1].key}}`
											: `{${numberFields[0]?.key ?? 'quantity'}} * {${numberFields[0] ? 'another_field' : 'price'}} + 5`
									}
									onChange={(value) => set({ formula: String(value) })}
								/>
								{/* Everything that can go into the calculation, one click each. */}
								<span className="vuloform-chips">
									{numberFields.map((item) => (
										<button
											type="button"
											key={item.id}
											className="is-field"
											title={sprintf(
												/* translators: %s: field label. */
												'number' === item.type || 'calculation' === item.type
													? __('The answer to "%s"', 'vuloform')
													: /* translators: %s: field label. */
													  __('The answer to "%s". Counts as 0 unless the answer is a number.', 'vuloform'),
												item.label || item.key
											)}
											onClick={() => addToFormula(`{${item.key}}`)}
										>
											{`{${item.key}}`}
										</button>
									))}
									{/* The usual starting points are offered even before the form has them: selecting one adds that Number field to the form and uses it. */}
									{onAddField &&
										suggestions.map((item) => (
											<button
												type="button"
												key={item.key}
												className="is-field"
												title={sprintf(
													/* translators: %s: field label, such as Quantity. */
													__('Adds a "%s" number field to the form and uses it here', 'vuloform'),
													item.label
												)}
												onClick={() => onAddField('number', item.label, item.key, { formula: withPiece(`{${item.key}}`) })}
											>
												{`{${item.key}}`}
											</button>
										))}
									{[
										['+', __('plus', 'vuloform')],
										['-', __('minus', 'vuloform')],
										['*', __('times', 'vuloform')],
										['/', __('divided by', 'vuloform')],
										['(', __('open bracket', 'vuloform')],
										[')', __('close bracket', 'vuloform')],
									].map(([symbol, name]) => (
										<button type="button" key={symbol} title={name} aria-label={name} onClick={() => addToFormula(symbol)}>
											{{ '*': '×', '/': '÷', '-': '−' }[symbol] ?? symbol}
										</button>
									))}
								</span>
							</Control>
							{'' !== formulaMeaning.text && (
								<div className={`vuloform-formula-meaning${formulaMeaning.ok ? '' : ' is-wrong'}`} role="status">
									{formulaMeaning.ok && <span>{__('Visitors see the result of:', 'vuloform')}</span>}
									<strong>{formulaMeaning.text}</strong>
								</div>
							)}
							<Pair>
								<Control
									label={__(
										'Digits after the point',
										'vuloform'
									)}
									name="decimals"
								>
									<TextInput
										id={id('decimals')}
										name="decimals"
										type="number"
										minNumber={0}
										maxNumber={4}
										value={Number(field.decimals ?? 2)}
										onChange={(value) =>
											set({ decimals: Number(value) })
										}
									/>
								</Control>
							</Pair>
							<Control
								label={__('Shown before the result', 'vuloform')}
								name="prefix"
								desc={__('Select a symbol or type your own, such as "Total:". Leave empty to show the number alone.', 'vuloform')}
							>
								<TextInput id={id('prefix')} name="prefix" value={text('prefix')} onChange={(value) => set({ prefix: String(value) })} />
								<span className="vuloform-chips">
									{['$', '€', '£', '₹', '¥', 'A$', 'C$', 'CHF'].map((symbol) => (
										<button
											type="button"
											key={symbol}
											className={text('prefix') === symbol ? 'is-field' : ''}
											aria-pressed={text('prefix') === symbol}
											onClick={() => set({ prefix: text('prefix') === symbol ? '' : symbol })}
										>
											{symbol.trim()}
										</button>
									))}
								</span>
							</Control>
						</>
					)}

				{'file' === field.type &&
					section(
						'files',
						__('Upload limits', 'vuloform'),
						allowedTypes.join(', '),
						<>
							<Control
								label={__('Allowed file types', 'vuloform')}
							>
								<div className="vuloform-checks">
									{vuloformAppLocalizer.file_types.map(
										(extension) => (
											<label key={extension}>
												<input
													type="checkbox"
													checked={allowedTypes.includes(
														extension
													)}
													onChange={(event) =>
														set({
															allowed_types: event
																.target.checked
																? [
																		...allowedTypes,
																		extension,
																	]
																: allowedTypes.filter(
																		(
																			item
																		) =>
																			item !==
																			extension
																	),
														})
													}
												/>{' '}
												{extension}
											</label>
										)
									)}
								</div>
							</Control>
							<Pair>
								<Control
									label={__(
										'Maximum size per file',
										'vuloform'
									)}
									name="max_size_mb"
								>
									<TextInput
										id={id('max_size_mb')}
										name="max_size_mb"
										type="number"
										minNumber={1}
										maxNumber={100}
										postText="MB"
										value={Number(field.max_size_mb ?? 5)}
										onChange={(value) =>
											set({ max_size_mb: Number(value) })
										}
									/>
								</Control>
								<Control
									label={__('Number of files', 'vuloform')}
									name="max_files"
								>
									<TextInput
										id={id('max_files')}
										name="max_files"
										type="number"
										minNumber={1}
										maxNumber={10}
										value={Number(field.max_files ?? 1)}
										onChange={(value) =>
											set({ max_files: Number(value) })
										}
									/>
								</Control>
							</Pair>
						</>
					)}

				{('name' === field.type || 'address' === field.type) &&
					section(
						'parts',
						__('Parts to show', 'vuloform'),
						sprintf(
							/* translators: 1: parts shown, 2: parts available. */
							__('%1$d of %2$d', 'vuloform'),
							shownParts.length,
							Object.keys(parts).length
						),
						<div className="vuloform-checks">
							{Object.entries(parts).map(([part, label]) => (
								<label key={part}>
									<input
										type="checkbox"
										checked={shownParts.includes(part)}
										onChange={(event) =>
											set({
												parts: Object.keys(
													parts
												).filter((item) =>
													item === part
														? event.target.checked
														: shownParts.includes(
																item
															)
												),
											})
										}
									/>{' '}
									{label}
								</label>
							))}
						</div>
					)}

				{(supports(field, 'range') || supports(field, 'length')) &&
					section(
						'validation',
						__('Answer limits', 'vuloform'),
						hasLimits
							? __('Limits set', 'vuloform')
							: __('No limits', 'vuloform'),
						<>
							{supports(field, 'range') && (
								<>
									<Pair>
										<Control
											label={__(
												'Lowest number allowed',
												'vuloform'
											)}
											name="min"
										>
											<TextInput
												id={id('min')}
												name="min"
												type="number"
												value={text('min')}
												onChange={(value) =>
													set({ min: String(value) })
												}
											/>
										</Control>
										<Control
											label={__(
												'Highest number allowed',
												'vuloform'
											)}
											name="max"
										>
											<TextInput
												id={id('max')}
												name="max"
												type="number"
												value={text('max')}
												onChange={(value) =>
													set({ max: String(value) })
												}
											/>
										</Control>
									</Pair>
									<span className="vuloform-control-desc">
										{__(
											'Leave empty for no limit.',
											'vuloform'
										)}
									</span>
								</>
							)}
							{supports(field, 'length') && (
								<>
									<Pair>
										<Control
											label={__(
												'Shortest answer',
												'vuloform'
											)}
											name="minlength"
										>
											<TextInput
												id={id('minlength')}
												name="minlength"
												type="number"
												minNumber={0}
												value={Number(
													field.minlength ?? 0
												)}
												onChange={(value) =>
													set({
														minlength:
															Number(value),
													})
												}
											/>
										</Control>
										<Control
											label={__(
												'Longest answer',
												'vuloform'
											)}
											name="maxlength"
										>
											<TextInput
												id={id('maxlength')}
												name="maxlength"
												type="number"
												minNumber={0}
												value={Number(
													field.maxlength ?? 0
												)}
												onChange={(value) =>
													set({
														maxlength:
															Number(value),
													})
												}
											/>
										</Control>
									</Pair>
									<span className="vuloform-control-desc">
										{__(
											'In characters. 0 means no limit.',
											'vuloform'
										)}
									</span>
								</>
							)}
						</>
					)}

				{hasAppearance &&
					section(
						'appearance',
						__('Layout', 'vuloform'),
						[
							width?.title,
							field.hide_label && !isLayout
								? __('label hidden', 'vuloform')
								: '',
						]
							.filter(Boolean)
							.join(', '),
						<>
							<Control
								label={__('Field width', 'vuloform')}
								desc={__(
									'Narrower fields sit side by side on wide screens and stack on phones.',
									'vuloform'
								)}
							>
								<Segmented
									label={__('Field width', 'vuloform')}
									options={WIDTHS}
									value={String(field.width)}
									onChange={(value) =>
										set({ width: Number(value) })
									}
								/>
							</Control>
							{!isLayout && 'consent' !== field.type && (
								<SwitchRow
									label={__(
										'Hide the field label',
										'vuloform'
									)}
									desc={__(
										'Screen readers still read it out.',
										'vuloform'
									)}
									checked={field.hide_label}
									onChange={(hide_label) =>
										set({ hide_label })
									}
								/>
							)}
						</>
					)}

				{/* The switch is the header: on shows the rules under it, off leaves a single line. */}
				{'page_break' !== field.type && (
					<div className="vuloform-inspector-section vuloform-inspector-conditions">
						<SwitchRow
							label={__('Conditional logic', 'vuloform')}
							desc={__('Depends on other answers.', 'vuloform')}
							checked={conditions.enabled}
							onChange={(enabled) =>
								// Switching it on starts with one rule, so there is something to fill in.
								setConditions(
									enabled &&
										0 === conditions.rules.length &&
										ruleTargets.length > 0
										? {
												enabled,
												rules: [
													{
														field: ruleTargets[0]
															.value,
														operator: 'is',
														value: '',
													},
												],
											}
										: { enabled }
								)
							}
						/>
						{conditions.enabled && 0 === ruleTargets.length && (
							<NoticeComponent
								displayPosition="inline-notice"
								type="info"
								message={__(
									'Add another field to the form first. A rule needs an answer to look at.',
									'vuloform'
								)}
							/>
						)}
						{conditions.enabled && ruleTargets.length > 0 && (
							<>
								<Control
									label={__('This field is', 'vuloform')}
								>
									<Segmented
										label={__('This field is', 'vuloform')}
										options={
											'divider' === field.type || isLayout
												? ACTIONS.slice(0, 2)
												: ACTIONS
										}
										value={conditions.action}
										onChange={(value) =>
											setConditions({
												action: value as Field['conditions']['action'],
											})
										}
									/>
								</Control>
								<Control
									label={
										conditions.rules.length > 1
											? __('When', 'vuloform')
											: __(
													'When this is true',
													'vuloform'
												)
									}
								>
									{conditions.rules.length > 1 && (
										<Segmented
											label={__(
												'How many rules must be true',
												'vuloform'
											)}
											options={[
												{
													value: 'all',
													label: __(
														'All of these are true',
														'vuloform'
													),
												},
												{
													value: 'any',
													label: __(
														'Any of these is true',
														'vuloform'
													),
												},
											]}
											value={conditions.match}
											onChange={(value) =>
												setConditions({
													match: value as
														'all' | 'any',
												})
											}
										/>
									)}
									{conditions.rules.map((rule, index) => (
										<div
											className="vuloform-rule"
											key={index}
										>
											<div className="vuloform-rule-line">
												<SelectInput
													type="single-select"
													name={`rule-field-${index}`}
													isClearable={false}
													options={ruleTargets}
													value={rule.field}
													onChange={(value) =>
														setRule(index, {
															field: value as string,
														})
													}
												/>
												<button
													type="button"
													className="vuloform-icon-button is-danger"
													aria-label={__(
														'Remove this rule',
														'vuloform'
													)}
													title={__(
														'Remove this rule',
														'vuloform'
													)}
													onClick={() =>
														setConditions({
															rules: conditions.rules.filter(
																(_, i) =>
																	i !== index
															),
														})
													}
												>
													<i
														className="adminfont-delete"
														aria-hidden="true"
													/>
												</button>
											</div>
											<div className="vuloform-rule-line">
												<SelectInput
													type="single-select"
													name={`rule-operator-${index}`}
													isClearable={false}
													options={OPERATORS}
													value={rule.operator}
													onChange={(value) =>
														setRule(index, {
															operator:
																value as string,
														})
													}
												/>
												{'empty' !== rule.operator &&
													'not_empty' !==
														rule.operator && (
														<TextInput
															name={`rule-value-${index}`}
															value={rule.value}
															placeholder={__(
																'this answer',
																'vuloform'
															)}
															onChange={(value) =>
																setRule(index, {
																	value: String(
																		value
																	),
																})
															}
														/>
													)}
											</div>
										</div>
									))}
									<button
										type="button"
										className="vuloform-link"
										onClick={() =>
											setConditions({
												rules: [
													...conditions.rules,
													{
														field: ruleTargets[0]
															.value,
														operator: 'is',
														value: '',
													},
												],
											})
										}
									>
										{__('+ Add another rule', 'vuloform')}
									</button>
								</Control>
							</>
						)}
					</div>
				)}

				{(!isLayout || hasAppearance) &&
					section(
						'advanced',
						__('For developers', 'vuloform'),
						isLayout ? field.css_class : field.key,
						<>
							{!isLayout && (
								<Control
									label={__(
										'Name in emails and exports',
										'vuloform'
									)}
									name="key"
									desc={__(
										'Use it as a placeholder in curly brackets, such as {email}. Changing it later breaks placeholders that use the old name.',
										'vuloform'
									)}
								>
									<TextInput
										id={id('key')}
										name="key"
										value={field.key}
										onChange={(value) =>
											set({ key: slug(String(value)) })
										}
										onBlur={() =>
											set({
												key: uniqueKey(
													field.key ||
														slug(field.label),
													fields,
													field.id
												),
											})
										}
									/>
								</Control>
							)}
							{hasAppearance && (
								<Control
									label={__('CSS class', 'vuloform')}
									name="css_class"
									desc={__(
										'Added to this field for your own stylesheet. Leave empty if unsure.',
										'vuloform'
									)}
								>
									<TextInput
										id={id('css_class')}
										name="css_class"
										value={field.css_class}
										onChange={(value) =>
											set({ css_class: String(value) })
										}
									/>
								</Control>
							)}
						</>
					)}

				{inspectorSections()
					.filter((item) => item.applies(field))
					.map((item) => (
						<item.Component
							key={item.id}
							field={field}
							fields={fields}
							onChange={set}
						/>
					))}
			</div>
		</aside>
	);
};

export default Inspector;
