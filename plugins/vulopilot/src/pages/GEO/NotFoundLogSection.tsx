/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import {
	CardComponent,
	ColumnComponent,
	ModuleGuardComponent,
	NoticeManager,
	PopupComponent,
	ContainerComponent,
	FormGroupWrapperComponent,
	FormGroupComponent
} from '@zyra/components';
import { ButtonInput, TextInput } from '@zyra/inputs';
import { TableCard, TableRow } from '@zyra/table';
import { useApiList } from '../../services/useApiList';
import { formatWpDate } from '../../services/formatWpDate';
import ShowProPopup from '../../components/Popup/Popup';
import { columns } from '../../services/tableColumns';

/** `wp_vulopilot_not_found_logs` rows - NotFoundLogger's own real 404 visit log. */
interface NotFoundLogRow extends TableRow {
	id: number;
	requested_path: string;
	referrer: string | null;
	hit_count: number;
	last_seen_at: string;
	// AbstractRepository's `SELECT *` comes back through $wpdb as a numeric STRING, not a real number/boolean.
	is_system: 0 | 1 | '0' | '1';
	// NotFoundLogs::get_items() computes this - a real PHP bool, not a `$wpdb`-string field.
	has_redirect: boolean;
	// NotFoundLogs::get_items() computes this per request - a live count, not a stored column.
	inlink_count: number;
	// The referrer this 404 was FIRST seen from - falls back to the most recent referrer for rows older than this column.
	first_referrer: string | null;
}

/** See NotFoundLogRow.is_system's own comment. */
const isSystemLog = (row: Pick<NotFoundLogRow, 'is_system'>): boolean =>
	1 === Number(row.is_system);

/** "404s" inner section of the merged "Crawl & URLs" tab. */
const NotFoundLogSection = () => {
	const [convertingLog, setConvertingLog] = useState<NotFoundLogRow | null>(
		null
	);
	const [convertTargetUrl, setConvertTargetUrl] = useState('');
	const [isConverting, setIsConverting] = useState(false);

	const [bulkDismissIds, setBulkDismissIds] = useState<(string | number)[] | null>(null);
	const [isBulkApplying, setIsBulkApplying] = useState(false);

	const [sortBy, setSortBy] = useState<'hit_count' | 'last_seen_at'>('hit_count');

	// "All/Content/System" status pill bar.
	const notFoundLogs = useApiList<NotFoundLogRow>(
		'not-found-logs',
		{ orderby: sortBy, order: 'desc' },
		{
			key: 'is_system',
			options: [
				{ label: __('All', 'vulopilot'), value: 'all' },
				{ label: __('Content', 'vulopilot'), value: '0' },
				{ label: __('System', 'vulopilot'), value: '1' },
			],
		}
	);

	const handleDismissLog = (row: NotFoundLogRow) => {
		sendApiResponse(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, `not-found-logs/${row.id}/delete`),
			{}
		).then((response) => {
			if (response) {
				notFoundLogs.refetch();
			}
		});
	};

	const handleBulkActionApply = (action: string, selectedIds: (string | number)[]) => {
		if (!selectedIds.length) {
			return;
		}

		if ('dismiss' === action) {
			setBulkDismissIds(selectedIds);
		}
	};

	const handleConfirmBulkDismiss = async () => {
		if (!bulkDismissIds) {
			return;
		}

		const ids = bulkDismissIds;

		setBulkDismissIds(null);
		setIsBulkApplying(true);

		let failed = 0;

		for (const id of ids) {
			try {
				const response = await sendApiResponse(
					vulopilotAppLocalizer,
					getApiLink(vulopilotAppLocalizer, `not-found-logs/${id}/delete`),
					{}
				);

				if (!response) {
					failed++;
				}
			} catch {
				failed++;
			}
		}

		NoticeManager.add({
			uniqueKey: 'vulopilot-not-found-log-bulk-dismiss',
			type: failed ? 'error' : 'success',
			position: 'float',
			message: failed
				? sprintf(
					/* translators: %d: number of log entries that failed to dismiss. */
					_n('%d entry could not be dismissed.', '%d entries could not be dismissed.', failed, 'vulopilot'),
					failed
				)
				: __('Selected entries dismissed.', 'vulopilot'),
		});

		notFoundLogs.refetch();
		setIsBulkApplying(false);
	};

	const openConvertPopup = (row: NotFoundLogRow) => {
		if (isSystemLog(row) || row.has_redirect) {
			// Belt-and-braces - the row action itself is already disabled for a system row or one that already has a matching redirect.
			return;
		}

		setConvertingLog(row);
		setConvertTargetUrl('');
	};

	const closeConvertPopup = () => {
		setConvertingLog(null);
		setConvertTargetUrl('');
	};

	const handleConvertLog = () => {
		if (!convertingLog || '' === convertTargetUrl.trim()) {
			return;
		}

		setIsConverting(true);

		sendApiResponse(
			vulopilotAppLocalizer,
			getApiLink(
				vulopilotAppLocalizer,
				`not-found-logs/${convertingLog.id}/convert`
			),
			{ target_url: convertTargetUrl }
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-log-convert',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __(
							'Redirect created from this log entry.',
							'vulopilot'
						)
						: __(
							'Could not create a redirect - a redirect for this path may already exist.',
							'vulopilot'
						),
				});

				if (response) {
					closeConvertPopup();
					notFoundLogs.refetch();
				}
			})
			.finally(() => setIsConverting(false));
	};

	return (
		<ContainerComponent>
			<ColumnComponent>
				<CardComponent
					title={__('404 Log', 'vulopilot')}
					titleIcon="link"
					desc={__(
						'Every real 404 this site has seen, both missing content pages and theme/plugin/core-file/asset requests (a stale cached bundle, a removed theme asset, a browser probing a well-known path) - told apart by the "Type" column and filterable by the pills above the table. Only a content-page 404 can be turned into a redirect; nobody redirects a broken theme file.',
						'vulopilot'
					)}
				>
					{notFoundLogs.error ? (
						<ModuleGuardComponent
							icon="error"
							title={__('Could not load the 404 log', 'vulopilot')}
							desc={notFoundLogs.error}
						/>
					) : (
						<TableCard
							search={{
								placeholder: __('Search missing URLs…', 'vulopilot'),
							}}
							hideHeader={true}
							filtersBeforeSearch
							filters={[
								{
									key: 'sort_by',
									label: __('Sort by', 'vulopilot'),
									type: 'select',
									size: 10,
									options: [
										{ label: __('Most hits', 'vulopilot'), value: 'hit_count' },
										{ label: __('Most recent', 'vulopilot'), value: 'last_seen_at' },
									],
								},
							]}
							headers={columns({
								requested_path: {
									key: 'requested_path',
									type: 'info',
									label: __('Requested URL', 'vulopilot'),
									iconKey: 'rowIcon',
									descriptionKey: 'descriptionItems',
									badgesKey: 'typeBadges',
								},
								inlink_count: {
									label: __('No. of all inlinks', 'vulopilot'),
									render: (row: Record<string, unknown>) => {
										const count = Number(
											(row as unknown as NotFoundLogRow).inlink_count || 0
										);

										return (
											<span className={count ? undefined : 'desc'}>
												{count}
											</span>
										);
									},
								},
								first_found_at: {
									label: __('First found at', 'vulopilot'),
									render: (row: Record<string, unknown>) => {
										const referrer = (row as unknown as NotFoundLogRow)
											.first_referrer;

										if (!referrer) {
											return (
												<span className="desc">
													{__(
														'No referrer found - likely a direct visit or a bookmark.',
														'vulopilot'
													)}
												</span>
											);
										}

										return (
											<a
												href={referrer}
												target="_blank"
												rel="noopener noreferrer"
											>
												{referrer}
											</a>
										);
									},
								},
								actions: {
									label: __('Actions', 'vulopilot'),
									// Real labelled buttons, same `type: 'button'` convention every other table's own action column now uses.
									type: 'action',
									actions: [

										{
											type: 'button',
											color: 'text-red',
											label: __('Dismiss', 'vulopilot'),
											icon: 'cross',
											onClick: (row: Record<string, unknown>) =>
												handleDismissLog(row as unknown as NotFoundLogRow),
										},
										{
											type: 'button',
											color: 'purple',
											label: (row: Record<string, unknown>) => {
												const logRow = row as unknown as NotFoundLogRow;

												if (isSystemLog(logRow)) {
													return __(
														"no redirect needed",
														'vulopilot'
													);
												}

												return logRow.has_redirect
													? __('Redirect exists', 'vulopilot')
													: __('Create redirect', 'vulopilot');
											},
											icon: (row: Record<string, unknown>) => {
												const logRow = row as unknown as NotFoundLogRow;

												return isSystemLog(logRow) || logRow.has_redirect
													? 'lock'
													: 'link';
											},
											onClick: (row: Record<string, unknown>) =>
												openConvertPopup(row as unknown as NotFoundLogRow),
										},
									],
								},
							})}
							rows={notFoundLogs.data.map((row) => ({
								...row,
								rowIcon:
									isSystemLog(row) || row.has_redirect
										? 'lock'
										: 'link',
								descriptionItems: [
									{
										icon: 'clock',
										value: sprintf(
											/* translators: %s: formatted date/time this URL was last requested. */
											__('Last seen %s', 'vulopilot'),
											formatWpDate(row.last_seen_at)
										),
									},
								],
								typeBadges: [
									{
										text: isSystemLog(row)
											? __('System', 'vulopilot')
											: __('Content', 'vulopilot'),
										color: isSystemLog(row) ? 'yellow' : 'blue',
									},
									{
										text: sprintf(
											/* translators: %d: real number of hits. */
											_n('%d hit', '%d hits', row.hit_count, 'vulopilot'),
											row.hit_count
										),
										color: 'blue',
									},
								],
							}))}
							ids={notFoundLogs.data.map((row) => row.id)}
							totalRows={notFoundLogs.total}
							// `is_system_counts` (NotFoundLogs.php) only ever reports real per- value buckets (0/1).
							categoryCounts={notFoundLogs.categoryCounts.map((cat) =>
								'all' === cat.value
									? { ...cat, count: notFoundLogs.total }
									: cat
							)}
							isLoading={notFoundLogs.isLoading || isBulkApplying}
							onQueryUpdate={(query) => {
								const nextSortBy = (query.filter as Record<string, string> | undefined)?.sort_by;

								setSortBy('last_seen_at' === nextSortBy ? 'last_seen_at' : 'hit_count');
								notFoundLogs.onQueryUpdate(query);
							}}
							bulkActions={[
								{ label: __('Dismiss', 'vulopilot'), value: 'dismiss' },
							]}
							onBulkActionApply={handleBulkActionApply}
							emptyMessage={
								<>
									{__(
										'No 404s logged yet - turn on "Log 404s" in ',
										'vulopilot'
									)}
									<a
										href={`${vulopilotAppLocalizer.admin_url}#&tab=settings&subtab=seo-content`}
										style={{
											color: 'var(--color-primary)',
											textDecoration: 'underline',
										}}
									>
										{__('Settings → Scanning → SEO', 'vulopilot')}
									</a>
									{__(
										' to start tracking missing-page visits.',
										'vulopilot'
									)}
								</>
							}
						/>
					)}
				</CardComponent>
			</ColumnComponent>

			<PopupComponent
				open={!!convertingLog}
				onClose={closeConvertPopup}
				width={28}
				height="50%"
				header={{
					title: __('Create redirect', 'vulopilot'),
				}}
				footer={
					<ButtonInput
						buttons={{
							text: __('Save', 'vulopilot'),
							icon: 'save',
							onClick: handleConvertLog,
							disabled:
								isConverting || '' === convertTargetUrl.trim(),
						}}
					/>
				}
			>
				<FormGroupWrapperComponent>
					<FormGroupComponent
						label={__('Old page url', 'vulopilot')}
					>
						<TextInput
							name="convert_source_path"
							inputLabel={__('From (path)', 'vulopilot')}
							placeholder={__('/old-page/', 'vulopilot')}
							value={convertingLog?.requested_path ?? ''}
							disabled
							onChange={() => { }}
						/>
					</FormGroupComponent>

					<FormGroupComponent
						label={__('New page url', 'vulopilot')}
					>
						<TextInput
							name="convert_target_url"
							inputLabel={__('To', 'vulopilot')}
							placeholder={__(
								'https://example.com/new-page/',
								'vulopilot'
							)}
							value={convertTargetUrl}
							onChange={(newValue) =>
								setConvertTargetUrl(newValue as string)
							}
						/>
					</FormGroupComponent>
				</FormGroupWrapperComponent>
			</PopupComponent>

			<PopupComponent
				position="lightbox"
				open={!!bulkDismissIds}
				onClose={() => setBulkDismissIds(null)}
				width={31.25}
				height="auto"
			>
				<ShowProPopup
					confirmMode
					title={__('Dismiss entries', 'vulopilot')}
					confirmMessage={sprintf(
						/* translators: %d: number of selected log entries. */
						_n(
							'Dismiss %d selected entry? This cannot be undone.',
							'Dismiss %d selected entries? This cannot be undone.',
							bulkDismissIds?.length ?? 0,
							'vulopilot'
						),
						bulkDismissIds?.length ?? 0
					)}
					confirmYesText={__('Dismiss', 'vulopilot')}
					confirmNoText={__('Cancel', 'vulopilot')}
					onConfirm={handleConfirmBulkDismiss}
					onCancel={() => setBulkDismissIds(null)}
				/>
			</PopupComponent>
		</ContainerComponent>
	);
};

export default NotFoundLogSection;
