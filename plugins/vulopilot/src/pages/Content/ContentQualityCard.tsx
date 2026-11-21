/* global vulopilotAppLocalizer */
import { useEffect, useState, type FC } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse } from '@zyra/core';
import {
	CardComponent,
	BadgeComponent,
	ModuleGuardComponent,
	TypographyComponent,
	IconComponent,
	AnalyticsComponent,
	ListComponent,
	SectionComponent
} from '@zyra/components';
import { ButtonInput, SelectInput } from '@zyra/inputs';
import { SEO_ISSUE_QUERY_PARAM } from '../../services/seoIssueEditorTarget';

interface ContentOption {
	id: number;
	title: string;
	date: string;
}

interface WpRestPost {
	id: number;
	title: { rendered: string };
	date: string;
}

interface OnPageCheck {
	id: string;
	group: string;
	status: 'pass' | 'warning' | 'fail';
	message: string;
}

interface ContentQualityResponse {
	post_id: number;
	readability: { score: number; label: string };
	completeness: { passed: number; total: number; checks: OnPageCheck[] };
	structure: OnPageCheck | null;
}

type ScoreTone = 'green' | 'orange' | 'red';

/** A 3-band green/orange/red split for a 0-100 score. */
const getScoreTone = (percent: number): ScoreTone => {
	if (percent >= 75) {
		return 'green';
	}
	if (percent >= 60) {
		return 'orange';
	}
	return 'red';
};

/** `OnPageCheck.status` → the list item's icon classes (icon name plus colour). */
const STATUS_NOTICE_TYPE: Record<OnPageCheck['status'], string> = {
	pass: 'success green',
	warning: 'info yellow',
	fail: 'error red',
};

/** Short status pill - Good/Medium/High - alongside the real message NoticeComponent renders. */
const STATUS_BADGE: Record<OnPageCheck['status'], { color: string; label: string }> = {
	pass: { color: 'green', label: __('Good', 'vulopilot') },
	warning: { color: 'orange', label: __('Medium', 'vulopilot') },
	fail: { color: 'red', label: __('High', 'vulopilot') },
};

/** Maps OnPageAnalyzer check ids to scanner ids, so a row click reuses the post-editor deep-link contract. */
const CHECK_ID_TO_SCANNER_ID: Record<string, string> = {
	title_length: 'seo',
	description_length: 'meta-description',
	content_length: 'thin-content',
	has_subheadings: 'heading-structure',
};

/** One real on-page check - zyra's own `ListComponent`, one item per check. */
const CheckRow: FC<{ check: OnPageCheck; onClick?: () => void }> = ({
	check,
	onClick,
}) => (
	<ListComponent
		className='mini-card report'
		items={[
			{
				id: check.id,
				icon: STATUS_NOTICE_TYPE[check.status],
				title: check.message,
				action: onClick,
				tags: (
					<BadgeComponent
						color={STATUS_BADGE[check.status].color}
						text={STATUS_BADGE[check.status].label}
					/>
				),
			},
		]}
	/>
);

/** Create Content's "Content Quality" card. */
interface ContentQualityCardProps {
	postId?: number;
	/** Real row title `RecentContentCard.tsx` already has on hand (no extra fetch needed). */
	title?: string;
	onClose?: () => void;
}

const ContentQualityCard = ({ postId: externalPostId, title: externalTitle, onClose }: ContentQualityCardProps = {}) => {
	const isExternal = undefined !== externalPostId;
	const [options, setOptions] = useState<ContentOption[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(externalPostId ?? null);
	const [isLoadingOptions, setIsLoadingOptions] = useState(!isExternal);
	const [data, setData] = useState<ContentQualityResponse | null>(null);
	const [isLoadingQuality, setIsLoadingQuality] = useState(false);

	useEffect(() => {
		if (isExternal) {
			return;
		}

		const nonceHeaders = { headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } };
		const fetchType = (endpoint: 'posts' | 'pages') =>
			getApiResponse<WpRestPost[]>(
				getApiLink(
					vulopilotAppLocalizer,
					`${endpoint}?per_page=10&orderby=date&order=desc&_fields=id,title,date`,
					'wp/v2'
				),
				nonceHeaders
			).then((response) =>
				(response || []).map(
					(post): ContentOption => ({
						id: post.id,
						title: post.title.rendered || __('(no title)', 'vulopilot'),
						date: post.date,
					})
				)
			);

		Promise.all([fetchType('posts'), fetchType('pages')])
			.then(([posts, pages]) => {
				const merged = [...posts, ...pages].sort((a, b) =>
					b.date.localeCompare(a.date)
				);
				setOptions(merged);
				if (merged.length > 0) {
					setSelectedId(merged[0].id);
				}
			})
			.finally(() => setIsLoadingOptions(false));
		// `isExternal`/`externalPostId` are fixed for this component instance's whole lifetime.
	}, []);

	// Externally driven: track a later `postId` prop change too.
	useEffect(() => {
		if (isExternal) {
			setSelectedId(externalPostId);
		}
	}, [externalPostId]);

	useEffect(() => {
		if (!selectedId) {
			return;
		}

		setIsLoadingQuality(true);

		getApiResponse<ContentQualityResponse>(
			getApiLink(vulopilotAppLocalizer, `content-intelligence/quality?post_id=${selectedId}`),
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				if (response) {
					setData(response);
				}
			})
			.finally(() => setIsLoadingQuality(false));
	}, [selectedId]);

	const isLoading = isLoadingOptions || isLoadingQuality;

	// Same real edit-screen link ContentRow.editLink/RecentContentCard.tsx already build for this exact post id.
	const editLink = selectedId
		? `${vulopilotAppLocalizer.site_url}/wp-admin/post.php?post=${selectedId}&action=edit`
		: '';

	const readabilityTone = data ? getScoreTone(data.readability.score) : 'green';
	const completenessPercent =
		data && data.completeness.total > 0
			? Math.round((data.completeness.passed / data.completeness.total) * 100)
			: 0;
	const completenessTone = getScoreTone(completenessPercent);

	// Local `const` so TypeScript's null-narrowing survives into the `onClick` closure below.
	const structureCheck = data?.structure ?? null;

	/**
	 * Same `post.php?post={id}&action=edit&vulopilot_seo_issue={scannerId}` shape `SeoIssuesByPageTable.tsx`/`GEO/PageAnalysisPanel.tsx` build.
	 */
	const goToCheckInEditor = (checkId: string) => {
		if (!editLink) {
			return;
		}

		const scannerId = CHECK_ID_TO_SCANNER_ID[checkId];
		window.location.href = scannerId
			? `${editLink}&${SEO_ISSUE_QUERY_PARAM}=${encodeURIComponent(scannerId)}`
			: editLink;
	};

	const selectedOption = options.find((option: ContentOption) => option.id === selectedId);
	/** Real title either way - `RecentContentCard.tsx`'s own row title in `postId` mode, this card's own fetched picker option otherwise. */
	const analyzedTitle = externalTitle ?? selectedOption?.title;

	return (
		<CardComponent
			className={isExternal ? 'page-analysis-panel' : undefined}
			title={isExternal ? __('Page Analysis', 'vulopilot') : __('Content Quality', 'vulopilot')}
			titleIcon="ai"
			desc={
				isExternal
					? __("A single page's real content-quality signals, checked live.", 'vulopilot')
					: __('Real AI-assessed quality signals for the selected page.', 'vulopilot')
			}
			isLoading={(isExternal ? isLoadingQuality : isLoadingOptions) || undefined}
			action={
				isExternal && onClose ? (
					<ButtonInput
						buttons={{
							text: '',
							icon: 'close',
							className: 'icon',
							color: 'text-gray',
							tooltip: __('Close', 'vulopilot'),
							onClick: onClose,
						}}
					/>
				) : !isLoadingOptions && options.length > 0 ? (
					<div className="content-quality-picker">
						<TypographyComponent
							variant="caption"
							weight="semibold"
							className="content-quality-picker-label"
						>
							{__('Page being analyzed', 'vulopilot')}
						</TypographyComponent>
						<SelectInput
							name="content-quality-picker"
							size={10}
							type="single-select"
							value={selectedId ? String(selectedId) : ''}
							onChange={(value) => setSelectedId(Number(value))}
							options={options.map((option: ContentOption) => ({
								label: option.title,
								value: String(option.id),
							}))}
							isClearable={false}
						/>
						<div className="content-quality-picker-hint">
							<IconComponent name="info" />
							{__('Changing the page updates all results below.', 'vulopilot')}
						</div>
					</div>
				) : undefined
			}
		>
			{!isExternal && !isLoadingOptions && 0 === options.length && (
				<ModuleGuardComponent
					icon="document"
					title={__('No content yet', 'vulopilot')}
					desc={__(
						'Publish a post or page to see its content quality here.',
						'vulopilot'
					)}
				/>
			)}

			{!isExternal && !isLoading && data && analyzedTitle && (
				<div className="content-quality-analyzing-banner">
					<span className="content-quality-analyzing-banner-label">
						<IconComponent name="doc" />
						{__('Showing analysis for:', 'vulopilot')}{' '}
						<strong>{analyzedTitle}</strong>
					</span>
					<span className="content-quality-analyzing-banner-hint">
						<IconComponent name="ai" />
						{__(
							'Analysis updates automatically when you select a different page.',
							'vulopilot'
						)}
					</span>
				</div>
			)}

			{isExternal && !isLoading && data && analyzedTitle && (
				<div className="page-analysis-panel-meta">{analyzedTitle}</div>
			)}

			{!isLoading && data && (
				<div className="content-quality-body">
					<AnalyticsComponent
						variant="small-priority-card"
						cols={2}
						data={[
							{
								icon: 'knowledgebase',
								colorClass: readabilityTone,
								text: sprintf(
									/* translators: %d: real 0-100 score. */
									__('%d/100', 'vulopilot'),
									data.readability.score
								),
								number: __('Readability', 'vulopilot'),
							},
							{
								icon: 'search',
								colorClass: completenessTone,
								text: `${data.completeness.passed}/${data.completeness.total}`,
								number: __('Checks passed', 'vulopilot'),
							},
						]}
					/>
					<SectionComponent icon='ai'
						title={__('Content Assessment', 'vulopilot')}
					/>
					{data.completeness.checks.map((check: OnPageCheck) => (
						<CheckRow
							key={check.id}
							check={check}
							onClick={() => goToCheckInEditor(check.id)}
						/>
					))}
					{structureCheck && (
						<>
							<SectionComponent icon='blocks'
								title={__('Structure', 'vulopilot')}
							/>
							<CheckRow
								check={structureCheck}
								onClick={() => goToCheckInEditor(structureCheck.id)}
							/>
						</>
					)}
				</div>
			)}
		</CardComponent>
	);
};

export default ContentQualityCard;
