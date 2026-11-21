import { useEffect, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { CardComponent, ModuleGuardComponent, ListComponent, BadgeComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { SEO_ISSUE_QUERY_PARAM, FINDING_ID_QUERY_PARAM, getEditorTargetForScanner } from '../../services/seoIssueEditorTarget';
import { formatWpDate } from '../../services/formatWpDate';
import {
	fetchAllPagesWithScores,
	fetchOpenFindingsFor,
	worstFinding,
	GeoAnalysisPageRow,
	RawFinding,
	FindingSeverity,
} from './seoIssuesShared';
import './PageAnalysisPanel.scss';

interface GeoAeoPageAnalysisPanelProps {
	postId: number;
	/** This tab's own real scanner id set (`ALL_GEO_SCANNER_IDS`/`ALL_AEO_SCANNER_IDS`). */
	scannerIds: string[];
	/** "GEO Analysis"/"AEO Analysis" - GeoTab.tsx's/AeoTab.tsx's own real tab identity. */
	title: string;
	desc: string;
	onClose: () => void;
}

/** Same real severity→badge class convention `SeoSiteWideIssuesTable.tsx`'s/`IssuesList.tsx`'s own `titleBadges` already use. */
const severityBadgeColor = (severity: FindingSeverity): string => `badge-${severity}`;

/** Uses the `close` and `error` glyphs, the only ones zyra's icon font offers for open findings. */
const SEVERITY_ICON: Record<FindingSeverity, string> = {
	critical: 'close red',
	high: 'close red',
	medium: 'error orange',
	low: 'error orange',
	info: 'error',
};

/**
 * Same real navigate-and-highlight deep link `SeoIssuesByPageTable.tsx`'s own `buildFixWithAiLink()` already establishes.
 */
const buildFixWithAiLink = (editLink: string, finding: RawFinding): string =>
	getEditorTargetForScanner(finding.scanner_id)
		? `${editLink}&${SEO_ISSUE_QUERY_PARAM}=${encodeURIComponent(finding.scanner_id)}`
		: `${editLink}&${FINDING_ID_QUERY_PARAM}=${finding.id}`;

/** "Page Analysis" for GEO's/AEO's own "Pages & Posts" table. */
const GeoAeoPageAnalysisPanel = ({
	postId,
	scannerIds,
	title,
	desc,
	onClose,
}: GeoAeoPageAnalysisPanelProps) => {
	const [page, setPage] = useState<GeoAnalysisPageRow | null>(null);
	const [findings, setFindings] = useState<RawFinding[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const scannerIdsKey = scannerIds.join(',');

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		Promise.all([
			fetchAllPagesWithScores(scannerIds),
			fetchOpenFindingsFor(scannerIds),
		])
			.then(([pages, allFindings]) => {
				if (cancelled) {
					return;
				}

				const matchedPage = pages.find((p) => p.post_id === postId) ?? null;

				if (!matchedPage) {
					setError(
						__('Could not analyze this page. Please try again.', 'vulopilot')
					);
					return;
				}

				setPage(matchedPage);
				setFindings(
					allFindings.filter(
						(finding) => finding.object_ref === String(postId)
					)
				);
			})
			.catch(() =>
				setError(
					__('Could not analyze this page. Please try again.', 'vulopilot')
				)
			)
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [postId, scannerIdsKey]);

	/** Same real "pick the worst one" posture `SeoIssuesByPageTable.tsx`'s own row-level "Fix with AI" already uses (`worstFinding()`). */
	const primaryFinding = findings.length > 0 ? worstFinding(findings) : null;

	return (
		<CardComponent
			className="page-analysis-panel"
			title={title}
			titleIcon="search"
			desc={desc}
			action={
				<div className="page-analysis-panel-actions">
					<button
						type="button"
						className="page-analysis-panel-close"
						onClick={onClose}
						aria-label={__('Close', 'vulopilot')}
					>
						<i className="adminfont-close" />
					</button>
				</div>
			}
			isLoading={isLoading || undefined}
		>
			{error && (
				<ModuleGuardComponent
					icon="error"
					title={__('Something went wrong', 'vulopilot')}
					desc={error}
				/>
			)}
			{page && (
				<>
					<div className="page-analysis-search-preview">
						<div className="page-analysis-search-preview-meta">
							{sprintf(
								/* translators: %s: this site's own Settings → General → Date Format, e.g. "10/09/2026". */
								__('Last scanned %s', 'vulopilot'),
								formatWpDate(page.date)
							)}
						</div>
						<div className="page-analysis-search-preview-title">
							{page.title}
						</div>
						<div className="page-analysis-search-preview-url">
							{page.permalink}
						</div>
					</div>

					{findings.length > 0 ? (
						<ListComponent
							className="mini-card report hover"
							items={findings.map((finding) => ({
								id: String(finding.id),
								icon: SEVERITY_ICON[finding.severity],
								title: finding.title,
								action: () => {
									window.location.href = buildFixWithAiLink(
										page.edit_link,
										finding
									);
								},
								tags: (
									<>
										<BadgeComponent
											color={severityBadgeColor(finding.severity)}
											text={finding.severity}
										/>
										<i className="adminfont-pagination-right-arrow ai-copilot-row-arrow" />
									</>
								),
							}))}
						/>
					) : (
						<ModuleGuardComponent
							icon="check"
							title={__('No open findings', 'vulopilot')}
							desc={__(
								'This page has no open findings for this tab’s own checks right now.',
								'vulopilot'
							)}
						/>
					)}

					<ButtonInput
						position="full-width"
						buttons={[
							{
								icon: 'edit',
								color: 'border-green',
								text: __('Edit', 'vulopilot'),
								onClick: () => {
									window.location.href = page.edit_link;
								},
							},
							{
								icon: 'eye',
								color: 'border-blue',
								text: __('View', 'vulopilot'),
								disabled: !page.permalink,
								onClick: () => {
									if (page.permalink) {
										window.open(page.permalink, '_blank', 'noreferrer');
									}
								},
							},
							{
								icon: 'ai',
								color: 'orange-bg',
								text: __('Fix with AI', 'vulopilot'),
								disabled: !primaryFinding,
								onClick: () => {
									if (primaryFinding) {
										window.location.href = buildFixWithAiLink(
											page.edit_link,
											primaryFinding
										);
									}
								},
							},
						]}
					/>
				</>
			)}
		</CardComponent>
	);
};

export default GeoAeoPageAnalysisPanel;
