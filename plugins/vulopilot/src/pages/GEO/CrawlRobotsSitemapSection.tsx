/* global appLocalizer */
import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	BadgeComponent,
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	IconComponent,
	ListComponent,
	ModuleGuardComponent,
	NoticeManager,
	PopupComponent,
	SectionComponent
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { TableCard, TableRow } from '@zyra/table';
import TypographyComponent from '../../components/TypographyComponent';
import { useFindingsTable } from '../../services/useFindingsTable';
import { useLastScanTime } from '../../services/useLastScanTime';
import { useGoogleServicesConnection } from '../../services/useGoogleServicesConnection';
import ShowProPopup from '../../components/Popup/Popup';
import './SeoVisibility.scss';

const nonceHeaders = { headers: { 'X-WP-Nonce': appLocalizer.nonce } };

interface RobotsResponse {
	reachable: boolean;
	url: string;
	content: string;
	is_custom: boolean;
	custom_content: string;
	rules: { total: number; allowed: number; disallowed: number; sitemaps: number };
	directives: {
		user_agents: string[];
		allow: string[];
		disallow: string[];
		sitemaps: string[];
		crawl_delay: string | null;
	};
}

interface SitemapChild {
	loc: string;
	type: string;
	lastmod: string | null;
	url_count: number | null;
	status: 'ok' | 'error';
}

interface SitemapResponse {
	reachable: boolean;
	index_url: string;
	valid: boolean;
	total_sitemaps: number;
	total_urls: number;
	sitemaps: SitemapChild[];
}

interface SitemapRow extends TableRow, SitemapChild {
	id: string;
}

/**
 * "Blocked Pages" (AI-CRAWLER-ANALYTICS-MODULE.md), "Robots.txt Issues",
 * and "XML Sitemap Issues" are all registered by modules/Seo/Module.php,
 * same as every other robots.txt-adjacent check — their findings only
 * exist while the SEO module is active, same gate SeoTab.tsx's own
 * isSeoModuleActive() already checks for the identical reason.
 */
const isSeoModuleActive = () =>
	appLocalizer.active_modules?.includes('seo') ?? false;

/**
 * Real sitemap `loc` URL, stripped down to just its own path/name for
 * display — no scheme/host (`http://localhost:8888/wp-sitemap-posts-post.xml`
 * reads as `/wp-sitemap-posts-post`), and no real trailing page-number
 * suffix (`-1`/`-2`/…) or `.xml` extension either. Falls back to the raw
 * `loc` string on a malformed URL rather than throwing.
 */
const getSitemapDisplayName = (loc: string): string => {
	try {
		const { pathname } = new URL(loc);

		const name = pathname
			.replace(/-\d+(?=\.xml$)/i, '')
			.replace(/\.xml$/i, '')
			.replace(/^\/+|\/+$/g, '')
			.replace(/-/g, ' ');

		if (!name) {
			return 'Sitemap';
		}

		return name.charAt(0).toUpperCase() + name.slice(1);
	} catch {
		return loc;
	}
};

const escapeHtml = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Real, per-line syntax highlight for the robots.txt editor below — a
 * small regex tokenizer (directive name / value / `#` comment), not a
 * general syntax-highlighting library: robots.txt's own real grammar is
 * just those 2 line shapes, so a full editor dependency isn't warranted
 * for coloring them. Escapes its own output — this HTML only ever backs
 * the read-only highlight layer, never what the user actually types (the
 * real `<textarea>` underneath stays plain text either way).
 */
const highlightRobotsLine = (line: string): string => {
	if (/^\s*#/.test(line)) {
		return `<span class="rt-comment">${escapeHtml(line)}</span>`;
	}

	const match = line.match(/^(\s*)([A-Za-z][\w-]*)(\s*:\s*)(.*)$/);

	if (!match) {
		return escapeHtml(line);
	}

	const [, leadingSpace, directive, colon, value] = match;

	return (
		escapeHtml(leadingSpace) +
		`<span class="rt-directive">${escapeHtml(directive)}</span>` +
		escapeHtml(colon) +
		(value ? `<span class="rt-value">${escapeHtml(value)}</span>` : '')
	);
};

/**
 * Line-numbered, syntax-highlighted robots.txt editor — matches the
 * reference mockup's code-editor look (directive names/values/comments
 * colored, a real line-number gutter) via the classic transparent-
 * `<textarea>`-over-a-highlighted-`<pre>` overlay technique (both share
 * the exact same font/line-height/padding, so they line up pixel for
 * pixel) rather than pulling in a code-editor dependency — see
 * `highlightRobotsLine`'s own docblock above for why. The real edit
 * target is always the plain `<textarea>` on top; the `<pre>` underneath
 * is purely decorative (`aria-hidden`) and never receives focus/input.
 *
 * Exported (and `readOnly` added) so InspectorSection.tsx's own JSON-LD
 * blocks can reuse this exact same gutter/box look for real, live schema
 * content — not a new, second code-viewer component. `readOnly` just
 * drops the `<textarea>` overlay entirely (nothing to type into, nothing
 * to overlay) and adds `.rt-editor-readonly` (common.scss) so the box
 * sizes to its own real content instead of the fixed 16rem editable
 * height. `highlightRobotsLine`'s own robots.txt-specific tokenizer still
 * runs either way — a JSON line doesn't match its `directive: value`
 * pattern (JSON keys start with `"`, not a bare letter), so it simply
 * renders unhighlighted rather than mis-colored.
 */
interface RobotsTxtEditorProps {
	value: string;
	onChange?: (next: string) => void;
	placeholder?: string;
	readOnly?: boolean;
}

export const RobotsTxtEditor = ({ value, onChange, placeholder, readOnly = false }: RobotsTxtEditorProps) => {
	// Gutter/height track the real placeholder's own line count while
	// empty, so the box doesn't visually collapse to 1 line before any
	// real content has loaded/been typed.
	const lineCount = Math.max((value || placeholder || '').split('\n').length, readOnly ? 1 : 6);
	const highlighted = value ? value.split('\n').map(highlightRobotsLine).join('\n') : '';

	return (
		<div className={`rt-editor${readOnly ? ' rt-editor-readonly' : ''}`}>
			<div className="rt-gutter" aria-hidden="true">
				{Array.from({ length: lineCount }).map((_, i) => (
					<span key={i}>{i + 1}</span>
				))}
			</div>
			<div className="rt-code-wrap">
				<pre
					className="rt-highlight"
					aria-hidden="true"
					// Real highlight markup built entirely from `escapeHtml`'d
					// content above — never raw user input.
					dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
				/>
				{!readOnly && (
					<textarea
						className="rt-textarea"
						value={value}
						rows={lineCount}
						spellCheck={false}
						placeholder={placeholder}
						onChange={(e) => onChange?.(e.target.value)}
					/>
				)}
			</div>
		</div>
	);
};

/**
 * Confirmed unreachable from the UI, same "real, working, just flagged
 * here rather than deleted" status BrokenLinksSection.tsx's own docblocks
 * document for their own unwired pieces (not touched in this pass — none
 * of it is dead in the sense of broken or unused-and-safe-to-delete, just
 * currently not rendered): the "4 real status tiles" bullet below
 * (`robotsStatus`/`sitemapStatus`/`lastScanAt`, all computed but never
 * read into a tile) and the "Quick Actions" bullet's own "Resubmit
 * sitemap"/Search Console link (`handleResubmitSitemap`/
 * `searchConsoleUrl`, both real and callable but with no button/link
 * anywhere that reaches them).
 *
 * "Robots & Sitemap" inner section of the "Crawl & URLs" tab — rebuilt to
 * match the reference mockup wherever real data supports it:
 *   - 4 real status tiles: Robots.txt/Sitemap reachability (live
 *     `GET /robots-sitemap/robots`/`/sitemap`, new this pass — neither
 *     existing scanner returns file content or a structured breakdown,
 *     confirmed before writing Controllers\RobotsSitemap.php), a real
 *     connected Search Console property (useGoogleServicesConnection — no
 *     count next to it: this codebase's only real GSC integration is
 *     `searchAnalytics.query` for keyword rank tracking, never an
 *     index-coverage/"indexed pages" API, so that mockup number has zero
 *     real source and is deliberately omitted rather than faked), and a
 *     real "Last Checked" from the most recent completed
 *     robots-txt/sitemap scan run (useLastScanTime) — no "Next check"
 *     line, since neither scanner has any cadence/cron of its own.
 *   - "Robots.txt Analysis": the real live file content plus real
 *     Allow/Disallow/Sitemap line counts (a genuine full parse, not a
 *     summary standing in for the real thing), and a real violation
 *     badge from this scanner's own open findings.
 *   - "XML Sitemap Overview": real per-child-sitemap rows (URL/type/real
 *     `<lastmod>`/real `<url>` count) — WordPress core's own
 *     `/wp-sitemap.xml` index structurally has this, this plugin just
 *     never read it back before this pass.
 *   - "Blocked by Robots.txt": the real `ai-crawler-blocked-pages`
 *     findings (real post + real bot name per row) already used by the
 *     "Blocked pages" table below, just summarized as a glance card too.
 *   - "Important Crawl Directives": the same real parsed robots.txt
 *     directives, in the mockup's own compact key-value shape.
 *   - "Quick Actions": real links (the real robots.txt/sitemap URLs, the
 *     real connected Search Console property) and real actions ("Test
 *     robots.txt" re-runs the same live fetch; "Resubmit sitemap" calls
 *     the real, already-shipped `POST /indexnow/submit`).
 *   - "llms.txt content": moved here from Settings → AI Visibility, same
 *     real `llms_txt_content` auto-saving option and `GET /llms-txt/regenerate`
 *     action as before (see LlmsTxtGenerator) — just relocated to match the
 *     reference mockup, which places it on this tab. Gated on the real
 *     `enable_llms_txt` flag (still configured on Settings → AI Visibility,
 *     which didn't move) — editing content for a disabled feature would be
 *     dishonest, so this shows a plain link there instead when it's off.
 *
 * "Indexing Directives"/"Crawl Errors" (this file's own former "not
 * tracked yet" placeholder cards) are dropped here — the reference
 * mockup doesn't show them, and this pass already covers substantially
 * more real ground than before.
 */
const CrawlRobotsSitemapSection = () => {
	const [robots, setRobots] = useState<RobotsResponse | null>(null);
	const [isLoadingRobots, setIsLoadingRobots] = useState(true);
	const [sitemap, setSitemap] = useState<SitemapResponse | null>(null);
	const [isLoadingSitemap, setIsLoadingSitemap] = useState(true);

	const { lastScanAt } = useLastScanTime(['robots-txt', 'sitemap', 'sitemap-validation']);
	const { status: gscStatus } = useGoogleServicesConnection('settings');

	/**
	 * `useFindingsTable`'s own `tableCardProps.totalRows` counts every
	 * status (open/resolved/ignored/snoozed) — fine for its own table's
	 * "Showing X of Y" footer, wrong for a real "still-open right now"
	 * count, so these two glance stats fetch that real number directly
	 * rather than reusing (and overcounting from) the table's own total.
	 */
	const [robotsOpenCount, setRobotsOpenCount] = useState(0);
	const [blockedPagesOpenCount, setBlockedPagesOpenCount] = useState(0);

	const loadOpenCounts = () => {
		getApiResponse<{ total: number }>(
			getApiLink(appLocalizer, 'findings?scanner_id=robots-txt&status=open&per_page=1'),
			nonceHeaders
		).then((response) => setRobotsOpenCount(response?.total ?? 0));

		getApiResponse<{ total: number }>(
			getApiLink(appLocalizer, 'findings?scanner_id=ai-crawler-blocked-pages&status=open&per_page=1'),
			nonceHeaders
		).then((response) => setBlockedPagesOpenCount(response?.total ?? 0));
	};

	/**
	 * `refreshEditorContent` gates whether this fetch is allowed to
	 * overwrite the editor's local `value` state. On initial mount and on
	 * an explicit "Test robots.txt" click, it should (that's the whole
	 * point of the fetch). On the background refetch `persistRobotsContent`
	 * fires after every auto-save, it must NOT — otherwise the server's
	 * round-tripped content (possibly normalized differently, e.g. a
	 * trailing newline WordPress added) replaces what the user is still
	 * typing, and the cursor jumps to the end. That was the real bug: the
	 * auto-save refetch was clobbering in-progress edits, which looked
	 * like a page reload.
	 *
	 * `showLoadingState` is the companion fix for a second, related
	 * symptom: this card's own `isLoading` prop (below) is driven by
	 * `isLoadingRobots`, so toggling that on every call — including the
	 * silent post-autosave refetch — flashed the whole card into its
	 * loading/skeleton state 800ms after every keystroke pause. That
	 * read as the page re-rendering/refreshing on every edit, when only
	 * the small `robotsSaveState` indicator next to the editor should
	 * visibly change. Only the initial mount and an explicit "Test
	 * robots.txt" click are real "loading" moments; the autosave
	 * refetch stays silent.
	 */
	const loadRobots = (refreshEditorContent = true, showLoadingState = true) => {
		if (showLoadingState) {
			setIsLoadingRobots(true);
		}
		getApiResponse<RobotsResponse>(getApiLink(appLocalizer, 'robots-sitemap/robots'), nonceHeaders)
			.then((response) => {
				if (response) {
					setRobots(response);
					if (refreshEditorContent) {
						setRobotsEditContent(response.custom_content || response.content || '');
					}
				}
			})
			.finally(() => {
				if (showLoadingState) {
					setIsLoadingRobots(false);
				}
			});
	};

	const loadSitemap = () => {
		setIsLoadingSitemap(true);
		getApiResponse<SitemapResponse>(getApiLink(appLocalizer, 'robots-sitemap/sitemap'), nonceHeaders)
			.then((response) => response && setSitemap(response))
			.finally(() => setIsLoadingSitemap(false));
	};

	/**
	 * Inline, auto-saving robots.txt editor — same real shape "llms.txt
	 * content" below already established (`llmsTxtContent`/
	 * `llmsTxtSaveState`/`llmsTxtSaveTimer`), not a popup: edit the real
	 * live file directly in the card, saved 800ms after the last
	 * keystroke, with a real Saving…/Saved/Could not save state next to
	 * it instead of an explicit Save button.
	 */
	const [robotsEditContent, setRobotsEditContent] = useState('');
	const [robotsSaveState, setRobotsSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const robotsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persistRobotsContent = (content: string, notify = false) => {
		setRobotsSaveState('saving');

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'robots-sitemap/robots'), { content })
			.then((response) => {
				setRobotsSaveState(response ? 'saved' : 'error');

				if (notify) {
					NoticeManager.add({
						uniqueKey: 'robots-sitemap-save',
						type: response ? 'success' : 'error',
						position: 'float',
						message: response
							? '' === content
								? __('robots.txt reset to the WordPress default.', 'vulopilot')
								: __('robots.txt saved and live.', 'vulopilot')
							: __('Could not save robots.txt. Please try again.', 'vulopilot'),
					});
				}

				if (response) {
					// Refresh the card's own read-only data (rules/directives
					// counts, the "Custom" badge) — but explicitly NOT the
					// editor's own `robotsEditContent`, so the user's cursor
					// and in-progress text are left untouched mid-save. Also
					// silent (no card-level loading state): only the small
					// `robotsSaveState` indicator should visibly change here.
					loadRobots(false, false);
				}
			});
	};

	const handleRobotsContentChange = (value: string) => {
		setRobotsEditContent(value);

		if (robotsSaveTimer.current) {
			clearTimeout(robotsSaveTimer.current);
		}
		robotsSaveTimer.current = setTimeout(
			() => persistRobotsContent(value),
			800
		);
	};

	const handleResetRobotsToDefault = () => {
		if (robotsSaveTimer.current) {
			clearTimeout(robotsSaveTimer.current);
		}
		setRobotsEditContent('');
		persistRobotsContent('', true);
	};

	/**
	 * "llms.txt content" — moved here from Settings → AI Visibility (the
	 * mockup places it on this tab instead), same real field/behavior as
	 * before: `llms_txt_content` is a plain, auto-saving option
	 * (Controllers\Settings::update_item() writes it straight to a real
	 * `/llms.txt` on save, see GeoAnalysis\LlmsTxtGenerator::write_file()).
	 * `enable_llms_txt` still lives on Settings → AI Visibility (its own
	 * toggle, plus "Auto-regenerate on publish"/"Included content types" —
	 * none of that moved) — this card just reads that same real flag to
	 * decide whether editing the content here makes sense right now, same
	 * `dependent` gate the old textarea field used.
	 */
	const [llmsTxtContent, setLlmsTxtContent] = useState('');
	const [isLlmsTxtEnabled, setIsLlmsTxtEnabled] = useState(false);
	const [isLoadingLlmsTxt, setIsLoadingLlmsTxt] = useState(true);
	const [isRegeneratingLlmsTxt, setIsRegeneratingLlmsTxt] = useState(false);
	const [llmsTxtSaveState, setLlmsTxtSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const llmsTxtSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const loadLlmsTxt = () => {
		setIsLoadingLlmsTxt(true);
		getApiResponse<{ enable_llms_txt?: string[] | boolean; llms_txt_content?: string }>(
			getApiLink(appLocalizer, 'settings'),
			nonceHeaders
		)
			.then((response) => {
				if (!response) {
					return;
				}
				setIsLlmsTxtEnabled(
					Array.isArray(response.enable_llms_txt)
						? response.enable_llms_txt.includes('enable_llms_txt')
						: !!response.enable_llms_txt
				);
				setLlmsTxtContent(response.llms_txt_content ?? '');
			})
			.finally(() => setIsLoadingLlmsTxt(false));
	};

	const persistLlmsTxtContent = (content: string, notify = false) => {
		setLlmsTxtSaveState('saving');
		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'settings'), {
			setting: { llms_txt_content: content },
		}).then((response) => {
			setLlmsTxtSaveState(response ? 'saved' : 'error');
			if (notify) {
				NoticeManager.add({
					uniqueKey: 'llms-txt-regenerated',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __('llms.txt regenerated and saved.', 'vulopilot')
						: __('Regenerated, but saving failed. Please try again.', 'vulopilot'),
				});
			}
		});
	};

	const handleLlmsTxtChange = (value: string) => {
		setLlmsTxtContent(value);
		if (llmsTxtSaveTimer.current) {
			clearTimeout(llmsTxtSaveTimer.current);
		}
		llmsTxtSaveTimer.current = setTimeout(() => persistLlmsTxtContent(value), 800);
	};

	const handleRegenerateLlmsTxt = () => {
		setIsRegeneratingLlmsTxt(true);
		getApiResponse<{ content: string }>(getApiLink(appLocalizer, 'llms-txt/regenerate'), nonceHeaders)
			.then((response) => {
				if (!response) {
					NoticeManager.add({
						uniqueKey: 'llms-txt-regenerate-failed',
						type: 'error',
						position: 'float',
						message: __('Could not regenerate llms.txt. Please try again.', 'vulopilot'),
					});
					return;
				}
				if (llmsTxtSaveTimer.current) {
					clearTimeout(llmsTxtSaveTimer.current);
				}
				setLlmsTxtContent(response.content);
				persistLlmsTxtContent(response.content, true);
			})
			.finally(() => setIsRegeneratingLlmsTxt(false));
	};

	useEffect(() => {
		loadRobots();
		loadSitemap();
		loadOpenCounts();
		loadLlmsTxt();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const {
		tableCardProps: blockedPagesProps,
		error: blockedPagesError,
		refetch: refetchBlockedPages,
		isProPopupOpen,
		closeProPopup,
	} = useFindingsTable({
		description: __(
			'No AI-bot-specific blocks found — run a scan to check robots.txt against your published pages.',
			'vulopilot'
		),
		scannerIds: ['ai-crawler-blocked-pages'],
	});

	const {
		tableCardProps: robotsTxtProps,
		error: robotsTxtError,
		refetch: refetchRobotsTxt,
		isProPopupOpen: isRobotsTxtProPopupOpen,
		closeProPopup: closeRobotsTxtProPopup,
	} = useFindingsTable({
		description: __(
			'No robots.txt findings yet — run a scan to check crawler access.',
			'vulopilot'
		),
		scannerIds: ['robots-txt'],
	});

	const {
		tableCardProps: sitemapFindingsProps,
		error: sitemapFindingsError,
		refetch: refetchSitemapFindings,
		isProPopupOpen: isSitemapProPopupOpen,
		closeProPopup: closeSitemapProPopup,
	} = useFindingsTable({
		description: __(
			'No sitemap findings yet — run a scan to check your XML sitemap.',
			'vulopilot'
		),
		scannerIds: ['sitemap', 'sitemap-validation'],
	});

	const handleResubmitSitemap = () => {
		if (!sitemap?.index_url) {
			return;
		}

		sendApiResponse(appLocalizer, getApiLink(appLocalizer, 'indexnow/submit'), {
			urls: [sitemap.index_url],
		}).then((response: { success?: boolean; message?: string } | undefined) => {
			NoticeManager.add({
				uniqueKey: 'robots-sitemap-resubmit',
				type: response?.success ? 'success' : 'error',
				position: 'float',
				message:
					response?.message ||
					(response?.success
						? __('Sitemap submitted to IndexNow.', 'vulopilot')
						: __(
							'Could not submit the sitemap — check the IndexNow API key under Settings → Instant Indexing.',
							'vulopilot'
						)),
			});
		});
	};

	const searchConsoleUrl = gscStatus?.search_console_site
		? `https://search.google.com/search-console?resource_id=${encodeURIComponent(gscStatus.search_console_site)}`
		: `${appLocalizer.site_url}/wp-admin/admin.php?page=vulopilot#&tab=settings&subtab=connections`;

	const sitemapRows: SitemapRow[] = (sitemap?.sitemaps ?? []).map((child, index) => ({
		id: `${index}-${child.loc}`,
		...child,
	}));

	const robotsStatus: 'valid' | 'attention' | 'unreachable' = !robots?.reachable
		? 'unreachable'
		: robotsOpenCount > 0
			? 'attention'
			: 'valid';

	const sitemapStatus: 'valid' | 'attention' | 'unreachable' = !sitemap?.reachable || !sitemap?.valid
		? 'unreachable'
		: sitemap.total_sitemaps === 0
			? 'attention'
			: 'valid';

	if (!isSeoModuleActive()) {
		return (
			<ColumnComponent>
				<CardComponent
					title={__('Robots & Sitemap', 'vulopilot')}
					titleIcon="link"
					desc={__('Robots.txt and XML sitemap checks for this site.', 'vulopilot')}
				>
					<ModuleGuardComponent
						icon="error"
						title={__('SEO module is turned off', 'vulopilot')}
						desc={__(
							'Turn the SEO module back on from Settings → Modules to resume robots.txt/sitemap checks.',
							'vulopilot'
						)}
					/>
				</CardComponent>
			</ColumnComponent>
		);
	}

	return (
		<>
			<ContainerComponent>
				<ColumnComponent>
					<CardComponent
						title={__('Robots.txt Analysis', 'vulopilot')}
						titleIcon="link"
						desc={__(
							'Your live robots.txt, fetched right now (not a cached copy). Edit it below — saving takes effect immediately, and /robots.txt serves your version from the next request. Other active plugins (e.g. WooCommerce) may still add their own rules on top. If a physical robots.txt file exists in your site’s root folder, the web server serves that file instead and these edits won’t apply.',
							'vulopilot'
						)}
						isLoading={isLoadingRobots}
					>
						<div className="robots-overview-wrapper">
							<div className="left-section">
								{robots?.reachable ? (
									<>
										<ButtonInput
											buttons={{
												text: __('Test robots.txt', 'vulopilot'),
												icon: 'refresh',
												// Explicit click → refresh the editor content too.
												onClick: () => loadRobots(true),
											}}
										/>
										<div className='broken-link-section'>
											<div className="rt-editor-wrap">
												<RobotsTxtEditor
													value={robotsEditContent}
													onChange={handleRobotsContentChange}
													placeholder={__(
														'User-agent: *\nDisallow: /wp-admin/',
														'vulopilot'
													)}
												/>
												{robots.is_custom && (
													<ButtonInput
														buttons={{
															text: __(
																'Reset to WordPress default',
																'vulopilot'
															),
															icon: 'refresh',
															color: 'border-purple',
															onClick: handleResetRobotsToDefault,
														}}
													/>
												)}
											</div>
											<div className='list-wrapper'>
												<ListComponent
													className="mini-card report"
													items={[
														{
															id: 'total',
															desc: __('Total Rules', 'vulopilot'),
															tags: (
																<TypographyComponent
																	variant="h5"
																	weight="bold"
																	className="seo-health-score-row-value"
																>
																	{robots.rules.total}
																</TypographyComponent>
															),
														},
														{
															id: 'allowed',
															desc: __('Allowed', 'vulopilot'),
															tags: (
																<TypographyComponent
																	variant="h5"
																	weight="bold"
																	className="seo-health-score-row-value"
																>
																	{robots.rules.allowed}
																</TypographyComponent>
															),
														},
														{
															id: 'disallowed',
															desc: __('Disallowed', 'vulopilot'),
															tags: (
																<TypographyComponent
																	variant="h5"
																	weight="bold"
																	className="seo-health-score-row-value"
																>
																	{robots.rules.disallowed}
																</TypographyComponent>
															),
														},
													]}
												/>
												<ListComponent
													className="mini-card report"
													cols={2}
													items={[

														{
															id: 'sitemaps',
															desc: __('Sitemaps', 'vulopilot'),
															tags: (
																<TypographyComponent
																	variant="h5"
																	weight="bold"
																	className="seo-health-score-row-value"
																>
																	{robots.rules.sitemaps}
																</TypographyComponent>
															),
														},
														{
															id: 'user-agent',
															desc: __('User-agent', 'vulopilot'),
															tags: (
																<>
																	<TypographyComponent
																		variant="h5"
																		weight="bold"
																		className="seo-health-score-row-value"
																	>
																		{String(robots.directives.user_agents.length)}
																	</TypographyComponent>
																</>
															),
														},
														{
															id: 'crawl-delay',
															desc: __('Crawl-delay', 'vulopilot'),
															tags: (
																<>
																	<div className='small'>{robots.directives.crawl_delay ??
																		__('Not set', 'vulopilot')}</div>
																</>
															),
														},
													]}
												/>
											</div>
										</div>
									</>
								) : (
									<ModuleGuardComponent
										icon="error"
										title={__('robots.txt is not reachable', 'vulopilot')}
										desc={__('This site did not return a working /robots.txt just now.', 'vulopilot')}
									/>
								)}
							</div>
							<div className="right-section">
								{robotsTxtError ? (
									<ModuleGuardComponent
										icon="error"
										title={__('Could not load findings', 'vulopilot')}
										desc={robotsTxtError}
										buttonText={__('Retry', 'vulopilot')}
										onButtonClick={refetchRobotsTxt}
									/>
								) : (
									<>
										<SectionComponent
											title={__('Robots.txt Issues', 'vulopilot')}
											titleIcon="security"
											desc={__('Whether robots.txt is reachable and not accidentally blocking every crawler.', 'vulopilot')}
										/>
										<TableCard {...robotsTxtProps} bulkActions={[]} />
									</>
								)}
							</div>
						</div>
					</CardComponent>
				</ColumnComponent>

				<ColumnComponent>
					<CardComponent
						title={__('llms.txt content', 'vulopilot')}
						titleIcon="menu"
						desc={__(
							'Pre-filled with an auto-generated index of your published pages and posts — edit and it saves automatically, just like every other setting here, and is written straight to the live /llms.txt file.',
							'vulopilot'
						)}
						isLoading={isLoadingLlmsTxt}
					>
						<div className="robots-overview-wrapper">
							<div className="left-section">
								{isLlmsTxtEnabled ? (
									<div className="llms-txt-card-field">
										<div className="rt-editor-wrap">
											<RobotsTxtEditor
												value={llmsTxtContent}
												onChange={handleLlmsTxtChange}
												placeholder={__(
													'# Site Name\n\n> A short summary of the site.',
													'vulopilot'
												)}
											/>
											<ButtonInput
												buttons={{
													text: isRegeneratingLlmsTxt
														? __('Regenerating…', 'vulopilot')
														: __('Regenerate', 'vulopilot'),
													icon: 'refresh',
													color: 'border-purple',
													onClick: handleRegenerateLlmsTxt,
													disabled: isRegeneratingLlmsTxt,
												}}
											/>
										</div>
									</div>
								) : (
									<ModuleGuardComponent
										icon="info"
										title={__('llms.txt generation is turned off', 'vulopilot')}
										desc={__(
											'Turn on "Generate llms.txt" under Settings → AI Visibility to edit its content here.',
											'vulopilot'
										)}
										buttonText={__('Open Settings', 'vulopilot')}
										onButtonClick={() => {
											window.location.href = `${appLocalizer.site_url}/wp-admin/admin.php?page=vulopilot#&tab=settings&subtab=ai-visibility`;
										}}
									/>
								)}
							</div>
							<div className="right-section">
								<SectionComponent
									title={__('llms.txt Issues', 'vulopilot')}
									titleIcon="security"
									desc={__(
										'Whether robots.txt is reachable and not accidentally blocking every crawler.',
										'vulopilot'
									)} />
								{sitemapFindingsError ? (
									<ModuleGuardComponent
										icon="error"
										title={__('Could not load findings', 'vulopilot')}
										desc={sitemapFindingsError}
										buttonText={__('Retry', 'vulopilot')}
										onButtonClick={refetchSitemapFindings}
									/>
								) : (
									<TableCard {...sitemapFindingsProps} bulkActions={[]} />
								)}
							</div>
						</div>
					</CardComponent>
				</ColumnComponent>
				<ColumnComponent grid={6}>
					<CardComponent
						title={__('XML Sitemap Overview', 'vulopilot')}
						titleIcon="link"
						desc={__('Check your live sitemap (fetched right now, not a cached copy).', 'vulopilot')}
						isLoading={isLoadingSitemap}
						action={
							<ButtonInput
								buttons={[
									...(sitemap?.reachable
										? [
												{
													text: __('View sitemap index', 'vulopilot'),
													color: 'text-purple',
													onClick: () => window.open(sitemap.index_url, '_blank'),
												},
											]
										: []),
									{
										text: 'Settings',
										icon: 'setting',
										color: 'purple',
										onClick: () => {
											window.location.href = '?page=vulopilot#&tab=settings&subtab=sitemap';
										},
									},
								]}
							/>
						}
					>
						{sitemap?.reachable && sitemap.valid ? (
							<div className='broken-link-section left-side'>
								{sitemapRows.length > 0 ? (
									<ListComponent
										className="mini-card report sitemap-overview-list"
										loading={isLoadingSitemap}
										items={sitemapRows.map((row) => ({
											id: row.id,
											icon: 'link blue',
											title: getSitemapDisplayName(row.loc),
											desc: row.loc,
											titleTag: (
												<BadgeComponent
													color="indigo"
													text={
														null === row.url_count
															? __('— URLs', 'vulopilot')
															: sprintf(
																	/* translators: %d: real number of URLs this sitemap lists. */
																	_n('%d URL', '%d URLs', row.url_count, 'vulopilot'),
																	row.url_count
															)
													}
												/>
											),
											tags: (
												<a href={row.loc} target="_blank" rel="noreferrer">
													{__('View sitemap', 'vulopilot')}
													<IconComponent name="pagination-right-arrow" />
												</a>
											),
										}))}
									/>
								) : (
									<ModuleGuardComponent
										icon="info"
										title={__('No child sitemaps found', 'vulopilot')}
										desc={__('No child sitemaps found in the index.', 'vulopilot')}
									/>
								)}
							</div>
						) : (
							<ModuleGuardComponent
								icon="error"
								title={__('No usable sitemap found', 'vulopilot')}
								desc={__(
									'Neither /wp-sitemap.xml nor /sitemap.xml returned valid, parseable XML just now.',
									'vulopilot'
								)}
							/>
						)}

					</CardComponent>
				</ColumnComponent>


				<ColumnComponent grid={6} fullHeight>
					<CardComponent
						title={__('Blocked pages', 'vulopilot')}
						titleIcon="eye-blocked"
						desc={__('Real pages an AI bot is blocked from crawling right now.', 'vulopilot')}
					>
						{blockedPagesError ? (
							<ModuleGuardComponent
								icon="error"
								title={__('Could not load findings', 'vulopilot')}
								desc={blockedPagesError}
								buttonText={__('Retry', 'vulopilot')}
								onButtonClick={refetchBlockedPages}
							/>
						) : (
							<>
								<div className="robots-blocked-count">
									<TypographyComponent as="span" variant="h3" className="redirect-stat-value is-attention">
										{blockedPagesOpenCount}
									</TypographyComponent>
									<TypographyComponent as="span" variant="desc">
										{sprintf(
											/* translators: %d: number of blocked URLs. */
											__('%d URL(s) currently blocked', 'vulopilot'),
											blockedPagesOpenCount
										)}
									</TypographyComponent>
								</div>
								<TableCard {...blockedPagesProps} />
							</>
						)}
					</CardComponent>
				</ColumnComponent>
			</ContainerComponent>

			<PopupComponent open={isProPopupOpen} onClose={closeProPopup} width={31.25} height="auto" >
				{appLocalizer.khali_dabba ? <ShowProPopup moduleName="one-click-fix" /> : <ShowProPopup />}
			</PopupComponent>
			<PopupComponent
				open={isRobotsTxtProPopupOpen}
				onClose={closeRobotsTxtProPopup}
				width={31.25}
				height="auto"

			>
				{appLocalizer.khali_dabba ? <ShowProPopup moduleName="one-click-fix" /> : <ShowProPopup />}
			</PopupComponent>
			<PopupComponent
				open={isSitemapProPopupOpen}
				onClose={closeSitemapProPopup}
				width={31.25}
				height="auto"

			>
				{appLocalizer.khali_dabba ? <ShowProPopup moduleName="one-click-fix" /> : <ShowProPopup />}
			</PopupComponent>
		</>
	);
};

export default CrawlRobotsSitemapSection;