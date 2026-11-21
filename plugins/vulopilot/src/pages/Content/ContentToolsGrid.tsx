/* global vulopilotAppLocalizer */
import { useState } from 'react';
import type { ComponentType } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { PopupComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ContentToolPopup from './ContentToolPopup';
import ProSample from '../../components/ProSample/ProSample';
import ShowProPopup, { VuloCloudInlineNotice } from '../../components/Popup/Popup';
import { IconTile } from '../../components/ui';
import type { Tone } from '../../components/ui';
import { useFilterSlot, useIsRouteRegistered } from '../../services/useFilterSlot';
import { useAiCredits } from '../../services/useAiCredits';
import { useContentToolsEnabled } from '../../services/useContentToolsEnabled';

export type ToolFieldType = 'post-picker' | 'text' | 'textarea' | 'media-picker' | 'duplicate-finding-picker' | 'select';

export interface ToolField {
	key: string;
	label: string;
	type: ToolFieldType;
	/** Only for 'post-picker' - restricts which real post types are offered. */
	postTypes?: ('post' | 'page')[];
	/** Only for 'select' - a fixed option list. */
	options?: { value: string; label: string }[];
}

export interface ContentTool {
	id: string;
	icon: string;
	color: string;
	title: string;
	desc: string;
	/** The AI action this tool runs (classes/AIActions/Actions/*.php). */
	actionId: string;
	fields: ToolField[];
	pro?: boolean;
}

/** What VuloPilot Pro's Content Optimization module adds (`vulopilot_content_tools_pro`): its tools and their form. */
export interface ProToolsSlot {
	Popup: ComponentType<{
		tool: ContentTool | null;
		onClose: () => void;
		VuloCloudInlineNotice: ComponentType;
		creditsStatus: { connected?: boolean } | null;
	}>;
	tools: ContentTool[];
}

/** Free's own tools - each runs a real AI action end to end through ContentToolPopup. */
const FREE_TOOLS: ContentTool[] = [
	{
		id: 'ai-writer',
		icon: 'edit',
		color: 'purple',
		title: __('AI Writer', 'vulopilot'),
		desc: __('Write a draft from a short brief.', 'vulopilot'),
		actionId: 'write-post-content',
		fields: [{ key: 'brief', label: __('What should it write about?', 'vulopilot'), type: 'textarea' }],
	},
	{
		id: 'blog-generator',
		icon: 'document',
		color: 'green',
		title: __('Blog Generator', 'vulopilot'),
		desc: __('A full, SEO-ready blog post from a topic.', 'vulopilot'),
		actionId: 'generate-blog',
		fields: [{ key: 'topic', label: __('Topic', 'vulopilot'), type: 'text' }],
	},
	{
		id: 'content-audit',
		icon: 'search',
		color: 'blue',
		title: __('Content Audit', 'vulopilot'),
		desc: __('What to improve on one post or page.', 'vulopilot'),
		actionId: 'audit-content',
		fields: [{ key: 'post_id', label: __('Post or page', 'vulopilot'), type: 'post-picker' }],
	},
	{
		id: 'duplicate-content',
		icon: 'copy',
		color: 'pink',
		title: __('Duplicate Titles', 'vulopilot'),
		desc: __('Make pages that share a title distinct.', 'vulopilot'),
		actionId: 'differentiate-duplicate-title',
		fields: [{ key: 'post_ids', label: __('Duplicate title group', 'vulopilot'), type: 'duplicate-finding-picker' }],
	},
];

/** Pictures of Pro's tools for free's sample - names and icons only, nothing runs. */
const SAMPLE_PRO_TOOLS: { icon: string; tone: Tone; title: string }[] = [
	{ icon: 'web-page-website', tone: 'blue', title: __('Landing Pages', 'vulopilot') },
	{ icon: 'cart', tone: 'amber', title: __('Product Descriptions', 'vulopilot') },
	{ icon: 'question', tone: 'red', title: __('FAQ Generator', 'vulopilot') },
	{ icon: 'shortcode', tone: 'violet', title: __('Schema Generator', 'vulopilot') },
	{ icon: 'image', tone: 'green', title: __('Image Alt Text', 'vulopilot') },
	{ icon: 'price', tone: 'amber', title: __('Meta Generator', 'vulopilot') },
	{ icon: 'bar-chart', tone: 'green', title: __('Content Optimizer', 'vulopilot') },
	{ icon: 'refresh', tone: 'blue', title: __('Content Refresh', 'vulopilot') },
	{ icon: 'search', tone: 'violet', title: __('Keyword Research', 'vulopilot') },
	{ icon: 'calendar', tone: 'blue', title: __('Content Planner', 'vulopilot') },
];

const TONE: Record<string, Tone> = {
	purple: 'violet',
	indigo: 'violet',
	pink: 'violet',
	green: 'green',
	teal: 'green',
	blue: 'blue',
	orange: 'amber',
	yellow: 'amber',
	red: 'red',
};

/** One of Pro's tools as a small tile: a button, or a plain tile inside the sample. */
const ToolTile = ({ icon, tone, title, onClick }: { icon: string; tone: Tone; title: string; onClick?: () => void }) => {
	const inner = (
		<>
			<IconTile icon={icon} tone={tone} size="sm" />
			<strong>{title}</strong>
		</>
	);

	return onClick ? (
		<button type="button" className="vp-wtool" onClick={onClick}>
			{inner}
		</button>
	) : (
		<div className="vp-wtool">{inner}</div>
	);
};

/** Asks for an AI connection first, then opens the tool's form. */
const useToolOpener = () => {
	const [activeTool, setActiveTool] = useState<ContentTool | null>(null);
	const [isConnectOpen, setIsConnectOpen] = useState(false);
	const { status: creditsStatus } = useAiCredits();

	const open = (tool: ContentTool) => {
		if (creditsStatus && !creditsStatus.connected) {
			setIsConnectOpen(true);
			return;
		}

		setActiveTool(tool);
	};

	const connectPopup = (
		<PopupComponent open={isConnectOpen} onClose={() => setIsConnectOpen(false)} width={22} height="auto" position="lightbox">
			<ShowProPopup vulocloud />
		</PopupComponent>
	);

	return { activeTool, setActiveTool, open, connectPopup, creditsStatus };
};

/** The rail's "Quick start": free's four AI tools, each opening its form (ContentToolPopup). */
export const QuickStartCard = () => {
	const { activeTool, setActiveTool, open, connectPopup } = useToolOpener();

	return (
		<section className="vp-card vp-rail-card" id="content-tools-grid">
			<header className="vp-rail-head">
				<div>
					<h3>{__('Quick start', 'vulopilot')}</h3>
					<p>{__('Free AI tools that work on your site.', 'vulopilot')}</p>
				</div>
			</header>
			<ul className="vp-quick">
				{FREE_TOOLS.map((tool) => (
					<li key={tool.id}>
						<button type="button" onClick={() => open(tool)}>
							<IconTile icon={tool.icon} tone={TONE[tool.color] ?? 'neutral'} size="sm" />
							<span className="vp-quick-text">
								<strong>{tool.title}</strong>
								<span>{tool.desc}</span>
							</span>
							<i className="adminfont-arrow-right" aria-hidden="true" />
						</button>
					</li>
				))}
			</ul>
			<ContentToolPopup tool={activeTool} onClose={() => setActiveTool(null)} />
			{connectPopup}
		</section>
	);
};

/**
 * "More AI tools": VuloPilot Pro's Content Optimization tools (and its Content planner page) when the module is on;
 * a "turn it on" line when licensed but off; a sample that opens the Pro popup without Pro. Free carries no code for
 * Pro's tools - only their names and icons for the sample.
 */
export const MoreToolsCard = () => {
	const { activeTool, setActiveTool, open, connectPopup, creditsStatus } = useToolOpener();
	const [isModuleOffOpen, setIsModuleOffOpen] = useState(false);
	const proSlot = useFilterSlot<ProToolsSlot>('vulopilot_content_tools_pro');
	const hasPlanner = useIsRouteRegistered('content-planner');
	const isModuleOn = useContentToolsEnabled();
	const proTools = isModuleOn && proSlot ? proSlot.tools : [];

	let body;

	if (proTools.length > 0) {
		body = (
			<div className="vp-wtools">
				{proTools.map((tool) => (
					<ToolTile key={tool.id} icon={tool.icon} tone={TONE[tool.color] ?? 'neutral'} title={tool.title} onClick={() => open(tool)} />
				))}
				{hasPlanner && (
					<ToolTile
						icon="calendar"
						tone="blue"
						title={__('Content Planner', 'vulopilot')}
						onClick={() => {
							window.location.hash = '#&tab=content-planner';
						}}
					/>
				)}
			</div>
		);
	} else if (vulopilotAppLocalizer.khali_dabba) {
		// Licensed, but the module that holds these tools is off.
		body = (
			<div className="vp-wtools-off">
				<span>
					{sprintf(
						/* translators: %d: number of tools. */
						__('Turn on Content Optimization to add %d tools, from landing pages to keyword research.', 'vulopilot'),
						SAMPLE_PRO_TOOLS.length
					)}
				</span>
				<ButtonInput buttons={{ text: __('Turn on', 'vulopilot'), color: 'purple-bg', onClick: () => setIsModuleOffOpen(true) }} />
			</div>
		);
	} else {
		body = (
			<ProSample
				feature={{
					title: __('Pro writing tools', 'vulopilot'),
					description: __('Landing pages, product descriptions, FAQs, schema, alt text, keyword research and a content planner.', 'vulopilot'),
					icon: 'edit',
				}}
				text={__('Landing pages, product copy, FAQs, schema, alt text, keyword research and a planner.', 'vulopilot')}
				cta={__('Unlock all tools', 'vulopilot')}
			>
				<div className="vp-wtools">
					{SAMPLE_PRO_TOOLS.map((tool) => (
						<ToolTile key={tool.title} icon={tool.icon} tone={tool.tone} title={tool.title} />
					))}
				</div>
			</ProSample>
		);
	}

	return (
		<section className="vp-card vp-more-tools">
			<header className="vp-card-head">
				<div className="vp-card-title">
					<span className="vp-card-icon" aria-hidden="true">
						<i className="adminfont-tools" />
					</span>
					<div>
						<h3>{__('More AI tools', 'vulopilot')}</h3>
						<p>{__('Create pages and product copy, and improve what is already published.', 'vulopilot')}</p>
					</div>
				</div>
			</header>
			<div className="vp-card-body">{body}</div>

			{activeTool && proSlot && (
				<proSlot.Popup
					tool={activeTool}
					onClose={() => setActiveTool(null)}
					VuloCloudInlineNotice={VuloCloudInlineNotice}
					creditsStatus={creditsStatus}
				/>
			)}
			{connectPopup}
			<PopupComponent open={isModuleOffOpen} onClose={() => setIsModuleOffOpen(false)} width={31.25} height="auto" position="lightbox">
				<ShowProPopup moduleName="content-optimization" />
			</PopupComponent>
		</section>
	);
};
