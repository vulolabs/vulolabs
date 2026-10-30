import type { ComponentType } from 'react';
import { __ } from '@wordpress/i18n';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Tools from './pages/Tools';
import SmsAlerts from './pages/SmsAlerts';
import EmailTemplates from './pages/EmailTemplates';
import Settings from './pages/Settings';

export interface RouteDefinition {
	tab: string;
	name: string;
	desc: string;
	component: ComponentType;
}

/**
 * One entry per admin submenu tab (classes/Admin.php). searchIndex.ts lists these as its "Tabs".
 */
export const routes: RouteDefinition[] = [
	{
		tab: 'dashboard',
		name: __('Dashboard', 'vulomail'),
		desc: __('Delivery totals and connection status.', 'vulomail'),
		component: Dashboard,
	},
	{
		tab: 'sms-alerts',
		name: __('SMS Alerts', 'vulomail'),
		desc: __('Text messages for site, store and customer events.', 'vulomail'),
		component: SmsAlerts,
	},
	{
		tab: 'email-templates',
		name: __('Email Templates', 'vulomail'),
		desc: __('Customise every plugin’s email templates from one place.', 'vulomail'),
		component: EmailTemplates,
	},
	{
		tab: 'logs',
		name: __('Logs', 'vulomail'),
		desc: __('Every email and SMS sent from this site.', 'vulomail'),
		component: Logs,
	},
	{
		tab: 'tools',
		name: __('Tools', 'vulomail'),
		desc: __('Send a test email or SMS and run diagnostics.', 'vulomail'),
		component: Tools,
	},
	{
		tab: 'settings',
		name: __('Settings', 'vulomail'),
		desc: __('Connections, sender, SMS, logging, privacy and integrations.', 'vulomail'),
		component: Settings,
	},
];
