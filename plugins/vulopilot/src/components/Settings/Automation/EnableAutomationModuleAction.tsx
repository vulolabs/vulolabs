/* global vulopilotAppLocalizer */
import React, { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse, useModules } from '@zyra/core';
import { NoticeManager } from '@zyra/components';
import { MultiCheckboxInput } from '@zyra/inputs';

/** Real backend module id - Modules/index.ts's own `id: 'automations'` entry docblock. */
const AUTOMATION_MODULE_ID = 'workflow-automation';

/** Header action with a toggle that activates or deactivates the `automations` module. */
const EnableAutomationModuleAction: React.FC = () => {
	const [isActive, setIsActive] = useState(
		(vulopilotAppLocalizer.active_modules ?? []).includes(AUTOMATION_MODULE_ID)
	);
	const [isToggling, setIsToggling] = useState(false);
	// Same real zustand store ModuleGridComponent.tsx's own toggle already writes to on activate/deactivate.
	const { insertModule, removeModule } = useModules();

	const handleToggle = () => {
		const nextAction = isActive ? 'deactivate' : 'activate';
		setIsToggling(true);

		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'modules'), {
			id: AUTOMATION_MODULE_ID,
			action: nextAction,
		})
			.then((response) => {
				if (response) {
					setIsActive('activate' === nextAction);
					if ('activate' === nextAction) {
						insertModule?.(AUTOMATION_MODULE_ID);
					} else {
						removeModule?.(AUTOMATION_MODULE_ID);
					}
					NoticeManager.add({
						uniqueKey: 'vulopilot-toggle-automation-module',
						type: 'success',
						position: 'float',
						message:
							'activate' === nextAction
								? __('Automation module enabled.', 'vulopilot')
								: __('Automation module disabled.', 'vulopilot'),
					});
				} else {
					NoticeManager.add({
						uniqueKey: 'vulopilot-toggle-automation-module',
						type: 'error',
						position: 'float',
						message:
							'activate' === nextAction
								? __(
									'Could not enable the Automation module. Please try again.',
									'vulopilot'
								)
								: __(
									'Could not disable the Automation module. Please try again.',
									'vulopilot'
								),
					});
				}
			})
			.finally(() => setIsToggling(false));
	};

	return (
		<>
			<MultiCheckboxInput
				look="toggle"
				options={[
					{
						key: AUTOMATION_MODULE_ID,
						value: AUTOMATION_MODULE_ID,
						label: '',
						// zyra disables per option; it has no component-wide `disabled`.
						disabled: isToggling,
					},
				]}
				value={isActive ? [AUTOMATION_MODULE_ID] : []}
				onChange={handleToggle}
				// Real "Enabled"/"Disabled" status text next to the switch.
				toggleStatusLabel={{
					on: __('Enabled', 'vulopilot'),
					off: __('Disabled' , 'vulopilot'),
				}}
				modules={[]}
			/>
		</>
	);
};

export default EnableAutomationModuleAction;
