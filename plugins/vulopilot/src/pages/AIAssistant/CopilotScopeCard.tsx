import React from 'react';
import { __ } from '@wordpress/i18n';
import { IconTile } from '../../components/ui';

/** What the Copilot will and will not change - the trust contract, in view rather than behind a tooltip. */
const CopilotScopeCard: React.FC = () => (
	<section className="vp-card vp-rail-card">
		<header className="vp-rail-head">
			<div>
				<h3>{__('What Copilot does', 'vulopilot')}</h3>
				<p>{__('Nothing changes on your site without your say.', 'vulopilot')}</p>
			</div>
		</header>
		<ul className="vp-list vp-scope">
			<li>
				<IconTile icon="edit" tone="green" size="sm" />
				<div className="vp-list-main">
					<strong>{__('Writes blog posts', 'vulopilot')}</strong>
					<span>{__('Saved as drafts and logged to History, with Undo.', 'vulopilot')}</span>
				</div>
			</li>
			<li>
				<IconTile icon="search-discovery" tone="blue" size="sm" />
				<div className="vp-list-main">
					<strong>{__('Advises on the rest', 'vulopilot')}</strong>
					<span>{__('SEO, speed, security and store answers based on your real data.', 'vulopilot')}</span>
				</div>
			</li>
			<li>
				<IconTile icon="approval" tone="violet" size="sm" />
				<div className="vp-list-main">
					<strong>{__('Asks before going live', 'vulopilot')}</strong>
					<span>{__('Even with Auto-apply on, fixes wait for your approval.', 'vulopilot')}</span>
				</div>
			</li>
		</ul>
	</section>
);

export default CopilotScopeCard;
