import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import { ListComponent } from '@zyra/components';
import ChatComposerCard from './ChatComposerCard';
import aiImage from '../../assets/images/ai.png';

export interface AiChatCardPrompt {
	id: string;
	icon: string;
	title: string;
}

export interface AiChatCardProps<TTurn> {
	guarded?: boolean;
	sendingAvatarIcon?: string;
	/** Passed straight through to ChatComposerCard's own `cardClassName` — an escape hatch for a one-off page-scoped tweak (e.g. AI Copilot's own "Chat History" button whitespace), not for re-doing this card's shared look. */
	cardClassName?: string;
	cardTitle: ReactNode;
	cardTitleIcon?: string;
	cardDesc?: ReactNode;
	/** e.g. AI Copilot's own "Chat History" button — omit for a composer with no card-level action. */
	cardAction?: ReactNode;
	emptyTitle?: ReactNode;
	emptyDesc?: ReactNode;
	/** Suggested-prompt pills, rendered right below the empty-state text (only while `turns` is empty) — clicking one calls `onSelectPrompt(prompt.title)`. Omit/pass `[]` for a composer with no prompt grid. */
	prompts?: AiChatCardPrompt[];
	// eslint-disable-next-line no-unused-vars -- named param on a type-only call signature; base no-unused-vars doesn't recognize TS call-signature parameters.
	onSelectPrompt?: (title: string) => void;
	turns: TTurn[];
	// eslint-disable-next-line no-unused-vars -- named params on a type-only call signature; base no-unused-vars doesn't recognize TS call-signature parameters.
	renderTurn: (turn: TTurn, index: number) => ReactNode;
	isSending?: boolean;
	sendingSpinnerClassName?: string;
	/** Whether `composer` renders before or after the turns block — GEO's Overview composer puts it first, matching that page's own mockup order. */
	composerPosition?: 'before-turns' | 'after-turns';
	/** Extra content rendered right before the composer — attachment/context chips, toggleable picker panels, a pending-chip question, etc.; still built by each page itself. */
	beforeComposer?: ReactNode;
	/** The fully-built `<ChatInput />` element — still built by each page itself, since its own props (attach/context handlers, auto-apply tooltip, a pending-answer placeholder, …) genuinely differ per composer. */
	composer: ReactNode;
	note?: ReactNode;
}

/**
 * The "Chat with VuloPilot" look — every real AI chat composer card in
 * this plugin (AI Copilot's own Chat tab, GEO's "How would you like to
 * grow today?", Create Content's AI Content Assistant) now renders
 * through this one component instead of each hand-assembling its own
 * `ChatComposerCard` call with a slightly different card header/empty
 * state/prompt grid. Built on top of `ChatComposerCard` (this folder's
 * own bare skeleton): supplies the icon-badge card header, the `ai.png`
 * illustration + heading + subtitle empty state (with the suggested
 * prompts nested inside it, shown only before the first real turn — not
 * a separate always-visible slot), and the chip-grid prompt pills —
 * `.ai-card`/`.chip-grid` in ChatComposerCard.scss already style all of
 * this identically for every consumer.
 *
 * Turn rendering stays a `renderTurn` callback rather than being folded
 * in here too: `CopilotTurnBubble` (this folder's own component) is the
 * shared bubble for every real `useCopilotChat` consumer, but Create
 * Content's own chat has a different turn shape (no attachments/runId/
 * undone) and needs its own — genericizing turn content itself would mean
 * forcing every future consumer's shape through one type, which the
 * `composer`/`beforeComposer` props already deliberately avoid doing for
 * the same reason.
 */
const AiChatCard = <TTurn,>({
	guarded = true,
	sendingAvatarIcon = 'person',
	cardClassName,
	cardTitle,
	cardTitleIcon = 'ai',
	cardDesc,
	cardAction,
	emptyTitle = __('How can I help you today?', 'vulopilot'),
	emptyDesc,
	prompts = [],
	onSelectPrompt,
	turns,
	renderTurn,
	isSending = false,
	sendingSpinnerClassName,
	composerPosition,
	beforeComposer,
	composer,
	note,
}: AiChatCardProps<TTurn>) => (
	<ChatComposerCard<TTurn>
		guarded={guarded}
		sendingAvatarIcon={sendingAvatarIcon}
		cardClassName={cardClassName}
		cardTitle={cardTitle}
		cardTitleIcon={cardTitleIcon}
		cardDesc={cardDesc}
		cardAction={cardAction}
		emptyState={
			<div className="chat-empty-state">
				<img className="chat-empty-state-image" src={aiImage} alt="" />
				<div className="chat-empty-state-title">{emptyTitle}</div>
				{emptyDesc && (
					<div className="chat-empty-state-desc">{emptyDesc}</div>
				)}
				{prompts.length > 0 && (
					<ListComponent
						className="chip-grid"
						items={prompts.map((prompt) => ({
							id: prompt.id,
							icon: prompt.icon,
							title: prompt.title,
							action: () => onSelectPrompt?.(prompt.title),
							tags: (
								<i className="adminfont-pagination-next-arrow" />
							),
						}))}
					/>
				)}
			</div>
		}
		turns={turns}
		renderTurn={renderTurn}
		isSending={isSending}
		sendingSpinnerClassName={sendingSpinnerClassName}
		composerPosition={composerPosition}
		beforeComposer={beforeComposer}
		composer={composer}
		note={note}
	/>
);

export default AiChatCard;
