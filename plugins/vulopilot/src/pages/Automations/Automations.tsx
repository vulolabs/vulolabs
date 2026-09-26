/* global vulopilotAppLocalizer */
import { ComponentType, useEffect, useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import {
	ColumnComponent,
	ContainerComponent,
	NavigatorHeaderComponent,
	PopupComponent,
} from '@zyra/components';
import ShowProPopup from '../../components/Popup/Popup';
import { useFilterSlot } from '../../services/useFilterSlot';
import AutomationsStatusCard from './AutomationsStatusCard';
import AutomationsResourcesCard from './AutomationsResourcesCard';
import AutomationsAttentionCard from './AutomationsAttentionCard';
import BuiltinAutomationCards from './BuiltinAutomationCards';
import { AutomationsActivityDummy } from './AutomationsProDummies';
import { AutomationRow, AutomationTemplate, getAutomationTemplateById } from './automationsTypes';
import './Automations.scss';

interface ManageAutomationsSectionComponentProps {
	hasWizard: boolean;
	// eslint-disable-next-line no-unused-vars -- named param on a type-only call signature; base no-unused-vars doesn't recognize TS call-signature parameters.
	onOpenRow: (row: AutomationRow) => void;
	onRequireProUpsell: () => void;
	refetchSignal: number;
}

interface AutomationWizardComponentProps {
	openSignal?: number;
	initialName?: string;
	initialCategory?: string;
	initialTriggerType?: string;
	initialActionTypes?: string[];
	initialNotificationTypes?: string[];
	initialConditions?: { type: string; config: Record<string, unknown> }[];
	viewAutomation?: AutomationRow | null;
	onSaved?: () => void;
}

interface AutomationGenerateComponentProps {
	openSignal?: number;
	onSaved?: () => void;
}

interface AutomationsActivityCardComponentProps {
	onViewHistory: () => void;
	refetchSignal: number;
}

interface AutomationSlotValue {
	Wizard: ComponentType<AutomationWizardComponentProps>;
	Generate: ComponentType<AutomationGenerateComponentProps>;
	Templates: ComponentType<AutomationGenerateComponentProps>;
	Manage: ComponentType<ManageAutomationsSectionComponentProps>;
	Activity: ComponentType<AutomationsActivityCardComponentProps>;
}

/**
 * "Automate Work" - Free gets exactly 2 fixed, schedule-only automations
 * (`BuiltinAutomationCards.tsx` - "Run Full Site Scan"/"Send Visibility
 * Report", no template picker, no wizard) always shown at the top.
 *
 * Owns the real wizard/"Build with AI" popups' open-signal state and the
 * `vulopilot_automations_panel` filter-slot resolution directly (rather than
 * `ManageAutomationsSection.tsx`, their previous host) since the header's
 * own buttons need to open them too, not just the table's row actions - a
 * single shared instance of each popup, not two independently-triggered
 * ones.
 */
const Automations = () => {
	const slot = useFilterSlot<AutomationSlotValue>('vulopilot_automations_panel');
	const Wizard = slot?.Wizard;
	const Generate = slot?.Generate;
	const Templates = slot?.Templates;
	const Manage = slot?.Manage;
	const Activity = slot?.Activity;

	const [wizardOpenSignal, setWizardOpenSignal] = useState(0);
	const [generateOpenSignal, setGenerateOpenSignal] = useState(0);
	const [templatesOpenSignal, setTemplatesOpenSignal] = useState(0);
	const [refetchSignal, setRefetchSignal] = useState(0);
	const [viewingRow, setViewingRow] = useState<AutomationRow | null>(null);
	const [pendingTemplate, setPendingTemplate] = useState<AutomationTemplate | null>(null);
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	const openProPopup = () => setIsProPopupOpen(true);

	const handleSaved = () => setRefetchSignal((n) => n + 1);

	const openCreateWizard = () => {
		if (!Wizard) {
			openProPopup();
			return;
		}

		setViewingRow(null);
		setPendingTemplate(null);
		setWizardOpenSignal((n) => n + 1);
	};

	const openGenerate = () => {
		if (!Generate) {
			openProPopup();
			return;
		}

		setGenerateOpenSignal((n) => n + 1);
	};

	const openTemplatesLibrary = () => {
		if (!Templates) {
			openProPopup();
			return;
		}

		setTemplatesOpenSignal((n) => n + 1);
	};

	const openTemplate = (template: AutomationTemplate) => {
		if (!Wizard) {
			openProPopup();
			return;
		}

		setViewingRow(null);
		setPendingTemplate(template);
		setWizardOpenSignal((n) => n + 1);
	};

	const openRow = (row: AutomationRow) => {
		if (!Wizard) {
			openProPopup();
			return;
		}

		setPendingTemplate(null);
		setViewingRow(row);
		setWizardOpenSignal((n) => n + 1);
	};

	// AI Copilot's Chat tab (AIAssistant.tsx's own AutomationsTemplatesCard
	// preview) deep-links here as `?...#tab=automations&automation_template=<id>`
	// - the id itself is read once on mount (URL param, never changes for
	// the life of this page load), same as this page's previous tab-shell
	// version.
	const [initialTemplateId] = useState<string | null>(() =>
		new URLSearchParams(window.location.hash.substring(1)).get('automation_template')
	);
	const [highlightTemplateId, setHighlightTemplateId] = useState<string | null>(null);
	const firedInitialTemplateRef = useRef(false);

	useEffect(() => {
		if (firedInitialTemplateRef.current || !initialTemplateId) {
			return;
		}

		const template = getAutomationTemplateById(initialTemplateId);

		if (!template) {
			return;
		}

		if (template.linkOnly) {
			firedInitialTemplateRef.current = true;
			setHighlightTemplateId(template.id);
			return;
		}

		if (!Wizard) {
			return;
		}

		firedInitialTemplateRef.current = true;
		openTemplate(template);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-checks only when Wizard itself resolves (useFilterSlot's own real script-load-order race - see that hook's docblock) or initialTemplateId (set once, stable); openTemplate is redefined every render and the ref guard already makes this safely re-runnable.
	}, [Wizard, initialTemplateId]);

	// "View all issues →" (AutomationAttentionCard) and "View automation
	// history →" (AutomationActivityCard) both jump to the same real
	// destination - the "Your Automations" table already shows every
	// automation's own real status/last-run outcome, and the wizard's own
	// read-only "Open" view already surfaces a filtered run history per
	// automation; there's no separate unfiltered history view to link to
	// instead.
	const scrollToTable = () =>
		document.getElementById('automation-manage')?.scrollIntoView({ behavior: 'smooth' });

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="automation"
				headerTitle={__('Automations', 'vulopilot')}
				headerDescription={
					Wizard
						? __(
							'Create workflows that automatically handle repetitive work and keep you informed.',
							'vulopilot'
						)
						: __(
							'Two ready-made automations keep your site scanned and reported on. Custom and AI-powered automations are available in VuloPilot Pro.',
							'vulopilot'
						)
				}
				buttons={[
					{
						label: __('Build with AI', 'vulopilot'),
						icon: 'automation',
						color: 'border-purple',
						onClick: openGenerate,
					},
					{
						label:  __('Create Your Own', 'vulopilot'),
						icon: 'plus',
						color: 'border-purple',
						onClick: openCreateWizard,
					},
					{
						label:  __('Choose a Template', 'vulopilot'),
						icon: 'search',
						onClick: openTemplatesLibrary,
					},
				]}
			/>

			<ContainerComponent general>
				<BuiltinAutomationCards
					refetchSignal={refetchSignal}
					onChanged={handleSaved}
					highlightTemplateId={highlightTemplateId}
				/>

				<ColumnComponent grid={7} fullHeight>
					<AutomationsStatusCard refetchSignal={refetchSignal} />
				</ColumnComponent>
				<ColumnComponent grid={5} fullHeight>
					<AutomationsAttentionCard onViewAll={scrollToTable} refetchSignal={refetchSignal} />
				</ColumnComponent>

				<ColumnComponent grid={7} fullHeight>
					{Activity ? (
						<Activity onViewHistory={scrollToTable} refetchSignal={refetchSignal} />
					) : (
						<AutomationsActivityDummy onClick={openProPopup} />
					)}
				</ColumnComponent>
				<ColumnComponent grid={5} fullHeight>
					<AutomationsResourcesCard onCreateCustom={openCreateWizard} />
				</ColumnComponent>

				{Manage && (
					<ColumnComponent grid={12}>
						<Manage
							hasWizard={Boolean(Wizard)}
							onOpenRow={openRow}
							onRequireProUpsell={openProPopup}
							refetchSignal={refetchSignal}
						/>
					</ColumnComponent>
				)}
				{Wizard && (
					<Wizard
						openSignal={wizardOpenSignal}
						initialName={pendingTemplate?.category ? pendingTemplate.label : undefined}
						initialCategory={pendingTemplate?.category ?? undefined}
						initialTriggerType={pendingTemplate?.triggerType ?? undefined}
						initialActionTypes={pendingTemplate?.actionTypes ?? undefined}
						viewAutomation={viewingRow}
						onSaved={handleSaved}
					/>
				)}

				{Generate && <Generate openSignal={generateOpenSignal} onSaved={handleSaved} />}

				{Templates && <Templates openSignal={templatesOpenSignal} onSaved={handleSaved} />}

				<PopupComponent
					open={isProPopupOpen}
					onClose={() => setIsProPopupOpen(false)}
					width={31.25}
					height="auto"
					position="lightbox"
				>
					{vulopilotAppLocalizer.khali_dabba ? (
						<ShowProPopup moduleName="workflow-automation" />
					) : (
						<ShowProPopup />
					)}
				</PopupComponent>
			</ContainerComponent>
		</>
	);
};

export default Automations;
