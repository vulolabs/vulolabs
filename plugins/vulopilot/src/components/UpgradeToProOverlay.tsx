import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import './UpgradeToProOverlay.scss';

/** Every prop defaults to the original upgrade copy. */
interface OverlayCopy {
	icon?: string;
	title?: string;
	desc?: string;
	buttonText?: string;
	/** `admin-btn` modifier for the CTA (e.g. `purple-bg`, `orange-bg`). Defaults to `purple-bg`. */
	buttonColor?: string;
}

export const UpgradeToProOverlay = ({
	onClick,
	icon = 'pro-tag',
	title = __('Available with VuloPilot Pro', 'vulopilot'),
	desc = __('Unlock the full VuloPilot toolkit', 'vulopilot'),
	buttonText = __('Unlock with Pro', 'vulopilot'),
	buttonColor = 'purple-bg',
}: { onClick?: () => void } & OverlayCopy) => (
	<div
		className="pro-section-wrapper"
		style={onClick ? { cursor: 'pointer' } : undefined}
		role={onClick ? 'button' : undefined}
		tabIndex={onClick ? 0 : undefined}
		onClick={onClick}
		onKeyDown={
			onClick
				? (event) => {
						if ('Enter' === event.key || ' ' === event.key) {
							onClick();
						}
					}
				: undefined
		}
	>
		<div
			className="pro-section"
		>
			<i className={`adminfont-${icon}`}></i>
			<div className="title">{title}</div>
			<span>{desc}</span>
			<div
				className={`admin-btn btn-${buttonColor}`}
				role={onClick ? 'button' : undefined}
				tabIndex={onClick ? 0 : undefined}
				onKeyDown={(event) => {
					if (onClick && ('Enter' === event.key || ' ' === event.key)) {
						event.preventDefault();
						onClick();
					}
				}}
			>
				{buttonText}
			</div>
		</div>
	</div>
);

export const BlurredProContent = ({
	contentClassName,
	onClick,
	children,
	...overlayCopy
}: {
	/** This dummy's own content class - `blur-wrapper-content` is appended automatically. */
	contentClassName: string;
	onClick: () => void;
	children: ReactNode;
} & OverlayCopy) => (
	<div className="blur-wrapper">
		<UpgradeToProOverlay onClick={onClick} {...overlayCopy} />
		<div
			className={`${contentClassName} blur-wrapper-content`}
			data-sample-label={__('Sample', 'vulopilot')}
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(event) => {
				if ('Enter' === event.key || ' ' === event.key) {
					onClick();
				}
			}}
		>
			{children}
		</div>
	</div>
);