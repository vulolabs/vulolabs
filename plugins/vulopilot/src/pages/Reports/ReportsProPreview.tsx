import { useState } from 'react';
import type { CSSProperties } from 'react';
import { __ } from '@wordpress/i18n';
import { PopupComponent } from '@zyra/components';
import ShowProPopup from '../../components/Popup/Popup';
import { Card, IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';
import './ReportsProPreview.scss';

export const REPORTS_FEATURE = {
	title: __('Reports', 'vulopilot'),
	description: __(
		'Download branded PDF and CSV reports, or email them to your team and clients every week or month.',
		'vulopilot'
	),
	icon: 'bar-chart',
};

const REPORT_TYPES: { icon: string; tone: Tone; title: string; desc: string; includes: string[] }[] = [
	{
		icon: 'global-community',
		tone: 'violet',
		title: __('Full website report', 'vulopilot'),
		desc: __('The whole picture, for owners and clients.', 'vulopilot'),
		includes: [
			__('Health score and how it moved', 'vulopilot'),
			__('Issues fixed, new and still open', 'vulopilot'),
			__('SEO, security, speed and AI visibility', 'vulopilot'),
		],
	},
	{
		icon: 'search-discovery',
		tone: 'blue',
		title: __('SEO report', 'vulopilot'),
		desc: __('What search engines and AI see.', 'vulopilot'),
		includes: [
			__('Titles, meta, schema and links', 'vulopilot'),
			__('Content that needs a refresh', 'vulopilot'),
			__('Top issues to fix next', 'vulopilot'),
		],
	},
	{
		icon: 'security',
		tone: 'red',
		title: __('Security report', 'vulopilot'),
		desc: __('Proof the site is looked after.', 'vulopilot'),
		includes: [
			__('Vulnerabilities and weak spots', 'vulopilot'),
			__('Core and plugin file changes', 'vulopilot'),
			__('Updates waiting to be applied', 'vulopilot'),
		],
	},
];

const PERKS = [
	__('Branded PDF or CSV, ready to send', 'vulopilot'),
	__('Emailed weekly or monthly to anyone you choose', 'vulopilot'),
	__('Any period: 7, 30 or 90 days', 'vulopilot'),
	__('Every report kept, to view or download again', 'vulopilot'),
];

/** The sample report on the right of the hero: a picture of what a sent report looks like, not real data. */
const SampleReport = () => (
	<div className="vp-rp-sample" aria-hidden="true">
		<div className="vp-rp-doc">
			<div className="vp-rp-doc-head">
				<span className="vp-rp-doc-logo" />
				<div>
					<strong>{__('Website health report', 'vulopilot')}</strong>
					<span>{__('Last 30 days', 'vulopilot')}</span>
				</div>
				<span className="vp-rp-doc-tag">{__('Sample', 'vulopilot')}</span>
			</div>
			<div className="vp-rp-doc-score">
				<span className="vp-rp-ring" style={{ '--vp-rp-score': 82 } as CSSProperties}>
					<b>82</b>
				</span>
				<div className="vp-rp-doc-kpis">
					<span>
						<b className="is-good">24</b>
						{__('Fixed', 'vulopilot')}
					</span>
					<span>
						<b className="is-warn">6</b>
						{__('New', 'vulopilot')}
					</span>
					<span>
						<b>11</b>
						{__('Open', 'vulopilot')}
					</span>
				</div>
			</div>
			<div className="vp-rp-doc-bars">
				{[
					[__('SEO', 'vulopilot'), 88],
					[__('Security', 'vulopilot'), 94],
					[__('Speed', 'vulopilot'), 71],
					[__('AI visibility', 'vulopilot'), 64],
				].map(([label, value]) => (
					<div key={label as string} className="vp-rp-bar">
						<span>{label}</span>
						<i style={{ width: `${value}%` }} />
						<b>{value}</b>
					</div>
				))}
			</div>
		</div>
	</div>
);

/** Reports → Overview without Pro: what reports are, a sample of one, and the way to get them. */
const ReportsProPreview = () => {
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);
	const openPro = () => setIsProPopupOpen(true);

	return (
		<div className="vp-rp">
			<section className="vp-rp-hero">
				<div className="vp-rp-hero-main">
					<span className="vp-rp-eyebrow">
						<i className="adminfont-pro-tag" aria-hidden="true" />
						{__('VuloPilot Pro', 'vulopilot')}
					</span>
					<h2>{__('Reports your team and clients will actually read', 'vulopilot')}</h2>
					<p>
						{__(
							'Turn every scan into a clear report of what improved, what is new and what to fix next - on demand, or in their inbox on a schedule.',
							'vulopilot'
						)}
					</p>
					<ul className="vp-rp-perks">
						{PERKS.map((perk) => (
							<li key={perk}>
								<i className="adminfont-check" aria-hidden="true" />
								{perk}
							</li>
						))}
					</ul>
					<div className="vp-rp-actions">
						<button type="button" className="vp-rp-btn is-primary" onClick={openPro}>
							<i className="adminfont-pro-tag" aria-hidden="true" />
							{__('Unlock reports', 'vulopilot')}
						</button>
						<a className="vp-rp-btn" href="?page=vulopilot#&tab=reports&subtab=history">
							<i className="adminfont-clock" aria-hidden="true" />
							{__('See your activity history', 'vulopilot')}
						</a>
					</div>
				</div>
				<SampleReport />
			</section>

			<Card
				title={__('Three reports, one click each', 'vulopilot')}
				icon="document"
				desc={__('Pick one, choose the period, then download it or put it on a schedule.', 'vulopilot')}
			>
				<div className="vp-rp-types">
					{REPORT_TYPES.map((type) => (
						<button type="button" key={type.title} className="vp-rp-type" onClick={openPro}>
							<span className="vp-rp-type-head">
								<IconTile icon={type.icon} tone={type.tone} />
								<span className="vp-rp-lock">
									<i className="adminfont-lock" aria-hidden="true" />
									{__('Pro', 'vulopilot')}
								</span>
							</span>
							<strong>{type.title}</strong>
							<span className="vp-rp-type-desc">{type.desc}</span>
							<ul>
								{type.includes.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
						</button>
					))}
				</div>
			</Card>

			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				<ShowProPopup feature={REPORTS_FEATURE} />
			</PopupComponent>
		</div>
	);
};

export default ReportsProPreview;
