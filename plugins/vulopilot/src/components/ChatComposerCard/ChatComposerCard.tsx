import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import { CardComponent } from '@zyra/components';
import AiCopilotGuard from '../AiCopilotGuard';
import ChatMessage from './ChatMessage';
import './ChatComposerCard.scss';

export interface ChatComposerCardProps<TTurn = unknown> {
	/** Passed straight through to CardComponent. */
	cardTitle?: ReactNode;
	cardTitleIcon?: string;
	/** Passed straight through to CardComponent's own `desc` - a one-line subtitle under `cardTitle`. */
	cardDesc?: ReactNode;
	cardAction?: ReactNode;
	cardClassName?: string;
	/**
	 * Wraps the body in AiCopilotGuard (the shared "AI Copilot is turned
	 * off" fallback). Off by default - not every composer here actually
	 * talks to the AI Copilot module (AutomationComposerCard has no AI
	 * backend to gate at all).
	 */
	guarded?: boolean;
	/** A custom header rendered above everything else, for cards whose title isn't a plain CardComponent `title` (AutomationComposerCard's own `<h2>`). */
	header?: ReactNode;
	/** A static first turn (e.g. a greeting), rendered before `turns` - as a real `ChatMessage` bubble, and (unlike `emptyState` below) still shown once real turns exist. */
	welcome?: ReactNode;
	/**
	 * A centered "nothing sent yet" placeholder (icon + heading + subtitle,
	 * typically) rendered on its own - NOT wrapped in a `ChatMessage`
	 * bubble - in place of `welcome`/`turns` while `turns` is empty and
	 * nothing is sending. Once a real turn exists (or one is in flight),
	 * this stops rendering and `welcome`/`turns` take over as normal. Most
	 * callers get this for free via `AiChatCard` (this folder's own
	 * `ChatComposerCard`+`ai.png` wrapper) rather than building it by hand.
	 */
	emptyState?: ReactNode;
	turns?: TTurn[];
	// eslint-disable-next-line no-unused-vars -- named params on a type-only call signature; base no-unused-vars doesn't recognize TS call-signature parameters.
	renderTurn?: (turn: TTurn, index: number) => ReactNode;
	isSending?: boolean;
	sendingLabel?: string;
	sendingAvatarIcon?: string;
	sendingSpinnerClassName?: string;
	/**
	 * The fully-built `<ChatInput />` element. Left to the caller rather
	 * than genericized - each site's composer props diverge too much
	 * (`sendDisabledReason` vs `onAttach`/`autoApply`) to be worth forcing
	 * through one shared prop shape.
	 */
	composer: ReactNode;
	/** Whether `composer` renders before or after the welcome/turns block. */
	composerPosition?: 'before-turns' | 'after-turns';
	/** Extra content rendered right before the composer - e.g. ChatTab's "Try asking me…" label, attachment/context chips, attach/context panels. */
	beforeComposer?: ReactNode;
	/**
	 * The fully-built prompt-pills element. Left to the caller for the same
	 * reason as `composer` - shapes genuinely differ (zyra's `ListComponent`
	 * chip-grid vs AutomationComposerCard's raw `<button>` grid). Most
	 * callers get this for free via `AiChatCard` instead.
	 */
	prompts?: ReactNode;
	note?: ReactNode;
}

const ChatComposerCard = <TTurn,>({
	cardTitle,
	cardTitleIcon,
	cardDesc,
	cardAction,
	cardClassName,
	guarded = false,
	header,
	welcome,
	emptyState,
	turns = [],
	renderTurn,
	isSending = false,
	sendingLabel = __('Thinking…', 'vulopilot'),
	sendingAvatarIcon,
	sendingSpinnerClassName = 'chat-thinking-spinner',
	composer,
	composerPosition = 'after-turns',
	beforeComposer,
	prompts,
	note,
}: ChatComposerCardProps<TTurn>) => {
	const turnsBlock =
		emptyState && 0 === turns.length && !isSending ? (
			emptyState
		) : (
			<div className='chat-turns'>
				{welcome && (
					<ChatMessage
						sender="ai"
						{...(sendingAvatarIcon
							? { avatarIcon: sendingAvatarIcon }
							: {})}
					>
						{welcome}
					</ChatMessage>
				)}

				{turns.map((turn, index) =>
					renderTurn ? (
						renderTurn(turn, index)
					) : (
						<ChatMessage key={index}>{turn as ReactNode}</ChatMessage>
					)
				)}

				{isSending && (
					<ChatMessage
						sender="ai"
						{...(sendingAvatarIcon
							? { avatarIcon: sendingAvatarIcon }
							: {})}
					>
						<i
							className={`adminfont-refresh ${sendingSpinnerClassName}`}
						/>{' '}
						{sendingLabel}
					</ChatMessage>
				)}
			</div>
		);

	// Every real composer here is a `ChatInput` whose own textarea handles
	// Enter-to-send - without this, a page-level `keydown` listener above
	// this card (e.g. a global hotkey) sees that same Enter bubble past the
	// textarea and can fire too. Bubble-phase (not capture) on purpose:
	// capture fires top-down *before* the event reaches ChatInput's own
	// textarea, so stopping it there would swallow the textarea's own
	// Enter-to-send handler before it ever runs - this lets that listener
	// fire first, then blocks it from reaching anything above this point.
	// Lives here once rather than in every `composer` prop's own JSX (each
	// consumer building one used to hand-wrap it identically).
	const wrappedComposer = (
		// eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pure event-propagation guard, not an interactive element.
		<div onKeyDown={(e) => e.stopPropagation()}>{composer}</div>
	);

	const body = (
		<>
			{header}
			{'before-turns' === composerPosition && wrappedComposer}
			{turnsBlock}
			{beforeComposer}
			{'after-turns' === composerPosition && wrappedComposer}
			{prompts}
			{note}
		</>
	);

	return (
		<CardComponent
			title={cardTitle}
			titleIcon={cardTitleIcon}
			desc={cardDesc}
			action={cardAction}
			className={`${cardClassName} ai-card-wrapper`}
		>
			<div className='chat-composer-body'>
				{guarded ? <AiCopilotGuard>{body}</AiCopilotGuard> : body}
			</div>
		</CardComponent>
	);
};

export default ChatComposerCard;
