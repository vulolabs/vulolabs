/* global vulopilotAppLocalizer */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import axios from 'axios';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import { NoticeManager, PopupComponent } from '@zyra/components';
import { SelectInput } from '@zyra/inputs';
import { ChatMessage, CopilotTurnBubble } from '../../components/ChatComposerCard';
import ShowProPopup from '../../components/Popup/Popup';
import { IconTile } from '../../components/ui';
import { useAiCredits } from '../../services/useAiCredits';

interface WpRestPost {
	id: number;
	title: { rendered: string };
}

interface ChatTurn {
	role: 'user' | 'assistant';
	content: string;
	link?: { url: string; label: string } | null;
}

interface PromptChip {
	id: string;
	icon: string;
	title: string;
	/** Asked in the chat (no AI call) once the chip is picked. */
	ask: string;
	/** Turns the answer into the instruction sent to the AI. */
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	build: (answer: string) => string;
}

const PROMPT_CHIPS: PromptChip[] = [
	{
		id: 'blog',
		icon: 'document',
		title: __('Write a blog post', 'vulopilot'),
		ask: __('What should the blog post be about?', 'vulopilot'),
		/* translators: %s: topic the user typed. */
		build: (answer) => sprintf(__('Write a blog about %s', 'vulopilot'), answer),
	},
	{
		id: 'product-description',
		icon: 'cart',
		title: __('Describe a product', 'vulopilot'),
		ask: __('Which product is this for? Include its name and a few key details.', 'vulopilot'),
		/* translators: %s: product details the user typed. */
		build: (answer) => sprintf(__('Create a product description for %s', 'vulopilot'), answer),
	},
	{
		id: 'faqs',
		icon: 'question',
		title: __('Generate FAQs', 'vulopilot'),
		ask: __('What topic or policy should these FAQs cover?', 'vulopilot'),
		/* translators: %s: topic the FAQs should cover. */
		build: (answer) => sprintf(__('Generate FAQs for %s', 'vulopilot'), answer),
	},
	{
		id: 'meta-title',
		icon: 'price',
		title: __('Write a meta title', 'vulopilot'),
		ask: __('Which page is this meta title for?', 'vulopilot'),
		/* translators: %s: page the meta title is for. */
		build: (answer) => sprintf(__('Create meta title for %s', 'vulopilot'), answer),
	},
	{
		id: 'cta',
		icon: 'edit',
		title: __('Write a call to action', 'vulopilot'),
		ask: __('What product or service is this call to action for?', 'vulopilot'),
		/* translators: %s: product or service. */
		build: (answer) => sprintf(__('Write a call-to-action for %s', 'vulopilot'), answer),
	},
];

/** The composer grows with its text up to this height, then scrolls. */
const COMPOSER_MAX_HEIGHT = 160;

/**
 * The writing assistant (`POST /content-assistant/chat`): starter prompts that ask one question first, then the
 * conversation. Drawn like AI Copilot's chat (`vp-chat` in AIAssistant/copilot.scss).
 */
const ContentAssistant = () => {
	const [message, setMessage] = useState('');
	const [turns, setTurns] = useState<ChatTurn[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [pendingChip, setPendingChip] = useState<PromptChip | null>(null);
	const [isConnectOpen, setIsConnectOpen] = useState(false);
	const [pageOptions, setPageOptions] = useState<{ value: string; label: string }[]>([]);
	const [isLoadingPages, setIsLoadingPages] = useState(false);
	const { status: creditsStatus } = useAiCredits();
	const streamRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const isEmpty = 0 === turns.length && !isSending;
	const notConnected = Boolean(creditsStatus && !creditsStatus.connected);

	// "Write a meta title" answers with a real post or page, so load them when it is picked.
	useEffect(() => {
		if ('meta-title' !== pendingChip?.id) {
			return;
		}

		const list = (type: string) =>
			getApiResponse<WpRestPost[]>(
				getApiLink(vulopilotAppLocalizer, `${type}?per_page=100&orderby=title&order=asc&_fields=id,title`, 'wp/v2'),
				{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
			);

		setIsLoadingPages(true);
		Promise.all([list('posts'), list('pages')])
			.then(([posts, pages]) =>
				setPageOptions(
					[...(posts || []), ...(pages || [])].map((post) => ({
						value: String(post.id),
						label: post.title.rendered || `#${post.id}`,
					}))
				)
			)
			.finally(() => setIsLoadingPages(false));
	}, [pendingChip]);

	useEffect(() => {
		const stream = streamRef.current;

		if (stream && !isEmpty) {
			stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
		}
	}, [turns.length, isSending]);

	useLayoutEffect(() => {
		const input = inputRef.current;

		if (input) {
			input.style.height = 'auto';
			input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
		}
	}, [message]);

	const sendToAi = (text: string, history: ChatTurn[]) => {
		setIsSending(true);

		axios
			.post<{ content: string; link: ChatTurn['link'] }>(
				getApiLink(vulopilotAppLocalizer, 'content-assistant/chat'),
				{ message: text, history },
				{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
			)
			.then((response) =>
				setTurns((current) => [...current, { role: 'assistant', content: response.data.content, link: response.data.link }])
			)
			.catch((error) => {
				const reason = (error?.response?.data as { message?: string } | undefined)?.message;

				if (reason?.includes('No AI connection is configured') && !creditsStatus?.connected) {
					setIsConnectOpen(true);
					return;
				}

				NoticeManager.add({
					uniqueKey: 'vulopilot-content-assistant-error',
					type: 'error',
					position: 'float',
					message: reason ?? __('Could not reach the writing assistant. Please try again.', 'vulopilot'),
				});
			})
			.finally(() => setIsSending(false));
	};

	const pickChip = (chip: PromptChip) => {
		if (isSending || pendingChip) {
			return;
		}

		if (notConnected) {
			setIsConnectOpen(true);
			return;
		}

		setPendingChip(chip);
		setMessage('');
		setTurns((current) => [...current, { role: 'assistant', content: chip.ask }]);
	};

	const submit = (answer: string) => {
		if ('' === answer || isSending) {
			return;
		}

		if (notConnected) {
			setIsConnectOpen(true);
			return;
		}

		const text = pendingChip ? pendingChip.build(answer) : answer;

		setTurns([...turns, { role: 'user', content: text }]);
		setMessage('');
		setPendingChip(null);
		sendToAi(text, turns);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if ('Enter' === event.key && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			submit(message.trim());
		}
	};

	const startOver = () => {
		setTurns([]);
		setMessage('');
		setPendingChip(null);
	};

	return (
		<section className="vp-card vp-chat vp-writer" aria-label={__('Writing assistant', 'vulopilot')}>
			<header className="vp-chat-head">
				<div className="vp-card-title">
					<span className="vp-card-icon" aria-hidden="true">
						<i className="adminfont-edit" />
					</span>
					<div>
						<h3>{__('Writing assistant', 'vulopilot')}</h3>
						<p>{__('Drafts posts, product copy, FAQs and meta titles in your site’s voice.', 'vulopilot')}</p>
					</div>
				</div>
				{(turns.length > 0 || isSending) && (
					<button type="button" className="vp-widget-tool" onClick={startOver}>
						<i className="adminfont-plus" aria-hidden="true" />
						{__('New chat', 'vulopilot')}
					</button>
				)}
			</header>

			<div className="vp-chat-stream" ref={streamRef} aria-live="polite">
				{isEmpty ? (
					<div className="vp-chat-welcome">
						<IconTile icon="edit" tone="violet" size="lg" />
						<h4>
							{sprintf(
								/* translators: %s: the user's display name. */
								__('What shall we write today, %s?', 'vulopilot'),
								vulopilotAppLocalizer.current_user_display_name
							)}
						</h4>
						<p>{__('Pick a starting point, or describe what you need.', 'vulopilot')}</p>
						<div className="vp-prompts">
							{PROMPT_CHIPS.map((chip) => (
								<button key={chip.id} type="button" onClick={() => pickChip(chip)}>
									<i className={`adminfont-${chip.icon}`} aria-hidden="true" />
									<span>{chip.title}</span>
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="vp-chat-turns">
						{turns.map((turn, index) => (
							<CopilotTurnBubble key={index} turn={turn} aiAvatarIcon="edit" />
						))}
						{isSending && (
							<ChatMessage sender="ai" avatarIcon="edit">
								<span className="vp-chat-thinking">
									<span className="vp-dots" aria-hidden="true">
										<i />
										<i />
										<i />
									</span>
									{__('Writing…', 'vulopilot')}
								</span>
							</ChatMessage>
						)}
					</div>
				)}
			</div>

			<footer className="vp-composer">
				{'meta-title' === pendingChip?.id ? (
					<div className="vp-writer-pick">
						<SelectInput
							type="single-select"
							options={pageOptions}
							value=""
							onChange={(value) => {
								const picked = pageOptions.find((option) => option.value === String(value ?? ''));

								if (picked) {
									submit(picked.label);
								}
							}}
							placeholder={isLoadingPages ? __('Loading pages…', 'vulopilot') : __('Search for a page…', 'vulopilot')}
							disabled={isSending || isLoadingPages}
						/>
						<button type="button" className="vp-chat-cancel" onClick={startOver}>
							{__('Cancel', 'vulopilot')}
						</button>
					</div>
				) : (
					<div className={`vp-composer-box${isSending ? ' is-locked' : ''}`}>
						<textarea
							ref={inputRef}
							rows={1}
							value={message}
							disabled={isSending}
							onChange={(event) => setMessage(event.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={pendingChip ? __('Type your answer…', 'vulopilot') : __('Describe what you want to write…', 'vulopilot')}
							aria-label={__('Message the writing assistant', 'vulopilot')}
						/>
						<div className="vp-composer-bar">
							<a className="vp-composer-tool" href="#&tab=reports&subtab=history">
								<i className="adminfont-recent" aria-hidden="true" />
								{__('History', 'vulopilot')}
							</a>
							<span className="vp-composer-hint">{__('Enter to send · Shift+Enter for a new line', 'vulopilot')}</span>
							<button
								type="button"
								className="vp-composer-send"
								disabled={isSending || '' === message.trim()}
								onClick={() => submit(message.trim())}
								aria-label={__('Send', 'vulopilot')}
							>
								<i className="adminfont-send" aria-hidden="true" />
							</button>
						</div>
					</div>
				)}
			</footer>
			<PopupComponent open={isConnectOpen} onClose={() => setIsConnectOpen(false)} width={22} height="auto" position="lightbox">
				<ShowProPopup vulocloud />
			</PopupComponent>
		</section>
	);
};

export default ContentAssistant;
