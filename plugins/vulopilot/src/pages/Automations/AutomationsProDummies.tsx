import { __ } from '@wordpress/i18n';
import { AnalyticsComponent, CardComponent, ColumnComponent } from '@zyra/components';
import DummyDataNotice from '../../components/DummyDataNotice';
import { BlurredProContent } from '../../components/UpgradeToProOverlay';

interface AutomationsDummyProps {
	onClick: () => void;
	/** Once Pro itself is licensed, the only remaining reason `vulopilot_automations_panel`
	 * doesn't resolve is the Workflow Automation module being off - the overlay needs to say
	 * that, not "Upgrade to Pro" (see Automations.tsx's own docblock on this prop). */
	isModuleGate?: boolean;
}

/** Shared copy both dummy cards below pass to `BlurredProContent`. */
const moduleGateCopy = (isModuleGate?: boolean) =>
	isModuleGate
		? {
				icon: 'unlock',
				title: __('Enable Workflow Automation module', 'vulopilot'),
				desc: __(
					'Turn the Workflow Automation module on from Settings → Modules to see this here.',
					'vulopilot'
				),
				buttonText: __('Enable module', 'vulopilot'),
			}
		: {};


const AGENT_DUMMY_ROWS: { name: string; task: string; progress: number }[] = [
	{ name: __('Monitoring Agent', 'vulopilot'), task: __('Optimizing internal links…', 'vulopilot'), progress: 72 },
	{ name: __('Content Agent', 'vulopilot'), task: __('Generating blog drafts…', 'vulopilot'), progress: 54 },
	{ name: __('Commerce Agent', 'vulopilot'), task: __('Checking abandoned carts…', 'vulopilot'), progress: 63 },
	{ name: __('Security Agent', 'vulopilot'), task: __('Scanning plugins…', 'vulopilot'), progress: 88 },
	{ name: __('Reporting Agent', 'vulopilot'), task: __('Building the weekly report…', 'vulopilot'), progress: 66 },
];

const OVERVIEW_DUMMY_CARDS: { title: string; icon: string; desc: string; action: string }[] = [
	{
		title: __('Automation Library', 'vulopilot'),
		icon: 'category',
		desc: __('120 ready-made automations', 'vulopilot'),
		action: __('Explore Library', 'vulopilot'),
	},
	{
		title: __('AI Agents', 'vulopilot'),
		icon: 'ai',
		desc: __('Monitoring, Security, Commerce & Content agents', 'vulopilot'),
		action: __('Manage Agents', 'vulopilot'),
	},
	{
		title: __('Scheduled Jobs', 'vulopilot'),
		icon: 'clock',
		desc: __('Next job in 2h 34m', 'vulopilot'),
		action: __('View Schedule', 'vulopilot'),
	},
];

export const AutomationsOverviewDummy = ({ onClick, isModuleGate }: AutomationsDummyProps) => (
	<ColumnComponent>
		<BlurredProContent
			contentClassName="automations-overview-dummy"
			onClick={onClick}
			{...moduleGateCopy(isModuleGate)}
		>
			{/* Same real `AnalyticsComponent variant="dashboard"` shape (zyra Storybook's
			`Components/AnalyticsComponent/Dashboard` story) `AutomationsStatusCard.tsx`'s own
			"Automation status" tiles already use - each tile's real headline renders in `number`
			(no literal count here, so the card's own title fills that slot), its `desc` in `text`,
			and its real "Explore Library →"-style action link in the `extra` report row, in place of
			3 separate plain `CardComponent`s. */}
			<div aria-hidden="true">
				<AnalyticsComponent
					variant="dashboard"
					cols={3}
					data={OVERVIEW_DUMMY_CARDS.map((card) => ({
						icon: card.icon,
						number: card.title,
						text: card.desc,
						extra: (
							<span className="automation-overview-link">{card.action}</span>
						),
					}))}
				/>
			</div>
			<CardComponent title={__('Running AI Agents', 'vulopilot')} titleIcon="ai">
				<div className="automation-agents-grid" aria-hidden="true">
					{AGENT_DUMMY_ROWS.map((agent) => (
						<div key={agent.name} className="automation-agent">
							<div className="automation-agent-name">
								<span className="automation-agent-dot is-green" />
								{agent.name}
							</div>
							<div className="automation-agent-task">{agent.task}</div>
							<div className="automation-agent-progress">
								<div className="automation-agent-bar">
									<span style={{ width: `${agent.progress}%` }} />
								</div>
								<span>{`${agent.progress}%`}</span>
							</div>
							<div className="automation-agent-status is-green">{__('Working', 'vulopilot')}</div>
						</div>
					))}
				</div>
			</CardComponent>
			<DummyDataNotice />
		</BlurredProContent>
	</ColumnComponent>
);

const AI_ACTIVITY_DUMMY_ROWS: { title: string; time: string }[] = [
	{ title: __('Optimized 128 images', 'vulopilot'), time: __('10 min ago', 'vulopilot') },
	{ title: __('Updated 9 plugins', 'vulopilot'), time: __('25 min ago', 'vulopilot') },
	{ title: __('Published new blog', 'vulopilot'), time: __('1 hour ago', 'vulopilot') },
	{ title: __('Fixed 14 metadata issues', 'vulopilot'), time: __('2 hours ago', 'vulopilot') },
];

export const AutomationsAiActivityDummy = ({ onClick, isModuleGate }: AutomationsDummyProps) => (
	<CardComponent title={__('Automation Activity', 'vulopilot')} titleIcon="ai">
		<BlurredProContent
			contentClassName="automations-activity-dummy"
			onClick={onClick}
			{...moduleGateCopy(isModuleGate)}
		>
			<ul className="automation-ai-activity" aria-hidden="true">
				{AI_ACTIVITY_DUMMY_ROWS.map((row) => (
					<li key={row.title} className="automation-ai-activity-row">
						<i className="adminfont-check" />
						<span className="automation-ai-activity-title">{row.title}</span>
						<span className="admin-badge purple">{__('AI', 'vulopilot')}</span>
						<span className="automation-agent-task">{row.time}</span>
						<span className="automation-overview-link">{__('Undo', 'vulopilot')}</span>
					</li>
				))}
			</ul>
		</BlurredProContent>
		<DummyDataNotice />
	</CardComponent>
);
