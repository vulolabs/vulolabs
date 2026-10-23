/* global vulopilotAppLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { CardComponent, ListComponent, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ContentToolPopup from './ContentToolPopup';
import { ContentTool } from './ContentToolsGrid';
import ShowProPopup from '../../components/Popup/Popup';
import { useAiCredits } from '../../services/useAiCredits';
import { useContentToolsEnabled } from '../../services/useContentToolsEnabled';

/**
 * "Quick Actions" card: standalone AI actions using the same propose, preview and approve flow as
 * ContentToolsGrid.tsx.
 */
const QUICK_ACTION_TOOLS: ContentTool[] = [
	{
		id: 'content-audit',
		icon: 'lock',
		color: 'purple',
		title: __('AI Content Audit', 'vulopilot'),
		desc: __('Scan and audit all your content', 'vulopilot'),
		actionId: 'audit-content',
		fields: [
			{
				key: 'post_id',
				label: __('Post or page', 'vulopilot'),
				type: 'post-picker',
			},
		],
	},
	{
		id: 'keyword-research',
		icon: 'search',
		color: 'blue',
		title: __('Keyword Research', 'vulopilot'),
		desc: __('Discover content opportunities', 'vulopilot'),
		actionId: 'keyword-research',
		pro: true,
		fields: [
			{
				key: 'post_id',
				label: __('Post or page', 'vulopilot'),
				type: 'post-picker',
			},
		],
	},
	{
		id: 'content-templates',
		icon: 'document',
		color: 'orange',
		title: __('Content Templates', 'vulopilot'),
		desc: __('Use proven content templates', 'vulopilot'),
		actionId: 'generate-from-template',
		pro: true,
		fields: [
			{
				key: 'template_type',
				label: __('Template', 'vulopilot'),
				type: 'select',
				options: [
					{ value: 'how-to-guide', label: __('How-To Guide', 'vulopilot') },
					{ value: 'listicle', label: __('Listicle', 'vulopilot') },
					{ value: 'comparison', label: __('Comparison Post', 'vulopilot') },
					{ value: 'faq-page', label: __('FAQ Page', 'vulopilot') },
					{ value: 'product-announcement', label: __('Product Announcement', 'vulopilot') },
				],
			},
			{ key: 'topic', label: __('Topic', 'vulopilot'), type: 'text' },
		],
	},
];

const QuickActionsCard = () => {
	const [activeTool, setActiveTool] = useState<ContentTool | null>(null);
	const { status: creditsStatus } = useAiCredits();
	const isContentToolsEnabled = useContentToolsEnabled();
	const [isCloudConnectPromptOpen, setIsCloudConnectPromptOpen] = useState(false);
	const [isProLocked, setIsProLocked] = useState(false);
	const dismissProLocked = () => setIsProLocked(false);

	const scrollTo = (id: string) => {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	// Content Planner has its own dedicated page (`pages/ContentPlanner/ContentPlanner.tsx`, WP
	// menu slug `content-planner`) - this button navigates there directly rather than opening a
	// second, competing create UI over the same `/content-planner` REST store (the Content
	// Planner Redesign spec's "two competing create flows" complaint - the old popup this used
	// to open has been removed).
	const openPlanner = () => {
		if (vulopilotAppLocalizer.khali_dabba) {
			window.location.href = '?page=vulopilot#&tab=content-planner';
			return;
		}

		setIsProLocked(true);
	};

	const handleToolClick = (tool: ContentTool) => {
		if (tool.pro && !isContentToolsEnabled) {
			setIsProLocked(true);
			return;
		}

		if (creditsStatus && !creditsStatus.connected) {
			setIsCloudConnectPromptOpen(true);
			return;
		}

		setActiveTool(tool);
	};

	const proBadge = (tool: ContentTool) =>
		tool.pro && !isContentToolsEnabled ? (
			<span className="admin-tag pro-tag pro-tag-inline">
				<i className="adminfont-pro-tag" />
				{__('Pro', 'vulopilot')}
			</span>
		) : (
			<i className="adminfont-arrow-right" />
		);

	return (
		<CardComponent
			id="content-quick-actions-card"
			title={__('Quick Actions', 'vulopilot')}
			titleIcon="ai"
			desc={__('Jump straight to your most common content tasks.', 'vulopilot')}
		>
			<ListComponent
				className="mini-card report without-border "
				border
				items={[
					...QUICK_ACTION_TOOLS.map((tool) => ({
						id: tool.id,
						icon: tool.icon,
						className: `icon-${tool.color}`,
						title: tool.title,
						desc: tool.desc,
						tags: proBadge(tool),
						action: () => handleToolClick(tool),
					})),
					{
						id: 'content-planner',
						icon: 'calendar',
						className: 'icon-blue',
						title: __('Content Planner', 'vulopilot'),
						desc: __('Plan and schedule content', 'vulopilot'),
						tags: vulopilotAppLocalizer.khali_dabba ? (
							<i className="adminfont-arrow-right" />
						) : (
							<span className="admin-tag pro-tag pro-tag-inline">
								<i className="adminfont-pro-tag" />
								{__('Pro', 'vulopilot')}
							</span>
						),
						action: openPlanner,
					},
				]}
			/>
			<ButtonInput
				wrapperClass="quick-actions-view-all"
				buttons={{
					text: __('View all tools', 'vulopilot'),
					rightIcon: 'arrow-right',
					color: 'border-purple',
					onClick: () => scrollTo('content-tools-grid'),
				}}
			/>
			<ContentToolPopup tool={activeTool} onClose={() => setActiveTool(null)} />
			<PopupComponent
				open={isCloudConnectPromptOpen}
				onClose={() => setIsCloudConnectPromptOpen(false)}
				width={22}
				height="auto"
				position="lightbox"
			>
				<ShowProPopup vulocloud />
			</PopupComponent>
			<PopupComponent
				open={isProLocked}
				onClose={dismissProLocked}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{vulopilotAppLocalizer.khali_dabba ? (
					<ShowProPopup moduleName="content-optimization" />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</CardComponent>
	);
};

export default QuickActionsCard;
