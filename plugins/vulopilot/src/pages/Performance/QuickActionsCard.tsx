/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import {
	CardComponent,
	ListComponent,
	NoticeManager,
	NoticeReceiverComponent,
} from '@zyra/components';
import './Performance.scss';

interface QuickAction {
	id: string;
	icon: string;
	label: string;
}

interface ActionResult {
	success: boolean;
	message: string;
}

const QUICK_ACTIONS: QuickAction[] = [
	{ id: 'clear-caches', icon: 'refresh-bold', label: __('Clear All Caches', 'vulopilot') },
	{ id: 'minify-css-js', icon: 'coding', label: __('Minify CSS & JS', 'vulopilot') },
	{ id: 'optimize-images', icon: 'image', label: __('Optimize Images', 'vulopilot') },
	{ id: 'database-cleanup', icon: 'database', label: __('Database Cleanup', 'vulopilot') },
	{ id: 'image-cleanup', icon: 'delete', label: __('Image Cleanup', 'vulopilot') },
	{ id: 'lazy-loading', icon: 'eye', label: __('Enable Lazy Loading', 'vulopilot') },
	{ id: 'preload-resources', icon: 'cloud-upload', label: __('Preload Critical Resources', 'vulopilot') },
	{ id: 'browser-caching', icon: 'global-community', label: __('Enable Browser Caching', 'vulopilot') },
];

const QuickActionsCard = () => {
	const [runningActionId, setRunningActionId] = useState<string | null>(null);

	const runAction = (action: QuickAction) => {
		if (runningActionId) {
			return;
		}

		setRunningActionId(action.id);

		sendApiResponse<ActionResult>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, `performance-actions/${action.id}`),
			{}
		)
			.then((response) => {
				NoticeManager.add(
					{
						uniqueKey: `speed-quick-action-${action.id}`,
						type: response && response.success ? 'success' : 'info',
						position: 'notice',
						message: response
							? response.message
							: __(
									'Could not run this action - please try again.',
									'vulopilot'
								),
					},
					5000
				);
			})
			.finally(() => setRunningActionId(null));
	};

	return (
		<CardComponent
			id="performance-quick-actions-card"
			title={__('Quick Actions', 'vulopilot')}
			titleIcon="ai"
			desc={__('Common performance fixes you can run in one click.', 'vulopilot')}
		>
			<ListComponent
				className="mini-card report without-border"
				border
				items={QUICK_ACTIONS.map((action) => ({
					id: action.id,
					icon: action.icon,
					title: action.label,
					tags:
						runningActionId === action.id ? (
							<i className="adminfont-refresh performance-quick-action-spinner" />
						) : (
							<i className="adminfont-arrow-right" />
						),
					action: () => runAction(action),
				}))}
			/>
			<NoticeReceiverComponent position="notice" />
		</CardComponent>
	);
};

export default QuickActionsCard;
