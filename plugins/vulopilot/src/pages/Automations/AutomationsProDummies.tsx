import { __ } from '@wordpress/i18n';
import { CardComponent } from '@zyra/components';
import DummyDataNotice from '../../components/DummyDataNotice';
import { BlurredProContent } from '../../components/UpgradeToProOverlay';

interface AutomationsDummyProps {
	onClick: () => void;
}


const ACTIVITY_DUMMY_ROWS: { title: string; desc: string; time: string }[] = [
	{
		title: __('Run Full Site Scan completed', 'vulopilot'),
		desc: __('No changes needed.', 'vulopilot'),
		time: __('Today, 10:29', 'vulopilot'),
	},
	{
		title: __('Security Monitoring completed', 'vulopilot'),
		desc: __('1 change made.', 'vulopilot'),
		time: __('Yesterday, 16:01', 'vulopilot'),
	},
	{
		title: __('Send Visibility Report completed', 'vulopilot'),
		desc: __('No changes needed.', 'vulopilot'),
		time: __('Sept 10, 16:00', 'vulopilot'),
	},
];

export const AutomationsActivityDummy = ({ onClick }: AutomationsDummyProps) => (
	<CardComponent
		title={__('Recent automation activity', 'vulopilot')}
		titleIcon="clock"
		desc={__('The last 5 automation runs and what they did.', 'vulopilot')}
	>
		<BlurredProContent contentClassName="automations-activity-dummy" onClick={onClick}>
			<ul className="activity-log">
				{ACTIVITY_DUMMY_ROWS.map((row) => (
					<li key={row.title} className="activity" aria-hidden="true">
						<div className="title">
							{row.title}
							<div className="admin-badge green">{__('Completed', 'vulopilot')} </div>
						</div>
						<div className="desc">{row.desc}</div>
						<span>{row.time}</span>
					</li>
				))}
			</ul>
		</BlurredProContent>
		<DummyDataNotice />
	</CardComponent>
);
