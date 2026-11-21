/* global vulopilotAppLocalizer */
import { useEffect, useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import './AICopilot.scss';
import '../../dashboard-widgets/dashboard.scss';
import './copilot.scss';
import {
	ColumnComponent,
	ContainerComponent,
	NavigatorHeaderComponent,
	NoticeManager,
	PopupComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { getApiLink, scrollToId, sendApiResponse } from '@zyra/core';
import ShowProPopup from '../../components/Popup/Popup';
import { Pill } from '../../components/ui';
import { useAiCredits } from '../../services/useAiCredits';
import { useCopilotChat } from '../../services/useCopilotChat';
import { useGuidedCopilotFlow } from '../../services/useGuidedCopilotFlow';
import { GUIDED_FLOW_ID_BY_PROMPT } from '../../services/copilotGuidedFlows';
import type { FindingGroup } from '../../components/Issues/issuesTypes';
import CopilotChat from './CopilotChat';
import type { StarterPrompt } from './CopilotChat';
import IssueStartersCard, { askAboutIssue } from './IssueStartersCard';
import RecentConversationsCard from './RecentConversationsCard';
import CopilotScopeCard from './CopilotScopeCard';
import RecommendedActionsCard from './RecommendedActionsCard';
import IssuesList from './IssuesList';
import type { IssuesFilter } from './types';

/** "Try asking me…" starter prompts - static UI copy, not fetched data. */
const SUGGESTED_PROMPTS: StarterPrompt[] = [
	{ id: 'homepage', icon: 'home', title: __('Improve my homepage', 'vulopilot') },
	{ id: 'traffic', icon: 'bar-chart', title: __('Why is traffic dropping?', 'vulopilot') },
	{ id: 'vitals', icon: 'bar-chart', title: __('Fix my Core Web Vitals', 'vulopilot') },
	{ id: 'schema', icon: 'coding', title: __('Generate schema', 'vulopilot') },
	{ id: 'checkout', icon: 'cart', title: __('Improve checkout', 'vulopilot') },
	{ id: 'woocommerce', icon: 'woocommerce', title: __('Optimize WooCommerce', 'vulopilot') },
	{ id: 'blog', icon: 'edit', title: __('Write a blog', 'vulopilot') },
	{ id: 'security', icon: 'security', title: __('Find security issues', 'vulopilot') },
	{ id: 'geo', icon: 'geo-location', title: __('Make my site GEO ready', 'vulopilot') },
];

const CONNECT_URL = '?page=vulopilot#&tab=settings&subtab=integrations';

/** `#&tab=ai-assistant&subtab=issues&scanner_id=…` (Reports → History, Pro's WooCommerce Analytics) opens that issue. */
const filterFromHash = (): IssuesFilter | null => {
	const params = new URLSearchParams(window.location.hash.substring(1));
	const scannerId = params.get('scanner_id');

	return scannerId ? { scannerId, label: '', category: params.get('category') ?? '' } : null;
};

/**
 * AI Copilot, laid out like the dashboard: the chat beside a rail of ways into it (an open issue, an earlier chat,
 * what it may change), then AI suggestions and the full Issues list.
 */
const AIAssistant = () => {
	const [autoApply, setAutoApply] = useState(true);
	const [undoingRunId, setUndoingRunId] = useState<number | null>(null);
	const [issuesFilter, setIssuesFilter] = useState<IssuesFilter | null>(filterFromHash);
	// Bumped on every "go to the Issues section", so the same filter twice still scrolls.
	const [issuesNavToken, setIssuesNavToken] = useState(() => (filterFromHash() ? 1 : 0));
	// Bumped after each reply, so Recent chats picks up a new or renamed conversation.
	const [repliesToken, setRepliesToken] = useState(0);
	const chatRef = useRef<HTMLDivElement>(null);

	const { status: aiCreditsStatus } = useAiCredits();
	// Unknown until the status loads: no badge rather than a false "not connected".
	const cloudState = aiCreditsStatus ? (aiCreditsStatus.connected ? 'on' : 'off') : 'unknown';

	const chat = useCopilotChat('vulopilot-copilot-chat-error');
	// Starter prompts walk their fixed question tree first, then send the composed question.
	const guided = useGuidedCopilotFlow((message) => chat.send(message, [], [], autoApply));

	const wasSending = useRef(false);

	useEffect(() => {
		if (wasSending.current && !chat.isSending) {
			setRepliesToken((token) => token + 1);
		}

		wasSending.current = chat.isSending;
	}, [chat.isSending]);

	useEffect(() => {
		if (issuesNavToken > 0) {
			scrollToId('ai-copilot-issues-section');
		}
	}, [issuesNavToken]);

	const showChat = () => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

	const showIssues = (filter?: IssuesFilter) => {
		setIssuesFilter(filter ?? null);
		setIssuesNavToken((token) => token + 1);
	};

	const handleSelectPrompt = (prompt: StarterPrompt) => {
		if (chat.isSending || guided.activeFlow) {
			return;
		}

		if (GUIDED_FLOW_ID_BY_PROMPT[prompt.id]) {
			guided.startFlow(GUIDED_FLOW_ID_BY_PROMPT[prompt.id]);
			return;
		}

		chat.send(prompt.title, [], [], autoApply);
	};

	const handleAskAboutIssue = (group: FindingGroup) => {
		chat.send(askAboutIssue(group), [], [], autoApply);
		showChat();
	};

	const handleSelectConversation = (id: number) => {
		chat.loadConversation(id);
		showChat();
	};

	/** Undoes a turn's content-creation run via `POST /ai-action-runs/{id}/rollback`. */
	const handleUndo = (runId: number) => {
		setUndoingRunId(runId);

		sendApiResponse<{ success?: boolean }>(
			vulopilotAppLocalizer,
			getApiLink(vulopilotAppLocalizer, `ai-action-runs/${runId}/rollback`),
			{}
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `copilot-chat-rollback-${runId}`,
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Change undone.', 'vulopilot')
						: __('Could not undo this change. Please try again.', 'vulopilot'),
				});

				if (response) {
					chat.markTurnUndone(runId);
				}
			})
			.finally(() => setUndoingRunId(null));
	};

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="ai"
				headerTitle={__('AI Copilot', 'vulopilot')}
				headerDescription={
					'off' === cloudState
						? __('Connect VuloCloud to start chatting. Your scans and issues below work without it.', 'vulopilot')
						: __('Ask about your site, or start from an issue VuloPilot found.', 'vulopilot')
				}
				headerCustomContent={
					'unknown' === cloudState ? undefined : (
						<div className="vp-copilot-status">
							{'on' === cloudState ? (
								<Pill status="good">{__('VuloCloud connected', 'vulopilot')}</Pill>
							) : (
								<>
									<Pill status="off">{__('VuloCloud not connected', 'vulopilot')}</Pill>
									<ButtonInput
										buttons={{
											text: __('Connect VuloCloud', 'vulopilot'),
											icon: 'link',
											color: 'purple-bg',
											onClick: () => {
												window.location.href = CONNECT_URL;
											},
										}}
									/>
								</>
							)}
						</div>
					)
				}
			/>

			<ContainerComponent general>
				<ColumnComponent>
					<div className="vp-page vp-copilot">
						{/* 1. The conversation, beside the ways into one. */}
						<div className="vp-command">
							<div className="vp-copilot-main" ref={chatRef}>
								<CopilotChat
									chat={chat}
									guided={guided}
									prompts={SUGGESTED_PROMPTS}
									onSelectPrompt={handleSelectPrompt}
									autoApply={autoApply}
									onAutoApplyChange={setAutoApply}
									undoingRunId={undoingRunId}
									onUndo={handleUndo}
								/>
							</div>
							<aside className="vp-rail">
								<IssueStartersCard
									disabled={chat.isSending || Boolean(guided.activeFlow)}
									onAsk={handleAskAboutIssue}
									onShow={(group) =>
										showIssues(group ? { scannerId: group.scanner_id, label: group.label, category: group.category } : undefined)
									}
								/>
								<RecentConversationsCard
									activeId={chat.conversationId ?? null}
									refreshToken={repliesToken}
									onSelectConversation={handleSelectConversation}
								/>
								<CopilotScopeCard />
							</aside>
						</div>

						{/* 2. The biggest fix in each area (Pro replaces this card through its slot). */}
						<RecommendedActionsCard onNavigateTab={(_tab, filter) => showIssues(filter)} />

						{/* 3. Every open issue, with the details of the chosen one. */}
						<IssuesList
							key={`${issuesFilter?.scannerId ?? 'all'}-${issuesNavToken}`}
							initialScannerId={issuesFilter?.scannerId}
							initialCategory={issuesFilter?.category || undefined}
							onAsk={handleAskAboutIssue}
						/>
					</div>
				</ColumnComponent>
			</ContainerComponent>

			<PopupComponent
				open={chat.isCloudConnectPromptOpen}
				onClose={chat.dismissCloudConnectPrompt}
				width={22}
				height="auto"
				position="lightbox"
			>
				<ShowProPopup vulocloud />
			</PopupComponent>
		</>
	);
};

export default AIAssistant;
