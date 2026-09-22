/* global appLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { CardComponent, ListComponent, NoticeManager, PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ContentToolPopup from './ContentToolPopup';
import { ContentTool } from './ContentToolsGrid';
import ConnectVuloCloudPopup from '../../components/AiCredits/ConnectVuloCloudPopup';
import ShowProPopup from '../../components/Popup/Popup';
import { useAiCredits } from '../../services/useAiCredits';
import { useContentToolsEnabled } from '../../services/useContentToolsEnabled';

/**
 * Content page's "Quick Actions" card — 4 rows, 3 of them real, standalone
 * AI actions (the same real propose→preview→approve/reject flow
 * ContentToolsGrid.tsx's own 12 tiles use, via the same shared
 * ContentToolPopup) rather than the plain in-page scroll/navigation
 * shortcuts these rows used to be:
 *
 * - "AI Content Audit" (`audit-content`, free) — an AI-generated
 *   score/summary/suggestions verdict for one existing post, saved as
 *   postmeta. Stays free — gated only on a connected VuloCloud AI account
 *   (ConnectVuloCloudPopup/useAiCredits), same treatment
 *   ContentToolsGrid.tsx's own free tiles (AI Writer, Blog Generator,
 *   Duplicate Content) get. Unrelated to (and doesn't replace)
 *   RecentContentCard.tsx's own rule-based scanner findings, which this row
 *   used to just scroll to.
 * - "Keyword Research" (`keyword-research`, Pro) — AI-suggested target
 *   keywords + content-angle notes for one existing post, saved as
 *   postmeta. A real Pro feature (vulopilot-pro's own
 *   ContentTools\Actions\KeywordResearchAction) — an AI brainstorming aid
 *   alongside, not a replacement for, SEO & Visibility → Keywords' own free
 *   Google Search Console-backed ranking data (this row used to just link
 *   there).
 * - "Content Templates" (`generate-from-template`, Pro) — picks a proven
 *   post structure (how-to guide, listicle, comparison, FAQ page, product
 *   announcement) and drafts a brand-new post around a given topic. A real
 *   Pro feature (vulopilot-pro's own
 *   ContentTools\Actions\GenerateFromTemplateAction) — the actual template
 *   library this row's copy always promised, not the AI content-generation
 *   grid (ContentToolsGrid.tsx) it used to just scroll to.
 * - "Content Planner" (a content editorial calendar) has no real backend
 *   anywhere in this codebase (free or Pro) — rather than link to a
 *   fabricated destination, its row still shows a "Coming soon" tag and an
 *   honest notice on click instead of a working arrow. Untouched by this.
 *
 * Same free/Pro split mechanics as ContentToolsGrid.tsx's own
 * `handleToolClick()` — see that file's own top docblock for the full
 * reasoning this mirrors: a free tool with no AI service connected opens
 * ConnectVuloCloudPopup immediately; a Pro tool with `content-tools`
 * inactive opens ShowProPopup immediately; either way instead of letting
 * ContentToolPopup's own form open first.
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

	const notifyComingSoon = () => {
		NoticeManager.add({
			uniqueKey: 'vulopilot-content-planner-coming-soon',
			type: 'info',
			position: 'float',
			message: __(
				'Content Planner is not available yet — check back in a future update.',
				'vulopilot'
			),
		});
	};

	const handleToolClick = (tool: ContentTool) => {
		if (tool.pro && !isContentToolsEnabled) {
			setIsProLocked(true);
			return;
		}

		if (!tool.pro && creditsStatus && !creditsStatus.connected) {
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
						tags: (
							<span className="admin-badge blue">
								{__('Coming soon', 'vulopilot')}
							</span>
						),
						action: notifyComingSoon,
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
			<ConnectVuloCloudPopup
				open={isCloudConnectPromptOpen}
				onClose={() => setIsCloudConnectPromptOpen(false)}
			/>
			<PopupComponent
				open={isProLocked}
				onClose={dismissProLocked}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				{appLocalizer.khali_dabba ? (
					<ShowProPopup moduleName="content-tools" />
				) : (
					<ShowProPopup />
				)}
			</PopupComponent>
		</CardComponent>
	);
};

export default QuickActionsCard;
