import React from 'react';
import { IconComponent } from '@zyra/components';

interface ChatMessageProps {
	sender?: 'ai' | 'user';
	/** adminfont icon glyph shown in the avatar circle — defaults to 'person'. */
	avatarIcon?: string;
	children: React.ReactNode;
}

/**
 * A single chat bubble — avatar circle + free-form content block. `sender`
 * only flips the alignment/color treatment; the greeting/message content
 * itself is passed as `children` so callers can mix bold lead-ins,
 * paragraphs, or lists inside one bubble same as the AI Copilot mockup's
 * welcome message does.
 *
 * Ported from zyra's own ChatMessageComponent (@zyra/components) — every
 * real consumer lived in this plugin alone, so it's kept here with the rest
 * of ChatComposerCard instead of in the shared design system.
 */
const ChatMessage: React.FC<ChatMessageProps> = ({
	sender = 'person',
	avatarIcon = 'person',
	children,
}) => {
	return (
		<div className={`chat-message chat-message-${sender}`}>
			<span className="chat-message-avatar">
				<IconComponent name={avatarIcon} />
			</span>
			<div className="chat-message-content">{children}</div>
		</div>
	);
};

export default ChatMessage;
