import React from 'react';
import { AnalyticsComponent, ModuleGuardComponent } from '@zyra/components';
import DashboardWidget from './DashboardWidget';
import { DashboardSummary, WidgetProps } from './types';

export interface StatWidgetConfig {
	id: string;
	title: string;
	icon: string;
	 
	/** Reads this widget's headline number out of the shared /dashboard summary payload. */
	// eslint-disable-next-line no-unused-vars
	getNumber: (summary: DashboardSummary) => React.ReactNode;
	/** Optional secondary line under the number (e.g. "3 critical", "2 open issues"). */
	// eslint-disable-next-line no-unused-vars
	getExtra?: (summary: DashboardSummary) => React.ReactNode;
	/**
	 * When present and returns a value, the widget shows this empty state instead of a number.
	 */
	getUnavailableState?: (
		// eslint-disable-next-line no-unused-vars
		summary: DashboardSummary
	) => { title: string; desc: string } | null;
	 
}

interface StatWidgetProps {
	config: StatWidgetConfig;
	summary: DashboardSummary;
	isLoading: boolean;
	onHide: () => void;
	isCustomizing: boolean;
}

/**
 * Binds a StatWidgetConfig into a component matching WidgetDefinition's
 * `React.ComponentType<WidgetProps>` shape.
 */
export const createStatWidgetComponent = (
	config: StatWidgetConfig
): React.FC<WidgetProps> => {
	const Component: React.FC<WidgetProps> = ({
		summary,
		isLoading,
		onHide,
		isCustomizing,
	}) => (
		<StatWidget
			config={config}
			summary={summary}
			isLoading={isLoading}
			onHide={onHide}
			isCustomizing={isCustomizing}
		/>
	);
	Component.displayName = `StatWidget(${config.id})`;
	return Component;
};

/**
 * Config-driven stat tile.
 */
const StatWidget: React.FC<StatWidgetProps> = ({
	config,
	summary,
	isLoading,
	onHide,
	isCustomizing,
}) => {
	const unavailable = config.getUnavailableState?.(summary);

	return (
		<DashboardWidget
			title={config.title}
			icon={config.icon}
			isLoading={isLoading}
			onHide={onHide}
			isCustomizing={isCustomizing}
		>
			{unavailable ? (
				<ModuleGuardComponent
					icon={config.icon}
					title={unavailable.title}
					desc={unavailable.desc}
				/>
			) : (
				<AnalyticsComponent
					variant="progress"
					cols={1}
					isLoading={isLoading}
					data={[
						{
							icon: config.icon,
							number: config.getNumber(summary),
							text: config.title,
							extra: config.getExtra?.(summary),
							progress: config.getNumber(summary),
							colorClass: 'zyra-red-color'
						},
					]}
				/>
			)}
		</DashboardWidget>
	);
};

export default StatWidget;
