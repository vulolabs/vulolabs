import type { CSSProperties, ReactNode } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import './ScoreBreakdown.scss';

/** good ≥ 70, warn ≥ 40, bad below - the bands every SEO & Visibility score uses. */
export type ScoreBand = 'good' | 'warn' | 'bad';

export const bandFor = (score: number): ScoreBand => {
	if (score >= 70) {
		return 'good';
	}
	return score >= 40 ? 'warn' : 'bad';
};

/** A 0–100 score as a ring: the number and its rating inside, coloured by band. */
export const ScoreRing = ({
	score,
	label,
	size = 'lg',
}: {
	score: number;
	/** The rating under the number ("Good"). */
	label?: string;
	size?: 'md' | 'lg';
}) => (
	<span
		className={`vp-score-ring is-${bandFor(score)} is-${size}`}
		style={{ '--vp-ring-score': Math.max(0, Math.min(100, score)) } as CSSProperties}
		role="img"
		aria-label={sprintf(
			/* translators: %d: score out of 100. */
			__('Score %d out of 100', 'vulopilot'),
			score
		)}
	>
		<b>{score}</b>
		{label && <small>{label}</small>}
	</span>
);

export interface BreakdownRow {
	key: string;
	icon: string;
	title: string;
	/** A line under the title ("2 issues"). */
	sub?: ReactNode;
	/** The row's 0–100 score; null shows `status` instead and no bar. */
	score: number | null;
	/** Points moved since the start of the period. */
	change?: number | null;
	/** Shown in place of a score (a pass/fail check). */
	status?: ReactNode;
	onClick?: () => void;
}

interface ScoreBreakdownProps {
	score: number;
	ratingLabel: string;
	summary: ReactNode;
	rows: BreakdownRow[];
	/** Small figures under everything ("Pages checked 2"). */
	stats?: { label: string; value: ReactNode; tone?: 'bad' | 'warn' }[];
}

/**
 * The score card of every SEO & Visibility tab: the ring and one line beside a list of what makes it up, each part
 * with its own colour, its score, the change and a bar. Rows open their part when they have an `onClick`.
 */
const ScoreBreakdown = ({ score, ratingLabel, summary, rows, stats }: ScoreBreakdownProps) => (
	<div className="vp-breakdown">
		<div className="vp-breakdown-main">
			<div className="vp-breakdown-score">
				<ScoreRing score={score} label={ratingLabel} />
				<p>{summary}</p>
			</div>
			<ul className="vp-breakdown-rows">
				{rows.map((row) => {
					const body = (
						<>
							<span className="vp-breakdown-icon" aria-hidden="true">
								<i className={`adminfont-${row.icon}`} />
							</span>
							<span className="vp-breakdown-name">
								{row.title}
								{row.sub && <small>{row.sub}</small>}
							</span>
							<span className="vp-breakdown-value">
								{null === row.score ? (
									row.status
								) : (
									<>
										{row.score}
										{!!row.change && (
											<em className={row.change > 0 ? 'is-up' : 'is-down'}>
												{row.change > 0 ? '+' : '−'}
												{Math.abs(row.change)}
											</em>
										)}
									</>
								)}
							</span>
							{null !== row.score && (
								<span className={`vp-breakdown-bar is-${bandFor(row.score)}`} aria-hidden="true">
									<i style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} />
								</span>
							)}
						</>
					);

					return (
						<li key={row.key}>
							{row.onClick ? (
								<button type="button" className="vp-breakdown-row" onClick={row.onClick}>
									{body}
								</button>
							) : (
								<div className="vp-breakdown-row">{body}</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
		{stats && stats.length > 0 && (
			<dl className="vp-breakdown-stats">
				{stats.map((stat) => (
					<div key={stat.label} className={stat.tone ? `is-${stat.tone}` : undefined}>
						<dt>{stat.label}</dt>
						<dd>{stat.value}</dd>
					</div>
				))}
			</dl>
		)}
	</div>
);

export default ScoreBreakdown;
