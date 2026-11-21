import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import { NoticeManager, TooltipComponent } from '@zyra/components';
import { FileInput } from '@zyra/inputs';
import AiCopilotGuard from '../../components/AiCopilotGuard';
import { ChatMessage, CopilotTurnBubble } from '../../components/ChatComposerCard';
import { IconTile, Switch } from '../../components/ui';
import type { CopilotAttachment, useCopilotChat } from '../../services/useCopilotChat';
import type { useGuidedCopilotFlow } from '../../services/useGuidedCopilotFlow';

/** Mirrors Copilot.php's MAX_ATTACHMENTS. */
const MAX_ATTACHMENTS = 3;

const ATTACHMENT_ACCEPT =
	'.txt,.csv,text/plain,text/csv,.jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp';

export interface StarterPrompt {
	id: string;
	icon: string;
	title: string;
}

interface CopilotChatProps {
	chat: ReturnType<typeof useCopilotChat>;
	guided: ReturnType<typeof useGuidedCopilotFlow>;
	prompts: StarterPrompt[];
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onSelectPrompt: (prompt: StarterPrompt) => void;
	autoApply: boolean;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onAutoApplyChange: (next: boolean) => void;
	undoingRunId: number | null;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onUndo: (runId: number) => void;
}

/** The composer grows with its text up to this height, then scrolls. */
const COMPOSER_MAX_HEIGHT = 160;

/**
 * "Chat with VuloPilot": the conversation, newest at the bottom, and the composer pinned under it. Drawn as a
 * dashboard card (ui.scss) rather than zyra's CardComponent, so it sits with the rail beside it; the turn bubbles
 * and both chat hooks are the shared ones the other AI cards use.
 */
const CopilotChat = ({
	chat,
	guided,
	prompts,
	onSelectPrompt,
	autoApply,
	onAutoApplyChange,
	undoingRunId,
	onUndo,
}: CopilotChatProps) => {
	const [message, setMessage] = useState('');
	const [attachments, setAttachments] = useState<CopilotAttachment[]>([]);
	const [isAttachOpen, setIsAttachOpen] = useState(false);
	const [otherAnswer, setOtherAnswer] = useState('');
	const streamRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const { turns, isSending, send, isLoadingConversation } = chat;
	const { activeFlow, activeStep, turns: guidedTurns, findings, isLoadingFindings } = guided;
	const isEmpty = 0 === turns.length && !isSending && !activeFlow && !isLoadingConversation;
	const isLocked = isSending || Boolean(activeFlow);
	const canSend = !isLocked && '' !== message.trim();

	// Keep the newest message in view; the welcome (nothing sent yet) stays at its top.
	useEffect(() => {
		const stream = streamRef.current;

		if (stream && !isEmpty) {
			stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
		}
	}, [turns.length, isSending, guidedTurns.length, activeStep, findings.length]);

	// Grow the composer with its text.
	useLayoutEffect(() => {
		const input = inputRef.current;

		if (input) {
			input.style.height = 'auto';
			input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
		}
	}, [message]);

	const handleSend = () => {
		if (!canSend) {
			return;
		}

		send(message, [], attachments, autoApply);
		setMessage('');
		setAttachments([]);
		setIsAttachOpen(false);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter sends, Shift+Enter breaks the line; never mid-composition (IME input).
		if ('Enter' === event.key && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			handleSend();
		}
	};

	const handleFiles = (value: { id?: number; url: string } | { id?: number; url: string }[] | '') => {
		const raw = Array.isArray(value) ? value : value ? [value] : [];
		const uploaded = raw.filter((file): file is { id: number; url: string } => 'number' === typeof file.id);

		if (uploaded.length < raw.length) {
			NoticeManager.add({
				uniqueKey: 'vulopilot-chat-attach-local-only',
				type: 'error',
				position: 'float',
				message: __(
					"That file wasn't uploaded - use the Upload File button so it's saved to the Media Library and readable by the AI.",
					'vulopilot'
				),
			});
		}

		setAttachments(
			uploaded.slice(0, MAX_ATTACHMENTS).map((file) => ({
				id: file.id,
				url: file.url,
				name: file.url.split('#').pop()?.split('/').pop() || file.url,
			}))
		);
	};

	let guidedPanel: ReactNode = null;

	if (activeFlow) {
		let choices: ReactNode = null;

		if (activeStep && 'findings' === activeStep.kind) {
			if (isLoadingFindings) {
				choices = <p className="vp-chat-note">{__('Checking your site data…', 'vulopilot')}</p>;
			} else if (findings.length > 0) {
				choices = (
					<div className="vp-chat-choices">
						{findings.map((group) => (
							<button key={group.scanner_id} type="button" onClick={() => guided.answerFinding(group)}>
								<i className="adminfont-error" aria-hidden="true" />
								{group.label}
							</button>
						))}
					</div>
				);
			} else {
				choices = (
					<p className="vp-chat-note">
						{__('No open findings here right now - moving to the next question.', 'vulopilot')}
					</p>
				);
			}
		} else if (activeStep) {
			const options = activeStep.options ?? [];
			const allowOther = activeStep.allowOther ?? 0 === options.length;

			choices = (
				<>
					{activeStep.prefillHint && <p className="vp-chat-note">{activeStep.prefillHint}</p>}
					{options.length > 0 && (
						<div className="vp-chat-choices">
							{options.map((option) => (
								<button key={option.value} type="button" onClick={() => guided.answerStep(option)}>
									{option.label}
								</button>
							))}
						</div>
					)}
					{allowOther && (
						<form
							className="vp-chat-other"
							onSubmit={(event) => {
								event.preventDefault();

								if ('' !== otherAnswer.trim()) {
									guided.answerStep({ value: 'other', label: otherAnswer.trim() });
									setOtherAnswer('');
								}
							}}
						>
							<input
								type="text"
								value={otherAnswer}
								onChange={(event) => setOtherAnswer(event.target.value)}
								placeholder={__('Or type your own answer…', 'vulopilot')}
								aria-label={__('Your answer', 'vulopilot')}
							/>
							<button type="submit" disabled={'' === otherAnswer.trim()}>
								{__('Answer', 'vulopilot')}
							</button>
						</form>
					)}
				</>
			);
		}

		guidedPanel = (
			<div className="vp-chat-guided">
				{guidedTurns.map((turn, index) => (
					<ChatMessage
						key={`guided-${index}`}
						sender={'user' === turn.role ? 'user' : 'ai'}
						avatarIcon={'user' === turn.role ? undefined : 'ai'}
					>
						{turn.content}
					</ChatMessage>
				))}
				<div className="vp-chat-guided-actions">
					{choices}
					<button type="button" className="vp-chat-cancel" onClick={guided.cancelFlow}>
						{__('Cancel', 'vulopilot')}
					</button>
				</div>
			</div>
		);
	}

	return (
		<section className="vp-card vp-chat" aria-label={__('Chat with VuloPilot', 'vulopilot')}>
			<header className="vp-chat-head">
				<div className="vp-card-title">
					<span className="vp-card-icon" aria-hidden="true">
						<i className="adminfont-ai" />
					</span>
					<div>
						<h3>{__('Chat with VuloPilot', 'vulopilot')}</h3>
						<p>{__('Answers come from your live site data - scans, traffic, security and store health.', 'vulopilot')}</p>
					</div>
				</div>
				{(turns.length > 0 || isSending) && (
					<button type="button" className="vp-widget-tool" onClick={chat.startNewConversation}>
						<i className="adminfont-plus" aria-hidden="true" />
						{__('New chat', 'vulopilot')}
					</button>
				)}
			</header>

			<AiCopilotGuard>
				<div className="vp-chat-stream" ref={streamRef} aria-live="polite">
					{isEmpty ? (
						<div className="vp-chat-welcome">
							<IconTile icon="ai" tone="violet" size="lg" />
							<h4>{__('How can I help you today?', 'vulopilot')}</h4>
							<p>{__('Ask about your website, or start with one of these.', 'vulopilot')}</p>
							<div className="vp-prompts">
								{prompts.map((prompt) => (
									<button key={prompt.id} type="button" onClick={() => onSelectPrompt(prompt)}>
										<i className={`adminfont-${prompt.icon}`} aria-hidden="true" />
										<span>{prompt.title}</span>
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="vp-chat-turns">
							{isLoadingConversation && 0 === turns.length && (
								<p className="vp-chat-note">{__('Opening conversation…', 'vulopilot')}</p>
							)}
							{turns.map((turn, index) => (
								<CopilotTurnBubble
									key={index}
									turn={turn}
									undoingRunId={undoingRunId}
									onUndo={onUndo}
									aiAvatarIcon="ai"
								/>
							))}
							{isSending && (
								<ChatMessage sender="ai" avatarIcon="ai">
									<span className="vp-chat-thinking">
										<span className="vp-dots" aria-hidden="true">
											<i />
											<i />
											<i />
										</span>
										{__('Checking your site…', 'vulopilot')}
									</span>
								</ChatMessage>
							)}
							{guidedPanel}
						</div>
					)}
				</div>

				<footer className="vp-composer">
					{attachments.length > 0 && (
						<ul className="vp-composer-files">
							{attachments.map((attachment) => (
								<li key={attachment.id}>
									<i className="adminfont-attachment" aria-hidden="true" />
									<span>{attachment.name}</span>
									<button
										type="button"
										aria-label={__('Remove attachment', 'vulopilot')}
										onClick={() => setAttachments((current) => current.filter((file) => file.id !== attachment.id))}
									>
										<i className="adminfont-close" aria-hidden="true" />
									</button>
								</li>
							))}
						</ul>
					)}

					{isAttachOpen && (
						<div className="vp-composer-attach">
							<p>
								{__(
									'Attach a .txt/.csv file to read, or a .jpg/.png/.gif/.webp image for the AI to see. Files are uploaded to your Media Library first.',
									'vulopilot'
								)}
							</p>
							<FileInput
								multiple
								accept={ATTACHMENT_ACCEPT}
								openUploader={__('Upload File', 'vulopilot')}
								wrapperClass="chat-composer-fileinput"
								// zyra's FileInput takes { url } objects as well as URL strings (it turns strings into them).
								imageSrc={attachments.map((attachment) => ({ id: attachment.id, url: attachment.url })) as unknown as string[]}
								onChange={handleFiles}
							/>
						</div>
					)}

					<div className={`vp-composer-box${isLocked ? ' is-locked' : ''}`}>
						<textarea
							ref={inputRef}
							rows={1}
							value={message}
							disabled={isLocked}
							onChange={(event) => setMessage(event.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={
								activeFlow
									? __('Answer the question above to continue…', 'vulopilot')
									: __('Ask VuloPilot anything about your website…', 'vulopilot')
							}
							aria-label={__('Message VuloPilot', 'vulopilot')}
						/>
						<div className="vp-composer-bar">
							<button
								type="button"
								className={`vp-composer-tool${isAttachOpen ? ' is-active' : ''}`}
								aria-pressed={isAttachOpen}
								onClick={() => setIsAttachOpen((open) => !open)}
							>
								<i className="adminfont-attachment" aria-hidden="true" />
								{__('Attach', 'vulopilot')}
								{attachments.length > 0 && <b>{attachments.length}</b>}
							</button>
							<span className="vp-composer-auto">
								<Switch
									checked={autoApply}
									onChange={() => onAutoApplyChange(!autoApply)}
									label={__('Auto-apply fixes', 'vulopilot')}
								/>
								<span aria-hidden="true">{__('Auto-apply fixes', 'vulopilot')}</span>
								<TooltipComponent
									text={__(
										'When on, VuloPilot applies a fix itself and still asks you to approve it before it goes live - nothing changes on your site without your say.',
										'vulopilot'
									)}
								>
									<i className="adminfont-info" aria-hidden="true" />
								</TooltipComponent>
							</span>
							<span className="vp-composer-hint">{__('Enter to send · Shift+Enter for a new line', 'vulopilot')}</span>
							<button
								type="button"
								className="vp-composer-send"
								disabled={!canSend}
								onClick={handleSend}
								aria-label={__('Send', 'vulopilot')}
							>
								<i className="adminfont-send" aria-hidden="true" />
							</button>
						</div>
					</div>
				</footer>
			</AiCopilotGuard>
		</section>
	);
};

export default CopilotChat;
