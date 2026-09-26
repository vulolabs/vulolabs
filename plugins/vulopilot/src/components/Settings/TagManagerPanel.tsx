/* global vulopilotAppLocalizer */
import { useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { FormGroupWrapperComponent, NoticeManager } from '@zyra/components';
import { TextInput } from '@zyra/inputs';
import { useSetting } from '../../contexts/SettingContext';
import CardHeader from '../CardHeader';

/** "Stop typing, then save" debounce - same shape SiteVerificationPanel.tsx's own `PlainCodeField`/`CustomTagsField` already use for a hand-built (non-InputRenderer) panel's plain text field. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

const TagManagerPanel = () => {
	const { setting, updateSetting } = useSetting();
	const [containerId, setContainerId] = useState(
		(setting.tag_manager_container_id as string) || ''
	);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persist = (nextContainerId: string) => {
		const nextEnabled = '' !== nextContainerId.trim() ? ['tag_manager_enabled'] : [];
		updateSetting('tag_manager_container_id', nextContainerId);
		updateSetting('tag_manager_enabled', nextEnabled);
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
			setting: {
				tag_manager_container_id: nextContainerId,
				tag_manager_enabled: nextEnabled,
			},
		}).then((response) => {
			NoticeManager.add({
				uniqueKey: 'vulopilot-tag-manager-saved',
				type: response ? 'success' : 'error',
				position: 'float',
				message: response
					? __('Settings saved.', 'vulopilot')
					: __('Could not save settings. Please try again.', 'vulopilot'),
			});
		});
	};

	const handleContainerIdChange = (value: string) => {
		setContainerId(value);
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(() => persist(value), AUTOSAVE_DEBOUNCE_MS);
	};

	return (
		<FormGroupWrapperComponent>
			<CardHeader
				icon="module"
				title={__('Container ID', 'vulopilot')}
				desc={__(
					'Your Google Tag Manager container ID',
					'vulopilot'
				)}
			>
				<TextInput
					id="tag-manager-container-id-input"
					placeholder={__('GTM-XXXXXXX', 'vulopilot')}
					size={25}
					value={containerId}
					onChange={(value) => handleContainerIdChange(String(value))}
				/>
			</CardHeader>
		</FormGroupWrapperComponent>
	);
};

export default TagManagerPanel;
