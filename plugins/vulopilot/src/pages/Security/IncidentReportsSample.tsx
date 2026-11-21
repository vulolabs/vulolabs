import { __ } from '@wordpress/i18n';
import ProSample from '../../components/ProSample/ProSample';

/** Made-up incidents in the shape of Pro's Incident reports table. */
const SAMPLE_INCIDENTS = [
	{
		title: __('Login attempts blocked from 14 addresses', 'vulopilot'),
		severity: 'high',
		label: __('High', 'vulopilot'),
		by: __('Login protection', 'vulopilot'),
		when: __('Today, 08:12', 'vulopilot'),
	},
	{
		title: __('Contact Form plugin has a known vulnerability', 'vulopilot'),
		severity: 'critical',
		label: __('Critical', 'vulopilot'),
		by: __('Vulnerabilities', 'vulopilot'),
		when: __('Yesterday, 22:40', 'vulopilot'),
	},
	{
		title: __('wp-config.php changed outside an update', 'vulopilot'),
		severity: 'medium',
		label: __('Medium', 'vulopilot'),
		by: __('File changes', 'vulopilot'),
		when: __('Nov 17, 03:05', 'vulopilot'),
	},
	{
		title: __('SSL certificate expires in 12 days', 'vulopilot'),
		severity: 'low',
		label: __('Low', 'vulopilot'),
		by: __('SSL certificate', 'vulopilot'),
		when: __('Nov 15, 09:00', 'vulopilot'),
	},
];

/**
 * Free's picture of VuloPilot Pro's Incident reports (modules/WebsiteSecurity): sample rows inside ProSample. Free
 * ships no incident code; with Pro, its own panel takes this place.
 */
const IncidentReportsSample = () => (
	<section className="vp-card vp-sec-incidents">
		<header className="vp-card-head">
			<div className="vp-card-title">
				<span className="vp-card-icon" aria-hidden="true">
					<i className="adminfont-report" />
				</span>
				<div>
					<h3>{__('Incident reports', 'vulopilot')}</h3>
					<p>{__('Every security event on one timeline: what happened, how serious, what caught it.', 'vulopilot')}</p>
				</div>
			</div>
		</header>
		<div className="vp-card-body">
			<ProSample
				feature={{
					title: __('Incident reports', 'vulopilot'),
					description: __('A log of every security incident with its severity, the check that caught it and when.', 'vulopilot'),
					icon: 'report',
				}}
				text={__('Keep a record of every incident, from first sign to fix.', 'vulopilot')}
				cta={__('Unlock incident reports', 'vulopilot')}
			>
				<ul className="vp-incidents">
					{SAMPLE_INCIDENTS.map((incident) => (
						<li key={incident.title}>
							<span className={`vp-incident-sev is-${incident.severity}`}>{incident.label}</span>
							<strong>{incident.title}</strong>
							<span className="vp-incident-by">{incident.by}</span>
							<span className="vp-incident-when">{incident.when}</span>
						</li>
					))}
				</ul>
			</ProSample>
		</div>
	</section>
);

export default IncidentReportsSample;
