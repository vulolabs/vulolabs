/* global vulopilotAppLocalizer */
import React from 'react';
import { ButtonInput } from '@zyra/inputs';
import { NoticeComponent } from '@zyra/components';
import { __, sprintf } from '@wordpress/i18n';
import MODULES_CATALOG, { isModuleCatalogEntry } from '../Modules';
import { useConnectVuloCloud } from '../../services/useConnectVuloCloud';
import '../Popup/Popup.scss';

interface PopupProps {
	moduleName?: string;
	plugin?: string;
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

const proPopupContent = {
	messages: [
		...MODULES_CATALOG.modules
			.filter(isModuleCatalogEntry)
			.filter((module) => module.popupTitle)
			.map((module) => ({
				icon: resolveModuleIcon(module.id),
				text: `${module.popupTitle} · ${module.name}`,
				des: module.popupDesc ?? '',
			})),
		{
			icon: 'report',
			text: `${__('See What’s Actually Improving', 'vulopilot')} · ${__('Advanced Reports', 'vulopilot')}`,
			des: __('Bring your results together to track progress, spot changes, and share clear reports with your team or clients.', 'vulopilot'),
		},
	],
};

const ShowProPopup: React.FC<PopupProps> = (props) => {
	const { isConnecting, handleConnect } = useConnectVuloCloud();

	if (props.confirmMode) {
		return (
			<div className="popup-confirm">
				<i className="popup-icon adminfont-suspended admin-badge red"></i>
				<div className="title">{props.title || __('Confirmation', 'vulopilot')}</div>
				<div className="desc">{props.confirmMessage}</div>
				<ButtonInput
					position="center"
					buttons={[
						{
							icon: 'close',
							text: props.confirmNoText || __('Cancel', 'vulopilot'),
							color: 'red',
							onClick: props.onCancel,
						},
						{
							icon: 'delete',
							text: props.confirmYesText || __('Confirm', 'vulopilot'),
							onClick: props.onConfirm,
						},
					]}
				/>
			</div>
		);
	}

	if (props.plugin) {
		return (
			<div className="popup-wrapper">
				<div className="popup-header">
					<i className={`adminfont-${props.plugin}`} />
				</div>
				<div className="popup-body">
					<div className="module-name">
						{sprintf(
							/* translators: %s: Plugin name. */
							__('Plugin Required: %s', 'vulopilot'),
							props.plugin
						)}
					</div>
					<div className="module-desc">
						{sprintf(
							/* translators: %s: name of the required plugin. */
							__(
								'This feature requires the "%s" plugin to be active.',
								'vulopilot'
							),
							props.plugin
						)}
					</div>
					<ButtonInput
						position="center"
						buttons={[
							{
								icon: 'eye',
								text: __('Activate Plugin', 'vulopilot'),
								onClick: () => {
									window.open(
										`${vulopilotAppLocalizer.admin_url.replace(/admin\.php.*/, '')}plugins.php`,
										'_blank'
									);
								},
							},
						]}
					/>
				</div>
			</div>
		);
	}

	if (props.vulocloud) {
		return (
			<div className="popup-wrapper">
				<div className="popup-header zyra-orange-bg">
					<i className="adminfont-lock zyra-orange-bg" />
				</div>
				<div className="popup-body">
					<div className="module-name">
						{__('Connect to VuloCloud', 'vulopilot')}
					</div>
					<div className="module-desc">
						{__(
							'Claim 100 Free AI Credits - no credit card required - to use this feature.',
							'vulopilot'
						)}
					</div>
					<ButtonInput
						position="center"
						buttons={[
							{
								icon: 'link',
								text: isConnecting
									? __('Connecting…', 'vulopilot')
									: __('Connect to VuloCloud', 'vulopilot'),
								color: 'orange-bg',
								disabled: isConnecting,
								onClick: handleConnect,
							},
						]}
					/>
				</div>
			</div>
		);
	}

	if (props.moduleName) {
		const displayName = resolveModuleDisplayName(props.moduleName);
		const displayIcon = resolveModuleIcon(props.moduleName);

		return (
			<div className="popup-wrapper">
				<div className="popup-header">
					<i className={`adminfont-${displayIcon}`} />
				</div>
				<div className="popup-body">
					<div className="module-name">
						{sprintf(
							/* translators: %s: module display name. */
							__('Activate %s', 'vulopilot'),
							displayName
						)}
					</div>
					<div className="module-desc">
						{sprintf(
							/* translators: %s: Module name. */
							__(
								'This feature is currently unavailable. To activate it, please enable the %s module.',
								'vulopilot'
							),
							displayName
						)}
					</div>
					<ButtonInput
						position="center"
						buttons={[
							{
								icon: 'eye',
								text: __('Enable Now', 'vulopilot'),
								onClick: () => {
									// Same admin page, just a different hash tab - '_self' matches
									// this plugin's own same-page navigation convention.
									window.open(
										`${vulopilotAppLocalizer.admin_url}#&tab=settings&subtab=modules&module=${props.moduleName}`,
										'_self'
									);
								},
							},
						]}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="popup-wrapper">
			<div className="top-section">
				<div className="heading">
					{__(
						'Unlock the full VuloPilot toolkit',
						'vulopilot'
					)}
				</div>
				<div className="description">
					{__(
						'Automate recurring checks, fix issues at scale, track progress over time, and uncover opportunities across SEO, AI search, performance, security, and WooCommerce.',
						'vulopilot'
					)}
				</div>
				<a
					className="admin-btn"
					href={vulopilotAppLocalizer.shop_url}
					target="_blank"
					rel="noreferrer"
				>
					{__('Upgrade to Pro', 'vulopilot')}
					<i className="adminfont-arrow-right arrow-icon"></i>
				</a>
			</div>
			<div className="popup-details">
				<div className="heading-text">
					{__('What you unlock with Pro', 'vulopilot')}
				</div>
				<ul>
					{proPopupContent.messages.map((message, index) => (
						<li key={index}>
							<div className="title">
								<i className={`adminfont-${message.icon}`} />
								{message.text}
							</div>
							<div className="desc">{message.des}</div>
						</li>
					))}
				</ul>
			</div>
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
