/* global appLocalizer */
import { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { CardComponent, ListComponent, PopupComponent } from '@zyra/components';
import ContentToolPopup from './ContentToolPopup';
import ConnectVuloCloudPopup from '../../components/AiCredits/ConnectVuloCloudPopup';
import ShowProPopup from '../../components/Popup/Popup';
import { useAiCredits } from '../../services/useAiCredits';
import { useContentToolsEnabled } from '../../services/useContentToolsEnabled';

export type ToolFieldType =
	| 'post-picker'
	| 'text'
	| 'textarea'
	| 'media-picker'
	| 'duplicate-finding-picker'
	| 'select';

export interface ToolField {
	key: string;
	label: string;
	type: ToolFieldType;
	/** Only for 'post-picker' — restricts which real post types are offered. */
	postTypes?: ('post' | 'page')[];
	/** Only for 'select' — a fixed, static option list rendered directly (no network fetch), unlike the other picker types. */
	options?: { value: string; label: string }[];
}

export interface ContentTool {
	id: string;
	icon: string;
	color: string;
	title: string;
	desc: string;
	/** The real AIActionInterface id this tool runs (classes/AIActions/Actions/*.php). */
	actionId: string;
	fields: ToolField[];
	/** True for the 9 tiles that are a real, Pro-only feature (vulopilot-pro's own modules/ContentTools/Rest.php) — see this file's own top docblock for the exact split and why. Omitted (falsy) for the 3 that stay free. */
	pro?: boolean;
}

/**
 * The 12 tool tiles each run a real AI action end-to-end: pick the real
 * input it needs (an existing post, an image, a topic — see `fields`),
 * propose it for real, show the real AI-generated preview, then
 * approve/reject it for real — see ContentToolPopup.tsx for the full
 * flow. 6 of these actions already existed (GenerateBlogAction,
 * GenerateProductDescriptionAction, GenerateFaqAction, GenerateSchemaAction,
 * GenerateAltAction, WriteMetaTitleAction) but had no route to trigger
 * them; the other 6 (WritePostContentAction, GenerateLandingPageAction,
 * OptimizeContentAction, RefreshContentAction, DifferentiateDuplicateTitleAction,
 * OptimizeMediaAction) are new, purpose-built for these tiles — see each
 * class's own docblock.
 *
 * Per direct instruction, this grid is a real split, not one uniform
 * gate: AI Writer/Blog Generator/Duplicate Content (`pro` omitted) stay
 * free — `POST /ai-action-runs` (Free's own shared
 * AIActions\ActionRunner::propose(), still there, still free for "Fix
 * with AI" buttons elsewhere too), gated only on `useAiCredits()`'s own
 * real AI-connected check (ConnectVuloCloudPopup opens
 * immediately on click if not). The other 9 (`pro: true`) are a real
 * Pro feature — `POST /content-tools/runs` (vulopilot-pro's own
 * ContentTools\Rest.php, a SEPARATE route forwarding to that exact same
 * engine, gated behind the real `content-tools` Pro module) — a tile
 * click with Pro inactive opens ShowProPopup immediately instead
 * (`handleToolClick()` below), and shows a small "PRO" badge in its own
 * row so which tiles need Pro is visible before clicking, not just
 * discovered by trying.
 */
export const CONTENT_TOOLS: ContentTool[] = [
	{
		id: 'ai-writer',
		icon: 'edit',
		color: 'purple',
		title: __('AI Writer', 'vulopilot'),
		desc: __('Write engaging content with AI in seconds.', 'vulopilot'),
		actionId: 'write-post-content',
		fields: [
			{
				key: 'brief',
				label: __('What should it write about?', 'vulopilot'),
				type: 'textarea',
			},
		],
	},
	{
		id: 'blog-generator',
		icon: 'document',
		color: 'green',
		title: __('Blog Generator', 'vulopilot'),
		desc: __('Generate SEO-optimized blog posts instantly.', 'vulopilot'),
		actionId: 'generate-blog',
		fields: [
			{ key: 'topic', label: __('Topic', 'vulopilot'), type: 'text' },
		],
	},
	{
		id: 'landing-pages',
		icon: 'web-page-website',
		color: 'blue',
		title: __('Landing Pages', 'vulopilot'),
		desc: __('Create high-converting landing pages.', 'vulopilot'),
		actionId: 'generate-landing-page',
		pro: true,
		fields: [
			{
				key: 'topic',
				label: __('What is this landing page for?', 'vulopilot'),
				type: 'text',
			},
		],
	},
	{
		id: 'product-descriptions',
		icon: 'cart',
		color: 'orange',
		title: __('Product Descriptions', 'vulopilot'),
		desc: __('Write persuasive product descriptions that sell.', 'vulopilot'),
		actionId: 'generate-product-description',
		pro: true,
		fields: [
			{
				key: 'product_name',
				label: __('Product name', 'vulopilot'),
				type: 'text',
			},
			{
				key: 'key_features',
				label: __('Key features (optional)', 'vulopilot'),
				type: 'textarea',
			},
		],
	},
	{
		id: 'faq-generator',
		icon: 'question',
		color: 'red',
		title: __('FAQ Generator', 'vulopilot'),
		desc: __('Generate FAQs that answer customer questions.', 'vulopilot'),
		actionId: 'generate-faq',
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
		id: 'schema-generator',
		icon: 'shortcode',
		color: 'indigo',
		title: __('Schema Generator', 'vulopilot'),
		desc: __('Create structured data schema markup.', 'vulopilot'),
		actionId: 'generate-schema',
		pro: true,
		fields: [
			{
				key: 'post_id',
				label: __('Post or page (must be published)', 'vulopilot'),
				type: 'post-picker',
			},
		],
	},
	{
		id: 'image-alt-text',
		icon: 'image',
		color: 'green',
		title: __('Image Alt Text', 'vulopilot'),
		desc: __('Generate SEO-friendly alt text for images.', 'vulopilot'),
		actionId: 'generate-alt',
		pro: true,
		fields: [
			{
				key: 'attachment_id',
				label: __('Image', 'vulopilot'),
				type: 'media-picker',
			},
		],
	},
	{
		id: 'meta-generator',
		icon: 'price',
		color: 'orange',
		title: __('Meta Generator', 'vulopilot'),
		desc: __('Create meta titles that rank.', 'vulopilot'),
		actionId: 'write-meta-title',
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
		id: 'content-optimizer',
		icon: 'bar-chart',
		color: 'teal',
		title: __('Content Optimizer', 'vulopilot'),
		desc: __('Optimize content for SEO and readability.', 'vulopilot'),
		actionId: 'optimize-content',
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
		id: 'content-refresh',
		icon: 'refresh',
		color: 'blue',
		title: __('Content Refresh', 'vulopilot'),
		desc: __('Update and improve existing content with AI.', 'vulopilot'),
		actionId: 'refresh-content',
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
		id: 'duplicate-content',
		icon: 'copy',
		color: 'pink',
		title: __('Duplicate Content', 'vulopilot'),
		desc: __('Find and fix duplicate content issues.', 'vulopilot'),
		actionId: 'differentiate-duplicate-title',
		fields: [
			{
				key: 'post_ids',
				label: __('Duplicate title group', 'vulopilot'),
				type: 'duplicate-finding-picker',
			},
		],
	},
	{
		id: 'media-library-ai',
		icon: 'media-library',
		color: 'purple',
		title: __('Media Library AI', 'vulopilot'),
		desc: __('Optimize alt text, titles, and captions for an image.', 'vulopilot'),
		actionId: 'optimize-media',
		pro: true,
		fields: [
			{
				key: 'attachment_id',
				label: __('Image', 'vulopilot'),
				type: 'media-picker',
			},
		],
	},
];

const ContentToolsGrid = () => {
	const [activeTool, setActiveTool] = useState<ContentTool | null>(null);
	const { status: creditsStatus } = useAiCredits();
	const isContentToolsEnabled = useContentToolsEnabled();
	const [isCloudConnectPromptOpen, setIsCloudConnectPromptOpen] = useState(false);
	/** True right after a Pro-only tile was clicked without an active Pro license — opens ShowProPopup below. Reset via `dismissProLocked()`. */
	const [isProLocked, setIsProLocked] = useState(false);
	const dismissProLocked = () => setIsProLocked(false);

	/**
	 * Checked up front, before a tool even opens — per direct instruction.
	 * A `pro` tile with `content-tools` inactive opens ShowProPopup
	 * immediately; a free tile with no AI service connected opens
	 * ConnectVuloCloudPopup immediately — either way, instead of letting
	 * the tool's own form open first and only discovering a real failure
	 * at Generate time (both still real fallbacks too — see
	 * ContentToolPopup.tsx's own `isNoProviderError` handling — for the
	 * rare case either state changes between this check and that click).
	 * `creditsStatus` starts `null` while `useAiCredits()`'s own first
	 * fetch is in flight — deliberately NOT blocked on that (a tile click
	 * in the first instant after page load falls through to the tool's own
	 * normal open), only once it's positively known the site isn't
	 * connected.
	 */
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

	return (
		<>
			<CardComponent
				id="content-tools-grid"
				className="ai-card"
				title={__('Content Tools', 'vulopilot')}
				titleIcon='tools'
				desc={__('AI tools to help you create and improve content.', 'vulopilot')}
			>
				<ListComponent
					className="tool-grid"
					items={CONTENT_TOOLS.map((tool) => ({
						id: tool.id,
						// "<adminfont name> <$color-palette key>" — same
						// icon-name-plus-palette-key convention MetricsGrid.tsx/
						// SecurityMetricsGrid.tsx already use: the extra word
						// isn't part of the icon name, it's zyra's own real,
						// already-compiled `.{color}` global utility class
						// (theme/src/common.scss's `@each $name, $style in
						// $color-palette` loop) tacked on via IconComponent's
						// className string. Replaces a custom `icon-${tool.color}`
						// class this card used to set — that class landed on the
						// whole list-item row (ListComponent's own `item.className`
						// slot), not the icon, and had no matching CSS rule
						// anywhere in this codebase either way, so it never
						// painted anything.
						icon: `${tool.icon} ${tool.color}`,
						title: tool.title,
						desc: tool.desc,
						tags: (
							<>
								{tool.pro && !isContentToolsEnabled && (
									<span className="admin-tag pro-tag">
										<i className="adminfont-pro-tag" />
										{__('Pro', 'vulopilot')}
									</span>
								)}
								<i className="adminfont-arrow-right" />
							</>
						),
						action: () => handleToolClick(tool),
					}))}
				/>
				<ContentToolPopup
					tool={activeTool}
					onClose={() => setActiveTool(null)}
				/>
			</CardComponent>
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
		</>
	);
};

export default ContentToolsGrid;
