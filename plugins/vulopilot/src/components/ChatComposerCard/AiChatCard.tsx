import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import { ListComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
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
	/** Passed straight through to ChatComposerCard's own `cardClassName`. */
	cardClassName?: string;
	cardTitle?: ReactNode;
	cardTitleIcon?: string;
	cardDesc?: ReactNode;
	showProBadge?: boolean;
	/** Renders a real "Chat History" button in the card header. */
	onOpenHistoryPopup?: () => void;
	/** Renders a real "New Chat" button in the card header, right next to "Chat History". */
	onNewChat?: () => void;
	emptyTitle?: ReactNode;
	emptyDesc?: ReactNode;
	/** Suggested-prompt pills, rendered right below the empty-state text. */
	prompts?: AiChatCardPrompt[];
	 
	// eslint-disable-next-line no-unused-vars
	onSelectPrompt?: (title: string) => void;
	turns: TTurn[];
	 
	// eslint-disable-next-line no-unused-vars
	renderTurn: (turn: TTurn, index: number) => ReactNode;
	isSending?: boolean;
	sendingSpinnerClassName?: string;
	/** Whether `composer` renders before or after the turns block. */
	composerPosition?: 'before-turns' | 'after-turns';
	/** Extra content rendered right before the composer. */
	beforeComposer?: ReactNode;
	/** The fully-built `ChatInput` element - still built by each page itself. */
	composer: ReactNode;
	note?: ReactNode;
}

const AiChatCard = <TTurn,>({
	guarded = true,
	sendingAvatarIcon = 'person',
	cardClassName = 'ai-copilot-main-chat',
	cardTitle = 'Chat with VuloPilot',
	cardTitleIcon = 'ai',
	cardDesc = 'Ask anything about your website, performance, security, content and more.',
	showProBadge = false,
	onOpenHistoryPopup,
	onNewChat,
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
		cardAction={
			(showProBadge || onNewChat || onOpenHistoryPopup) && (
				<>
					{showProBadge && (
						<span className="admin-tag pro-tag pro-tag-inline">
								<i className="adminfont-pro-tag" />
								{__('Pro', 'vulopilot')}
							</span>
					)}
					{onNewChat && (
						<ButtonInput
							buttons={{
								text: __('New Chat', 'vulopilot'),
								leftIcon: 'plus',
								color: 'text-purple',
								onClick: onNewChat,
							}}
						/>
					)}
					{onOpenHistoryPopup && (
						<ButtonInput
							buttons={{
								text: __('Chat History', 'vulopilot'),
								leftIcon: 'clock',
								color: 'purple',
								onClick: onOpenHistoryPopup,
							}}
						/>
					)}
				</>
			)
		}
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
