/* global vulopilotAppLocalizer */
import { useEffect, useMemo, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, scrollToId, sendApiResponse } from '@zyra/core';
import {
	BadgeComponent,
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	NoticeManager,
	SectionComponent,
} from '@zyra/components';
import { MultiCheckboxInput, SelectInput, TextInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { useSetting } from '../../../contexts/SettingContext';
import './SeoTitlesPanel.scss';

type BadgeClass = 'green' | 'info' | 'red';

interface ContextConfig {
	key: string;
	templateKey: string;
	descriptionTemplateKey: string;
	icon: string;
	label: string;
	/** Real zyra palette color name for this row's own content-type badge. */
	badgeColor: string;
	/** Real, one-line explanation of which real frontend pages this template applies to. */
	description: string;
	urlExample: string;
	vars: Record<string, string>;
	hasRealUrl: boolean;
}

interface LengthScore {
	length: number;
	max: number;
	label: string;
	cls: BadgeClass;
}

interface PreviewRow extends ContextConfig {
	resolvedTitle: string;
	titleScore: LengthScore;
	resolvedDescription: string;
	descriptionScore: LengthScore;
}

/** The 9 tokens TitleFormatter::VARIABLES resolves (`%sep%` plus 8). */
const VARIABLES: Array<{ token: string; label: string }> = [
	{ token: '%site_title%', label: __('Your website title', 'vulopilot') },
	{ token: '%site_description%', label: __('Your website description', 'vulopilot') },
	{ token: '%post_title%', label: __('Post title', 'vulopilot') },
	{ token: '%page_title%', label: __('Page title', 'vulopilot') },
	{ token: '%category_title%', label: __('Category title', 'vulopilot') },
	{ token: '%tag_title%', label: __('Tag title', 'vulopilot') },
	{ token: '%search_term%', label: __('Search term', 'vulopilot') },
	{ token: '%archive_title%', label: __('Archive title', 'vulopilot') },
	{ token: '%author_name%', label: __('Author name', 'vulopilot') },
	{ token: '%sep%', label: __('Separator (e.g. | – -)', 'vulopilot') },
];

/** Real, fixed separator characters this field offers - a `SelectInput` instead of a free-text field. */
const SEPARATOR_OPTIONS: Array<{ value: string; label: string; char: string }> = [
	{ value: 'pipe', label: __('| (Pipe)', 'vulopilot'), char: '|' },
	{ value: 'dash', label: __('- (Dash)', 'vulopilot'), char: '-' },
	{ value: 'bullet', label: __('• (Bullet)', 'vulopilot'), char: '•' },
	{ value: 'colon', label: __(': (Colon)', 'vulopilot'), char: ':' },
	{ value: 'greater', label: __('> (Greater Than)', 'vulopilot'), char: '>' },
	{ value: 'tilde', label: __('~ (Tilde)', 'vulopilot'), char: '~' },
];

/**
 * Same token-replacement + leading/trailing-separator-trim logic as TitleFormatter::resolve()
 * (PHP).
 */
const resolveTemplate = (template: string, vars: Record<string, string>, separator: string): string => {
	const resolved = template.replace(/%([a-z_]+)%/g, (_match, token: string) => {
		if ('sep' === token) {
			return separator;
		}
		return vars[token] ?? '';
	});

	const sep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const trimmed = resolved
		.replace(new RegExp(`\\s*${sep}\\s*$`), '')
		.replace(new RegExp(`^\\s*${sep}\\s*`), '');

	return trimmed.trim();
};

/**
 * Length-based heuristic, graded against real, already-established thresholds elsewhere in this
 * codebase rather than an invented number.
 */
const scoreLength = (text: string, max: number, min = 0): LengthScore => {
	const length = text.trim().length;

	if (0 === length) {
		return { length, max, label: __('Empty', 'vulopilot'), cls: 'red' };
	}

	let cls: BadgeClass;
	let label: string;

	if (min > 0 && length < min) {
		cls = 'red';
		label = __('Too short', 'vulopilot');
	} else if (length <= max) {
		cls = 'green';
		label = __('Good', 'vulopilot');
	} else {
		cls = 'info';
		label = __('Too long', 'vulopilot');
	}

	return { length, max, label, cls };
};

const TITLE_MAX_LENGTH = 60;
const TITLE_MIN_LENGTH = 30;
const DESCRIPTION_MIN_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 160;

/** Same real `urlExample` every row already carries. */
const toBreadcrumb = (urlExample: string): string =>
	urlExample
		.replace(/^https?:\/\//, '')
		.split('/')
		.filter(Boolean)
		.join(' › ');

/**
 * Settings → SEO → SEO Titles.
 */
const SeoTitlesPanel = () => {
	const { setting, updateSetting } = useSetting();

	const [separator, setSeparator] = useState<string>('|');
	/** Which real context row's own Edit action opened the right-side edit panel. */
	const [editingKey, setEditingKey] = useState<string | null>('home');

	/** Shared by the row click and the action cell's own "Edit"/"Editing" button. */
	const handleEditRow = (key: string) => {
		setEditingKey(key);
		scrollToId('site-identity-edit-panel');
	};

	const contexts = useMemo<ContextConfig[]>(() => {
		const siteTitle = vulopilotAppLocalizer.site_title || __('Your Site', 'vulopilot');
		const siteDescription = vulopilotAppLocalizer.site_description || __('A short description of your website.', 'vulopilot');
		const siteUrl = (vulopilotAppLocalizer.site_url || '').replace(/\/$/, '');
		const now = new Date();
		const archiveDatePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
		const archiveLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

		return [
			{
				key: 'home',
				templateKey: 'title_format_home',
				descriptionTemplateKey: 'description_format_home',
				icon: 'web-page-website pink',
				label: __('Homepage', 'vulopilot'),
				badgeColor: 'pink',
				description: __('Used on your site\'s front page.', 'vulopilot'),
				urlExample: `${siteUrl}/`,
				vars: { site_title: siteTitle, site_description: siteDescription },
				hasRealUrl: true,
			},
			{
				key: 'post',
				templateKey: 'title_format_post',
				descriptionTemplateKey: 'description_format_post',
				icon: 'document blue',
				label: __('Blog Post', 'vulopilot'),
				badgeColor: 'blue',
				description: __('Used on individual blog post pages.', 'vulopilot'),
				urlExample: `${siteUrl}/blog/sample-post`,
				vars: { site_title: siteTitle, site_description: siteDescription, post_title: __('Sample Post Title', 'vulopilot') },
				hasRealUrl: false,
			},
			{
				key: 'page',
				templateKey: 'title_format_page',
				descriptionTemplateKey: 'description_format_page',
				icon: 'document violet',
				label: __('Page', 'vulopilot'),
				badgeColor: 'violet',
				description: __('Used on standard (non-post) pages.', 'vulopilot'),
				urlExample: `${siteUrl}/sample-page`,
				vars: { site_title: siteTitle, site_description: siteDescription, page_title: __('Sample Page Title', 'vulopilot') },
				hasRealUrl: false,
			},
			{
				key: 'category',
				templateKey: 'title_format_category',
				descriptionTemplateKey: 'description_format_category',
				icon: 'module orange',
				label: __('Category', 'vulopilot'),
				badgeColor: 'orange',
				description: __('Used on category archive pages.', 'vulopilot'),
				urlExample: `${siteUrl}/category/sample`,
				vars: { site_title: siteTitle, site_description: siteDescription, category_title: __('Sample Category', 'vulopilot') },
				hasRealUrl: false,
			},
			{
				key: 'tag',
				templateKey: 'title_format_tag',
				descriptionTemplateKey: 'description_format_tag',
				icon: 'link teal',
				label: __('Tag', 'vulopilot'),
				badgeColor: 'teal',
				description: __('Used on tag archive pages.', 'vulopilot'),
				urlExample: `${siteUrl}/tag/sample`,
				vars: { site_title: siteTitle, site_description: siteDescription, tag_title: __('Sample Tag', 'vulopilot') },
				hasRealUrl: false,
			},
			{
				key: 'search',
				templateKey: 'title_format_search',
				descriptionTemplateKey: 'description_format_search',
				icon: 'search cyan',
				label: __('Search Results', 'vulopilot'),
				badgeColor: 'cyan',
				description: __('Used on internal site search results pages.', 'vulopilot'),
				urlExample: `${siteUrl}/?s=sample+search`,
				vars: { site_title: siteTitle, site_description: siteDescription, search_term: __('sample search', 'vulopilot') },
				hasRealUrl: false,
			},
			{
				key: 'archive',
				templateKey: 'title_format_archive',
				descriptionTemplateKey: 'description_format_archive',
				icon: 'analytics green',
				label: __('Archive', 'vulopilot'),
				badgeColor: 'green',
				description: __('Used on date-based and other archive pages.', 'vulopilot'),
				urlExample: `${siteUrl}/${archiveDatePath}`,
				vars: { site_title: siteTitle, site_description: siteDescription, archive_title: archiveLabel },
				hasRealUrl: false,
			},
			{
				key: 'author',
				templateKey: 'title_format_author',
				descriptionTemplateKey: 'description_format_author',
				icon: 'users yellow',
				label: __('Author Archive', 'vulopilot'),
				badgeColor: 'yellow',
				description: __('Used on author archive pages.', 'vulopilot'),
				urlExample: `${siteUrl}/author/sample-author`,
				vars: { site_title: siteTitle, site_description: siteDescription, author_name: __('Sample Author', 'vulopilot') },
				hasRealUrl: false,
			},
		];
	}, []);

	const [templateValues, setTemplateValues] = useState<Record<string, string>>({});

	// Settings.tsx's own GetForm() seeds SettingContext with this tab's real values (from
	// `modal[].key`) as a render-phase `setSetting()` call.
	const hydratedRef = useRef(false);

	useEffect(() => {
		if (hydratedRef.current || undefined === setting.title_format_home) {
			return;
		}

		hydratedRef.current = true;
		setSeparator((setting.title_separator as string) || '|');

		const initial: Record<string, string> = {};
		contexts.forEach((ctx) => {
			initial[ctx.templateKey] = (setting[ctx.templateKey] as string) ?? '';
			initial[ctx.descriptionTemplateKey] = (setting[ctx.descriptionTemplateKey] as string) ?? '';
		});
		setTemplateValues(initial);
	}, [setting, contexts]);

	const enabled = (setting.site_identity_enabled as string) || 'enabled';

	const handleSettingChange = (key: string, value: string) => {
		updateSetting(key, value);
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
			setting: { [key]: value },
		});
	};

	// "Stop typing, then save" debounce - same shape BackupStoragePanel.tsx's own
	// `AUTOSAVE_DEBOUNCE_MS`/CrawlRobotsSitemapSection.tsx's own `handleRobotsContentChange`
	// already use.
	const AUTOSAVE_DEBOUNCE_MS = 1000;
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persistTemplates = (nextTemplateValues: Record<string, string>, nextSeparator: string) => {
		const payload: Record<string, string> = { title_separator: nextSeparator, ...nextTemplateValues };

		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), { setting: payload }).then(
			(response) => {
				Object.entries(payload).forEach(([key, value]) => updateSetting(key, value));

				if (!response) {
					NoticeManager.add({
						uniqueKey: 'vulopilot-title-formats-save',
						type: 'error',
						position: 'float',
						message: __('Could not save title and description formats. Please try again.', 'vulopilot'),
					});
				}
			}
		);
	};

	const scheduleSave = (nextTemplateValues: Record<string, string>, nextSeparator: string) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(
			() => persistTemplates(nextTemplateValues, nextSeparator),
			AUTOSAVE_DEBOUNCE_MS
		);
	};

	const handleTemplateChange = (key: string, value: string) => {
		setTemplateValues((prev) => {
			const next = { ...prev, [key]: value };
			scheduleSave(next, separator);
			return next;
		});
	};

	const handleSeparatorChange = (value: string) => {
		setSeparator(value);
		scheduleSave(templateValues, value);
	};

	/** Appends a real `%token%` to whichever field's own pill row was clicked. */
	const insertToken = (key: string, token: string) => {
		const current = templateValues[key] ?? '';
		handleTemplateChange(key, current ? `${current} ${token}` : token);
	};

	const previewRows = useMemo<PreviewRow[]>(
		() =>
			contexts.map((ctx) => {
				const resolvedTitle = resolveTemplate(templateValues[ctx.templateKey] ?? '', ctx.vars, separator || '|');
				const resolvedDescription = resolveTemplate(
					templateValues[ctx.descriptionTemplateKey] ?? '',
					ctx.vars,
					separator || '|'
				);
				return {
					...ctx,
					resolvedTitle,
					titleScore: scoreLength(resolvedTitle, TITLE_MAX_LENGTH, TITLE_MIN_LENGTH),
					resolvedDescription,
					descriptionScore: scoreLength(resolvedDescription, DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH),
				};
			}),
		[contexts, templateValues, separator]
	);


	const editingRow = previewRows.find((row) => row.key === editingKey) ?? null;

	/**
	 * One real `%token%` field + its own "click to insert" pill row + a real length
	 * `BadgeComponent`.
	 */
	const renderTemplateField = (
		key: string,
		score: LengthScore
	) => (
		<>
		<FormGroupComponent label={__('Title format', 'vulopilot')} htmlFor={`${key}-edit-input`}>
			<TextInput
				id={`${key}-edit-input`}
				value={templateValues[key] ?? ''}
				onChange={(value) => handleTemplateChange(key, String(value))}
			/>
			<div className="site-identity-edit-variable-pills">
				{VARIABLES.map((item) => (
					<BadgeComponent
						key={item.token}
						color="purple"
						text={sprintf(
							/* translators: %s: a real template variable's own short label, e.g. "Post title". */
							__('+ %s', 'vulopilot'),
							item.label
						)}
						onClick={() => insertToken(key, item.token)}
					/>
				))}
			</div>
		</FormGroupComponent>
		<FormGroupComponent row label={__('Title length', 'vulopilot')} htmlFor={`${key}-edit-input`}>
			<BadgeComponent color={score.cls} text={`${score.length}/${score.max}`} />
		</FormGroupComponent>
		</>
	);

	return (
		<div className="site-identity-title-formats">
			<SectionComponent
				title={__('Custom title formats', 'vulopilot')}
				desc={__('Use the configured title and description formats across your site.', 'vulopilot')}
				rightContent={
					<MultiCheckboxInput
						look="toggle"
						modules={[]}
						value={'enabled' === enabled ? ['site_identity_enabled'] : []}
						options={[{ key: 'site_identity_enabled', value: 'site_identity_enabled' }]}
						onChange={(values) =>
							handleSettingChange(
								'site_identity_enabled',
								values.includes('site_identity_enabled') ? 'enabled' : 'disabled'
							)
						}
					/>
				}
			/>

			{'enabled' === enabled && (
			<ContainerComponent>
				<ColumnComponent grid={8}>
					<CardComponent
						title={__('Title & Description Format Templates', 'vulopilot')}
						titleIcon="setting"
						desc={__(
							'Customize title and description formats using the dynamic variables below.',
							'vulopilot'
						)}
						action={
							<div className="site-identity-separator-action">
								<label htmlFor="title-separator-input">
									{__('Separator', 'vulopilot')}
								</label>
								<SelectInput
									name="title-separator-input"
									value={
										SEPARATOR_OPTIONS.find((option) => option.char === separator)?.value ??
										'pipe'
									}
									size={15}
									options={SEPARATOR_OPTIONS}
									isClearable={false}
									onChange={(value) => {
										const char =
											SEPARATOR_OPTIONS.find((option) => option.value === value)?.char ??
											separator;
										handleSeparatorChange(char);
									}}
								/>
							</div>
						}
					>
						{/* One real row per context - just this row's own content-type icon/label. */}
						<TableCard
							showMenu={false}
							hideHeader={true}
							variant="transparent"
							headers={{
								preview: {
									label: __('Format', 'vulopilot'),
									width: '80%',
									render: (row: PreviewRow) => (
										<div className="info-item-wrapper">
											<div className='info-item '>
												<div className="details-wrapper">
													<div className="avatar"><i className={`adminfont-${row.icon}`}></i></div>
													<div className='details'>
														<div className='name'>
															{toBreadcrumb(row.urlExample)}
															<BadgeComponent color={row.badgeColor} text={row.label} />
														</div>
														<div className="desc">
															{row.resolvedTitle || __('(Empty - add a title format)', 'vulopilot')}
														</div>
														<div className="desc">
															{templateValues[row.templateKey] || ''}
														</div>
													</div>
												</div>
											</div>
										</div>
									),
								},
								action: {
									label: __('Action', 'vulopilot'),
									type: 'action',
									actions: [
										{
											type: 'button',
											label: (row: Record<string, unknown>) =>
												(row as unknown as PreviewRow).key === editingKey
													? __('Editing', 'vulopilot')
													: __('Edit', 'vulopilot'),
											color: (row: Record<string, unknown>) =>
												(row as unknown as PreviewRow).key === editingKey
													? 'text-green'
													: 'text-purple',
											icon: (row: Record<string, unknown>) =>
												(row as unknown as PreviewRow).key === editingKey
													? 'eye'
													: 'edit',
											onClick: (row) =>
												handleEditRow((row as unknown as PreviewRow).key),
										},
									],
								},
							}}
							rows={previewRows}
							ids={previewRows.map((row) => row.key)}
							totalRows={previewRows.length}
							isLoading={false}
							activeRowId={editingKey ?? undefined}
							onRowClick={(row: Record<string, unknown>) =>
								handleEditRow((row as unknown as PreviewRow).key)
							}
						/>
					</CardComponent>
				</ColumnComponent>

				<ColumnComponent grid={4}>
					<div id="site-identity-edit-panel">
					{editingRow && (
						<CardComponent
							title={sprintf(
								/* translators: %s: the real content type being edited, e.g. "Homepage". */
								__('%s Format', 'vulopilot'),
								editingRow.label
							)}
							titleIcon={editingRow.icon}
							desc={editingRow.description}
						>
							<FormGroupWrapperComponent>
								{renderTemplateField(
									editingRow.templateKey,
									editingRow.titleScore
								)}
							</FormGroupWrapperComponent>
						</CardComponent>
					)}
					</div>
				</ColumnComponent>
			</ContainerComponent>
			)}
		</div>
	);
};

export default SeoTitlesPanel;
