import { __ } from '@wordpress/i18n';
import EmptySample from '../../components/ProSample/EmptySample';
import { IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';
import type { HistoryFilter } from '../../services/historyTypes';

interface SampleRow {
	time: string;
	icon: string;
	tone: Tone;
	title: string;
	detail: string;
	pill?: string;
	pillTone?: 'good' | 'warn';
}

interface Sample {
	icon: string;
	title: string;
	text: string;
	action: string;
	hash: string;
	rows: SampleRow[];
}

/** For each filter: made-up rows in the timeline's shape, and the step that fills it for real. */
const SAMPLES: Record<HistoryFilter, Sample> = {
	all: {
		icon: 'scan',
		title: __('No activity yet', 'vulopilot'),
		text: __('Run your first scan - every scan, fix and conversation is logged here.', 'vulopilot'),
		action: __('Go to the dashboard', 'vulopilot'),
		hash: '#&tab=dashboard',
		rows: [
			{ time: '09:00', icon: 'scan', tone: 'blue', title: __('Scan · 24 checks', 'vulopilot'), detail: __('6 issues found by 3 checks', 'vulopilot') },
			{ time: '09:12', icon: 'edit', tone: 'green', title: __('Meta description written', 'vulopilot'), detail: __('Pricing page', 'vulopilot'), pill: __('Applied', 'vulopilot') },
			{ time: '09:20', icon: 'live-chat', tone: 'violet', title: __('Why did my SEO score drop?', 'vulopilot'), detail: __('Conversation with AI Copilot', 'vulopilot') },
		],
	},
	scan: {
		icon: 'scan',
		title: __('No scans yet', 'vulopilot'),
		text: __('Each scan shows up here with what every check found.', 'vulopilot'),
		action: __('Go to the dashboard', 'vulopilot'),
		hash: '#&tab=dashboard',
		rows: [
			{ time: '09:00', icon: 'scan', tone: 'blue', title: __('Scan · 24 checks', 'vulopilot'), detail: __('6 issues found by 3 checks', 'vulopilot') },
			{ time: '08:00', icon: 'scan', tone: 'blue', title: __('Scan · 7 checks', 'vulopilot'), detail: __('Every check came back clear', 'vulopilot') },
		],
	},
	conversation: {
		icon: 'live-chat',
		title: __('No conversations yet', 'vulopilot'),
		text: __('Questions you ask AI Copilot, and its answers, are kept here.', 'vulopilot'),
		action: __('Ask AI Copilot', 'vulopilot'),
		hash: '#&tab=ai-assistant',
		rows: [
			{ time: '10:24', icon: 'live-chat', tone: 'violet', title: __('Why did my SEO score drop this week?', 'vulopilot'), detail: __('3 pages lost their meta descriptions on Tuesday…', 'vulopilot') },
			{ time: '09:41', icon: 'live-chat', tone: 'violet', title: __('Which plugins slow my site down?', 'vulopilot'), detail: __('Two plugins add 1.2 s to every page…', 'vulopilot') },
		],
	},
	change: {
		icon: 'edit',
		title: __('No changes yet', 'vulopilot'),
		text: __('Every fix VuloPilot makes is logged here - with before and after, and an undo.', 'vulopilot'),
		action: __('Fix an issue with AI', 'vulopilot'),
		hash: '#&tab=ai-assistant',
		rows: [
			{ time: '11:05', icon: 'edit', tone: 'green', title: __('Meta description written', 'vulopilot'), detail: __('Pricing page', 'vulopilot'), pill: __('Applied', 'vulopilot') },
			{ time: '10:58', icon: 'image', tone: 'green', title: __('Alt text added to 12 images', 'vulopilot'), detail: __('Media library', 'vulopilot'), pill: __('Applied', 'vulopilot') },
			{ time: '10:40', icon: 'edit', tone: 'amber', title: __('Title rewritten', 'vulopilot'), detail: __('Waiting for your approval', 'vulopilot'), pill: __('Proposed', 'vulopilot'), pillTone: 'warn' },
		],
	},
	automations: {
		icon: 'automation',
		title: __('No automation runs yet', 'vulopilot'),
		text: __('Scheduled scans and reports log each run here.', 'vulopilot'),
		action: __('Set up automations', 'vulopilot'),
		hash: '#&tab=automations',
		rows: [
			{ time: '03:00', icon: 'automation', tone: 'amber', title: __('Website scan', 'vulopilot'), detail: __('Ran on schedule', 'vulopilot'), pill: __('Completed', 'vulopilot') },
			{ time: '09:00', icon: 'mail', tone: 'amber', title: __('Visibility report', 'vulopilot'), detail: __('Sent to the admin email', 'vulopilot'), pill: __('Completed', 'vulopilot') },
		],
	},
};

/** History with nothing in it (for this filter): what it will look like, and how to get there. */
const HistoryEmptySample = ({ filter }: { filter: HistoryFilter }) => {
	const sample = SAMPLES[filter] ?? SAMPLES.all;

	return (
		<EmptySample
			icon={sample.icon}
			title={sample.title}
			text={sample.text}
			actionLabel={sample.action}
			onAction={() => {
				window.location.hash = sample.hash;
			}}
		>
			<ul className="vp-hist-sample">
				{sample.rows.map((row) => (
					<li key={row.title} className="vp-hist-row">
						<span className="vp-hist-time">{row.time}</span>
						<IconTile icon={row.icon} tone={row.tone} size="sm" />
						<span className="vp-hist-main">
							<strong>{row.title}</strong>
							<span>{row.detail}</span>
						</span>
						{row.pill && <span className={`vp-pill is-${row.pillTone ?? 'good'}`}>{row.pill}</span>}
					</li>
				))}
			</ul>
		</EmptySample>
	);
};

export default HistoryEmptySample;
