import React from 'react';
import { __ } from '@wordpress/i18n';
import BannerCard from '../../components/BannerCard';

/**
 * Compact, dismissible "finish setup" banner — replaces the old
 * WelcomeSection's much larger welcome banner + Modules grid + Extend your
 * website + Need help getting started cards, none of which exist in the
 * Dashboard mockup this page is modeled on. Same-publisher quick links the
 * old WelcomeSection used (VuloLabs/dualcube docs, consultation, Discord —
 * no confirmed VuloPilot-specific URLs exist anywhere in this codebase),
 * plus a shortcut into Modules for CatalogX/Notifima instead of duplicating
 * their real install/activate flow, which still lives on the Modules page
 * itself.
 *
 * Rendered as its own banner (real `dashboard-banner.png` illustration as
 * background) rather than a plain `CardComponent`, matching the mockup's
 * own full-width purple banner — that asset has no title/toggle/border
 * affordances of its own, so the header row and dismiss control are
 * hand-built here instead of borrowed from `CardComponent`.
 */
const GettingStartedCard: React.FC = () => (
	<BannerCard
		dismissible
		dismissKey="vulopilot_getting_started_dismissed"
		title={__('Welcome to VuloPilot — finish setup', 'vulopilot')}
		desc={__('Docs, help, and modules to get the most out of VuloPilot.', 'vulopilot')}
			buttons={[
				{
					text: __('Explore docs', 'vulopilot'),
					icon: 'document',
					color: 'purple-bg',
					onClick: () =>
						window.open(
							'https://vulolabs.com/docs/knowledgebase/?utm_source=wpadmin&utm_medium=pluginsettings&utm_campaign=vulopilot',
							'_blank',
							'noopener,noreferrer'
						),
				},
				{
					text: __('Book a consultation', 'vulopilot'),
					icon: 'live-chat',
					color: 'white',
					onClick: () =>
						window.open(
							'https://vulolabs.com/custom-development/?utm_source=wpadmin&utm_medium=pluginsettings&utm_campaign=vulopilot',
							'_blank',
							'noopener,noreferrer'
						),
				},
				{
					text: __('Join Discord', 'vulopilot'),
					icon: 'global-community',
					color: 'white',
					onClick: () =>
						window.open(
							'https://discord.com/channels/1376811097134469191/1376811102020829258',
							'_blank',
							'noopener,noreferrer'
						),
				},
				{
					text: __('Extend: CatalogX, Notifima', 'vulopilot'),
					icon: 'cart',
					color: 'white',
					onClick: () => {
						// `tab=settings&subtab=modules`, not the old
						// standalone `tab=modules` route — see
						// Popup.tsx's own "Enable Now" comment for why.
						window.location.href =
							'?page=vulopilot#&tab=settings&subtab=modules';
					},
				},
			]}
	/>
);

export default GettingStartedCard;
