import { __, sprintf, _n } from '@wordpress/i18n';
import { IconTile, Pill, Skeleton } from '../../components/ui';
import { useApiList } from '../../services/useApiList';
import { ACCESSIBILITY_CHECKS } from './accessibilityChecks';

interface AccessibilityFinding {
	id: number;
	page?: string;
}

/** Distinct pages among one check's open findings. */
const pagesAffectedIn = (rows: AccessibilityFinding[]): number =>
	new Set(rows.map((row) => row.page).filter(Boolean)).size;

/** The five real checks; the combined "All checks" entry is the score beside this list. */
const CHECKS = ACCESSIBILITY_CHECKS.filter((check) => 'all' !== check.key);

const useOpenFindings = (scannerIds: string[]) =>
	useApiList<AccessibilityFinding>('findings', {
		scanner_id: scannerIds.join(','),
		status: 'open',
		per_page: 100,
	});

interface AccessibilityChecksGridProps {
	/** Switches the issues table to this check's tab and scrolls to it. */
	// eslint-disable-next-line no-unused-vars
	onReview: (checkKey: string) => void;
}

/** One row per check: what it looks at, and whether the last scan found anything. Rows with issues open them. */
const AccessibilityChecksGrid = ({ onReview }: AccessibilityChecksGridProps) => {
	// One request per check, in the order of CHECKS (hooks cannot run in a loop).
	const results = [
		useOpenFindings(CHECKS[0].scannerIds),
		useOpenFindings(CHECKS[1].scannerIds),
		useOpenFindings(CHECKS[2].scannerIds),
		useOpenFindings(CHECKS[3].scannerIds),
		useOpenFindings(CHECKS[4].scannerIds),
	];
	const isLoading = results.some((result) => result.isLoading);
	const clearCount = results.filter((result) => 0 === result.total).length;

	return (
		<div className="vp-a11y-checks">
			<div className="vp-a11y-checks-head">
				<h3>{__('Checks', 'vulopilot')}</h3>
				{!isLoading && (
					<span>
						{sprintf(
							/* translators: 1: checks with no open issues, 2: all checks. */
							__('%1$d of %2$d clear', 'vulopilot'),
							clearCount,
							CHECKS.length
						)}
					</span>
				)}
			</div>

			{isLoading ? (
				<div className="vp-a11y-checks-loading">
					{CHECKS.map((check) => (
						<Skeleton key={check.key} />
					))}
				</div>
			) : (
				<ul>
					{CHECKS.map((check, index) => {
						const { total, data } = results[index];
						const body = (
							<>
								<IconTile icon={check.tileIcon ?? 'check'} tone={check.tone} />
								<span className="vp-a11y-check-text">
									<strong>{check.title}</strong>
									<span>
										{total > 0
											? sprintf(
													/* translators: %d: number of pages with this problem. */
													_n('%d page affected', '%d pages affected', pagesAffectedIn(data), 'vulopilot'),
													pagesAffectedIn(data)
												)
											: check.clearText}
									</span>
								</span>
								{total > 0 ? (
									<Pill status="warn">
										{sprintf(
											/* translators: %d: number of open issues. */
											_n('%d issue', '%d issues', total, 'vulopilot'),
											total
										)}
									</Pill>
								) : (
									<Pill status="good">{__('Clear', 'vulopilot')}</Pill>
								)}
							</>
						);

						return (
							<li key={check.key}>
								{total > 0 ? (
									<button type="button" className="vp-a11y-check is-open" onClick={() => onReview(check.key)}>
										{body}
										<i className="adminfont-pagination-right-arrow vp-a11y-check-go" aria-hidden="true" />
									</button>
								) : (
									<div className="vp-a11y-check">{body}</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
};

export default AccessibilityChecksGrid;
