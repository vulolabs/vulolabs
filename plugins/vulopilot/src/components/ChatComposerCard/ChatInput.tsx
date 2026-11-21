import React from 'react';
import { TooltipComponent, IconComponent, ButtonInput } from '@zyra/components';
import { MultiCheckboxInput, TextAreaInput } from '@zyra/inputs';

interface ChatInputProps {
	value: string;
	// eslint-disable-next-line no-unused-vars
	onChange: (value: string) => void;
	onSend: () => void;
	placeholder?: string;
	onAttach?: () => void;
	attachLabel?: string;
	autoApply?: {
		checked: boolean;
		// eslint-disable-next-line no-unused-vars
		onChange: (checked: boolean) => void;
		label: React.ReactNode;
	};
	disabled?: boolean;
	/** When set, the send button renders visibly but inert with this explanation in a tooltip. */
	sendDisabledReason?: string;
}

/** The chat composer bar. */
const ChatInput: React.FC<ChatInputProps> = ({
	value,
	onChange,
	onSend,
	placeholder,
	onAttach,
	attachLabel = 'Attach',
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
					// Icon-only: zyra renders the (empty) text next to the icon.
					text: '',
					icon: 'send',
					color: 'purple chat-input-send',
					disabled: disabled || (!sendDisabledReason && !value.trim()),
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
			</div>
		</div>
	);
};

export default ChatInput;
