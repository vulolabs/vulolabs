import type { ReactNode } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { ButtonInput } from '@zyra/inputs';
import { ScoreRing, Skeleton, scoreTone } from './ui';
import type { FindingGroup } from './Issues/issuesTypes';
import type { IssueArea } from '../pages/AIAssistant/IssuesList';
import { getRating } from '../pages/Dashboard/scoring';
import '../dashboard-widgets/dashboard.scss';
import './AreaHero.scss';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const SEVERITY_WORD: Record<string, string> = {
	critical: __('critical', 'vulopilot'),
	high: __('high', 'vulopilot'),
	medium: __('medium', 'vulopilot'),
	low: __('low', 'vulopilot'),
	info: __('info', 'vulopilot'),
};

export type HeroArea = IssueArea & { icon: string };

/** Critical and high groups: what needs attention first. */
export const urgentCount = (groups: FindingGroup[]): number =>
	groups.filter((group) => (SEVERITY_RANK[group.severity] ?? 4) <= 1).length;

/** An area is clear, or shows its issue count in its worst issue's colour. */
const areaStatus = (groups: FindingGroup[]): { tone: 'good' | 'bad' | 'warn' | 'info'; text: string } => {
	if (0 === groups.length) {
		return { tone: 'good', text: __('Clear', 'vulopilot') };
	}

	const worst = groups.reduce((a, b) => ((SEVERITY_RANK[b.severity] ?? 4) < (SEVERITY_RANK[a.severity] ?? 4) ? b : a));
	const rank = SEVERITY_RANK[worst.severity] ?? 4;

	return {
		tone: rank <= 1 ? 'bad' : 2 === rank ? 'warn' : 'info',
		text: sprintf(
			/* translators: 1: number of issues, 2: worst severity, e.g. "critical". */
			_n('%1$d issue · %2$s', '%1$d issues · %2$s', groups.length, 'vulopilot'),
			groups.length,
			SEVERITY_WORD[worst.severity] ?? worst.severity
		),
	};
};

interface AreaHeroProps {
	/** What the score is, e.g. "Security": the eyebrow reads "Security · Good". */
	label: string;
	score: number | null;
	/** The page's open issue groups. */
	groups: FindingGroup[];
	areas: HeroArea[];
	areasTitle: string;
	isLoading: boolean;
	headline: string;
	/** One line under the headline, with its mood. */
	note: { tone: 'up' | 'down' | 'flat'; text: ReactNode };
	/** Short facts under the note; the number goes in <strong>. */
	facts?: ReactNode[];
	/** Shows one area's issues in the page's list (`all` for every area). */
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onReview: (area: string) => void;
	reviewLabel?: string;
}

/**
 * A page's opening answer, in the dashboard hero's shape (dashboard.scss `vp-hero`): the score and what it means, the
 * headline, a note and facts on the left; every area with its state on the right. An area with issues opens them in
 * the list below. Security, Site Health and Performance use it.
 */
const AreaHero = ({
	label,
	score,
	groups,
	areas,
	areasTitle,
	isLoading,
	headline,
	note,
	facts = [],
	onReview,
	reviewLabel = __('Review issues', 'vulopilot'),
}: AreaHeroProps) => {
	if (isLoading) {
		return (
			<section className="vp-hero is-loading" aria-busy="true">
				<Skeleton size="hero" />
				<Skeleton size="block" />
			</section>
		);
	}

	const shown = score ?? 0;
	const rows = areas.map((area) => ({
		...area,
		status: areaStatus(groups.filter((group) => area.scannerIds.includes(group.scanner_id))),
	}));
	const noteIcon = { up: 'check', down: 'error', flat: 'info' }[note.tone];

	return (
		<section className="vp-hero vp-area-hero" aria-label={label}>
			<div className="vp-hero-main">
				<ScoreRing score={shown} />
				<div className="vp-hero-copy">
					<span className={`vp-hero-eyebrow is-${scoreTone(shown)}`}>
						{sprintf(
							/* translators: 1: what is scored, e.g. "Security", 2: rating such as "Excellent". */
							__('%1$s · %2$s', 'vulopilot'),
							label,
							getRating(shown)
						)}
					</span>
					<h2>{headline}</h2>
					<p className={`vp-hero-trend is-${note.tone}`}>
						<i className={`adminfont-${noteIcon}`} aria-hidden="true" />
						<span>{note.text}</span>
					</p>
					{facts.length > 0 && (
						<ul className="vp-hero-facts">
							{facts.map((fact, index) => (
								<li key={index}>{fact}</li>
							))}
						</ul>
					)}
					{groups.length > 0 && (
						<div className="vp-hero-cta">
							<ButtonInput
								buttons={{
									text: reviewLabel,
									icon: 'arrow-down',
									color: 'purple-bg',
									onClick: () => onReview('all'),
								}}
							/>
						</div>
					)}
				</div>
			</div>

			<div className="vp-hero-areas">
				<span className="vp-hero-areas-title">{areasTitle}</span>
				<ul className="vp-area-list">
					{rows.map((area) => (
						<li key={area.id}>
							<button
								type="button"
								className={`is-${area.status.tone}`}
								disabled={'good' === area.status.tone}
								onClick={() => onReview(area.id)}
							>
								<i className={`adminfont-${area.icon}`} aria-hidden="true" />
								<span className="vp-area-name">{area.label}</span>
								<span className="vp-area-state">
									{'good' === area.status.tone && <i className="adminfont-check" aria-hidden="true" />}
									{area.status.text}
								</span>
							</button>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
};

export default AreaHero;
