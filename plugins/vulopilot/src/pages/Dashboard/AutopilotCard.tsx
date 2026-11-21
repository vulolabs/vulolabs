/* global vulopilotAppLocalizer */
import React from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import { IconTile, Skeleton, Switch } from '../../components/ui';
import type { Tone } from '../../components/ui';
import { useApiList } from '../../services/useApiList';

interface AutomationRow {
	id: number;
	name: string;
	status: 'enabled' | 'disabled';
	trigger_type: string;
}

/** Free ships exactly these two built-in automations (Automations\BuiltinAutomationSeeder). */
const BUILTINS: { trigger: string; icon: string; tone: Tone; desc: string }[] = [
	{
		trigger: 'free_full_site_scan',
		icon: 'scan',
		tone: 'blue',
		desc: __('Scans your site on a schedule and refreshes these numbers.', 'vulopilot'),
	},
	{
		trigger: 'free_visibility_report',
		icon: 'mail',
		tone: 'violet',
		desc: __('Emails you a summary of visibility, issues and opportunities.', 'vulopilot'),
	},
];

/** "Autopilot": what VuloPilot does on its own, each switchable in place. */
const AutopilotCard: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
	const { data, isLoading, error, refetch } = useApiList<AutomationRow>('automations', { per_page: 100 });

	const rows = BUILTINS.map((builtin) => ({
		...builtin,
		row: data.find((item) => item.trigger_type === builtin.trigger),
	})).filter((item): item is typeof item & { row: AutomationRow } => Boolean(item.row));
	const enabled = rows.filter((item) => 'enabled' === item.row.status).length;

	// Same `PATCH /automations/{id}` the Automations page's built-in cards use.
	const toggle = (row: AutomationRow) => {
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, `automations/${row.id}`), {
			status: 'enabled' === row.status ? 'disabled' : 'enabled',
		}).then(() => {
			refetch();
			onChanged();
		});
	};

	return (
		<section className="vp-card vp-rail-card">
			<header className="vp-rail-head">
				<div>
					<h3>{__('Autopilot', 'vulopilot')}</h3>
					<p>
						{isLoading
							? __('What VuloPilot does for you in the background.', 'vulopilot')
							: sprintf(
									/* translators: 1: automations switched on, 2: automations in total. */
									_n('%1$d of %2$d running in the background.', '%1$d of %2$d running in the background.', rows.length, 'vulopilot'),
									enabled,
									rows.length
							  )}
					</p>
				</div>
				<a className="vp-card-link" href="?page=vulopilot#&tab=automations">
					{__('Manage', 'vulopilot')}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			</header>

			{isLoading && <Skeleton />}
			{!isLoading && error && <p className="vp-rail-note is-bad">{error}</p>}
			{!isLoading && !error && 0 === rows.length && (
				<p className="vp-rail-note">
					{__('No automations yet.', 'vulopilot')}{' '}
					<a href="?page=vulopilot#&tab=automations">{__('Set them up', 'vulopilot')}</a>
				</p>
			)}

			{rows.length > 0 && (
				<ul className="vp-list vp-autopilot">
					{rows.map(({ trigger, icon, tone, desc, row }) => {
						const isOn = 'enabled' === row.status;

						return (
							<li key={trigger} className={isOn ? '' : 'is-off'}>
								<IconTile icon={icon} tone={isOn ? tone : 'neutral'} size="sm" />
								<div className="vp-list-main">
									<strong>{row.name}</strong>
									<span>{isOn ? desc : __('Off - turn on to let VuloPilot handle this.', 'vulopilot')}</span>
								</div>
								<Switch checked={isOn} onChange={() => toggle(row)} label={row.name} />
							</li>
						);
					})}
				</ul>
			)}

			{!vulopilotAppLocalizer.khali_dabba && (
				<a className="vp-rail-upsell" href={vulopilotAppLocalizer.shop_url} target="_blank" rel="noopener noreferrer">
					<i className="adminfont-pro-tag" aria-hidden="true" />
					<span>
						<strong>{__('Put more on autopilot', 'vulopilot')}</strong>
						{__('Custom and AI-powered automations with VuloPilot Pro.', 'vulopilot')}
					</span>
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			)}
		</section>
	);
};

export default AutopilotCard;
