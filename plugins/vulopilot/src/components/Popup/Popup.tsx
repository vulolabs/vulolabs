/* global vulopilotAppLocalizer */
import React from 'react';
import { ButtonInput } from '@zyra/inputs';
import { NoticeComponent } from '@zyra/components';
import { __, sprintf } from '@wordpress/i18n';
import MODULES_CATALOG, { isModuleCatalogEntry } from '../Modules';
import { useConnectVuloCloud } from '../../services/useConnectVuloCloud';
import '../Popup/Popup.scss';

/** The feature the upgrade was asked from (a ProSample section), shown first in the Pro popup - as VuloCart does. */
export interface ProFeature {
	title: string;
	description: string;
	icon?: string;
}

interface PopupProps {
	moduleName?: string;
	feature?: ProFeature;
	/** A plugin slug, or zyra's dependent-plugin entry ({ plugin: slug, name }) for a field that needs one. */
	plugin?: string | { plugin: string; name: string; link?: string };
	vulocloud?: boolean;

	confirmMode?: boolean;
	title?: string;
	confirmMessage?: React.ReactNode;
	confirmYesText?: string;
	confirmNoText?: string;
	onConfirm?: () => void;
	onCancel?: () => void;
}

const formatModuleName = (name: string): string => {
	return name
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
};

/** Module catalog keyed by id for lookup below. */
const MODULE_CATALOG_BY_ID = new Map(
	MODULES_CATALOG.modules
		.filter(isModuleCatalogEntry)
		.map((module) => [module.id, module])
);

/** Resolves a module id to the same name Settings → Modules shows for it. */
export const resolveModuleDisplayName = (moduleId: string): string =>
	MODULE_CATALOG_BY_ID.get(moduleId)?.name ?? formatModuleName(moduleId);

/** Icons for backend modules with no catalog entry. */
const CARDLESS_MODULE_ICONS: Record<string, string> = {
	'one-click-fix': 'tools',
	'copilot-chat': 'ai',
};

const resolveModuleIcon = (moduleId: string): string =>
	MODULE_CATALOG_BY_ID.get(moduleId)?.icon ??
	CARDLESS_MODULE_ICONS[moduleId] ??
	moduleId;

/** What Pro adds: every module the catalog gives a popup line, then Advanced Reports (no catalog card). */
const PRO_FEATURES = [
	...MODULES_CATALOG.modules
		.filter(isModuleCatalogEntry)
		.filter((module) => module.popupTitle)
		.map((module) => ({
			id: module.id,
			icon: resolveModuleIcon(module.id),
			name: module.name,
			benefit: module.popupTitle as string,
			desc: module.popupDesc ?? '',
		})),
	{
		id: 'advanced-reports',
		icon: 'report',
		name: __('Advanced Reports', 'vulopilot'),
		benefit: __('See what’s actually improving', 'vulopilot'),
		desc: __('Bring your results together to track progress, spot changes, and share clear reports with your team or clients.', 'vulopilot'),
	},
];

/** The three reasons people upgrade, shown first. */
const PRO_HIGHLIGHTS = [
	__('Fix issues in bulk with AI', 'vulopilot'),
	__('Daily score history and reports', 'vulopilot'),
	__('Custom and AI automations', 'vulopilot'),
];

type DialogTone = 'violet' | 'red' | 'amber' | 'orange';

/** The small dialogs (confirm, module, plugin, VuloCloud): an icon tile, a title, one line, the actions. */
const Dialog = ({
	className = '',
	icon,
	tone,
	title,
	children,
	actions,
}: {
	className?: string;
	icon: string;
	tone: DialogTone;
	title: React.ReactNode;
	children: React.ReactNode;
	actions: React.ReactNode;
}) => (
	<div className={`vp-modal vp-dialog is-${tone} ${className}`.trim()}>
		<span className="vp-dialog-icon" aria-hidden="true">
			<i className={`adminfont-${icon}`} />
		</span>
		<h2 className="title">{title}</h2>
		<div className="desc">{children}</div>
		<div className="vp-dialog-actions">{actions}</div>
	</div>
);

const ShowProPopup: React.FC<PopupProps> = (props) => {
	const { isConnecting, handleConnect } = useConnectVuloCloud();

	if (props.confirmMode) {
		return (
			<Dialog
				className="popup-confirm"
				icon="suspended"
				tone="red"
				title={props.title || __('Are you sure?', 'vulopilot')}
				actions={
					<ButtonInput
						position="center"
						buttons={[
							{
								text: props.confirmNoText || __('Cancel', 'vulopilot'),
								color: 'purple',
								onClick: () => props.onCancel?.(),
							},
							{
								icon: 'delete',
								text: props.confirmYesText || __('Confirm', 'vulopilot'),
								color: 'red-bg',
								onClick: () => props.onConfirm?.(),
							},
						]}
					/>
				}
			>
				{props.confirmMessage}
			</Dialog>
		);
	}

	const requiredPlugin =
		'object' === typeof props.plugin
			? props.plugin
			: props.plugin
				? { plugin: props.plugin, name: props.plugin }
				: null;

	if (requiredPlugin) {
		return (
			<Dialog
				icon={requiredPlugin.plugin}
				tone="amber"
				title={sprintf(
					/* translators: %s: Plugin name. */
					__('%s is needed for this', 'vulopilot'),
					requiredPlugin.name
				)}
				actions={
					<ButtonInput
						position="center"
						buttons={[
							{
								icon: 'module',
								text: __('Go to Plugins', 'vulopilot'),
								color: 'purple-bg',
								onClick: () => {
									window.open(`${vulopilotAppLocalizer.admin_url.replace(/admin\.php.*/, '')}plugins.php`, '_blank');
								},
							},
						]}
					/>
				}
			>
				{sprintf(
					/* translators: %s: name of the required plugin. */
					__('Install and activate "%s", then come back. VuloPilot picks it up straight away.', 'vulopilot'),
					requiredPlugin.name
				)}
			</Dialog>
		);
	}

	if (props.vulocloud) {
		return (
			<Dialog
				icon="cloud-upload"
				tone="orange"
				title={__('Connect to VuloCloud', 'vulopilot')}
				actions={
					<>
						<ButtonInput
							position="center"
							buttons={[
								{
									icon: 'link',
									text: isConnecting ? __('Connecting…', 'vulopilot') : __('Claim 100 free credits', 'vulopilot'),
									color: 'orange-bg',
									disabled: isConnecting,
									onClick: handleConnect,
								},
							]}
						/>
						<span className="vp-dialog-note">
							<i className="adminfont-check" aria-hidden="true" />
							{__('No credit card required', 'vulopilot')}
						</span>
					</>
				}
			>
				{__('This feature runs on AI credits. Connect once and get 100 free credits to start using it.', 'vulopilot')}
			</Dialog>
		);
	}

	if (props.moduleName) {
		const displayName = resolveModuleDisplayName(props.moduleName);

		return (
			<Dialog
				icon={resolveModuleIcon(props.moduleName)}
				tone="violet"
				title={sprintf(
					/* translators: %s: module display name. */
					__('Turn on %s', 'vulopilot'),
					displayName
				)}
				actions={
					<ButtonInput
						position="center"
						buttons={[
							{
								icon: 'toggle',
								text: __('Turn it on', 'vulopilot'),
								color: 'purple-bg',
								onClick: () => {
									// Same admin page, just a different hash tab.
									window.open(
										`${vulopilotAppLocalizer.admin_url}#&tab=settings&subtab=modules&module=${props.moduleName}`,
										'_self'
									);
								},
							},
						]}
					/>
				}
			>
				{sprintf(
					/* translators: %s: Module name. */
					__('This feature is part of the %s module, which is switched off. Turn it on in Modules to use it.', 'vulopilot'),
					displayName
				)}
			</Dialog>
		);
	}

	return (
		<div className="vp-modal vp-pro">
			<header className="vp-pro-hero">
				<span className="vp-pro-badge">
					<i className="adminfont-pro-tag" aria-hidden="true" />
					{__('VuloPilot Pro', 'vulopilot')}
				</span>
				<h2>{__('Unlock the full VuloPilot toolkit', 'vulopilot')}</h2>
				<p>
					{__(
						'Automate recurring checks, fix issues at scale, track progress over time, and uncover opportunities across SEO, AI search, performance, security, and WooCommerce.',
						'vulopilot'
					)}
				</p>
				{props.feature && (
					<div className="vp-pro-feature">
						<span className="vp-pro-icon" aria-hidden="true">
							<i className={`adminfont-${props.feature.icon ?? 'pro-tag'}`} />
						</span>
						<span>
							<strong>
								{sprintf(
									/* translators: %s: feature name, e.g. "Health trend". */
									__('%s is included', 'vulopilot'),
									props.feature.title
								)}
							</strong>
							{props.feature.description}
						</span>
						<span className="vp-pro-feature-check" aria-hidden="true" />
					</div>
				)}
				<ul className="vp-pro-highlights">
					{PRO_HIGHLIGHTS.map((item) => (
						<li key={item}>
							<i className="adminfont-check" aria-hidden="true" />
							{item}
						</li>
					))}
				</ul>
			</header>

			<div className="vp-pro-body">
				<h3>
					{__('Everything in Pro', 'vulopilot')}
					<span>
						{sprintf(
							/* translators: %d: number of Pro features. */
							__('%d features', 'vulopilot'),
							PRO_FEATURES.length
						)}
					</span>
				</h3>
				<ul className="vp-pro-grid">
					{PRO_FEATURES.map((feature) => (
						<li key={feature.id}>
							<span className="vp-pro-icon" aria-hidden="true">
								<i className={`adminfont-${feature.icon}`} />
							</span>
							<div>
								<strong>{feature.name}</strong>
								<em>{feature.benefit}</em>
								{feature.desc && <p>{feature.desc}</p>}
							</div>
						</li>
					))}
				</ul>
			</div>

			<footer className="vp-pro-foot">
				<span>
					<i className="adminfont-security" aria-hidden="true" />
					{__('Your free features, settings and data stay exactly as they are.', 'vulopilot')}
				</span>
				<a className="vp-pro-cta" href={vulopilotAppLocalizer.shop_url} target="_blank" rel="noreferrer">
					{__('Upgrade to Pro', 'vulopilot')}
					<i className="adminfont-arrow-right" aria-hidden="true" />
				</a>
			</footer>
		</div>
	);
};

export default ShowProPopup;

export const VuloCloudInlineNotice = () => {
	const { isConnecting, handleConnect } = useConnectVuloCloud();

	return (
		<NoticeComponent
			displayPosition="inline-notice"
			type="info"
			title={__('Connect to VuloCloud', 'vulopilot')}
			message={__(
				'Claim 100 Free AI Credits - no credit card required - to use this feature.',
				'vulopilot'
			)}
			actionLabel={
				isConnecting
					? __('Connecting…', 'vulopilot')
					: __('Connect to VuloCloud', 'vulopilot')
			}
			onAction={handleConnect}
		/>
	);
};
