import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';

/**
 * VuloPilot's own building blocks, drawn the way VuloCart, VuloForm and VuloMail draw their admin screens (their
 * components/ui.tsx): white cards with a hairline border and a small bordered icon tile beside the title, KPI tiles,
 * a segmented control, status pills, empty states and loading placeholders. Styles: ui.scss (`vp-` classes).
 */

export type Tone = 'neutral' | 'violet' | 'blue' | 'green' | 'amber' | 'red';
export type Status = 'good' | 'warn' | 'bad' | 'off' | 'info';

/** A rounded square holding an icon, tinted by tone. */
export const IconTile = ({ icon, tone = 'neutral', size = 'md' }: { icon: string; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) => (
	<span className={`vp-icon is-${tone} is-${size}`} aria-hidden="true">
		<i className={`adminfont-${icon}`} />
	</span>
);

/** A white card: an optional icon tile, the title and one line, an action or link on the right, then content. */
export const Card = ({
	id,
	title,
	icon,
	desc,
	action,
	link,
	className = '',
	children,
}: {
	id?: string;
	title?: ReactNode;
	icon?: string;
	desc?: ReactNode;
	action?: ReactNode;
	link?: { label: string; href: string };
	className?: string;
	children: ReactNode;
}) => (
	<section className={`vp-card ${className}`.trim()} id={id}>
		{title && (
			<header className="vp-card-head">
				<div className="vp-card-title">
					{icon && (
						<span className="vp-card-icon" aria-hidden="true">
							<i className={`adminfont-${icon}`} />
						</span>
					)}
					<div>
						<h3>{title}</h3>
						{desc && <p>{desc}</p>}
					</div>
				</div>
				{(action || link) && (
					<div className="vp-card-actions">
						{action}
						{link && (
							<a className="vp-card-link" href={link.href}>
								{link.label}
								<i className="adminfont-arrow-right" aria-hidden="true" />
							</a>
						)}
					</div>
				)}
			</header>
		)}
		<div className="vp-card-body">{children}</div>
	</section>
);

/** A heading between groups of cards, with an optional control on the right. */
export const SectionHead = ({ title, children }: { title: string; children?: ReactNode }) => (
	<div className="vp-section-head">
		<h2>{title}</h2>
		{children}
	</div>
);

/** One grey track, the chosen option a raised white tab. */
export const Segmented = ({
	options,
	value,
	onChange,
	label,
	size = 'md',
}: {
	options: { value: string; label: string; icon?: string }[];
	value: string;
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature, not a variable.
	onChange: (next: string) => void;
	label: string;
	size?: 'sm' | 'md';
}) => (
	<div className={`vp-seg is-${size}`} role="group" aria-label={label}>
		{options.map((option) => (
			<button
				key={option.value}
				type="button"
				className={value === option.value ? 'is-active' : ''}
				aria-pressed={value === option.value}
				onClick={() => onChange(option.value)}
			>
				{option.icon && <i className={`adminfont-${option.icon}`} aria-hidden="true" />}
				{option.label}
			</button>
		))}
	</div>
);

/** A change as a coloured chip (`suffix` after the number, "%" by default); nothing when there is no change. */
export const Delta = ({ change, inverse = false, suffix = '%' }: { change: number | null; inverse?: boolean; suffix?: string }) => {
	if (null === change || 0 === change || !Number.isFinite(change)) {
		return null;
	}

	const good = inverse ? change < 0 : change > 0;

	return (
		<span className={`vp-delta ${good ? 'is-good' : 'is-bad'}`}>
			<i className={`adminfont-arrow-${change > 0 ? 'up' : 'down'}`} aria-hidden="true" />
			{Math.abs(change)}
			{suffix}
		</span>
	);
};

/** One KPI tile: icon and label, the figure with its change, one line of context. A link when `href` is set. */
export const Kpi = ({
	icon,
	label,
	value,
	hint,
	change = null,
	changeSuffix,
	inverse = false,
	href,
	tone,
}: {
	icon: string;
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	change?: number | null;
	changeSuffix?: string;
	inverse?: boolean;
	href?: string;
	tone?: Tone;
}) => {
	const inner = (
		<>
			<span className="vp-kpi-label">
				<span className="vp-kpi-icon" aria-hidden="true">
					<i className={`adminfont-${icon}`} />
				</span>
				{label}
			</span>
			<span className="vp-kpi-value">
				{value}
				<Delta change={change} inverse={inverse} suffix={changeSuffix} />
			</span>
			{hint && <span className="vp-kpi-hint">{hint}</span>}
		</>
	);
	const className = `vp-kpi${tone ? ` is-${tone}` : ''}`;

	return href ? (
		<a className={className} href={href}>
			{inner}
		</a>
	) : (
		<div className={className}>{inner}</div>
	);
};

export const KpiGrid = ({ label, children, cols = 4 }: { label: string; children: ReactNode; cols?: 3 | 4 }) => (
	<section className={`vp-kpis is-${cols}`} aria-label={label}>
		{children}
	</section>
);

/** A state as a coloured dot and a word ("● Enabled"). */
export const Pill = ({ status, children }: { status: Status; children: ReactNode }) => (
	<span className={`vp-pill is-${status}`}>{children}</span>
);

/** What a card shows when it has nothing yet: an icon tile, one bold line, one quiet line, an optional action. */
export const EmptyState = ({
	icon,
	tone = 'violet',
	title,
	text,
	action,
	compact = false,
}: {
	icon: string;
	tone?: Tone;
	title: string;
	text?: ReactNode;
	action?: ReactNode;
	compact?: boolean;
}) => (
	<div className={`vp-empty${compact ? ' is-compact' : ''}`}>
		<IconTile icon={icon} tone={tone} size={compact ? 'md' : 'lg'} />
		<div className="vp-empty-text">
			<strong>{title}</strong>
			{text && <span>{text}</span>}
		</div>
		{action && <div className="vp-empty-action">{action}</div>}
	</div>
);

/** A shimmering placeholder while data loads. */
export const Skeleton = ({ size = 'row' }: { size?: 'row' | 'block' | 'hero' | 'chart' | 'tall' }) => (
	<div className={`vp-skel is-${size}`} aria-hidden="true" />
);

/** An accessible on/off switch. */
export const Switch = ({
	checked,
	onChange,
	label,
	disabled = false,
}: {
	checked: boolean;
	onChange: () => void;
	label: string;
	disabled?: boolean;
}) => (
	<label className={`vp-switch${disabled ? ' is-disabled' : ''}`}>
		<input type="checkbox" role="switch" checked={checked} onChange={onChange} aria-label={label} disabled={disabled} />
		<span className="vp-switch-track" />
	</label>
);

/** "Good morning", "Good afternoon" or "Good evening" for the current hour. */
export const greeting = (): string => {
	const hour = new Date().getHours();

	if (hour < 12) {
		return __('Good morning', 'vulopilot');
	}

	return hour < 18 ? __('Good afternoon', 'vulopilot') : __('Good evening', 'vulopilot');
};

/** A 0–100 score's tone: the same four bands as the dashboard's "Excellent / Good / Fair / Needs work". */
export const scoreTone = (score: number): Tone => {
	if (score >= 90) {
		return 'green';
	}
	if (score >= 70) {
		return 'blue';
	}

	return score >= 50 ? 'amber' : 'red';
};

/** The score as a ring: one track, one arc in the score's colour. */
export const ScoreRing = ({ score }: { score: number }) => {
	const radius = 52;
	const length = 2 * Math.PI * radius;
	const clamped = Math.max(0, Math.min(100, score));

	return (
		<div className={`vp-ring is-${scoreTone(score)}`}>
			<svg viewBox="0 0 120 120" aria-hidden="true">
				<circle cx="60" cy="60" r={radius} className="vp-ring-track" />
				<circle
					cx="60"
					cy="60"
					r={radius}
					className="vp-ring-arc"
					strokeDasharray={length}
					strokeDashoffset={length * (1 - clamped / 100)}
				/>
			</svg>
			<span className="vp-ring-label">
				<strong>{score}</strong>
				<span>{__('of 100', 'vulopilot')}</span>
			</span>
		</div>
	);
};
