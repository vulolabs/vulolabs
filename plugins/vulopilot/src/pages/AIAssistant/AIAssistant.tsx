/* global appLocalizer */
import { useEffect, useRef, useState } from 'react';
import { __ } from '@wordpress/i18n';
import './AICopilot.scss';
import {
	ColumnComponent,
	ContainerComponent,
	NavigatorHeaderComponent,
	NoticeManager,
	PopupComponent,
	SectionComponent,
	TooltipComponent,
} from '@zyra/components';
import { FileInput } from '@zyra/inputs';
import { getApiLink, scrollToId, sendApiResponse } from '@zyra/core';
import ConnectVuloCloudPopup from '../../components/AiCredits/ConnectVuloCloudPopup';
import { useAiCredits } from '../../services/useAiCredits';
import NeedsAttentionCard, { IssuesFilter } from './NeedsAttentionCard';
import RecentConversationsCard from './RecentConversationsCard';
import RecommendedActionsCard from './RecommendedActionsCard';
import IssuesList from './IssuesList';
import AutomationTemplatesCard from '../Automations/AutomationsTemplatesCard';
import { AutomationTemplate } from '../Automations/automationsTypes';
import { useFilterSlot } from '../../services/useFilterSlot';
import {
	useCopilotChat,
	CopilotAttachment,
} from '../../services/useCopilotChat';
import { ChatInput, AiChatCard, CopilotTurnBubble } from '../../components/ChatComposerCard';

/** Mirrors Controllers\Copilot.php's own MAX_ATTACHMENTS — capped client-side too so the composer never offers to add more than the server would actually resolve. */
const MAX_ATTACHMENTS = 3;

/**
 * The types vulopilot-pro's own Rest.php actually does something real with: text/csv files
 * are read as text (ATTACHMENT_TEXT_MIME_TYPES); anything else, images included, gets
 * an honest "can't be read" note since the VuloCloud gateway carries text only. Only
 * restricts the drag-and-drop/native-picker validation path — the
 * "Upload File" button's wp.media() library picker ignores `accept`
 * entirely and can select anything already in the Media Library, which
 * Rest.php still resolves honestly either way.
 */
const ATTACHMENT_ACCEPT =
	'.txt,.csv,text/plain,text/csv,.jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp';

/** "Try asking me…" starter prompts — static UI copy, not fetched data. */
const SUGGESTED_PROMPTS = [
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

/**
 * "AI Copilot" — a real, single-view page (Chat/History used to be a tab
 * shell; History moved to Reports' own "History" tab, and the former
 * ChatTab.tsx was folded directly in here per direct instruction ("this
 * file i do not think required, directly call from AIAssistant.tsx,
 * remove all this type of files") — it was only ever rendered by this one
 * component, so the separate file/prop-passing layer added nothing.
 * NeedsAttentionCard.tsx/RecentConversationsCard.tsx/
 * RecommendedActionsCard.tsx/IssuesList.tsx stay as their own files: each
 * is a real, self-contained concern with its own state and API calls, not
 * a thin pass-through.
 *
 * A welcome message, the "Try asking me…" prompt grid, and the composer
 * bar in the main column; a real "Site Overview" findings summary
 * (`/dashboard`, NeedsAttentionCard.tsx) + AI Workflows (`/automations`)
 * preview in the sidebar. Sending really talks to `POST /copilot/chat`
 * (`Controllers\Copilot.php`, shared via useCopilotChat.ts — genuinely
 * free, gated the same way as every other AI surface (a configured AI
 * provider, BYOK or a connected VuloCloud account), not a Pro license; see
 * that hook's own docblock for the real "Connect to VuloCloud" popup this
 * page shows on that condition) — a real reply grounded in this site's own
 * open findings/automation counts, not a canned response. A request like
 * "write a blog about X" really creates and saves a WordPress draft
 * (Copilot.php's own ContentCreationOrchestrator hand-off, the same real
 * capability "Create Content"'s own AI Content Assistant sidebar already
 * had) — that turn's `link` is rendered below as a real clickable edit
 * link, right next to a real inline "Undo" (`handleUndo()`, same
 * `POST /ai-action-runs/{id}/rollback` HistoryDetailPanel.tsx's own Undo
 * button already calls) so reverting what was just created doesn't require
 * leaving this page. Every other kind of request stays advice-only. A page
 * refresh still starts a fresh, empty composer (`turns` itself is still
 * client-side-only React state, cleared on unmount), but every real
 * conversation really persists server-side too (`vulopilot_ai_conversations`,
 * Copilot.php's own persist_conversation()) — "Recent conversations"
 * (RecentConversationsCard.tsx, `GET /copilot/conversations`) lists the
 * user's own recent real threads, and clicking one
 * (`handleSelectConversation()` below, useCopilotChat.ts's own
 * loadConversation()) loads that thread's full, untruncated turns straight
 * back into this composer, ready to keep chatting from — not just a
 * read-only excerpt. The prompt grid still prefills the composer.
 *
 * "Attach" is real: it opens zyra's FileInput, which — on this admin
 * screen, now that Admin.php calls wp_enqueue_media() — hands back a real
 * WP Media Library attachment {id, url} via wp.media(), never a
 * client-only blob preview. Sent as `attachments` on the next
 * `POST /copilot/chat` and re-resolved against real, current data
 * server-side (Copilot.php's build_extra_context()) — this component only
 * carries an id, never the resolved content itself.
 *
 * "Add context" (a picker over open finding groups/active automations) was
 * removed from this composer per direct instruction — Copilot.php's own
 * `build_extra_context()`/`context_refs` handling stays as-is server-side
 * (untouched, real, still reachable by any future caller), only this page's
 * own button/panel/state for it is gone.
 *
 * The header's "Online"/"Offline" badge is real, not decorative — but NOT
 * `appLocalizer.vulocloud_connected` (VuloCloudAccountConnection, the
 * *personal* VuloCloud login) as an earlier pass here had it. That flag
 * turned out to be the wrong one: confirmed live that
 * AI\AiRequestSender::send() — the real gate every
 * chat send actually goes through — checks `AiCreditsConnection::
 * is_connected()` instead (a separate, site-scoped credential; see that
 * class's own docblock for how it layers on top of, but doesn't require
 * still having, the personal login). A site can easily have credits
 * connected with no personal account connected (confirmed live in this
 * exact dev environment: 100 AI Credits, chat fully working, yet
 * `vulocloud_connected` false) — showing "Offline" there was actively
 * misleading, telling the admin chat wouldn't work when it would. Now
 * reads the SAME live `connected` field the header's own "N AI Credits"
 * indicator already fetches (`useAiCredits()`, `GET /ai-credits/status`
 * → AiCreditsConnection::get_status()) — the two badges can no longer
 * disagree about whether AI is actually usable. Loading state
 * fail-closed (`status?.connected` false-y default), same "unknown =
 * locked" convention useContentGate.tsx's own `isVuloCloudLocked` uses.
 * The old "How it works" popup button is now a hover tooltip on the title
 * itself instead (`headerTitle` cast through JSX — NavigatorHeaderComponent's
 * own type only declares it as `string`, but it just renders
 * `{headerTitle}` as children, so a real element works at runtime the same
 * way `field.component`'s escape hatch does elsewhere).
 */
const AIAssistant = () => {
	const [chatMessage, setChatMessage] = useState('');
	const [autoApply, setAutoApply] = useState(true);
	/** Opens the "Recent conversations" popup — the header button lives in this page's own header, the popup and the real conversation data/selection it needs render further down. */
	const [isHistoryPopupOpen, setIsHistoryPopupOpen] = useState(false);
	const [issuesFilter, setIssuesFilter] = useState<IssuesFilter | null>(
		null
	);
	// Bumped on every "go to the Issues section" navigation, even when
	// `issuesFilter` resolves to the same value as before (e.g. clicking
	// "View all issues" when it was already null) — the scroll-into-view
	// effect below keys off this instead of `issuesFilter` so a same-value
	// React state bailout doesn't silently swallow the scroll.
	const [issuesNavToken, setIssuesNavToken] = useState(0);
	const { status: aiCreditsStatus } = useAiCredits();
	const vulocloudConnected = Boolean(aiCreditsStatus?.connected);

	/**
	 * The Issues table lives inline below the composer rather than as its
	 * own nav tab — NeedsAttentionCard's "View all issues"/group-row clicks
	 * still pass through here as `onNavigateTab('chat', filter)`, so this
	 * still needs to update the filter that table reads. `tab` itself is
	 * otherwise unused now that Chat is the only surface this page renders.
	 */
	const goToTab = (tab: string, filter?: IssuesFilter) => {
		if ('chat' === tab) {
			setIssuesFilter(filter ?? null);
			setIssuesNavToken((n) => n + 1);
		}
	};

	const composerRef = useRef<HTMLDivElement>(null);
	const didMountRef = useRef(false);

	// Scrolls the appended Issues table into view whenever NeedsAttentionCard
	// sends a new filter (or a bare "View all issues" click) — without this
	// the click would silently do nothing visible if the table is off-screen.
	// Skipped on first mount so loading this page itself never auto-scrolls.
	useEffect(() => {
		if (!didMountRef.current) {
			didMountRef.current = true;
			return;
		}

		scrollToId('ai-copilot-issues-section');
		// eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the token specifically so a same-value issuesFilter update (e.g. "View all issues" when it was already null) still re-triggers the scroll.
	}, [issuesNavToken]);

	const {
		turns,
		isSending,
		send,
		markTurnUndone,
		loadConversation,
		startNewConversation,
		isCloudConnectPromptOpen,
		dismissCloudConnectPrompt,
	} = useCopilotChat('vulopilot-copilot-chat-error');
	const [undoingRunId, setUndoingRunId] = useState<number | null>(null);

	/**
	 * RecentConversationsCard.tsx's own click-to-load — the card renders
	 * below the composer, so loading a past thread also scrolls the
	 * composer back into view rather than leaving the user looking at the
	 * still-visible "Recent conversations" list while the turns above it
	 * silently change.
	 */
	const handleSelectConversation = (id: number) => {
		loadConversation(id);
		composerRef.current?.scrollIntoView({
			behavior: 'smooth',
			block: 'start',
		});
	};

	const [attachments, setAttachments] = useState<CopilotAttachment[]>([]);
	const [isAttachPanelOpen, setIsAttachPanelOpen] = useState(false);

	/**
	 * A starter chip starts the chat straight away — its title is sent as
	 * the first message, no separate Send click needed.
	 */
	const handleSelectPrompt = (title: string) => {
		if (isSending) {
			return;
		}

		send(title, [], [], autoApply);
		setChatMessage('');
	};

	const handleSend = () => {
		send(chatMessage, [], attachments, autoApply);
		setChatMessage('');
		setAttachments([]);
		// Close the Attach panel on send — otherwise it stays open and
		// reverts to its own empty "Drag and drop" state, which reads as if
		// nothing was actually sent.
		setIsAttachPanelOpen(false);
	};

	/**
	 * Undoes a turn's own content-creation run — the same real
	 * `POST /ai-action-runs/{id}/rollback` (AIActions\ActionRunner::rollback())
	 * HistoryDetailPanel.tsx's own Undo button already calls, just reachable
	 * right here next to what it undoes instead of only from History.
	 */
	const handleUndo = (runId: number) => {
		setUndoingRunId(runId);

		sendApiResponse<{ success?: boolean }>(
			appLocalizer,
			getApiLink(appLocalizer, `ai-action-runs/${runId}/rollback`),
			{}
		)
			.then((response) => {
				NoticeManager.add({
					uniqueKey: `copilot-chat-rollback-${runId}`,
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('Change undone.', 'vulopilot')
						: __(
								'Could not undo this change. Please try again.',
								'vulopilot'
							),
				});

				if (response) {
					markTurnUndone(runId);
				}
			})
			.finally(() => setUndoingRunId(null));
	};

	const toggleAttachPanel = () => {
		setIsAttachPanelOpen((open) => !open);
	};

	const handleFileInputChange = (
		value:
			| { id?: number; url: string }
			| { id?: number; url: string }[]
			| ''
	) => {
		const raw = Array.isArray(value) ? value : value ? [value] : [];
		const valid = raw.filter(
			(file): file is { id: number; url: string } =>
				'number' === typeof file.id
		);

		if (valid.length < raw.length) {
			NoticeManager.add({
				uniqueKey: 'vulopilot-chat-attach-local-only',
				type: 'error',
				position: 'float',
				message: __(
					"That file wasn't uploaded — use the Upload File button so it's saved to the Media Library and readable by the AI.",
					'vulopilot'
				),
			});
		}

		setAttachments(
			valid.slice(0, MAX_ATTACHMENTS).map((file) => ({
				id: file.id,
				url: file.url,
				name: file.url.split('#').pop()?.split('/').pop() || file.url,
			}))
		);
	};

	const removeAttachment = (id: number) =>
		setAttachments((current) => current.filter((file) => file.id !== id));

	/**
	 * Same real `vulopilot_automations_panel` Pro filter slot
	 * Automations.tsx itself reads — its own `Wizard`/`Generate` come from
	 * there, and `!Wizard` is the exact same "Automations Pro module isn't
	 * active" check that page's own openTemplate()/openCreateWizard()/etc.
	 * already gate every action on. Passed to AutomationTemplatesCard.tsx's
	 * own `isAutomationsActive` prop — that card's own useContentGate.tsx
	 * call (login → Pro → this module, per direct instruction) now decides
	 * whether a template row is even real/clickable, so a locked click on
	 * *that card* shows the real "Unlock with Pro" popup immediately from
	 * inside it, right where it was clicked — direct instruction ("when
	 * click popup open if pro is deactivate"). Before this, a locked click
	 * fell through to plain navigation below, landing on Automate Work
	 * first and only *then* showing a popup there (Automations.tsx's own
	 * `automation_template` URL-param effect) — a real, jarring two-step
	 * "page changes, then something pops up" flow for what should be one
	 * click, one popup.
	 */
	const automationsPanelSlot = useFilterSlot<{ Wizard?: unknown }>(
		'vulopilot_automations_panel'
	);

	/**
	 * AutomationTemplatesCard's real home is Automate Work
	 * (`ManageAutomationsSection.tsx`, via `Automations.tsx`) — this preview
	 * on Chat navigates there rather than trying to open a create form that
	 * lives in a different top-level page's own React tree, carrying the
	 * picked template through the `automation_template` URL param.
	 * `Automations.tsx` reads it on mount and forwards it down so the real
	 * wizard opens already seeded, not a bare redirect to a blank page.
	 * Automate Work has no `subtab=` of its own since its own redesign
	 * flattened its previous Overview/Automations two-tab shell into one
	 * page — nothing left to route to but the page itself. Only ever
	 * called for a real, unlocked row now — AutomationTemplatesCard.tsx's
	 * own content gate replaces its real, clickable list with an inert
	 * dummy one (and its own popup) whenever this same
	 * `automationsPanelSlot.Wizard` check (or the login/Pro tiers above it)
	 * is locked, so this function is never reached in that case.
	 */
	const handleSelectAutomationTemplate = (template: AutomationTemplate) => {
		window.location.href = `${appLocalizer.admin_url}#&tab=automations&automation_template=${template.id}`;
	};

	return (
		<>
			<NavigatorHeaderComponent
				headerIcon="ai"
				headerTitle={
					(
						<>
							{__('AI Copilot', 'vulopilot')}
							<TooltipComponent
								text={__(
									'Ask a question or pick a suggested prompt. VuloPilot checks your live site data — scans, traffic, security, and store health — and answers with real recommendations. Ask for a blog post, landing page, or product description and it writes one and saves it as a real draft, logged to History with a real Undo. Everything else — SEO, performance, security, and other fixes — is advice only for now.',
									'vulopilot'
								)}
								position="bottom"
							>
								<i className="adminfont-info ai-copilot-title-info" />
							</TooltipComponent>
						</>
					) as unknown as string
				}
				headerDescription={__(
					'Your always-on AI assistant for WordPress. Ask anything, get intelligent answers and take action.',
					'vulopilot'
				)}
				showPremiumLink={false}
				badges={[
					vulocloudConnected
						? {
								text: `● ${__('Online', 'vulopilot')}`,
								color: 'green',
							}
						: {
								text: `● ${__('Offline', 'vulopilot')}`,
								color: 'red',
							},
				]}
			/>
			<ContainerComponent general>
				<ContainerComponent>
					<ColumnComponent grid={8}>
						{/* Scroll target for handleSelectConversation() — loading a past thread from the "Recent conversations" sidebar brings this composer back into view. */}
						<div ref={composerRef}>
							<AiChatCard
								cardClassName="ai-copilot-main-chat"
								cardTitle={__('Chat with VuloPilot', 'vulopilot')}
								cardDesc={__('', 'vulopilot')}
								onNewChat={
									turns.length > 0 || isSending
										? startNewConversation
										: undefined
								}
								onOpenHistoryPopup={() => setIsHistoryPopupOpen(true)}
								emptyDesc={__(
									'Ask me anything about your website, performance, security, content and more.',
									'vulopilot'
								)}
								prompts={SUGGESTED_PROMPTS}
								onSelectPrompt={handleSelectPrompt}
								turns={turns}
								renderTurn={(turn, index) => (
									<CopilotTurnBubble
										key={index}
										turn={turn}
										undoingRunId={undoingRunId}
										onUndo={handleUndo}
									/>
								)}
								isSending={isSending}
								beforeComposer={
									<>
										{attachments.length > 0 && (
											<div className="chat-composer-chips">
												{attachments.map((attachment) => (
													<span
														className="chat-composer-chip"
														key={`attachment-${attachment.id}`}
													>
														<i className="adminfont-attachment" />
														{attachment.name}
														<i
															className="adminfont-close"
															onClick={() =>
																removeAttachment(attachment.id)
															}
														/>
													</span>
												))}
											</div>
										)}

										{isAttachPanelOpen && (
											<div className="chat-composer-panel">
												<p className="chat-composer-panel-label">
													{__(
														'Attach a .txt/.csv file to read, or a .jpg/.png/.gif/.webp image for the AI to actually see — uploaded to your Media Library first.',
														'vulopilot'
													)}
												</p>
												<FileInput
													multiple
													accept={ATTACHMENT_ACCEPT}
													openUploader={__('Upload File', 'vulopilot')}
													wrapperClass="chat-composer-fileinput"
													imageSrc={attachments.map((attachment) => ({
														id: attachment.id,
														url: attachment.url,
													}))}
													onChange={handleFileInputChange}
												/>
											</div>
										)}
									</>
								}
								composer={
									// The Enter-to-send bubble-propagation guard every
									// real composer needs now lives once in
									// ChatComposerCard.tsx itself (wraps `composer`
									// there) rather than duplicated per consumer.
									<ChatInput
										value={chatMessage}
										onChange={setChatMessage}
										onSend={handleSend}
										disabled={isSending}
										placeholder={__(
											'Ask VuloPilot anything about your website…',
											'vulopilot'
										)}
										onAttach={toggleAttachPanel}
										attachLabel={__('Attach', 'vulopilot')}
										autoApply={{
											checked: autoApply,
											onChange: setAutoApply,
											label: (
												<>
													{__('Auto-applies', 'vulopilot')}
													<TooltipComponent
														text={__(
															'When on, VuloPilot applies a fix itself and still asks you to approve it before it goes live — nothing changes on your site without your say.',
															'vulopilot'
														)}
													>
														<i className="adminfont-info chat-input-autoapply-info" />
													</TooltipComponent>
												</>
											),
										}}
									/>
								}
							/>
						</div>
						<PopupComponent
							open={isHistoryPopupOpen}
							onClose={() => setIsHistoryPopupOpen(false)}
							width={25}
							height="70%"
							position="slide-right-to-left"
						>
							<RecentConversationsCard
								onSelectConversation={(id: number) => {
									handleSelectConversation(id);
									setIsHistoryPopupOpen(false);
								}}
							/>
						</PopupComponent>
						{/* useCopilotChat.ts's own send() sets this the moment a real send is attempted (or fails) with no AI connection configured — same free "Connect to VuloCloud" popup every other free AI surface in this plugin uses for this exact condition (ConnectVuloCloudPopup.tsx's own docblock). */}
						<ConnectVuloCloudPopup
							open={isCloudConnectPromptOpen}
							onClose={dismissCloudConnectPrompt}
						/>
						<RecommendedActionsCard onNavigateTab={goToTab} />
					</ColumnComponent>

					<ColumnComponent grid={4}>
						<NeedsAttentionCard onNavigateTab={goToTab} />
						<AutomationTemplatesCard
							onSelectTemplate={handleSelectAutomationTemplate}
							isAutomationsActive={!!automationsPanelSlot?.Wizard}
						/>
					</ColumnComponent>

					<ColumnComponent>
						<SectionComponent
							title={__('Issues', 'vulopilot')}
							desc={__(
								'Findings from your most recent scans, grouped by check.',
								'vulopilot'
							)}
						/>
					</ColumnComponent>
					<IssuesList
						key={issuesFilter?.scannerId ?? 'all'}
						initialScannerId={issuesFilter?.scannerId}
						initialCategory={issuesFilter?.category}
					/>
				</ContainerComponent>
			</ContainerComponent>
		</>
	);
};

export default AIAssistant;
