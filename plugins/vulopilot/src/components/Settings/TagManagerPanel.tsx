/* global vulopilotAppLocalizer */
import { useEffect, useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { FormGroupWrapperComponent, NoticeManager } from '@zyra/components';
import { TextInput } from '@zyra/inputs';
import { useSetting } from '../../contexts/SettingContext';
import CardHeader from '../CardHeader';
import FieldError, { Field } from '../FieldError/FieldError';

/** "Stop typing, then save" debounce. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

/** A real GTM container ID, e.g. GTM-ABC1234. Blank is allowed (turns Tag Manager off). */
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/i;

const isValidContainerId = (value: string): boolean => {
	const trimmed = value.trim();

	return '' === trimmed || GTM_ID_PATTERN.test(trimmed);
};

const TagManagerPanel = () => {
	const { setting, updateSetting } = useSetting();
	const [containerId, setContainerId] = useState(
		(setting.tag_manager_container_id as string) || ''
	);
	// The settings context fills in after first render, so pick up the saved value when it arrives.
	useEffect(() => {
		setContainerId((setting.tag_manager_container_id as string) || '');
	}, [setting.tag_manager_container_id]);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Read-only until the user clicks in: Chrome's saved-login autofill skips read-only fields.
	const [isEditable, setIsEditable] = useState(false);
	// Latest typed value not yet saved - lets blur, unmount and page unload save it right away.
	const pendingRef = useRef<string | null>(null);
	// The format hint waits until you leave the field, so it never shouts while you are still typing.
	const [isTouched, setIsTouched] = useState(false);

	const persist = (nextContainerId: string) => {
		pendingRef.current = null;

		// Never store a value that isn't a real GTM ID (e.g. browser autofill's "admin").
		if (!isValidContainerId(nextContainerId)) {
			return;
		}

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

	const flush = () => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
		if (null !== pendingRef.current) {
			persist(pendingRef.current);
		}
	};

	const handleContainerIdChange = (value: string) => {
		setContainerId(value);
		pendingRef.current = value;
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
		}
		saveTimerRef.current = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
	};

	// Save on leaving the page (refresh/close) - keepalive so the request survives the unload.
	useEffect(() => {
		const saveOnUnload = () => {
			if (null === pendingRef.current) {
				return;
			}
			const value = pendingRef.current;

			if (!isValidContainerId(value)) {
				return;
			}

			fetch(getApiLink(vulopilotAppLocalizer, 'settings'), {
				method: 'POST',
				keepalive: true,
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': vulopilotAppLocalizer.nonce,
				},
				body: JSON.stringify({
					setting: {
						tag_manager_container_id: value,
						tag_manager_enabled: '' !== value.trim() ? ['tag_manager_enabled'] : [],
					},
				}),
			});
		};

		window.addEventListener('beforeunload', saveOnUnload);

		return () => {
			window.removeEventListener('beforeunload', saveOnUnload);
			flush();
		};
	}, []);

	const showError = isTouched && !isValidContainerId(containerId);

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
				<Field invalid={showError}>
					<TextInput
						id="tag-manager-container-id-input"
						placeholder={__('GTM-XXXXXXX', 'vulopilot')}
						size={25}
						value={containerId}
						onChange={(value) => handleContainerIdChange(String(value))}
						onBlur={() => {
							setIsTouched(true);
							flush();
						}}
						onFocus={() => setIsEditable(true)}
						readOnly={!isEditable}
						aria-invalid={showError || undefined}
						aria-describedby={showError ? 'tag-manager-container-id-error' : undefined}
					/>
					{showError && (
						<FieldError id="tag-manager-container-id-error">
							{__('Use the format GTM-XXXXXXX, for example GTM-AB12CD3. This ID has not been saved.', 'vulopilot')}
						</FieldError>
					)}
				</Field>
			</CardHeader>
		</FormGroupWrapperComponent>
	);
};

export default TagManagerPanel;
