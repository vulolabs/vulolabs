/* global appLocalizer */
import React, { useEffect, useRef, useState } from 'react';
import { ReactSortable } from 'react-sortablejs';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { ColumnComponent, BadgeComponent } from '@zyra/components';
import { DEFAULT_DASHBOARD_WIDGETS } from './registry';
import { DashboardSummary, WidgetLayoutEntry, WidgetDefinition } from './types';
import './DashboardGrid.scss';

interface DashboardGridProps {
	summary: DashboardSummary;
	isLoading: boolean;
	/** Gates drag/hide affordances — see Dashboard.tsx's own state comment. */
	isCustomizing: boolean;
	/**
	 * Incremented by Dashboard.tsx's "Restore default" header button.
	 * A signal counter rather than a boolean so every click re-triggers
	 * the reset effect below even if the value would otherwise be
	 * unchanged (e.g. two clicks in a row with no other re-render
	 * between them).
	 */
	restoreDefaultSignal?: number;
	/** Forwarded straight through to every widget's own `onRefreshSummary` (WidgetProps' own docblock) — Dashboard.tsx's own `loadDashboard`. */
	onRefreshSummary: () => void;
}

/** What ReactSortable actually needs on every list item — see react-sortablejs's own usage in PanelEditor.tsx (Zyra's builders package) for this exact `list`/`setList` shape. */
interface SortableEntry extends WidgetLayoutEntry {
	key: string;
}

const WIDGETS_BY_ID = new Map(
	DEFAULT_DASHBOARD_WIDGETS.map((widget) => [widget.id, widget])
);

/**
 * The drag-and-drop widget grid — fetches the current user's saved
 * layout (`/dashboard-layout`, per-user meta, see
 * Controllers/DashboardLayout.php's docblock for why it's user meta and
 * not a site-wide setting), renders each enabled widget in saved order,
 * and persists a new order back whenever the user drags a widget.
 *
 * Uses `react-sortablejs`'s `ReactSortable` — not a new drag-and-drop
 * dependency: it's already a peer dependency of `@multivendorx/zyra` and
 * is the exact primitive Zyra's own builders package
 * (`PanelEditor.tsx`) uses for its drag-and-drop block canvas, so this
 * follows the dominant drag-and-drop pattern already established in this
 * monorepo rather than introducing a different library.
 *
 * `isCustomizing` (Dashboard.tsx's "Customize dashboard" header toggle)
 * gates whether any of this is reachable at all: when off, widgets render
 * in the same saved order as a plain (non-sortable) grid with no drag
 * handle/hide control and no hidden-widgets chip strip — a normal
 * read-only dashboard. The saved layout itself and the REST calls that
 * read/write it are unaffected either way.
 */
const DashboardGrid: React.FC<DashboardGridProps> = ({
	summary,
	isLoading,
	isCustomizing,
	restoreDefaultSignal,
	onRefreshSummary,
}) => {
	const [layout, setLayout] = useState<WidgetLayoutEntry[]>([]);
	const [isLayoutLoading, setIsLayoutLoading] = useState(true);

	useEffect(() => {
		getApiResponse<WidgetLayoutEntry[]>(
			getApiLink(appLocalizer, 'dashboard-layout'),
			{ headers: { 'X-WP-Nonce': appLocalizer.nonce } }
		)
			.then((response) => {
				// DashboardLayout.php's get_items() always reconciles
				// against every registered widget id and returns a
				// non-empty array on success — an empty/null response
				// here only ever means the request itself failed
				// (network error, or a non-admin hitting its
				// manage_options gate), never "this user has zero
				// widgets". Falling back to the same default order a
				// never-customized install starts with keeps the
				// dashboard usable instead of silently rendering
				// nothing; any drag/hide the user makes still tries to
				// persist normally afterwards.
				if (response && response.length > 0) {
					setLayout(response);
				} else {
					setLayout(
						DEFAULT_DASHBOARD_WIDGETS.map((widget) => ({
							id: widget.id,
							enabled: true,
						}))
					);
				}
			})
			.finally(() => setIsLayoutLoading(false));
	}, []);

	const persistLayout = (nextLayout: WidgetLayoutEntry[]) => {
		setLayout(nextLayout);
		sendApiResponse(
			appLocalizer,
			getApiLink(appLocalizer, 'dashboard-layout'),
			{ widgets: nextLayout }
		);
	};

	// `restoreDefaultSignal` starts at 0 and only ever increments from a
	// real button click (Dashboard.tsx), so skipping the very first run
	// (mount) is enough to avoid resetting the layout the user just
	// fetched before they've clicked anything.
	const isFirstRestoreRender = useRef(true);
	useEffect(() => {
		if (isFirstRestoreRender.current) {
			isFirstRestoreRender.current = false;
			return;
		}

		persistLayout(
			DEFAULT_DASHBOARD_WIDGETS.map((widget) => ({
				id: widget.id,
				enabled: true,
			}))
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [restoreDefaultSignal]);

	const handleHide = (id: string) => {
		persistLayout(
			layout.map((entry) =>
				entry.id === id ? { ...entry, enabled: false } : entry
			)
		);
	};

	const handleRestore = (id: string) => {
		persistLayout(
			layout.map((entry) =>
				entry.id === id ? { ...entry, enabled: true } : entry
			)
		);
	};

	const handleReorder = (newVisibleOrder: SortableEntry[]) => {
		const hidden = layout.filter((entry) => !entry.enabled);
		persistLayout([
			...newVisibleOrder.map(({ id, enabled }) => ({ id, enabled })),
			...hidden,
		]);
	};

	if (isLoading || isLayoutLoading) {
		return (
			<>
				{DEFAULT_DASHBOARD_WIDGETS.slice(0, 4).map((widget) => {
					const Widget = widget.component;
					return (
						<ColumnComponent
							key={widget.id}
							grid={widget.grid}
							className="dashboard-widget-cell"
						>
							<Widget
								summary={summary}
								isLoading
								onHide={() => {}}
								isCustomizing={false}
							/>
						</ColumnComponent>
					);
				})}
			</>
		);
	}

	const visible: SortableEntry[] = layout
		.filter((entry) => entry.enabled && WIDGETS_BY_ID.has(entry.id))
		.map((entry) => ({ ...entry, key: entry.id }));

	const hidden = layout.filter(
		(entry) => !entry.enabled && WIDGETS_BY_ID.has(entry.id)
	);

	const renderWidgetCell = (entry: SortableEntry) => {
		const widget = WIDGETS_BY_ID.get(entry.id);
		if (!widget) {
			return null;
		}
		const Widget = widget.component;
		return (
			<ColumnComponent
				key={widget.id}
				grid={widget.grid}
				className={`dashboard-widget-cell${isCustomizing ? ' is-customizing' : ''}`}
			>
				<Widget
					summary={summary}
					isLoading={isLoading}
					onHide={() => handleHide(widget.id)}
					isCustomizing={isCustomizing}
					onRefreshSummary={onRefreshSummary}
				/>
			</ColumnComponent>
		);
	};

	return (
		<>
			{isCustomizing ? (
				// ReactSortable needs to own the actual sortable DOM node
				// itself (it takes a ref to it), so it can't render
				// ContainerComponent as a child the way the read-only
				// branch below does — `className` is set to the exact
				// same `container-wrapper general-wrapper` markup
				// ContainerComponent's own `general` variant renders
				// (ContainerComponent.tsx), so the grid looks and behaves
				// identically either way.
				<ReactSortable
					list={visible}
					setList={handleReorder}
					handle=".widget-drag-handle"
					animation={150}
					className="container-wrapper"
				>
					{visible.map(renderWidgetCell)}
				</ReactSortable>
			) : (
				<>{visible.map(renderWidgetCell)}</>
			)}

			{isCustomizing && hidden.length > 0 && (
				<div className="dashboard-hidden-widgets">
					<span className="dashboard-hidden-widgets-label">
						{__('Hidden widgets:', 'vulopilot')}
					</span>
					{hidden.map((entry) => {
						const widget = WIDGETS_BY_ID.get(entry.id);
						if (!widget) {
							return null;
						}
						return (
							<BadgeComponent
								key={widget.id}
								className="dashboard-hidden-widget-chip"
								icon="plus"
								text={widget.title}
								role="button"
								tabIndex={0}
								onClick={() => handleRestore(widget.id)}
							/>
						);
					})}
				</div>
			)}
		</>
	);
};

export default DashboardGrid;
