/* global vuloformAppLocalizer */
import { useCallback, useEffect, useRef, useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
	BadgeComponent,
	CardComponent,
	ContainerComponent,
	ModuleGuardComponent,
	NavigatorHeaderComponent,
	PopupComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { apiDelete, apiGet, apiPost } from '../services/api';
import { errorMessage, notify } from '../services/notify';
import type { Form } from '../services/types';

interface FormRow {
	id: number;
	title: string;
	status: string;
	submissions: number;
	unread: number;
	updated_at_display: string;
	[key: string]: unknown;
}

interface TableQuery {
	paged?: number | string;
	per_page?: number | string;
	searchValue?: string;
	categoryFilter?: string;
}

interface MigrationSource {
	id: string;
	label: string;
	count: number;
	plugin_file: string;
	forms: Array<{ already_migrated: boolean }>;
}

interface MigrationResult {
	migrated: number;
	skipped: number;
	errors: string[];
	posts_updated?: number;
	references_updated?: number;
}

const open = (hash: string) => {
	window.location.hash = hash;
};

/**
 * The forms list: every form with its submission count, and the "new form" chooser.
 */
const Forms = () => {
	const [query, setQuery] = useState<TableQuery>({ paged: 1, per_page: 10 });
	const [list, setList] = useState<{ data: FormRow[]; total: number }>({
		data: [],
		total: 0,
	});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');
	const [reload, setReload] = useState(0);
	const [isChoosing, setIsChoosing] = useState(false);
	const [templateCategory, setTemplateCategory] = useState('all');
	const [isBusy, setIsBusy] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const [sources, setSources] = useState<MigrationSource[] | null>(null);
	const [isMigrating, setIsMigrating] = useState(false);
	const [isDeactivating, setIsDeactivating] = useState(false);

	// Checked once on load, so a detected plugin can be surfaced right on the forms list.
	const loadSources = () => {
		apiGet<{ data: MigrationSource[] }>('migration/sources')
			.then((payload) => setSources(payload.data))
			.catch(() => {});
	};

	useEffect(loadSources, []);

	const detectedSources = (sources ?? []).filter((source) => source.count > 0);

	// Still-active plugins with at least one already-migrated form - shown until the plugin itself
	// is deactivated (plugin_file goes empty), so this survives reloads, not just this page visit.
	const migratedSources = (sources ?? []).filter(
		(source) => source.plugin_file && source.forms.some((form) => form.already_migrated)
	);

	// Categories in first-seen order, each with how many templates it holds.
	const templateCategories = vuloformAppLocalizer.templates.reduce<
		Array<{ id: string; label: string; count: number }>
	>((categories, template) => {
		const existing = categories.find((category) => category.label === template.category);

		if (existing) {
			existing.count++;
		} else {
			categories.push({ id: template.category, label: template.category, count: 1 });
		}

		return categories;
	}, []);

	const visibleTemplates =
		'all' === templateCategory
			? vuloformAppLocalizer.templates
			: vuloformAppLocalizer.templates.filter(
					(template) => template.category === templateCategory
				);

	const onQueryUpdate = useCallback((next: TableQuery) => setQuery(next), []);

	useEffect(() => {
		let cancelled = false;

		setIsLoading(true);

		apiGet<{ data: FormRow[]; total: number }>('forms', {
			search: query.searchValue || undefined,
			page: query.paged,
			per_page: query.per_page,
		})
			.then((data) => {
				if (!cancelled) {
					setList(data);
					setError('');
				}
			})
			.catch((e) => !cancelled && setError(errorMessage(e)))
			.finally(() => !cancelled && setIsLoading(false));

		return () => {
			cancelled = true;
		};
	}, [query, reload]);

	const create = (body: Record<string, unknown>) => {
		setIsBusy(true);

		apiPost<Form>('forms', body)
			.then((form) => open(`&tab=forms&form=${form.id}`))
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setIsBusy(false));
	};

	const importFile = (file: File | undefined) => {
		if (!file) {
			return;
		}

		file.text()
			.then((text) => {
				const parsed = JSON.parse(text);

				// The server rebuilds the schema field by field, so a hand-edited file is safe to send.
				create({ title: parsed.title, schema: parsed.schema });
			})
			.catch(() =>
				notify(
					'error',
					__('That file is not a VuloForm export.', 'vuloform')
				)
			);
	};

	/** Migrates every detected source straight away - no picker, no popup. */
	const migrateDetected = () => {
		if (0 === detectedSources.length) {
			return;
		}

		setIsMigrating(true);

		const migratingSources = detectedSources;

		Promise.all(
			migratingSources.map((source) =>
				apiPost<MigrationResult>('migration/run', { source: source.id })
			)
		)
			.then((results) => {
				const migrated = results.reduce((total, result) => total + result.migrated, 0);
				const errors = results.flatMap((result) => result.errors);

				if (migrated > 0) {
					notify(
						'success',
						sprintf(
							/* translators: %d: number of forms migrated. */
							_n('%d form migrated.', '%d forms migrated.', migrated, 'vuloform'),
							migrated
						)
					);
					setReload((n) => n + 1);
				}

				if (errors.length > 0) {
					notify('error', errors.join(' '));
				}

				loadSources();
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setIsMigrating(false));
	};

	const deactivateMigratedSources = () => {
		if (0 === migratedSources.length) {
			return;
		}

		setIsDeactivating(true);

		Promise.all(
			migratedSources.map((source) =>
				apiPost('migration/deactivate-source', { source: source.id })
			)
		)
			.then(() => {
				notify('success', __('Plugin deactivated.', 'vuloform'));
				loadSources();
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setIsDeactivating(false));
	};

	const duplicate = (row: FormRow) => {
		apiPost<Form>(`forms/${row.id}/duplicate`)
			.then(() => {
				notify('success', __('Form duplicated.', 'vuloform'));
				setReload((n) => n + 1);
			})
			.catch((e) => notify('error', errorMessage(e)));
	};

	const confirmDelete = () => {
		if (!pendingDelete) {
			return;
		}

		apiDelete(`forms/${pendingDelete.id}`)
			.then(() => {
				notify('success', __('Form deleted.', 'vuloform'));
				setReload((n) => n + 1);
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setPendingDelete(null));
	};

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="form"
				headerTitle={__('Forms', 'vuloform')}
				headerDescription={__(
					'Every form on your site. Build one, publish it, and add it to a page.',
					'vuloform'
				)}
				headerCustomContent={
					<ButtonInput
						buttons={{
							text: __('New form', 'vuloform'),
							icon: 'plus',
							onClick: () => setIsChoosing(true),
						}}
					/>
				}
			/>
			<ContainerComponent general>
				<CardComponent>
					{error ? (
						<ModuleGuardComponent
							icon="error"
							title={__('Could not load your forms', 'vuloform')}
							desc={error}
						/>
					) : !isLoading && 0 === list.total && !query.searchValue ? (
						detectedSources.length > 0 ? (
							<ModuleGuardComponent
								icon="import"
								iconColor="purple"
								className="vuloform-migration-guard"
								title={sprintf(
									/* translators: %s: comma-separated list of detected plugin names. */
									__('Bring your %s forms into VuloForm', 'vuloform'),
									detectedSources.map((source) => source.label).join(', ')
								)}
								desc={sprintf(
									/* translators: 1: number of forms found, 2: comma-separated list of detected plugin names. */
									_n(
										'%1$d form found in %2$s. Migrate copies it to VuloForm - %2$s stays untouched.',
										'%1$d forms found in %2$s. Migrate copies them to VuloForm - %2$s stays untouched.',
										detectedSources.reduce((total, source) => total + source.count, 0),
										'vuloform'
									),
									detectedSources.reduce((total, source) => total + source.count, 0),
									detectedSources.map((source) => source.label).join(', ')
								)}
								buttonText={isMigrating ? __('Migrating…', 'vuloform') : __('Migrate now', 'vuloform')}
								onButtonClick={migrateDetected}
							/>
						) : (
							<ModuleGuardComponent
								icon="form"
								title={__('Create your first form', 'vuloform')}
								desc={__(
									'Start from a template such as a contact form, or from a blank form.',
									'vuloform'
								)}
								buttonText={__('New form', 'vuloform')}
								onButtonClick={() => setIsChoosing(true)}
							/>
						)
					) : (
						<>
							{detectedSources.length > 0 && (
								<div className="vuloform-migration-banner">
									<div>
										<strong>
											{sprintf(
												/* translators: %s: comma-separated list of detected plugin names. */
												__('Forms found in %s.', 'vuloform'),
												detectedSources.map((source) => source.label).join(', ')
											)}
										</strong>
										<span>
											{sprintf(
												/* translators: %d: number of forms found. */
												_n(
													'%d form can be migrated into VuloForm.',
													'%d forms can be migrated into VuloForm.',
													detectedSources.reduce((total, source) => total + source.count, 0),
													'vuloform'
												),
												detectedSources.reduce((total, source) => total + source.count, 0)
											)}
										</span>
									</div>
									<ButtonInput
										buttons={{
											text: isMigrating ? __('Migrating…', 'vuloform') : __('Migrate', 'vuloform'),
											icon: 'import',
											color: 'purple',
											disabled: isMigrating,
											onClick: migrateDetected,
										}}
									/>
								</div>
							)}
							{migratedSources.length > 0 && (
								<div className="vuloform-migration-banner vuloform-migration-success">
									<div>
										<strong>{__('Migration successful.', 'vuloform')}</strong>
										<span>
											{sprintf(
												/* translators: %s: comma-separated list of source plugin names. */
												__(
													'Your forms from %s now live in VuloForm too. You can deactivate it.',
													'vuloform'
												),
												migratedSources.map((source) => source.label).join(', ')
											)}
										</span>
									</div>
									<ButtonInput
										buttons={{
											text: isDeactivating
												? __('Deactivating…', 'vuloform')
												: __('Deactivate it', 'vuloform'),
											icon: 'trash',
											color: 'border-red',
											disabled: isDeactivating,
											onClick: deactivateMigratedSources,
										}}
									/>
								</div>
							)}
							<TableCard
							search={{
								placeholder: __('Search forms…', 'vuloform'),
							}}
							showMenu={false}
							headers={{
								title: {
									label: __('Form', 'vuloform'),
									render: (row: FormRow) => (
										<div className="vuloform-cell">
											<span className="vuloform-cell-title">
												{/* The number used in the shortcode and the block. */}
												<span className="vuloform-cell-number">#{row.id}</span>
												<a
													className="vuloform-cell-primary"
													href={`#&tab=forms&form=${row.id}`}
												>
													{row.title}
												</a>
												{'published' === row.status ? (
													<BadgeComponent
														color="green"
														text={__(
															'Published',
															'vuloform'
														)}
													/>
												) : (
													<BadgeComponent
														color="yellow"
														text={__('Draft', 'vuloform')}
													/>
												)}
												{0 === row.submissions && (
													<BadgeComponent
														color="blue"
														text={__(
															'No submissions',
															'vuloform'
														)}
													/>
												)}
											</span>
											<span className="vuloform-cell-secondary">
												{sprintf(
													/* translators: %s: date and time. */
													__('Edited %s', 'vuloform'),
													row.updated_at_display
												)}
											</span>
										</div>
									),
								},
								shortcode: {
									label: __('Shortcode', 'vuloform'),
									render: (row: FormRow) => (
										<code className="vuloform-cell-shortcode">
											{`[vuloform id="${row.id}"]`}
										</code>
									),
								},
								id: {
									label: __('Actions', 'vuloform'),
									type: 'action',
									actions: [
										{
											label: __('Edit', 'vuloform'),
											icon: 'edit',
											color: 'text-purple',
											type: 'button',
											onClick: (row: Record<string, unknown>) =>
												open(`&tab=forms&form=${(row as unknown as FormRow).id}`),
										},
										{
											label: __('Duplicate', 'vuloform'),
											icon: 'copy',
											color: 'text-purple',
											type: 'button',
											onClick: (row: Record<string, unknown>) =>
												duplicate(row as unknown as FormRow),
										},
										{
											label: __('Delete', 'vuloform'),
											icon: 'delete',
											color: 'text-red',
											type: 'button',
											onClick: (row: Record<string, unknown>) =>
												setPendingDelete(row as unknown as FormRow),
										},
									],
								},
							}}
							rows={list.data}
							ids={list.data.map((row) => row.id)}
							totalRows={list.total}
							isLoading={isLoading}
							onQueryUpdate={onQueryUpdate}
							emptyMessage={__(
								'No forms match your search.',
								'vuloform'
							)}
						/>
						</>
					)}
				</CardComponent>
			</ContainerComponent>
			<PopupComponent
				open={isChoosing}
				onClose={() => setIsChoosing(false)}
				width={68}
				height="auto"
				position="lightbox"
				header={{
					icon: 'form',
					title: __('Start a new form', 'vuloform'),
				}}
			>
				<div className="vuloform-popup-body">
					<div className="vuloform-template-picker">
						<div className="vuloform-template-categories">
							<button
								type="button"
								className={
									'all' === templateCategory
										? 'vuloform-template-category is-active'
										: 'vuloform-template-category'
								}
								onClick={() => setTemplateCategory('all')}
							>
								{__('All templates', 'vuloform')}
								<span>{vuloformAppLocalizer.templates.length}</span>
							</button>
							{templateCategories.map((category) => (
								<button
									type="button"
									key={category.id}
									className={
										category.id === templateCategory
											? 'vuloform-template-category is-active'
											: 'vuloform-template-category'
									}
									onClick={() => setTemplateCategory(category.id)}
								>
									{category.label}
									<span>{category.count}</span>
								</button>
							))}
						</div>
						<div className="vuloform-templates">
							<button
								type="button"
								className="vuloform-template"
								disabled={isBusy}
								onClick={() => create({})}
							>
								<i className="adminfont-plus" aria-hidden="true" />
								<strong>{__('Blank form', 'vuloform')}</strong>
								<span>
									{__('Start with an empty canvas.', 'vuloform')}
								</span>
							</button>
							{visibleTemplates.map((template) => (
								<button
									type="button"
									className="vuloform-template"
									key={template.id}
									disabled={isBusy}
									onClick={() =>
										create({ template: template.id })
									}
								>
									<i
										className={`adminfont-${template.icon}`}
										aria-hidden="true"
									/>
									<strong>{template.title}</strong>
									<span>{template.desc}</span>
								</button>
							))}
						</div>
					</div>
					<div className="vuloform-form-footer">
						<input
							ref={fileInput}
							type="file"
							accept="application/json,.json"
							hidden
							onChange={(event) =>
								importFile(event.target.files?.[0])
							}
						/>
						<ButtonInput
							buttons={{
								text: __('Import a form (.json)', 'vuloform'),
								icon: 'import',
								color: 'purple',
								disabled: isBusy,
								onClick: () => fileInput.current?.click(),
							}}
						/>
					</div>
				</div>
			</PopupComponent>
			<PopupComponent
				open={Boolean(pendingDelete)}
				onClose={() => setPendingDelete(null)}
				width={30}
				height="auto"
				position="lightbox"
				header={{
					icon: 'delete',
					title: __('Delete this form?', 'vuloform'),
				}}
			>
				<div className="vuloform-popup-body">
					<p>
						{sprintf(
							/* translators: 1: form title, 2: number of submissions. */
							_n(
								'"%1$s" and its %2$d submission, including any uploaded files, will be permanently deleted.',
								'"%1$s" and its %2$d submissions, including any uploaded files, will be permanently deleted.',
								pendingDelete?.submissions ?? 0,
								'vuloform'
							),
							pendingDelete?.title ?? '',
							pendingDelete?.submissions ?? 0
						)}
					</p>
					<div className="vuloform-form-footer">
						<ButtonInput
							buttons={[
								{
									text: __('Keep form', 'vuloform'),
									color: 'purple',
									onClick: () => setPendingDelete(null),
								},
								{
									text: __('Delete form', 'vuloform'),
									icon: 'delete',
									color: 'border-red',
									onClick: confirmDelete,
								},
							]}
						/>
					</div>
				</div>
			</PopupComponent>
		</>
	);
};

export default Forms;