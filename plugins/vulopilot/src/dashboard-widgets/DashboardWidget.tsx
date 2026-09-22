import React from 'react';
import { __ } from '@wordpress/i18n';
import { CardComponent, TooltipComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';

interface DashboardWidgetProps {
	title: React.ReactNode;
	icon: string;
	isLoading?: boolean;
	onHide: () => void;
	isCustomizing: boolean;
	children: React.ReactNode;
	/** Passed straight through to CardComponent — e.g. BrandBreakdownWidget's pink accent. */
	borderColor?: string;
	/** Passed straight through to CardComponent — a short subtitle under the title. */
	desc?: React.ReactNode;
	/**
	 * An optional always-visible header link (e.g. "Show details" linking
	 * to another page) — same `CardComponent` `action` slot the drag/hide
	 * controls use, so it only renders outside customization mode (the
	 * drag handle needs that space instead while reordering).
	 */
	headerAction?: React.ReactNode;
}

/**
 * The one reusable shell every dashboard widget renders inside — wraps
 * Zyra's CardComponent (react-frontend.md: build UI from the shared zyra
 * package, not raw elements) and adds the two things every widget needs
 * beyond a plain card: a `.widget-drag-handle` element for
 * DashboardGrid.tsx's ReactSortable `handle` option (so dragging only
 * starts from this handle, not from a click anywhere on the widget), and
 * a "hide" control that writes back into the saved layout instead of
 * unmounting silently.
 *
 * The widget's icon is composed into `title` (rather than passed as
 * CardComponent's own `iconName` prop) because CardComponent only renders
 * `iconName` when no `action` is supplied — every widget here has an
 * `action` (the drag/hide controls), so `iconName` would silently never
 * render.
 *
 * Every widget's own component (StatWidget, HealthTimelineWidget, etc.)
 * only implements what's inside `children` — the header, loading
 * skeleton, and drag/hide affordances are never re-implemented per
 * widget.
 *
 * `isCustomizing` gates the whole `action` block: outside customization
 * mode there's no drag handle and no hide control at all (not just
 * visually hidden — omitted from the `CardComponent` call the same way
 * every non-dashboard `CardComponent` usage in this plugin already omits
 * `action` when it has none), so a read-only dashboard can't be
 * accidentally reordered or hidden by a stray click.
 */
const DashboardWidget: React.FC<DashboardWidgetProps> = ({
	title,
	icon,
	isLoading,
	onHide,
	isCustomizing,
	children,
	borderColor,
	desc,
	headerAction,
}) => {
	return (
		<CardComponent
			className={`dashboard-widget${isCustomizing ? ' is-customizing' : ''}`}
			titleIcon={icon}
			title={title}
			isLoading={isLoading}
			borderColor={borderColor}
			desc={desc}
			action={
				isCustomizing ? (
					<>
						<ButtonInput
							buttons={{
								text: __('Hide', 'vulopilot'),
								color: 'text-purple',
								icon: 'eye-blocked',
								onClick: onHide,
							}}
						/>
						<TooltipComponent text={__('Drag to reorder', 'vulopilot')}>
							{/* The whole button is the sortable handle (DashboardGrid.tsx's `handle=".widget-drag-handle"`), not just its icon, so a mouse-down on the label starts a drag too. */}
							<span className="widget-drag-handle">
								<ButtonInput
									buttons={{
										color: 'purple',
										icon: 'move',
									}}
								/>
							</span>
						</TooltipComponent>
					</>
				) : (
					headerAction ?? undefined
				)
			}
		>
			{children}
		</CardComponent>
	);
};

export default DashboardWidget;
