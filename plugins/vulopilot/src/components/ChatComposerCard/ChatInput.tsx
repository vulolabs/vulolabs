import React from 'react';
import { TooltipComponent, IconComponent, ButtonInput } from '@zyra/components';
import { MultiCheckboxInput, TextAreaInput } from '@zyra/inputs';

interface ChatInputProps {
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	placeholder?: string;
	onAttach?: () => void;
	attachLabel?: string;
	onAddContext?: () => void;
	addContextLabel?: string;
	autoApply?: {
		checked: boolean;
		onChange: (checked: boolean) => void;
		label: React.ReactNode;
	};
	disabled?: boolean;
	/** When set, the send button renders visibly but inert with this explanation in a tooltip — e.g. no chat backend wired up yet — instead of a button that silently does nothing. */
	sendDisabledReason?: string;
}

/**
 * The chat composer bar — free-text input plus Attach/Add context pill
 * buttons on one row and a send button, with an optional auto-apply switch
 * on the trailing edge. Every AI-assistant-style surface in this plugin
 * (AI Copilot's Chat tab, Grow My Traffic's composer, Create Content's AI
 * Content Assistant) uses the same bar.
 *
 * Ported from zyra's own ChatInputComponent (@zyra/components) — every real
 * consumer lived in this plugin alone, so it's kept here with the rest of
 * ChatComposerCard instead of in the shared design system.
 */
const ChatInput: React.FC<ChatInputProps> = ({
	value,
	onChange,
	onSend,
	placeholder,
	onAttach,
	attachLabel = 'Attach',
	onAddContext,
	addContextLabel = 'Add context',
	autoApply,
	disabled = false,
	sendDisabledReason,
}) => {
	const handleSend = () => {
		if (!disabled && !sendDisabledReason && value.trim()) {
			onSend();
		}
	};

	const sendButton = (
		<ButtonInput
			buttons={[
				{
					icon: 'send',
					color: 'purple chat-input-send',
					disabled: disabled || (!sendDisabledReason && !value.trim()),
					ariaDisabled: !!sendDisabledReason,
					onClick: handleSend,
				},
			]}
		/>
	);

	return (
		<div className="chat-input">
			<div className="chat-input-row">
				{onAttach && (
					<TooltipComponent text={attachLabel}>
						<IconComponent className="attachment-icon" onClick={onAttach} name="attachment" />
					</TooltipComponent>
				)}
				<TextAreaInput
					inputClass="chat-input-textarea"
					value={value}
					placeholder={placeholder}
					disabled={disabled}
					usePlainText
					rowNumber={1}
					onChange={onChange}
					onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							handleSend();
						}
					}}
				/>
				{sendDisabledReason ? (
					<TooltipComponent text={sendDisabledReason}>
						{sendButton}
					</TooltipComponent>
				) : (
					sendButton
				)}
			</div>
			<div className='chat-input-actions'>
				{autoApply && (
					<div className="chat-input-autoapply">
						<MultiCheckboxInput
							look="toggle"
							modules={[]}
							options={[
								{ key: 'auto-apply', value: 'auto-apply' },
							]}
							value={autoApply.checked ? ['auto-apply'] : []}
							onChange={(vals) =>
								autoApply.onChange(
									vals.includes('auto-apply')
								)
							}
						/>
						{autoApply.label && (
							<span className="chat-input-autoapply-label">
								{autoApply.label}
							</span>
						)}
					</div>
				)}
				{onAddContext && (
					<>
						<ButtonInput
							buttons={[
								{
									onClick: onAddContext,
									color: 'text-purple',
									text: 'Add site context',
								},
							]}
						/>
					</>
				)}
			</div>
		</div>
	);
};

export default ChatInput;
