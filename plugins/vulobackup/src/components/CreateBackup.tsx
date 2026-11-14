/* global vulobackupAppLocalizer */
import { useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { NoticeComponent, PopupComponent } from '@zyra/components';
import { ButtonInput, TextInput, ToggleInput } from '@zyra/inputs';
import { apiGet, apiPost } from '../services/api';
import { errorMessage, notify } from '../services/notify';
import { useJob } from '../services/JobContext';
import { AREA_LABELS } from '../services/types';

interface Stored {
	areas: string[];
	encrypt: boolean;
}

/**
 * "Back up now": choose what goes into the backup and start it.
 */
const CreateBackup = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
	const { kick } = useJob();
	const [type, setType] = useState('full');
	const [areas, setAreas] = useState<string[]>([]);
	const [name, setName] = useState('');
	const [encrypt, setEncrypt] = useState(false);
	const [isBusy, setIsBusy] = useState(false);

	// The folders ticked to begin with are the ones chosen in Settings.
	useEffect(() => {
		if (open) {
			apiGet<Stored>('settings')
				.then((stored) => {
					setAreas(stored.areas.filter((area) => vulobackupAppLocalizer.areas.includes(area)));
					setEncrypt(stored.encrypt);
				})
				.catch(() => undefined);
		}
	}, [open]);

	const start = () => {
		setIsBusy(true);

		apiPost('backups', { type, areas, name })
			.then(() => {
				notify('success', __('Backup started.', 'vulobackup'));
				setName('');
				onClose();
				kick();
			})
			.catch((error) => notify('error', errorMessage(error)))
			.finally(() => setIsBusy(false));
	};

	const needsAreas = 'database' !== type;

	return (
		<PopupComponent open={open} onClose={onClose} width={38} height="auto" position="lightbox" header={{ icon: 'database', title: __('Back up now', 'vulobackup') }}>
			<div className="vulobackup-popup-body">
				<div className="vulobackup-control">
					<span className="vulobackup-control-label">{__('What to back up', 'vulobackup')}</span>
					<ToggleInput
						value={type}
						options={[
							{ key: 'full', value: 'full', label: __('Database and files', 'vulobackup') },
							{ key: 'database', value: 'database', label: __('Database only', 'vulobackup') },
							{ key: 'files', value: 'files', label: __('Files only', 'vulobackup') },
						]}
						onChange={(value) => setType(String(value))}
					/>
				</div>
				{needsAreas && (
					<div className="vulobackup-control">
						<span className="vulobackup-control-label">{__('Files to include', 'vulobackup')}</span>
						<div className="vulobackup-checks">
							{vulobackupAppLocalizer.areas.map((area) => (
								<label key={area} htmlFor={`vulobackup-area-${area}`}>
									<input
										type="checkbox"
										id={`vulobackup-area-${area}`}
										checked={areas.includes(area)}
										onChange={(event) => setAreas(event.target.checked ? [...areas, area] : areas.filter((item) => item !== area))}
									/>
									<div>
										<strong>{AREA_LABELS[area]?.name ?? area}</strong>
										<span>{AREA_LABELS[area]?.desc}</span>
									</div>
								</label>
							))}
						</div>
					</div>
				)}
				<div className="vulobackup-control">
					<span className="vulobackup-control-label">{__('Name (optional)', 'vulobackup')}</span>
					<TextInput name="backup-name" value={name} placeholder={__('For example: Before the redesign', 'vulobackup')} onChange={(value) => setName(String(value))} />
				</div>
				{encrypt && (
					<NoticeComponent
						displayPosition="inline-notice"
						type="info"
						message={__('This backup will be encrypted with the password set in Settings → Security. Without that password it cannot be restored.', 'vulobackup')}
					/>
				)}
				<div className="vulobackup-form-footer">
					<ButtonInput
						buttons={[
							{ text: __('Cancel', 'vulobackup'), color: 'purple', onClick: onClose },
							{
								text: isBusy ? __('Starting…', 'vulobackup') : __('Start backup', 'vulobackup'),
								icon: 'database',
								disabled: isBusy || (needsAreas && 0 === areas.length),
								onClick: start,
							},
						]}
					/>
				</div>
			</div>
		</PopupComponent>
	);
};

export default CreateBackup;
