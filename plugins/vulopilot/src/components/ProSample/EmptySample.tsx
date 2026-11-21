import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import './ProSample.scss';

interface EmptySampleProps {
	/** Made-up rows in the real list's shape. */
	children: ReactNode;
	/** What is missing, e.g. "No conversations yet". */
	title: string;
	/** One line on what the list will show. */
	text: string;
	/** The real next step, e.g. "Ask AI Copilot". */
	actionLabel: string;
	onAction: () => void;
	icon?: string;
}

/**
 * A list with nothing in it yet: sample rows in its own shape, faded and marked "Sample data", then a strip that says
 * what is missing and runs the real next step. ProSample's look without the Pro tag (VuloPilot Pro has the same
 * component for its own tables). Use it where empty means "not started yet", never where empty is good news.
 */
const EmptySample = ({ children, title, text, actionLabel, onAction, icon = 'info' }: EmptySampleProps) => (
	<div className="vp-sample is-empty-sample">
		<div
			className="vp-sample-preview"
			role="button"
			tabIndex={0}
			aria-label={actionLabel}
			onClick={onAction}
			onKeyDown={(event) => {
				if ('Enter' === event.key || ' ' === event.key) {
					event.preventDefault();
					onAction();
				}
			}}
		>
			<div className="vp-sample-content" aria-hidden="true">
				{children}
			</div>
			<span className="vp-sample-label">{__('Sample data', 'vulopilot')}</span>
		</div>

		<div className="vp-sample-bar">
			<span className="vp-sample-tag is-start">
				<i className={`adminfont-${icon}`} aria-hidden="true" />
				{title}
			</span>
			<p>{text}</p>
			<button type="button" className="vp-sample-cta" onClick={onAction}>
				{actionLabel}
			</button>
		</div>
	</div>
);

export default EmptySample;
