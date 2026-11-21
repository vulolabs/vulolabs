/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { IconComponent, NoticeManager, PopupComponent } from '@zyra/components';
import { ButtonInput, SelectInput } from '@zyra/inputs';
import './MigrationPanel.scss';

interface MigrationSource {
	id: string;
	label: string;
	count: number;
}

interface MigrationResult {
	migrated: number;
	skipped: number;
	errors: string[];
}

type ImportStatus = 'idle' | 'running' | 'completed' | 'failed';

/** The select box's per-option label. */
const sourceCountLabel = (source: MigrationSource): string =>
	sprintf(
		/* translators: 1: plugin name, 2: number of items found. */
		__('%1$s (%2$d item(s) found)', 'vulopilot'),
		source.label,
		source.count
	);

/**
 * Settings → Migration tab, built to the same "card row + wizard popup" shape MultiVendorX's own Status & Tools → Migration tab uses.
 */
const MigrationPanel = () => {
	const [sources, setSources] = useState<MigrationSource[]>([]);
	const [isLoadingSources, setIsLoadingSources] = useState(true);
	const [isWizardOpen, setIsWizardOpen] = useState(false);
	const [selectedId, setSelectedId] = useState<string>('');
	const [isImporting, setIsImporting] = useState(false);
	const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
	const [importStatusText, setImportStatusText] = useState('');
	const [runningSourceLabel, setRunningSourceLabel] = useState('');

	const loadSources = () => {
		setIsLoadingSources(true);

		getApiResponse<{ data: MigrationSource[] }>(
			getApiLink(vulopilotAppLocalizer, 'migration/sources'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				const found = (response?.data ?? []).filter(
					(source) => source.count > 0
				);

				setSources(found);
				setSelectedId(found[0]?.id ?? '');
			})
			.finally(() => setIsLoadingSources(false));
	};

	useEffect(loadSources, []);

	const openWizard = () => {
		setIsWizardOpen(true);
		setImportStatus('idle');
		setImportStatusText('');
		loadSources();
	};

	const runImport = () => {
		const source = sources.find((item) => item.id === selectedId);

		if (!source) {
			return;
		}

		setIsImporting(true);
		setImportStatus('running');
		setRunningSourceLabel(source.label);
		setImportStatusText(
			sprintf(
				/* translators: %s: source plugin name. */
				__('Importing from %s…', 'vulopilot'),
				source.label
			)
		);

		sendApiResponse<MigrationResult>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, 'migration/run'),
			{ source: source.id, overwrite: false }
		)
			.then((response) => {
				if (!response) {
					setImportStatus('failed');
					setImportStatusText(
						__('Migration failed. Please try again.', 'vulopilot')
					);
					return;
				}

				setImportStatus('completed');
				setImportStatusText(
					sprintf(
						/* translators: 1: number of posts migrated, 2: number of posts skipped. */
						__('%1$d imported, %2$d skipped.', 'vulopilot'),
						response.migrated,
						response.skipped
					)
				);
				NoticeManager.add({
					uniqueKey: 'vulopilot-migration-run',
					type: 'success',
					position: 'float',
					message: sprintf(
						/* translators: 1: number of posts migrated, 2: source plugin name. */
						__('Imported %1$d post(s) from %2$s.', 'vulopilot'),
						response.migrated,
						source.label
					),
				});
				loadSources();
			})
			.catch(() => {
				setImportStatus('failed');
				setImportStatusText(
					__('Migration failed. Please try again.', 'vulopilot')
				);
			})
			.finally(() => setIsImporting(false));
	};

	return (
		<>
			<section className="vp-migrate">
				<header className="vp-migrate-head">
					<i className="vp-migrate-icon adminfont-import" aria-hidden="true" />
					<div className="vp-migrate-text">
						<h3>{__('Import from another SEO plugin', 'vulopilot')}</h3>
						<p>
							{__(
								'Bring your titles, descriptions, focus keywords and other SEO data across, so nothing is lost when you switch to VuloPilot.',
								'vulopilot'
							)}
						</p>
					</div>
					<ButtonInput
						buttons={{
							text: __('Start migration', 'vulopilot'),
							icon: 'import',
							color: 'purple-bg',
							onClick: openWizard,
						}}
					/>
				</header>

				<div className="vp-migrate-sources">
					<div className="vp-migrate-sources-title">{__('Found on this site', 'vulopilot')}</div>
					{isLoadingSources && (
						<p className="vp-migrate-empty">{__('Looking for SEO plugin data…', 'vulopilot')}</p>
					)}
					{!isLoadingSources && 0 === sources.length && (
						<p className="vp-migrate-empty">
							{__(
								'No data from Yoast SEO, Rank Math or All in One SEO was found. Install or reactivate the old plugin first if you still need its data.',
								'vulopilot'
							)}
						</p>
					)}
					{!isLoadingSources &&
						sources.map((source) => (
							<div key={source.id} className="vp-migrate-source">
								<span className="vp-migrate-source-name">{source.label}</span>
								<span className="vp-migrate-source-count">
									{sprintf(
										/* translators: %d: number of posts with SEO data. */
										__('%d item(s) ready to import', 'vulopilot'),
										source.count
									)}
								</span>
							</div>
						))}
				</div>
			</section>

			<PopupComponent
				open={isWizardOpen}
				onClose={() => !isImporting && setIsWizardOpen(false)}
				width={28}
				header={{
					icon: 'import',
					title: __('Migration', 'vulopilot'),
					description: __(
						'Get a hands-on feel of your SEO data in minutes.',
						'vulopilot'
					),
				}}
			>
				<div className="vulopilot-migration-popup-row">
					<div className="vulopilot-migration-row-label">
						{__('Migration', 'vulopilot')}
					</div>

					{!isLoadingSources && 0 === sources.length ? (
						<span className="vulopilot-migration-popup-empty">
							{__('No SEO plugin data found currently', 'vulopilot')}
						</span>
					) : (
						<SelectInput
							name="vulopilot-migration-source"
							type="single-select"
							isClearable={false}
							value={selectedId}
							onChange={(value) => setSelectedId(value as string)}
							options={sources.map((source) => ({
								label: sourceCountLabel(source),
								value: source.id,
							}))}
						/>
					)}

					<ButtonInput
						buttons={{
							text: isImporting
								? __('Importing…', 'vulopilot')
								: __('Import', 'vulopilot'),
							icon: 'cloud-upload',
							color: 'purple-bg',
							disabled: 0 === sources.length || isImporting,
							onClick: runImport,
						}}
					/>
				</div>

				{'idle' !== importStatus && (
					<div className="sequential-task-executor">
						<div className={`sequential-task ${importStatus}`}>
							{runningSourceLabel}
							<div className="status-wrapper">
								<span className="status-icons">
									{'running' === importStatus && (
										<span className="multivendorx-loader" />
									)}
									{'completed' === importStatus && (
										<IconComponent name="check" className="completed-icon" />
									)}
									{'failed' === importStatus && (
										<IconComponent name="error" className="failed-icon" />
									)}
								</span>
								<span>{importStatusText}</span>
							</div>
						</div>
					</div>
				)}
			</PopupComponent>
		</>
	);
};

export default MigrationPanel;
