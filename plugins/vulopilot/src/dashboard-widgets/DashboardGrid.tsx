/* global vulopilotAppLocalizer */
import React, { useEffect, useRef, useState } from 'react';
import { ReactSortable } from 'react-sortablejs';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { useDashboardWidgets } from './registry';
import { DashboardSummary, WidgetDefinition, WidgetLayoutEntry } from './types';
import './DashboardGrid.scss';

interface DashboardGridProps {
	summary: DashboardSummary;
	isLoading: boolean;
	/** Gates drag/hide affordances - see Dashboard.tsx's own state comment. */
	isCustomizing: boolean;
	/** Incremented by Dashboard.tsx's "Restore default" header button. */
	restoreDefaultSignal?: number;
	/** Forwarded straight through to every widget's own `onRefreshSummary`. */
	onRefreshSummary: () => void;
}

/** What ReactSortable actually needs on every list item. */
interface SortableEntry extends WidgetLayoutEntry {
	key: string;
}

/** Columns (of 12) a widget spans: its `grid`, else Pro's `size: 'small'` as half width, else the full row. */
const spanOf = (widget: WidgetDefinition): number =>
	widget.grid ?? ('small' === widget.size ? 6 : 12);


/** Drag-and-drop widget grid. */
const DashboardGrid: React.FC<DashboardGridProps> = ({
	summary,
	isLoading,
	isCustomizing,
	restoreDefaultSignal,
	onRefreshSummary,
}) => {
	const widgets = useDashboardWidgets();
	const widgetsById = new Map(widgets.map((widget) => [widget.id, widget]));
	const [layout, setLayout] = useState<WidgetLayoutEntry[]>([]);
	const [isLayoutLoading, setIsLayoutLoading] = useState(true);

	useEffect(() => {
		getApiResponse<WidgetLayoutEntry[]>(
			getApiLink(vulopilotAppLocalizer, 'dashboard-layout'),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				// DashboardLayout.php's get_items() always reconciles against every registered widget id and returns a non-empty array on success.
				if (response && response.length > 0) {
					setLayout(response);
				} else {
					setLayout(
						widgets.map((widget) => ({
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
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, 'dashboard-layout'),
			{ widgets: nextLayout }
		);
	};

	// `restoreDefaultSignal` starts at 0 and only ever increments from a real button click.
	const isFirstRestoreRender = useRef(true);
	useEffect(() => {
		if (isFirstRestoreRender.current) {
			isFirstRestoreRender.current = false;
			return;
		}

		persistLayout(
			widgets.map((widget) => ({
				id: widget.id,
				enabled: true,
			}))
		);
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
			<div className="vp-dash-grid">
				{widgets.slice(0, 4).map((widget) => {
					const Widget = widget.component;
					return (
						<div
							key={widget.id}
							className="vp-dash-cell"
							style={{ gridColumn: `span ${spanOf(widget)}` }}
						>
							<Widget
								summary={summary}
								isLoading
								onHide={() => {}}
								isCustomizing={false}
								onRefreshSummary={onRefreshSummary}
							/>
						</div>
					);
				})}
			</div>
		);
	}

	const visible: SortableEntry[] = layout
		.filter((entry) => entry.enabled && widgetsById.has(entry.id))
		.map((entry) => ({ ...entry, key: entry.id }));

	const hidden = layout.filter(
		(entry) => !entry.enabled && widgetsById.has(entry.id)
	);

	const renderWidgetCell = (entry: SortableEntry) => {
		const widget = widgetsById.get(entry.id);
		if (!widget) {
			return null;
		}
		const Widget = widget.component;
		return (
			<div
				key={widget.id}
				className={`vp-dash-cell${isCustomizing ? ' is-customizing' : ''}`}
				style={{ gridColumn: `span ${spanOf(widget)}` }}
			>
				<Widget
					summary={summary}
					isLoading={isLoading}
					onHide={() => handleHide(widget.id)}
					isCustomizing={isCustomizing}
					onRefreshSummary={onRefreshSummary}
				/>
			</div>
		);
	};

	return (
		<>
			{isCustomizing ? (
				// ReactSortable needs to own the actual sortable DOM node itself (it takes a ref to it).
				<ReactSortable
					list={visible}
					setList={handleReorder}
					handle=".widget-drag-handle"
					animation={150}
					className="vp-dash-grid is-customizing"
				>
					{visible.map(renderWidgetCell)}
				</ReactSortable>
			) : (
				<div className="vp-dash-grid">{visible.map(renderWidgetCell)}</div>
			)}

			{isCustomizing && hidden.length > 0 && (
				<div className="vp-hidden-widgets">
					<span>{__('Hidden widgets', 'vulopilot')}</span>
					{hidden.map((entry) => {
						const widget = widgetsById.get(entry.id);
						if (!widget) {
							return null;
						}
						return (
							<button
								key={widget.id}
								type="button"
								className="vp-chip-link"
								onClick={() => handleRestore(widget.id)}
							>
								<i className="adminfont-plus" aria-hidden="true" />
								{widget.title}
							</button>
						);
					})}
				</div>
			)}
		</>
	);
};

export default DashboardGrid;
