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
	/** A plugin needs this form, so it can't be deleted. */
	protected?: boolean;
	/** Made from a one-per-site template, so it can't be copied. */
	single?: boolean;
	updated_at_display: string;
	[key: string]: unknown;
}

interface TableQuery {
	paged?: number | string;
	per_page?: number | string;
	searchValue?: string;
	categoryFilter?: string;
}

const open = (hash: string) => {
	window.location.hash = hash;
};

/**
 * The forms list: every form with its submission count, and the "new form" chooser.
 */
const Forms = () => {
	const [query, setQuery] = useState<TableQuery>({ paged: 1, per_page: 10 });
	const [list, setList] = useState<{
		data: FormRow[];
		total: number;
		categories?: { value: string; label: string; count: number }[];
	}>({
		data: [],
		total: 0,
	});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');
	const [reload, setReload] = useState(0);
	const [isChoosing, setIsChoosing] = useState(false);
	const [isBusy, setIsBusy] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<FormRow | null>(null);
	const [bulkDeleteIds, setBulkDeleteIds] = useState<number[]>([]);
	const fileInput = useRef<HTMLInputElement>(null);

	const onQueryUpdate = useCallback((next: TableQuery) => setQuery(next), []);

	useEffect(() => {
		let cancelled = false;

		setIsLoading(true);

		apiGet<{
			data: FormRow[];
			total: number;
			categories?: { value: string; label: string; count: number }[];
		}>('forms', {
			search: query.searchValue || undefined,
			plugin:
				query.categoryFilter && 'all' !== query.categoryFilter
					? query.categoryFilter
					: undefined,
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

	const confirmBulkDelete = () => {
		apiPost<{ deleted: number; skipped: number }>('forms/bulk-delete', {
			ids: bulkDeleteIds,
		})
			.then(({ deleted, skipped }) => {
				notify(
					'success',
					sprintf(
						/* translators: %d: number of forms. */
						_n('%d form deleted.', '%d forms deleted.', deleted, 'vuloform'),
						deleted
					) +
						(skipped > 0
							? ' ' +
							  sprintf(
									/* translators: %d: number of forms. */
									_n(
										'%d form was kept because a plugin needs it.',
										'%d forms were kept because a plugin needs them.',
										skipped,
										'vuloform'
									),
									skipped
							  )
							: '')
				);
				setReload((n) => n + 1);
			})
			.catch((e) => notify('error', errorMessage(e)))
			.finally(() => setBulkDeleteIds([]));
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
					) : (
						<TableCard
							search={{
								placeholder: __('Search forms…', 'vuloform'),
							}}
							showMenu={false}
							hideHeader
							categoryCounts={list.categories ?? []}
							activeCategory="all"
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
												<a href={`#&tab=submissions&form=${row.id}`}>
													<BadgeComponent
														color="blue"
														text={sprintf(
															/* translators: %d: number of submissions. */
															_n(
																'%d submission',
																'%d submissions',
																row.submissions,
																'vuloform'
															),
															row.submissions
														)}
													/>
												</a>
												{row.unread > 0 && (
													<BadgeComponent
														color="green"
														text={sprintf(
															/* translators: %d: number of unread submissions. */
															__('%d new', 'vuloform'),
															row.unread
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
								action: {
									key: 'action',
									type: 'action',
									label: __('Action', 'vuloform'),
									actions: [
										{
											label: __('Edit', 'vuloform'),
											icon: 'setting',
											onClick: (row: FormRow) =>
												open(`&tab=forms&form=${row.id}`),
										},
										{
											// The form's submissions, as a table.
											label: __('View submissions', 'vuloform'),
											icon: 'eye',
											onClick: (row: FormRow) =>
												open(`&tab=submissions&form=${row.id}`),
										},
										{
											label: __('Duplicate', 'vuloform'),
											icon: 'copy',
											// One-per-site and plugin-owned forms are not copied.
											hidden: (row: FormRow) =>
												Boolean(row.single || row.protected),
											onClick: (row: FormRow) => duplicate(row),
										},
										{
											label: __('Delete', 'vuloform'),
											icon: 'delete',
											// A form a plugin depends on can't be deleted.
											hidden: (row: FormRow) =>
												Boolean(row.protected),
											onClick: (row: FormRow) =>
												setPendingDelete(row),
										},
									],
								},
							}}
							bulkActions={[
								{
									label: __('Delete', 'vuloform'),
									value: 'delete',
								},
							]}
							onBulkActionApply={(action: string, ids: number[]) => {
								if ('delete' === action && ids.length) {
									setBulkDeleteIds(ids);
								}
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
					)}
				</CardComponent>
			</ContainerComponent>
			<PopupComponent
				open={isChoosing}
				onClose={() => setIsChoosing(false)}
				width={52}
				height="auto"
				position="lightbox"
				header={{
					icon: 'form',
					title: __('Start a new form', 'vuloform'),
				}}
			>
				<div className="vuloform-popup-body">
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
						{vuloformAppLocalizer.templates.map((template) => (
							<button
								type="button"
								className="vuloform-template"
								key={template.id}
								disabled={isBusy}
								onClick={() =>
									// One form per site: open it instead of making another.
									template.exists
										? open(`&tab=forms&form=${template.exists}`)
										: create({ template: template.id })
								}
							>
								<i
									className={`adminfont-${template.icon}`}
									aria-hidden="true"
								/>
								<strong>{template.title}</strong>
								<span>{template.desc}</span>
								{template.exists ? (
									<BadgeComponent
										color="green"
										text={__('Already created: open it', 'vuloform')}
									/>
								) : null}
								{template.plugin && (
									<BadgeComponent
										color="blue"
										text={sprintf(
											/* translators: %s: plugin name. */
											__('Needs %s', 'vuloform'),
											template.plugin
										)}
									/>
								)}
							</button>
						))}
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
			<PopupComponent
				open={bulkDeleteIds.length > 0}
				onClose={() => setBulkDeleteIds([])}
				width={30}
				height="auto"
				position="lightbox"
				header={{
					icon: 'delete',
					title: __('Delete these forms?', 'vuloform'),
				}}
			>
				<div className="vuloform-popup-body">
					<p>
						{sprintf(
							/* translators: %d: number of forms. */
							_n(
								'%d selected form and its submissions, including any uploaded files, will be permanently deleted.',
								'%d selected forms and their submissions, including any uploaded files, will be permanently deleted.',
								bulkDeleteIds.length,
								'vuloform'
							),
							bulkDeleteIds.length
						)}{' '}
						{__(
							'A form a plugin needs is kept.',
							'vuloform'
						)}
					</p>
					<div className="vuloform-form-footer">
						<ButtonInput
							buttons={[
								{
									text: __('Keep forms', 'vuloform'),
									color: 'purple',
									onClick: () => setBulkDeleteIds([]),
								},
								{
									text: __('Delete forms', 'vuloform'),
									icon: 'delete',
									color: 'border-red',
									onClick: confirmBulkDelete,
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
