import { __ } from '@wordpress/i18n';
import { ModuleGridComponent, FormGroupComponent, FormGroupWrapperComponent } from '@zyra/components';
import { getModuleData } from '../../services/templateService';
import { isModuleCatalogEntry } from '../Modules';
import type { ModuleCatalogItem } from '../Modules';
import proPopupContent from '../Popup/Popup';
import './ModulesPanel.scss';

/**
 * zyra prints a card's category from its id, upper-casing the first letter of each `_`-separated word
 * ("seo-content" → "Seo-content"). Each category id is swapped for its pill's own label with `_` for spaces, so the
 * card reads exactly like the pill above it ("SEO & Content"). Pills and cards change together, so filtering holds.
 */
const withCategoryLabels = <T extends { modules: ModuleCatalogItem[] }>(data: T): T => {
	if (!data) {
		return data;
	}
	const labelFor: Record<string, string> = {};
	data.modules.forEach((item) => {
		if (!isModuleCatalogEntry(item)) {
			labelFor[item.id] = item.label.trim().replace(/\s+/g, '_');
		}
	});
	return {
		...data,
		modules: data.modules.map((item) => {
			if (!isModuleCatalogEntry(item)) {
				return { ...item, id: labelFor[item.id] };
			}
			return labelFor[item.category] ? { ...item, category: labelFor[item.category] } : item;
		}),
	} as T;
};

const LABELS = {
	all: __('All', 'vulopilot'),
	allStatus: __('All', 'vulopilot'),
	active: __('Active', 'vulopilot'),
	inactive: __('Inactive', 'vulopilot'),
	searchPlaceholder: __('Search modules', 'vulopilot'),
};

const ModulesPanel = () => {
	const modulesArray = withCategoryLabels(getModuleData());

	return (
		<FormGroupWrapperComponent>
			<FormGroupComponent>
				<ModuleGridComponent
					modulesArray={modulesArray}
					apiLink="modules"
					pluginName="vulopilot"
					proPopupContent={proPopupContent}
					labels={LABELS}
				/>
			</FormGroupComponent>
		</FormGroupWrapperComponent>
	);
};

export default ModulesPanel;
