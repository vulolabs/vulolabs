import type { ReactNode } from 'react';
import './FieldError.scss';

interface FieldErrorProps {
	children: ReactNode;
	/** Ties the message to its input: give the input the same id in `aria-describedby`. */
	id?: string;
	/**
	 * `field` (default): a short line right under one input.
	 * `block`: a soft red box, for an error that belongs to a whole card (a failed connection).
	 */
	variant?: 'field' | 'block';
}

/**
 * Every inline error in VuloPilot's settings looks and reads the same way: an icon, plain words, the same red. Use
 * it for a value that is wrong or an action that failed in place; a saved/failed toast stays a NoticeManager notice.
 */
const FieldError = ({ children, id, variant = 'field' }: FieldErrorProps) => (
	<p className={`vp-field-error is-${variant}`} id={id} role="alert">
		<i className="adminfont-error" aria-hidden="true" />
		<span>{children}</span>
	</p>
);

/** Wraps an input and its FieldError, so the error sits right under the input and the input turns red. */
export const Field = ({ children, invalid }: { children: ReactNode; invalid?: boolean }) => (
	<div className={`vp-field${invalid ? ' is-invalid' : ''}`}>{children}</div>
);

export default FieldError;
