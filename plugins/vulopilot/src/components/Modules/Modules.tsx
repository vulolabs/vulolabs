import { __ } from '@wordpress/i18n';
import {
	ModuleGridComponent} from '@zyra/components';
import { getModuleData } from '../../services/templateService';
import proPopupContent from '../Popup/Popup';

/**
 * No longer reachable - its own route (`tab: 'modules'`, src/routes.ts)
 * was removed per direct instruction once every real deep-link to it
 * (Popup.tsx's "Enable Now", AiCopilotGuard.tsx, GettingStartedCard.tsx,
 * searchIndex.ts's own module search results) had been repointed at the
 * real current home instead, Settings → Modules
 * (components/Settings/ModulesPanel.tsx, same real `getModuleData()`/
 * `ModuleGridComponent` this file still renders below). Kept in place
 * unwired rather than deleted, same "supersede, don't delete" posture
 * this codebase already applies elsewhere (e.g. AISuggestionsWidget.tsx/
 * TodaysTasksWidget.tsx, dashboard-widgets/registry.ts's own docblock).
 */
const Modules = () => {
	const modulesArray = getModuleData();

	return (
		<>
			<ModuleGridComponent
				modulesArray={modulesArray}
				apiLink="modules"
				pluginName="vulopilot"
				proPopupContent={proPopupContent}
			/>
		</>
	);
};

export default Modules;
