/* global vulopilotAppLocalizer */
import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { NoticeManager, SetupWizardComponent } from '@zyra/components';
import { ButtonInput, SelectInput } from '@zyra/inputs';
import './SetupWizard.scss';

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

type Step = 'detecting' | 'review' | 'importing' | 'done';

/**
 * Admin.php's `maybe_redirect_to_setup_wizard()` lands a freshly-activated site here only when a
 * Rank Math/Yoast/AIOSEO install with real data was detected - same auto-detect-then-wizard
 * pattern MultiVendorX's own onboarding uses. Reuses the Migration tab's own REST endpoints
 * (`migration/sources`, `migration/run`) and progress-bar styling (MigrationPanel.tsx), as a
 * full-page flow instead of a popup.
 */
const SetupWizard = () => {
	const [step, setStep] = useState<Step>('detecting');
	const [sources, setSources] = useState<MigrationSource[]>([]);
	const [selectedId, setSelectedId] = useState<string>('');
	const [result, setResult] = useState<MigrationResult | null>(null);
	const [importingLabel, setImportingLabel] = useState('');

	const goToDashboard = () => {
		window.location.hash = '#&tab=dashboard';
	};

	useEffect(() => {
		getApiResponse<{ data: MigrationSource[] }>(
			getApiLink(vulopilotAppLocalizer, 'migration/sources'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				const found = (response?.data ?? []).filter(
					(source) => source.count > 0
				);

				if (0 === found.length) {
					// Nothing left to migrate (e.g. the admin already ran it manually before this
					// page loaded) - no reason to show an empty wizard.
					goToDashboard();
					return;
				}

				setSources(found);
				setSelectedId(found[0].id);
				setStep('review');
			})
			.catch(() => goToDashboard());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const runImport = () => {
		const source = sources.find((item) => item.id === selectedId);

		if (!source) {
			return;
		}

		setStep('importing');
		setImportingLabel(source.label);

		sendApiResponse<MigrationResult>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, 'migration/run'),
			{ source: source.id, overwrite: false }
		)
			.then((response) => {
				if (!response) {
					NoticeManager.add({
						uniqueKey: 'vulopilot-setup-wizard-migration',
						type: 'error',
						position: 'float',
						message: __(
							'Migration failed. Please try again from Settings → Migration.',
							'vulopilot'
						),
					});
					setStep('review');
					return;
				}

				setResult(response);
				setStep('done');
			})
			.catch(() => setStep('review'));
	};

	const steps = [
		{ key: 'import', label: __('Import your SEO data', 'vulopilot') },
		{ key: 'done', label: __('All set', 'vulopilot') },
	];

	if ('done' === step) {
		return (
			<SetupWizardComponent
				brandName="VuloPilot"
				railTitle={__('Setup', 'vulopilot')}
				steps={steps}
				currentStep="done"
				title={__("You're all set!", 'vulopilot')}
				description={
					result
						? sprintf(
								/* translators: 1: number of items migrated, 2: number skipped. */
								__('%1$d item(s) imported, %2$d skipped.', 'vulopilot'),
								result.migrated,
								result.skipped
							)
						: ''
				}
				successIcon="check"
				actions={
					<ButtonInput
						buttons={{
							text: __('Go to Dashboard', 'vulopilot'),
							color: 'purple-bg',
							onClick: goToDashboard,
						}}
					/>
				}
			/>
		);
	}

	return (
		<SetupWizardComponent
			brandName="VuloPilot"
			railTitle={__('Setup', 'vulopilot')}
			steps={steps}
			currentStep="import"
			isLoading={'detecting' === step}
			title={__('Welcome to VuloPilot', 'vulopilot')}
			description={__(
				'We found existing SEO data on this site. Import it into VuloPilot before you get started - nothing in the other plugin is changed or removed.',
				'vulopilot'
			)}
			actions={
				<>
					<ButtonInput
						buttons={{
							text: __('Skip for now', 'vulopilot'),
							color: 'text-purple',
							disabled: 'importing' === step,
							onClick: goToDashboard,
						}}
					/>
					<ButtonInput
						buttons={{
							text: 'importing' === step
								? __('Importing…', 'vulopilot')
								: __('Import & Continue', 'vulopilot'),
							icon: 'cloud-upload',
							color: 'purple-bg',
							disabled: 'importing' === step,
							onClick: runImport,
						}}
					/>
				</>
			}
		>
			<SelectInput
				name="vulopilot-setup-wizard-source"
				type="single-select"
				isClearable={false}
				value={selectedId}
				onChange={(value: string) => setSelectedId(value)}
				options={sources.map((source) => ({
					label: sprintf(
						/* translators: 1: plugin name, 2: number of items found. */
						__('%1$s (%2$d item(s) found)', 'vulopilot'),
						source.label,
						source.count
					),
					value: source.id,
				}))}
			/>

			{'importing' === step && (
				<div className="sequential-task-executor">
					<div className="sequential-task running">
						{sprintf(
							/* translators: %s: source plugin name. */
							__('Importing from %s…', 'vulopilot'),
							importingLabel
						)}
						<div className="status-wrapper">
							<span className="status-icons">
								<span className="multivendorx-loader" />
							</span>
						</div>
					</div>
				</div>
			)}
		</SetupWizardComponent>
	);
};

export default SetupWizard;
