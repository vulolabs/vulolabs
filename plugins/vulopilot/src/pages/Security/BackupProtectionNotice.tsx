/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import InfoBanner from '../../components/InfoBanner';
import { useApiList } from '../../services/useApiList';
import { formatWpDate, formatWpTime } from '../../services/formatWpDate';

const BACKUPS_TAB_HASH = '#&tab=site-health&subtab=backups';
const BACKUP_SETTINGS_HASH = '#&tab=settings&subtab=backups';

interface BackupRow {
	id: number;
	status: 'queued' | 'running' | 'completed' | 'failed';
	file_size: number | null;
	finished_at: string | null;
	created_at: string;
}

const FREQUENCY: Record<string, string> = {
	hourly: __('every hour', 'vulopilot'),
	twicedaily: __('twice a day', 'vulopilot'),
	daily: __('every day', 'vulopilot'),
	weekly: __('every week', 'vulopilot'),
	monthly: __('every month', 'vulopilot'),
};

const formatSize = (bytes: number): string =>
	bytes >= 1024 * 1024 * 1024
		? `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
		: bytes >= 1024 * 1024
		? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface BackupProtectionNoticeProps {
	/** Switches this page's own "Backups" tab in place instead of navigating. */
	onNavigateToBackups?: () => void;
}

/**
 * "Backup protection": whether automatic backups are on and how often (`GET /settings`), and the latest backup
 * (`GET /backups`). Off, it asks to turn them on; on, it shows the schedule. Both open the Backups tab.
 */
const BackupProtectionNotice = ({ onNavigateToBackups }: BackupProtectionNoticeProps = {}) => {
	const [settings, setSettings] = useState<{ enabled: boolean; frequency: string } | null>(null);
	const { data: backups, isLoading } = useApiList<BackupRow>('backups', { per_page: 5, orderby: 'id', order: 'desc' });

	useEffect(() => {
		getApiResponse<{ enable_automatic_backups?: string[]; backup_frequency?: string }>(
			getApiLink(vulopilotAppLocalizer, 'settings'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		).then((response) => {
			if (response) {
				setSettings({
					enabled: Array.isArray(response.enable_automatic_backups) && response.enable_automatic_backups.length > 0,
					frequency: response.backup_frequency ?? 'daily',
				});
			}
		});
	}, []);

	if (!settings || isLoading) {
		return null;
	}

	const viewBackups =
		onNavigateToBackups ??
		(() => {
			window.location.hash = BACKUPS_TAB_HASH;
		});
	const latest = backups.find((row) => 'completed' === row.status);
	const lastFailed = backups[0] && 'failed' === backups[0].status;
	const latestAt = latest ? (latest.finished_at ?? latest.created_at) : null;

	const meta = [
		<>
			<i className="adminfont-clock" aria-hidden="true" />
			{latestAt ? (
				<span>
					{__('Last backup', 'vulopilot')}{' '}
					<strong>
						{sprintf(
							/* translators: 1: date, 2: time. */
							__('%1$s, %2$s', 'vulopilot'),
							formatWpDate(latestAt),
							formatWpTime(latestAt)
						)}
					</strong>
					{latest?.file_size ? ` · ${formatSize(latest.file_size)}` : ''}
				</span>
			) : (
				<span>{__('No backup yet', 'vulopilot')}</span>
			)}
		</>,
	];

	if (lastFailed) {
		meta.push(
			<>
				<i className="adminfont-error" aria-hidden="true" />
				<span>{__('The most recent backup failed', 'vulopilot')}</span>
			</>
		);
	}

	if (settings.enabled) {
		return (
			<InfoBanner
				tone={lastFailed ? 'warn' : 'good'}
				icon={lastFailed ? 'error' : 'check'}
				title={__('Backup protection', 'vulopilot')}
				badge={
					<span className={`info-banner-pill ${lastFailed ? 'is-warn' : 'is-good'}`}>
						{sprintf(
							/* translators: %s: how often, e.g. "every day". */
							__('On · %s', 'vulopilot'),
							FREQUENCY[settings.frequency] ?? settings.frequency
						)}
					</span>
				}
				desc={__('Your site is backed up automatically, so you can restore it if an update or change goes wrong.', 'vulopilot')}
				meta={meta}
				actionLabel={__('View backups', 'vulopilot')}
				onAction={viewBackups}
			/>
		);
	}

	return (
		<InfoBanner
			tone="warn"
			icon="info"
			title={__('Backup protection', 'vulopilot')}
			badge={<span className="info-banner-pill is-warn">{__('Not enabled', 'vulopilot')}</span>}
			desc={__(
				'Your site is not backed up automatically. Turn on scheduled backups so one bad update can always be undone.',
				'vulopilot'
			)}
			meta={meta}
			actionLabel={__('Turn on backups', 'vulopilot')}
			onAction={() => {
				window.location.hash = BACKUP_SETTINGS_HASH;
			}}
			secondaryAction={{ label: __('View backups', 'vulopilot'), onClick: viewBackups }}
		/>
	);
};

export default BackupProtectionNotice;
