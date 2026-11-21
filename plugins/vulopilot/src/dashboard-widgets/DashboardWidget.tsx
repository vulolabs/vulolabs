import React from 'react';
import { __ } from '@wordpress/i18n';
import { Card, Skeleton } from '../components/ui';

interface DashboardWidgetProps {
	title: React.ReactNode;
	icon: string;
	isLoading?: boolean;
	onHide: () => void;
	isCustomizing: boolean;
	children: React.ReactNode;
	/** A short subtitle under the title. */
	desc?: React.ReactNode;
	/** An optional always-visible header control (a link to another page, a period switch). */
	headerAction?: React.ReactNode;
	/** Anchor id, so other screens can link straight to this card. */
	id?: string;
	className?: string;
	/** Kept for the old zyra-card API; the new cards carry no coloured border. */
	borderColor?: string;
}

/**
 * The one shell every dashboard widget renders inside: the VuloCart/VuloForm/VuloMail card (components/ui.tsx).
 * While customizing, the header action makes way for "Hide" and the drag handle DashboardGrid sorts by.
 */
const DashboardWidget: React.FC<DashboardWidgetProps> = ({
	title,
	icon,
	isLoading,
	onHide,
	isCustomizing,
	children,
	desc,
	headerAction,
	id,
	className = '',
}) => (
	<Card
		id={id}
		className={`dashboard-widget${isCustomizing ? ' is-customizing' : ''} ${className}`.trim()}
		icon={icon}
		title={title}
		desc={desc}
		action={
			isCustomizing ? (
				<div className="vp-widget-tools">
					<button type="button" className="vp-widget-tool" onClick={onHide}>
						<i className="adminfont-eye-blocked" aria-hidden="true" />
						{__('Hide', 'vulopilot')}
					</button>
					{/* DashboardGrid.tsx sorts by `handle=".widget-drag-handle"`. */}
					<span className="vp-widget-tool is-handle widget-drag-handle" title={__('Drag to reorder', 'vulopilot')}>
						<i className="adminfont-move" aria-hidden="true" />
						<span className="screen-reader-text">{__('Drag to reorder', 'vulopilot')}</span>
					</span>
				</div>
			) : (
				headerAction
			)
		}
	>
		{isLoading ? <Skeleton size="block" /> : children}
	</Card>
);

export default DashboardWidget;
