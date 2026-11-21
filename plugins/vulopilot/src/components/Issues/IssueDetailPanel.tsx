/* global vulopilotAppLocalizer */
import React, { useEffect, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { applyFilters } from '@wordpress/hooks';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { PopupComponent, ClipboardComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import ShowProPopup from '../../components/Popup/Popup';
import { formatWpDate } from '../../services/formatWpDate';
import { CATEGORY_LABELS, formatAffected, getObjectTypeNoun, FindingGroup } from './issuesTypes';
import { FixOutcome } from '../../services/showFixOutcome';
import { useFixNotice } from '../../services/useFixNotice';
import { EmptyState, Skeleton } from '../ui';
import './IssueDetailPanel.scss';

interface BatchFixOutcome extends Omit<FixOutcome, 'noFixAvailable'> {
	succeeded?: number;
	total?: number;
	/** Per-batch no-fix count, distinct from FixOutcome's final verdict. */
	noFixAvailable?: number;
}

const BULK_FIX_BATCH_SIZE = 50;

interface FindingRow {
	id: number;
	title: string;
	object_type: string | null;
	object_ref: string | null;
	created_at: string;
	/** Last reconfirmed by a scan - same as created_at if only ever detected once. */
	last_seen_at?: string;
	page?: string;
}

/** How many individual findings to list under "Affected accounts"/"Affected pages"/etc. */
const MAX_AFFECTED_ITEMS_SHOWN = 20;

/** Prefers the live front-end page, falls back to the post edit screen. */
const getAffectedItemLink = (
	row: Pick<FindingRow, 'object_type' | 'object_ref' | 'page'>
): string | undefined => {
	if (row.page && __('Site-wide', 'vulopilot') !== row.page) {
		return `${vulopilotAppLocalizer.site_url}${row.page}`;
	}

	if (
		!row.object_ref ||
		('attachment' !== row.object_type && 'post' !== row.object_type)
	) {
		return undefined;
	}

	// admin_url is `.../admin.php?page=vulopilot`.
	return `${vulopilotAppLocalizer.site_url}/wp-admin/post.php?post=${encodeURIComponent(row.object_ref)}&action=edit`;
};

/** Splits a sample finding's title ("{message}: {affected item name}") into its two halves. */
const splitSampleTitle = (
	title: string
): { message: string; name: string | null } => {
	const separatorIndex = title.lastIndexOf(': ');

	if (-1 === separatorIndex) {
		return { message: title, name: null };
	}

	return {
		message: title.slice(0, separatorIndex),
		name: title.slice(separatorIndex + 2),
	};
};

/** Section label per `object_type`. */
const AFFECTED_ITEMS_LABEL: Record<string, string> = {
	user: __('Affected accounts', 'vulopilot'),
	post: __('Affected pages', 'vulopilot'),
	attachment: __('Affected images', 'vulopilot'),
	product: __('Affected products', 'vulopilot'),
	url: __('Affected endpoints', 'vulopilot'),
	plugin: __('Affected plugins', 'vulopilot'),
	theme: __('Affected themes', 'vulopilot'),
	table: __('Affected tables', 'vulopilot'),
	file: __('Affected files', 'vulopilot'),
	site: __('Affected checks', 'vulopilot'),
};

const getFindingBulkFixHandler = () =>
	applyFilters('vulopilot_finding_bulk_fix_handler', null);

const SEVERITY_LABEL: Record<string, string> = {
	critical: __('Critical Priority', 'vulopilot'),
	high: __('High Priority', 'vulopilot'),
	medium: __('Medium Priority', 'vulopilot'),
	low: __('Low Priority', 'vulopilot'),
	info: __('Low Priority', 'vulopilot'),
};

/**
 * A Pro section on the free plan: its real title, its content blurred (placeholder, never the real data), and
 * one click to unlock. The blur shows there is more here without giving it away.
 */
const LockedBlock = ({
	title,
	count,
	onUnlock,
	children,
}: {
	title: string;
	count?: number;
	onUnlock: () => void;
	children: React.ReactNode;
}) => (
	<section className="vp-issue-block">
		<h4>
			{title}
			{undefined !== count && <span>{count}</span>}
			<b className="vp-pro-chip">
				<i className="adminfont-pro-tag" aria-hidden="true" />
				{__('Pro', 'vulopilot')}
			</b>
		</h4>
		{/* A div, not a <button>: the placeholder holds lists and paragraphs, which a button may not contain. */}
		<div
			className="vp-issue-locked"
			role="button"
			tabIndex={0}
			onClick={onUnlock}
			onKeyDown={(event) => {
				if ('Enter' === event.key || ' ' === event.key) {
					event.preventDefault();
					onUnlock();
				}
			}}
			aria-label={sprintf(
				/* translators: %s: section name, e.g. "Affected accounts". */
				__('%s - unlock with VuloPilot Pro', 'vulopilot'),
				title
			)}
		>
			<div className="vp-issue-locked-blur" aria-hidden="true">
				{children}
			</div>
			<span className="vp-issue-locked-cta" aria-hidden="true">
				<i className="adminfont-lock" />
				{__('Unlock', 'vulopilot')}
			</span>
		</div>
	</section>
);

interface IssueDetailPanelProps {
	group: FindingGroup | null;
	/** `event` is set for a fix or an undo of `group`, so the host can keep it listed instead of dropping it. */
	// eslint-disable-next-line no-unused-vars
	onActionComplete: (event?: { group: FindingGroup; fixed: boolean }) => void;
	/** Shows "Ask Copilot about this", handing the group to the host's chat (AI Copilot only). */
	// eslint-disable-next-line no-unused-vars -- parameter name in a type signature.
	onAsk?: (group: FindingGroup) => void;
}

const IssueDetailPanel: React.FC<IssueDetailPanelProps> = ({
	group,
	onActionComplete,
	onAsk,
}) => {
	const isProActive = !!vulopilotAppLocalizer.khali_dabba;
	const [isBusy, setIsBusy] = useState(false);
	const [proPopup, setProPopup] = useState<null | 'one-click-fix' | 'generic'>(null);
	const [affectedItems, setAffectedItems] = useState<FindingRow[] | null>(
		null
	);
	const [isLoadingAffected, setIsLoadingAffected] = useState(false);
	// Result of the last action, rendered right above the action buttons.
	const { show: showPanelNotice, fixNotice, isUnfixable } = useFixNotice(() => group && onActionComplete({ group, fixed: false }));
	// Tracks the selected issue so a late-arriving result doesn't apply after selection changes.
	const activeScannerId = useRef<string | undefined>(group?.scanner_id);

	useEffect(() => {
		activeScannerId.current = group?.scanner_id;
		// A fixed issue listed again after a reload gets its Fixed message and Undo back.
		showPanelNotice(
			group?.fixed && group.undo_ids?.length
				? (applyFilters('vulopilot_fixed_group_outcome', null, group) as FixOutcome | null) ?? undefined
				: undefined
		);
		// `showPanelNotice` is re-created every render and only calls a state setter.
	}, [group?.scanner_id]);

	/** The group response only ever carries a count + one sample. */
	useEffect(() => {
		if (!group || !isProActive) {
			setAffectedItems(null);
			return;
		}

		setIsLoadingAffected(true);
		setAffectedItems(null);

		// Scoped by object_type too, not just scanner_id.
		const objectTypeParam = group.object_type
			? `&object_type=${encodeURIComponent(group.object_type)}`
			: '';

		getApiResponse<{ data?: FindingRow[] } | FindingRow[]>(
			getApiLink(
				vulopilotAppLocalizer,
				`findings?scanner_id=${encodeURIComponent(group.scanner_id)}${objectTypeParam}&status=open&per_page=${MAX_AFFECTED_ITEMS_SHOWN}&orderby=id&order=desc`
			),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				const list = Array.isArray(response)
					? response
					: (response?.data ?? []);

				setAffectedItems(list);
			})
			.finally(() => setIsLoadingAffected(false));
	}, [group?.scanner_id, group?.object_type]);

	if (!group) {
		return (
			<section className="vp-card vp-issue-detail">
				<div className="vp-card-body">
					<EmptyState
						icon="issue"
						tone="neutral"
						title={__('Pick an issue', 'vulopilot')}
						text={__('Choose one from the list to see what it means and how to fix it.', 'vulopilot')}
					/>
				</div>
			</section>
		);
	}

	/** Parses the raw JSON meta column, which older findings may not have. */
	const sampleMeta: Record<string, unknown> | null = (() => {
		if (!group.sample?.meta) {
			return null;
		}

		try {
			const parsed = JSON.parse(group.sample.meta);

			return parsed && 'object' === typeof parsed ? parsed : null;
		} catch {
			return null;
		}
	})();

	/** Per-finding `meta.recommended_fix` if present, else the per-scanner `no_fix_steps`. */
	const recommendedFixSteps: string[] = Array.isArray(
		sampleMeta?.recommended_fix
	)
		? (sampleMeta?.recommended_fix as unknown[]).filter(
			(step: unknown): step is string => 'string' === typeof step
		)
		: (group.no_fix_steps ?? []);

	const showRecommendedFix =
		!group.fix_action_id && recommendedFixSteps.length > 0;

	const whyItMatters =
		'string' === typeof sampleMeta?.why_it_matters
			? sampleMeta.why_it_matters
			: '';
	const whatHappened =
		'string' === typeof sampleMeta?.what_happened
			? sampleMeta.what_happened
			: '';
	const showWhatHappened = !showRecommendedFix && '' !== whatHappened;

	const sampleSectionTitle = showRecommendedFix
		? __('Recommended fix', 'vulopilot')
		: showWhatHappened
			? __('What happened?', 'vulopilot')
			: __('Example finding', 'vulopilot');

	/** group.sample is already shown in full above. */
	const otherAffectedItems = (affectedItems ?? []).filter(
		(row) => row.id !== group.sample?.id
	);

	/** Fetches every finding id for this group, scoped by object_type like the fetch above. */
	const fetchGroupIds = (
		scannerId: string,
		objectType: string | null
	): Promise<number[]> =>
		getApiResponse<{ data?: { id: number }[] } | { id: number }[]>(
			getApiLink(
				vulopilotAppLocalizer,
				`findings?scanner_id=${encodeURIComponent(scannerId)}${objectType
					? `&object_type=${encodeURIComponent(objectType)}`
					: ''
				}&status=open&per_page=100`
			),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		).then((response) => {
			const list = Array.isArray(response)
				? response
				: (response?.data ?? []);

			return list.map((row) => row.id);
		});

	const handleBulkStatus = (
		status: 'resolved' | 'ignored',
		successMessage: string
	) => {
		setIsBusy(true);
		fetchGroupIds(group.scanner_id, group.object_type)
			.then((ids) => {
				if (!ids.length) {
					return;
				}

				return sendApiResponse(
					vulopilotAppLocalizer,
					getApiLink(vulopilotAppLocalizer, 'findings/bulk'),
					{ ids, status }
				).then((response) => {
					if (activeScannerId.current !== group.scanner_id) {
						return;
					}

					showPanelNotice({
						success: !!response,
						message: response
							? successMessage
							: __(
								'Could not update these findings. Please try again.',
								'vulopilot'
							),
					});

					if (response) {
						onActionComplete();
					}
				});
			})
			.finally(() => setIsBusy(false));
	};

	/** Runs the bulk-fix handler in BULK_FIX_BATCH_SIZE chunks, aggregating the counts into one outcome. */
	const runBulkFixInBatches = (

		// eslint-disable-next-line no-unused-vars
		bulkFixHandler: (batchIds: number[]) => Promise<BatchFixOutcome> | undefined,
		ids: number[]
	): Promise<FixOutcome> => {
		const batches: number[][] = [];

		for (let i = 0; i < ids.length; i += BULK_FIX_BATCH_SIZE) {
			batches.push(ids.slice(i, i + BULK_FIX_BATCH_SIZE));
		}

		return batches
			.reduce(
				(chain, batch) =>
					chain.then((totals) =>
						Promise.resolve(bulkFixHandler(batch)).then((outcome) => ({
							succeeded: totals.succeeded + (outcome?.succeeded ?? 0),
							total: totals.total + (outcome?.total ?? batch.length),
							noFixCount:
								totals.noFixCount + (outcome?.noFixAvailable ?? 0),
							lastMessage: outcome?.message ?? totals.lastMessage,
							link: outcome?.link ?? totals.link,
							undos: outcome?.undo ? [...totals.undos, outcome.undo] : totals.undos,
						}))
					),
				Promise.resolve({
					succeeded: 0,
					total: 0,
					noFixCount: 0,
					lastMessage: '',
					link: undefined as FixOutcome['link'],
					undos: [] as Array<NonNullable<FixOutcome['undo']>>,
				})
			)
			.then(({ succeeded, total, noFixCount, lastMessage, link, undos }) => {
				// One Undo that reverses every batch that could be undone.
				const undo: FixOutcome['undo'] = undos.length
					? () =>
						Promise.all(undos.map((run) => run())).then((results) => ({
							success: results.every((result) => result.success),
							message:
								results.find((result) => !result.success)?.message ??
								results[0].message,
						}))
					: undefined;

				const failed = total - succeeded;

				// Single batch: the handler's own message already says exactly the right thing.
				if (batches.length <= 1) {
					return {
						success: 0 === failed,
						message: lastMessage,
						link,
						undo,
						noFixAvailable: 0 === succeeded && noFixCount === total && total > 0,
					};
				}

				let message: string;

				if (0 === failed) {
					message = sprintf(
						/* translators: %d is how many findings were fixed. */
						__('Fixed %d findings.', 'vulopilot'),
						succeeded
					);
				} else if (noFixCount === failed) {
					message =
						0 === succeeded && lastMessage
							// Nothing was fixable: keep the handler's own message, it says why.
							? lastMessage
							: succeeded > 0
								? sprintf(
									/* translators: 1: number fixed, 2: how many had no automatic fix available at all. */
									__(
										'Fixed %1$d findings - no automatic fix exists yet for the other %2$d.',
										'vulopilot'
									),
									succeeded,
									noFixCount
								)
								: __(
									'No automatic fix exists yet for these findings.',
									'vulopilot'
								);
				} else {
					message = sprintf(
						/* translators: 1: number fixed, 2: total findings attempted. */
						__(
							'Fixed %1$d of %2$d findings - some had no fix available or failed.',
							'vulopilot'
						),
						succeeded,
						total
					);
				}

				return {
					success: 0 === failed,
					message,
					link,
					undo,
					noFixAvailable: 0 === succeeded && noFixCount === total && total > 0,
				};
			});
	};

	const handleFix = () => {
		const bulkFixHandler = getFindingBulkFixHandler();

		if ('function' !== typeof bulkFixHandler) {
			setProPopup(isProActive ? 'one-click-fix' : 'generic');
			return;
		}

		setIsBusy(true);
		fetchGroupIds(group.scanner_id, group.object_type)
			.then((ids) => {
				if (!ids.length) {
					return;
				}

				showPanelNotice(undefined);

				return runBulkFixInBatches(
					// eslint-disable-next-line no-unused-vars -- a parameter name in a type, not a variable.
					bulkFixHandler as (batchIds: number[]) => Promise<BatchFixOutcome> | undefined,
					ids
				).then((outcome) => {
					if (activeScannerId.current === group.scanner_id) {
						showPanelNotice({ ...outcome, label: group.label });
					}

					onActionComplete({ group, fixed: outcome.success });
				});
			})
			.finally(() => setIsBusy(false));
	};

	/** The sample's own message ("{message}: {affected item}") reads best under the check's name. */
	const headerDesc = group.sample ? splitSampleTitle(group.sample.title).message : '';
	const hasFix = Boolean(group.fix_action_id) && !isUnfixable;
	const where = group.sample?.page || __('Site-wide', 'vulopilot');
	const samplePageLink = group.sample ? getAffectedItemLink(group.sample) : undefined;

	/** Where the sample was found: the location to copy, and a link to it when it is a page. */
	const whereRow = (
		<div className="vp-issue-where">
			<ClipboardComponent
				text={where}
				variant="code"
				copyButtonLabel={__('Copy', 'vulopilot')}
				copiedLabel={__('Copied!', 'vulopilot')}
			/>
			{samplePageLink && (
				<a href={samplePageLink} target="_blank" rel="noreferrer" className="vp-issue-link">
					{__('View page', 'vulopilot')}
					<i className="adminfont-external" aria-hidden="true" />
				</a>
			)}
		</div>
	);

	/** Pro: the fix steps, or what the check found, or a representative finding - whichever this group has. */
	let finding: React.ReactNode = null;

	if (showRecommendedFix) {
		finding = (
			<section className="vp-issue-block">
				<h4>{sampleSectionTitle}</h4>
				<ol className="vp-issue-steps">
					{recommendedFixSteps.map((step, index) => (
						<li key={index}>{step}</li>
					))}
				</ol>
			</section>
		);
	} else if (group.sample) {
		finding = (
			<section className="vp-issue-block">
				<h4>{sampleSectionTitle}</h4>
				{showWhatHappened ? (
					<p>{whatHappened}</p>
				) : (
					<>
						<strong className="vp-issue-sample-title">{group.sample.title}</strong>
						{group.sample.description && <p>{group.sample.description}</p>}
					</>
				)}
				{whereRow}
			</section>
		);
	}

	/** Pro: why there is no automatic fix, and where to fix it by hand. */
	const manualFix = !fixNotice && !group.fix_action_id && group.no_fix_reason && (
		<div className="vp-issue-manual">
			<strong>{__('Needs a manual fix', 'vulopilot')}</strong>
			{!showRecommendedFix && <p>{group.no_fix_reason}</p>}
			{group.no_fix_link && (
				<a href={group.no_fix_link.url} target="_blank" rel="noreferrer" className="vp-issue-link">
					{group.no_fix_link.label}
					<i className="adminfont-external" aria-hidden="true" />
				</a>
			)}
		</div>
	);

	/** Pro: every other affected item (the sample is shown above), each linking to its page when it has one. */
	const affectedList = (
		<section className="vp-issue-block">
			<h4>
				{AFFECTED_ITEMS_LABEL[group.object_type ?? ''] ?? __('Affected items', 'vulopilot')}
				<span>{group.count}</span>
			</h4>

			{isLoadingAffected && <Skeleton />}

			{!isLoadingAffected && affectedItems && 0 === affectedItems.length && (
				<p className="vp-issue-note">{__('No individual findings could be loaded for this group right now.', 'vulopilot')}</p>
			)}

			{!isLoadingAffected && affectedItems && affectedItems.length > 0 && 0 === otherAffectedItems.length && (
				<p className="vp-issue-note">
					{sprintf(
						/* translators: %s: the section above, e.g. "Example finding". */
						__('This is the only one - its details are under "%s" above.', 'vulopilot'),
						sampleSectionTitle
					)}
				</p>
			)}

			{otherAffectedItems.length > 0 && (
				<ul className="vp-issue-items">
					{otherAffectedItems.map((row) => {
						const pageLink = getAffectedItemLink(row);

						return (
							<li key={row.id}>
								<div>
									<strong>{row.title}</strong>
									<span>
										{sprintf(
											/* translators: 1: affected page/location, 2: formatted detection date */
											__('%1$s · Detected %2$s', 'vulopilot'),
											row.page || __('Site-wide', 'vulopilot'),
											formatWpDate(row.last_seen_at ?? row.created_at)
										)}
									</span>
								</div>
								{pageLink && (
									<a href={pageLink} target="_blank" rel="noreferrer" className="vp-issue-link">
										{__('View', 'vulopilot')}
										<i className="adminfont-external" aria-hidden="true" />
									</a>
								)}
							</li>
						);
					})}
				</ul>
			)}

			{!isLoadingAffected && affectedItems && group.count > affectedItems.length && (
				<p className="vp-issue-note">
					{sprintf(
						/* translators: %d: how many further open findings exist beyond the list shown above */
						__('+%d more not listed. Resolve all and Ignore all below cover every one.', 'vulopilot'),
						group.count - affectedItems.length
					)}
				</p>
			)}
		</section>
	);

	return (
		<>
			<section className={`vp-card vp-issue-detail is-${group.severity}`} aria-label={__('Issue details', 'vulopilot')}>
				<header className="vp-issue-detail-head">
					<span className="vp-issue-detail-eyebrow">
						{group.fixed && <span className="vp-pill">{__('Fixed', 'vulopilot')}</span>}
						<em>{SEVERITY_LABEL[group.severity]}</em>
						<span aria-hidden="true">·</span>
						{CATEGORY_LABELS[group.category] ?? group.category}
					</span>
					<h3>{group.label}</h3>
					{headerDesc && <p>{headerDesc}</p>}
					{onAsk && (
						<button type="button" className="vp-issue-ask" onClick={() => onAsk(group)}>
							<i className="adminfont-ai" aria-hidden="true" />
							{__('Ask Copilot about this', 'vulopilot')}
						</button>
					)}
				</header>

				<dl className="vp-issue-facts">
					<div>
						<dt>{__('Affected', 'vulopilot')}</dt>
						<dd>{formatAffected(group.count, group.object_type)}</dd>
					</div>
					<div>
						<dt>{__('Last seen', 'vulopilot')}</dt>
						<dd>{group.sample ? formatWpDate(group.sample.last_seen_at ?? group.sample.created_at) : '-'}</dd>
					</div>
					<div>
						<dt>{__('Where', 'vulopilot')}</dt>
						<dd title={where}>{where}</dd>
					</div>
				</dl>

				<div className="vp-issue-detail-body">
					{whyItMatters && (
						<div className="vp-issue-why">
							<strong>{__('Why it matters', 'vulopilot')}</strong>
							<p>{whyItMatters}</p>
						</div>
					)}

					{isProActive ? (
						<>
							{finding}
							{manualFix}
							{affectedList}
						</>
					) : (
						<>
							{/* Free: the real sections, their content blurred - enough to see it is there, not to read it. */}
							{(showRecommendedFix || group.sample) && (
								<LockedBlock
									title={sampleSectionTitle}
									onUnlock={() => setProPopup('generic')}
								>
									{showRecommendedFix ? (
										<ol className="vp-issue-steps">
											<li>{__('Open the settings screen where this is configured on your site.', 'vulopilot')}</li>
											<li>{__('Change the value flagged by the scan to the recommended one.', 'vulopilot')}</li>
											<li>{__('Save, then run the scan again to confirm it is fixed.', 'vulopilot')}</li>
										</ol>
									) : (
										<>
											<strong className="vp-issue-sample-title">{group.label}</strong>
											<p>{__('The exact item this check found, what is wrong with it, and how it affects your visitors and search engines.', 'vulopilot')}</p>
											<div className="vp-issue-where">
												<code>/{__('the-affected-page', 'vulopilot')}/</code>
												<span className="vp-issue-link">{__('View page', 'vulopilot')}</span>
											</div>
										</>
									)}
								</LockedBlock>
							)}

							<LockedBlock
								title={AFFECTED_ITEMS_LABEL[group.object_type ?? ''] ?? __('Affected items', 'vulopilot')}
								count={group.count}
								onUnlock={() => setProPopup('generic')}
							>
								<ul className="vp-issue-items">
									{Array.from({ length: Math.min(3, Math.max(1, group.count)) }).map((_, index) => (
										<li key={index}>
											<div>
												<strong>{__('An affected item on your site', 'vulopilot')}</strong>
												<span>{__('/its-page/ · Detected recently', 'vulopilot')}</span>
											</div>
											<span className="vp-issue-link">{__('View', 'vulopilot')}</span>
										</li>
									))}
								</ul>
							</LockedBlock>

							<div className="vp-issue-unlock-cta">
								<span>
									{1 === group.count
										? sprintf(
												/* translators: %s: the affected item's kind, e.g. "account". */
												__('See exactly which %s it is, the fix, and fix it with AI in one click.', 'vulopilot'),
												getObjectTypeNoun(1, group.object_type)
										  )
										: sprintf(
												/* translators: %s: affected items, e.g. "2 pages". */
												__('See all %s, the exact fix, and fix them with AI in one click.', 'vulopilot'),
												formatAffected(group.count, group.object_type)
										  )}
								</span>
								<ButtonInput
									buttons={{
										text: __('Unlock with Pro', 'vulopilot'),
										icon: 'pro-tag',
										color: 'purple-bg',
										onClick: () => setProPopup('generic'),
									}}
								/>
							</div>
						</>
					)}
				</div>

				{isProActive && (
					<footer className="vp-issue-detail-actions">
						{fixNotice}
						<div className="vp-issue-detail-buttons">
							<button
								type="button"
								className="vp-text-btn is-danger"
								disabled={isBusy}
								onClick={() => handleBulkStatus('ignored', __('All findings in this group ignored.', 'vulopilot'))}
							>
								{__('Ignore all', 'vulopilot')}
							</button>
							<ButtonInput
								buttons={[
									{
										text: __('Resolve all', 'vulopilot'),
										icon: 'check',
										color: hasFix ? 'purple' : 'purple-bg',
										disabled: isBusy,
										onClick: () =>
											handleBulkStatus('resolved', __('All findings in this group marked resolved.', 'vulopilot')),
									},
									// No automatic fix exists for this issue; don't offer a button that can only fail again.
									...(hasFix
										? [
												{
													text: __('Fix with AI', 'vulopilot'),
													icon: 'ai',
													color: 'purple-bg',
													disabled: isBusy,
													onClick: handleFix,
												},
										  ]
										: []),
								]}
							/>
						</div>
					</footer>
				)}
			</section>

			<PopupComponent open={!!proPopup} onClose={() => setProPopup(null)} width={31.25} height="auto" position="lightbox">
				{'one-click-fix' === proPopup ? <ShowProPopup moduleName="one-click-fix" /> : <ShowProPopup />}
			</PopupComponent>
		</>
	);
};

export default IssueDetailPanel;