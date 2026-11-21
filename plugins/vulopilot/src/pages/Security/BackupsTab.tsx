/* global vulopilotAppLocalizer */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import {
	BadgeComponent,
	CardComponent,
	ModuleGuardComponent,
	NoticeComponent,
	NoticeManager,
	PopupComponent,
	TypographyComponent,
	ContainerComponent
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { TableCard } from '@zyra/table';
import { useApiList } from '../../services/useApiList';
import { formatWpDate } from '../../services/formatWpDate';
import ShowProPopup from '../../components/Popup/Popup';
import './ProtectMySite.scss';
import { columns } from '../../services/tableColumns';
import type { QueryProps } from '@zyra/table';

interface BackupRow {
	id: number;
	status: 'queued' | 'running' | 'completed' | 'failed';
	trigger_type: 'manual' | 'scheduled' | 'pre_restore_safety';
	has_file: boolean;
	file_size: number | null;
	/** 'local' or the remote destination active when this backup finished. */
	destination: 'local' | 's3' | 'google_drive';
	/** Null for a 'local'-only row (nothing else to track). */
	destination_status: 'uploading' | 'uploaded' | 'failed' | 'skipped_not_configured' | null;
	destination_error: string | null;
	started_at: string | null;
	finished_at: string | null;
	error_message: string | null;
	created_at: string;
}

const STATUS_BADGE: Record<string, { text: string; className: string }> = {
	queued: { text: __('Queued', 'vulopilot'), className: 'indigo' },
	running: { text: __('Running', 'vulopilot'), className: 'orange' },
	completed: { text: __('Completed', 'vulopilot'), className: 'green' },
	failed: { text: __('Failed', 'vulopilot'), className: 'red' },
};

const STATUS_ICON: Record<string, string> = {
	queued: 'clock',
	running: 'update',
	completed: 'check',
	failed: 'error',
};

/** Real HH:MM:SS between two real timestamps. */
const formatDuration = (startIso: string, endIso: string): string => {
	const totalSeconds = Math.max(
		0,
		Math.round(
			(new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000
		)
	);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (value: number) => String(value).padStart(2, '0');

	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

/** Real "Finished in/Failed after/Elapsed" sub-line under the Status badge. */
const statusSubtext = (row: BackupRow): string | null => {
	if ('completed' === row.status && row.started_at && row.finished_at) {
		return sprintf(
			/* translators: %s: real HH:MM:SS duration this backup took to finish. */
			__('Finished in %s', 'vulopilot'),
			formatDuration(row.started_at, row.finished_at)
		);
	}

	if ('failed' === row.status && row.started_at && row.finished_at) {
		return sprintf(
			/* translators: %s: real HH:MM:SS duration until this backup failed. */
			__('Failed after %s', 'vulopilot'),
			formatDuration(row.started_at, row.finished_at)
		);
	}

	if ('running' === row.status && row.started_at) {
		return sprintf(
			/* translators: %s: real HH:MM:SS elapsed so far. */
			__('Elapsed: %s', 'vulopilot'),
			formatDuration(row.started_at, new Date().toISOString())
		);
	}

	return null;
};

const TRIGGER_LABEL: Record<string, string> = {
	manual: __('Manual', 'vulopilot'),
	scheduled: __('Scheduled', 'vulopilot'),
	pre_restore_safety: __('Pre-restore safety snapshot', 'vulopilot'),
};

const DESTINATION_PROVIDER_LABEL: Record<string, string> = {
	s3: __('Amazon S3', 'vulopilot'),
	google_drive: __('Google Drive', 'vulopilot'),
};

/** A real remote destination's own upload badge - `null` for a `'local'` row. */
const destinationBadge = (
	row: BackupRow
): { text: string; className: string } | null => {
	if ('local' === row.destination || !row.destination) {
		return null;
	}

	const provider = DESTINATION_PROVIDER_LABEL[row.destination] ?? row.destination;

	switch (row.destination_status) {
		case 'uploading':
			return {
				/* translators: %s: real remote storage provider name. */
				text: sprintf(__('Uploading to %s…', 'vulopilot'), provider),
				className: 'orange',
			};
		case 'uploaded':
			return {
				/* translators: %s: real remote storage provider name. */
				text: sprintf(__('Uploaded to %s', 'vulopilot'), provider),
				className: 'green',
			};
		case 'failed':
			return {
				/* translators: %s: real remote storage provider name. */
				text: sprintf(__('%s upload failed', 'vulopilot'), provider),
				className: 'red',
			};
		case 'skipped_not_configured':
			return {
				/* translators: %s: real remote storage provider name. */
				text: sprintf(__('%s not configured', 'vulopilot'), provider),
				className: 'yellow',
			};
		default:
			return { text: provider, className: 'indigo' };
	}
};


/** Real file size, human-scaled. */
const formatFileSize = (bytes: number | null): string => {
	if (!bytes) {
		return '-';
	}

	const mb = bytes / (1024 * 1024);

	return mb >= 1
		? sprintf('%s MB', mb.toFixed(1))
		: sprintf('%s KB', (bytes / 1024).toFixed(0));
};

/** Typed-confirmation gate - Recovery's second safety net (the first is BackupManager::restore()'s own automatic pre-restore snapshot; the third is its real activity-log audit entry). */
const RESTORE_CONFIRM_PHRASE = 'RESTORE';

export interface BackupsTabHandle {
	/** Same real `handleCreate` this card's own "Create Backup Now" header button calls directly. */
	createBackup: () => void;
}

interface BackupsTabProps {
	/** Mirrors this card's own real `isCreating` state out to a parent. */
	// eslint-disable-next-line no-unused-vars
	onCreatingChange?: (isCreating: boolean) => void;
}

/** "Backups" tab of "Protect My Site" - real backup creation, listing, download, delete. */
const BackupsTab = forwardRef<BackupsTabHandle, BackupsTabProps>(({
	onCreatingChange,
}, ref) => {
	const { data, isLoading, error, refetch } = useApiList<BackupRow>(
		'backups',
		{ per_page: 20, orderby: 'id', order: 'desc' }
	);

	// Real "Create Backup Now" state for this card's own header button below.
	const [isCreating, setIsCreating] = useState(false);
	const [busyId, setBusyId] = useState<number | null>(null);
	const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);
	const [confirmText, setConfirmText] = useState('');
	const [isRestoring, setIsRestoring] = useState(false);
	/** Row pending deletion, shown via the `confirmMode` popup below instead of `window.confirm()`. */
	const [deleteTarget, setDeleteTarget] = useState<BackupRow | null>(null);

	// Real "All triggers"/"All statuses"/"All destinations" filters + search.
	const [searchValue, setSearchValue] = useState('');
	const [triggerFilter, setTriggerFilter] = useState('');
	const [statusFilter, setStatusFilter] = useState('');
	const [destinationFilter, setDestinationFilter] = useState('');

	const filteredData = data.filter((row) => {
		if (triggerFilter && row.trigger_type !== triggerFilter) {
			return false;
		}
		if (statusFilter && row.status !== statusFilter) {
			return false;
		}
		if (destinationFilter && row.destination !== destinationFilter) {
			return false;
		}
		if (
			searchValue &&
			!(TRIGGER_LABEL[row.trigger_type] ?? row.trigger_type)
				.toLowerCase()
				.includes(searchValue.toLowerCase()) &&
			!formatWpDate(row.created_at)
				.toLowerCase()
				.includes(searchValue.toLowerCase())
		) {
			return false;
		}
		return true;
	});

	// Real, already-present values in this tab's own current backup list.
	const triggerFilterOptions = Array.from(
		new Set(data.map((row) => row.trigger_type))
	).map((value) => ({ label: TRIGGER_LABEL[value] ?? value, value }));
	const statusFilterOptions = Array.from(
		new Set(data.map((row) => row.status))
	).map((value) => ({ label: STATUS_BADGE[value]?.text ?? value, value }));
	const destinationFilterOptions = Array.from(
		new Set(data.map((row) => row.destination))
	).map((value) => ({
		label:
			'local' === value
				? __('Local', 'vulopilot')
				: (DESTINATION_PROVIDER_LABEL[value] ?? value),
		value,
	}));

	const hasPendingBackup = data.some(
		(row) => 'queued' === row.status || 'running' === row.status
	);

	/** Real live-refresh while a backup is queued/running. */
	useEffect(() => {
		if (!hasPendingBackup) {
			return;
		}

		const intervalId = window.setInterval(() => refetch({ silent: true }), 5000);

		return () => window.clearInterval(intervalId);
	}, [hasPendingBackup, refetch]);

	const handleCreate = () => {
		setIsCreating(true);
		onCreatingChange?.(true);

		sendApiResponse<{ success: boolean }>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, 'backups'),
			{}
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: 'vulopilot-backup-create',
					type: response?.success ? 'success' : 'error',
					position: 'float',
					message: response?.success
						? __(
								'Backup started - this runs in the background and will appear below as it progresses.',
								'vulopilot'
							)
						: __(
								'Could not start the backup. Please try again.',
								'vulopilot'
							),
				});
				refetch();
			})
			.finally(() => {
				setIsCreating(false);
				onCreatingChange?.(false);
			});
	};

	useImperativeHandle(ref, () => ({ createBackup: handleCreate }));

	const handleDownload = (row: BackupRow) => {
		// Real browser navigation, not an XHR.
		const baseUrl = getApiLink(vulopilotAppLocalizer, `backups/${row.id}/download`);
		const separator = baseUrl.includes('?') ? '&' : '?';
		window.open(`${baseUrl}${separator}_wpnonce=${vulopilotAppLocalizer.nonce}`, '_blank');
	};

	/** Opens the `confirmMode` popup. */
	const handleDelete = (row: BackupRow) => {
		setDeleteTarget(row);
	};

	const handleConfirmDelete = () => {
		if (!deleteTarget) {
			return;
		}

		const row = deleteTarget;
		setDeleteTarget(null);
		setBusyId(row.id);

		fetch(`${getApiLink(vulopilotAppLocalizer, 'backups')}/${row.id}`, {
			method: 'DELETE',
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `vulopilot-backup-delete-${row.id}`,
					type: response.ok ? 'success' : 'error',
					position: 'float',
					message: response.ok
						? __('Backup deleted.', 'vulopilot')
						: __('Could not delete this backup. Please try again.', 'vulopilot'),
				});

				if (response.ok) {
					refetch();
				}
			})
			.finally(() => setBusyId(null));
	};

	const handleRestoreConfirmed = () => {
		if (!restoreTarget) {
			return;
		}

		setIsRestoring(true);

		sendApiResponse<{ success: boolean; message?: string }>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, `backups/${restoreTarget.id}/restore`),
			{}
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `vulopilot-backup-restore-${restoreTarget.id}`,
					type: response?.success ? 'success' : 'error',
					position: 'float',
					message: response?.success
						? __(
								'Restore complete. A safety snapshot of the previous state was taken automatically before this restore ran.',
								'vulopilot'
							)
						: response?.message ||
							__(
								'Restore failed - the site was not changed. Check the error above and try again.',
								'vulopilot'
							),
				});

				if (response?.success) {
					refetch();
				}
			})
			.finally(() => {
				setIsRestoring(false);
				setRestoreTarget(null);
				setConfirmText('');
			});
	};

	if (error) {
		return (
			<CardComponent
				title={__('Backups', 'vulopilot')}
				titleIcon="error"
				desc={__('Database and file backups for this site.', 'vulopilot')}
			>
				<ModuleGuardComponent
					icon="error"
					title={__('Could not load backups', 'vulopilot')}
					desc={error}
				/>
			</CardComponent>
		);
	}

	return (
		<>
		<ContainerComponent>
			<CardComponent
				title={__('Backups', 'vulopilot')}
				titleIcon="cloud-upload"
				desc={__(
					'Real database + file archives, always stored on this server - also uploaded to Amazon S3/Google Drive if you set a remote destination in Settings.',
					'vulopilot'
				)}
				isLoading={isLoading || undefined}
			>
				{!isLoading && 0 === data.length ? (
					<ModuleGuardComponent
						icon="cloud-upload"
						title={__('No backups yet', 'vulopilot')}
						desc={__(
							'Create one to get started.',
							'vulopilot'
						)}
						buttonText={
							isCreating
								? __('Starting…', 'vulopilot')
								: __('Create Backup Now', 'vulopilot')
						}
						onButtonClick={isCreating ? undefined : handleCreate}
					/>
				) : (
					<TableCard
						showMenu={false}
						hideHeader={true}
						variant="transparent"
						search={{
							placeholder: __('Search backups…', 'vulopilot'),
						}}
						filtersBeforeSearch
						// Real toolbar order - puts "Create Backup Now" after the search box instead of up in the card's own header.
						buttonActions={[
							{
								label: isCreating
									? __('Starting…', 'vulopilot')
									: __('Create Backup Now', 'vulopilot'),
								icon: isCreating ? 'update' : 'cloud-upload',
								color: 'purple-bg',
								onClick: () => {
									if (!isCreating) {
										handleCreate();
									}
								},
							},
						]}
						filters={[
							{
								key: 'trigger_type',
								label: __('All triggers', 'vulopilot'),
								type: 'select',
								size: 10,
								options: triggerFilterOptions,
							},
							{
								key: 'status',
								label: __('All statuses', 'vulopilot'),
								type: 'select',
								size: 10,
								options: statusFilterOptions,
							},
							{
								key: 'destination',
								label: __('All destinations', 'vulopilot'),
								type: 'select',
								size: 10,
								options: destinationFilterOptions,
							},
						]}
						onQueryUpdate={(query: QueryProps) => {
							setSearchValue(query.searchValue ?? '');
							// Single-choice filters: each value is one string.
							setTriggerFilter((query.filter?.trigger_type as string) ?? '');
							setStatusFilter((query.filter?.status as string) ?? '');
							setDestinationFilter((query.filter?.destination as string) ?? '');
						}}
						headers={columns({
							date: {
								label: __('Date', 'vulopilot'),
								type: 'info',
								key: 'formattedDate',
								descriptionKey: 'rowDescriptions',
								iconKey: 'rowIcon',
								badgesKey: 'rowBadges',
								width: "60%",
							},
							destination: {
								label: __('Destination', 'vulopilot'),
								render: (row: BackupRow) => {
									const destBadge = destinationBadge(row);

									return destBadge ? (
										<>
										<span className="file-size">
											<BadgeComponent
												color={destBadge.className}
												text={destBadge.text}
											/>
											{formatFileSize(row.file_size)}
											{'failed' === row.destination_status &&
												row.destination_error && (
													<NoticeComponent
														type="error"
														displayPosition="inline"
														message={row.destination_error}
													/>
												)}
												</span>
										</>
									) : (
										<span className="file-size-wrapper">
											<TypographyComponent variant={'h6'} >{__('Local', 'vulopilot')}</TypographyComponent>
											<div className='file-size'>{formatFileSize(row.file_size)}</div>
										</span>
									);
								},
							},
							action: {
								label: __('Action', 'vulopilot'),
								// Button actions, not icon-only/badges.
								type: 'action',
								actions: [
									{
										label: __('Download', 'vulopilot'),
										type: 'button',
										icon: 'download',
										color: 'text-green',
										hidden: (row) =>
											!(
												'completed' ===
													(row as unknown as BackupRow)?.status &&
												(row as unknown as BackupRow)?.has_file
											),
										onClick: (row) =>
											handleDownload(row as unknown as BackupRow),
									},
									{
										label: __('Restore', 'vulopilot'),
										type: 'button',
										color: 'text-blue',
										icon: 'undo',
										hidden: (row) =>
											!(
												'completed' ===
													(row as unknown as BackupRow)?.status &&
												(row as unknown as BackupRow)?.has_file
											),
										onClick: (row) =>
											setRestoreTarget(row as unknown as BackupRow),
									},
									{
										label: (row) =>
											busyId === (row as unknown as BackupRow)?.id
												? __('Deleting…', 'vulopilot')
												: __('Delete', 'vulopilot'),
										color: 'text-red',
										type: 'button',
										icon: (row) =>
											busyId === (row as unknown as BackupRow)?.id
												? 'update'
												: 'delete',
										onClick: (row) => {
											const backupRow = row as unknown as BackupRow;

											if (busyId !== backupRow.id) {
												handleDelete(backupRow);
											}
										},
									},
								],
							},
						})}
						rows={filteredData.map((row) => {
							// Real trigger/status badges + the same real "Finished in/Failed after/Elapsed" subtext `statusSubtext()` already computes.
							const statusBadge =
								STATUS_BADGE[row.status] ?? STATUS_BADGE.queued;
							const subtext = statusSubtext(row);
							const rowDescriptions: {
								value: string;
								icon?: string;
							}[] = [];

							if (subtext) {
								rowDescriptions.push({ value: subtext });
							}
							if ('failed' === row.status && row.error_message) {
								rowDescriptions.push({
									icon: 'error',
									value: row.error_message,
								});
							}

							return {
								...row,
								formattedDate: formatWpDate(row.created_at),
								rowIcon: 'calendar',
								rowDescriptions,
								rowBadges: [
									{
										text:
											TRIGGER_LABEL[row.trigger_type] ??
											row.trigger_type,
										color: 'indigo',
									},
									{
										text: statusBadge.text,
										color: statusBadge.className,
										icon: STATUS_ICON[row.status] ?? 'clock',
									},
								],
							};
						})}
						ids={filteredData.map((row) => row.id)}
						totalRows={filteredData.length}
						isLoading={isLoading}
						emptyMessage={__(
							'No backups match these filters.',
							'vulopilot'
						)}
					/>
				)}
			</CardComponent>

			<PopupComponent
				open={null !== restoreTarget}
				onClose={() => {
					setRestoreTarget(null);
					setConfirmText('');
				}}
				width={28}
				height="auto"
				position="lightbox"
			>
				<div className="backups-restore-confirm">
					<h3>{__('Restore this backup?', 'vulopilot')}</h3>
					<p>
						{__(
							'This overwrites your current database and files with the state captured in this backup. A safety snapshot of your current state is taken automatically first, but this action itself cannot be undone once it starts.',
							'vulopilot'
						)}
					</p>
					<p>
						{sprintf(
							/* translators: %s is the literal confirmation phrase the admin must type. */
							__('Type %s to confirm.', 'vulopilot'),
							RESTORE_CONFIRM_PHRASE
						)}
					</p>
					<input
						type="text"
						className="backups-restore-confirm-input"
						value={confirmText}
						onChange={(event) => setConfirmText(event.target.value)}
						placeholder={RESTORE_CONFIRM_PHRASE}
					/>
					<div className="backups-restore-confirm-actions">
						<ButtonInput
							buttons={{
								text: __('Cancel', 'vulopilot'),
								icon: 'close',
								color: 'border-purple',
								onClick: () => {
									setRestoreTarget(null);
									setConfirmText('');
								},
							}}
						/>
						<ButtonInput
							buttons={{
								text: isRestoring
									? __('Restoring…', 'vulopilot')
									: __('Restore', 'vulopilot'),
								icon: 'undo',
								onClick: handleRestoreConfirmed,
								disabled:
									isRestoring ||
									confirmText !== RESTORE_CONFIRM_PHRASE,
							}}
						/>
					</div>
				</div>
			</PopupComponent>

			<PopupComponent
				position="lightbox"
				open={null !== deleteTarget}
				onClose={() => setDeleteTarget(null)}
				width={31.25}
				height="auto"
			>
				<ShowProPopup
					confirmMode
					title={__('Delete Backup', 'vulopilot')}
					confirmMessage={__('Delete this backup? This cannot be undone.', 'vulopilot')}
					confirmYesText={__('Delete', 'vulopilot')}
					confirmNoText={__('Cancel', 'vulopilot')}
					onConfirm={handleConfirmDelete}
					onCancel={() => setDeleteTarget(null)}
				/>
			</PopupComponent>
		</ContainerComponent>
		</>
	);
});

BackupsTab.displayName = 'BackupsTab';

export default BackupsTab;
