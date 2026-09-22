/* global appLocalizer */
import { useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { FormGroupWrapperComponent, NoticeManager } from '@zyra/components';
import { TextInput } from '@zyra/inputs';
import { useSetting } from '../../../contexts/SettingContext';
import CardHeader from '../../CardHeader';

/** "Stop typing, then save" debounce — same shape SiteVerificationPanel.tsx's own `PlainCodeField`/`CustomTagsField` already use for a hand-built (non-InputRenderer) panel's plain text field. */
const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Settings → Get Started → Connections — "Tag Manager" section content
 * (wrapped in `ConnectionsPanel.tsx`'s own `SectionRow`, rendered above
 * "Webmaster Tools" per direct instruction). Moved out of Scanning → SEO &
 * Content (`SeoContent.ts`'s own former last section) — same real
 * `tag_manager_enabled`/`tag_manager_container_id` keys, gating
 * `Services\TagManagerService`'s real `<script>` (`wp_head`) +
 * `<noscript><iframe>` (`wp_body_open`) Google Tag Manager output; nothing
 * server-side changed, only where the UI for it lives.
 *
 * The "Enable Google Tag Manager" toggle is gone per direct instruction —
 * only the Container ID field shows now. `TagManagerService::get_container_id()`
 * still real-gates its output on `tag_manager_enabled` being truthy
 * server-side (not just a non-empty container ID), so with no visible
 * toggle left to set it, this field now does that job itself: a non-empty
 * Container ID writes `tag_manager_enabled = ['tag_manager_enabled']`
 * alongside it, an emptied one writes `[]` — the single remaining field is
 * the real on/off switch, not just decorative once the toggle disappeared.
 */
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
		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
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
				icon="shortcode"
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
