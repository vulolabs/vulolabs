/* global vulopilotAppLocalizer */
import { useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, sendApiResponse } from '@zyra/core';
import {
	CardComponent,
	ColumnComponent,
	ContainerComponent,
	FormGroupComponent,
	FormGroupWrapperComponent,
	NoticeComponent,
	NoticeManager,
	PopupComponent,
	SectionComponent,
} from '@zyra/components';
import { MultiCheckboxInput, SelectInput, TextInput } from '@zyra/inputs';
import { useSetting } from '../../../contexts/SettingContext';
import ShowProPopup from '../../Popup/Popup';
import { formatWpDate } from '../../../services/formatWpDate';
import SitemapHowItWorksCard from './SitemapHowItWorksCard';

/** Settings → SEO → Sitemap. */
const SitemapPanel = () => {
	const { setting, updateSetting } = useSetting();

	const toArray = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : []);
	const isChecked = (key: string): boolean => toArray(setting[key]).includes(key);

	const handleSettingChange = (key: string, value: unknown) => {
		updateSetting(key, value);
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
			setting: { [key]: value },
		});
	};

	// "Stop typing, then save" debounce.
	const AUTOSAVE_DEBOUNCE_MS = 1000;
	const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

	const scheduleSave = (key: string, value: unknown) => {
		updateSetting(key, value);

		if (saveTimerRef.current[key]) {
			clearTimeout(saveTimerRef.current[key] as ReturnType<typeof setTimeout>);
		}

		saveTimerRef.current[key] = setTimeout(() => {
			sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, 'settings'), {
				setting: { [key]: value },
			}).then((response) => {
				if (!response) {
					NoticeManager.add({
						uniqueKey: 'vulopilot-sitemap-save',
						type: 'error',
						position: 'float',
						message: __('Could not save sitemap settings. Please try again.', 'vulopilot'),
					});
				}
			});
		}, AUTOSAVE_DEBOUNCE_MS);
	};

	const isPro = Boolean(vulopilotAppLocalizer.khali_dabba);
	const [isProPopupOpen, setIsProPopupOpen] = useState(false);

	/** Unlocked settings keep their real controls. */
	const proGuard = (save: () => void) => (isPro ? save() : setIsProPopupOpen(true));

	const lastRun = String(setting.sitemap_health_last_run ?? '');
	const lastProblems = Number(setting.sitemap_health_last_problems ?? 0);

	const sitemapEnabled = isChecked('sitemap_enabled');
	const htmlSitemapEnabled = isChecked('html_sitemap_enabled');
	const sitemapIncludeImages = isChecked('sitemap_include_images');

	/** The core post types plus any registered custom post types (`sitemap_custom_post_types`). */
	const POST_TYPE_OPTIONS = [
		{ key: 'post', label: __('Posts', 'vulopilot'), value: 'post' },
		{ key: 'page', label: __('Pages', 'vulopilot'), value: 'page' },
		{ key: 'attachment', label: __('Media', 'vulopilot'), value: 'attachment' },
		{ key: 'product', label: __('Products', 'vulopilot'), value: 'product' },
		...(vulopilotAppLocalizer.sitemap_custom_post_types ?? []).map((postType) => ({
			key: postType.value,
			label: postType.label,
			value: postType.value,
		})),
	];

	const TAXONOMY_OPTIONS = [
		{ key: 'category', label: __('Categories', 'vulopilot'), value: 'category' },
		{ key: 'post_tag', label: __('Tags', 'vulopilot'), value: 'post_tag' },
		{ key: 'product_cat', label: __('Product Categories', 'vulopilot'), value: 'product_cat' },
		{ key: 'product_tag', label: __('Product Tags', 'vulopilot'), value: 'product_tag' },
	];

	const DISPLAY_FORMAT_OPTIONS = [
		{ label: __('List', 'vulopilot'), value: 'list' },
		{ label: __('Grid', 'vulopilot'), value: 'grid' },
	];

	const SORT_BY_OPTIONS = [
		{ label: __('Published Date', 'vulopilot'), value: 'published_date' },
		{ label: __('Modified Date', 'vulopilot'), value: 'modified_date' },
		{ label: __('Title', 'vulopilot'), value: 'title' },
	];

	const ITEM_TITLES_OPTIONS = [
		{ label: __('Post/Term Titles', 'vulopilot'), value: 'post_title' },
		{ label: __('SEO Titles', 'vulopilot'), value: 'seo_title' },
	];

	/** Single-option `look="toggle"` switch, as in DeveloperToolsPanel.tsx and EnableAutomationModuleAction.tsx. */
	const renderToggle = (key: string, label: string, desc?: string) => (
		<FormGroupComponent row label={label} desc={desc}>
			<MultiCheckboxInput
				look="toggle"
				modules={[]}
				options={[{ key, value: key, label: '' }]}
				value={isChecked(key) ? [key] : []}
				onChange={(value) => handleSettingChange(key, value)}
			/>
		</FormGroupComponent>
	);

	return (
		<div className="site-identity-title-formats">
			<SectionComponent
				icon="editor-list"
				title={__('XML Sitemap', 'vulopilot')}
				desc={__('A machine-readable file listing your site pages, for search engines. Turn this on and VuloPilot notifies search engines automatically whenever it changes.',
					'vulopilot'
				)}
				rightContent={
					<MultiCheckboxInput
						look="toggle"
						modules={[]}
						options={[{ key: 'sitemap_enabled', value: 'sitemap_enabled', label: '' }]}
						value={sitemapEnabled ? ['sitemap_enabled'] : []}
						onChange={(value) => handleSettingChange('sitemap_enabled', value)}
					/>
				}
			/>

			{sitemapEnabled && (
				<>
					<ContainerComponent>
						<ColumnComponent grid={8}>
							<CardComponent
								title={__('What is included', 'vulopilot')}
								titleIcon="category"
								desc={__(
									'Choose which content and terms appear in your XML sitemap and the [vulopilot_html_sitemap] shortcode below. Noindex, redirected, canonical-elsewhere and placeholder pages are always left out.',
									'vulopilot'
								)}
							>
								<FormGroupWrapperComponent>
									<FormGroupComponent row label={__('Post types in sitemap', 'vulopilot')}>
										<MultiCheckboxInput
											modules={[]}
											selectDeselect
											options={POST_TYPE_OPTIONS}
											value={toArray(setting.sitemap_xml_post_types)}
											onChange={(value) => handleSettingChange('sitemap_xml_post_types', value)}
										/>
									</FormGroupComponent>
									<FormGroupComponent row label={__('Taxonomies in sitemap', 'vulopilot')}>
										<MultiCheckboxInput
											modules={[]}
											selectDeselect
											options={TAXONOMY_OPTIONS}
											value={toArray(setting.sitemap_xml_taxonomies)}
											onChange={(value) => handleSettingChange('sitemap_xml_taxonomies', value)}
										/>
									</FormGroupComponent>
									{renderToggle(
										'sitemap_skip_single_author',
										__('Hide the author sitemap on single-author sites', 'vulopilot'),
										__('With one author, the author page only repeats your blog page.', 'vulopilot')
									)}
								</FormGroupWrapperComponent>
							</CardComponent>

							<CardComponent
								title={__('Sitemap health checks', 'vulopilot')}
								titleIcon="tools"
								desc={__(
									'Fetches a sample of your sitemap URLs and reports any that fail to load, redirect, are noindex or point to another canonical, plus duplicates, placeholders and unchanged last modified dates.',
									'vulopilot'
								)}
							>
								<FormGroupWrapperComponent>
									<FormGroupComponent
										row
										label={
											<>
												{__('Run health checks', 'vulopilot')}
												{!isPro && (
													<span
														className="admin-tag pro-tag pro-tag-inline"
														role="button"
														tabIndex={0}
														onClick={() => setIsProPopupOpen(true)}
														onKeyDown={(event) => {
															if ('Enter' === event.key || ' ' === event.key) {
																event.preventDefault();
																setIsProPopupOpen(true);
															}
														}}
													>
														<i className="adminfont-pro-tag" />
														{__('Pro', 'vulopilot')}
													</span>
												)}
											</>
										}
										desc={__(
											'Checks a sample of your sitemap URLs each time a scan runs and reports problems in your SEO issues.',
											'vulopilot'
										)}
									>
										<MultiCheckboxInput
											look="toggle"
											modules={[]}
											options={[{ key: 'sitemap_health_enabled', value: 'sitemap_health_enabled', label: '' }]}
											value={isChecked('sitemap_health_enabled') ? ['sitemap_health_enabled'] : []}
											onChange={(value) =>
												proGuard(() => handleSettingChange('sitemap_health_enabled', value))
											}
										/>
									</FormGroupComponent>
									{lastRun && (
										<NoticeComponent
											displayPosition="inline-notice"
											type={lastProblems > 0 ? 'warning' : 'success'}
											message={
												lastProblems > 0
													? sprintf(
															/* translators: 1: date, 2: number of problems. */
															__('Last checked %1$s: %2$d problem types found.', 'vulopilot'),
															formatWpDate(lastRun),
															lastProblems
													  )
													: sprintf(
															/* translators: %s: date. */
															__('Last checked %s: no problems found.', 'vulopilot'),
															formatWpDate(lastRun)
													  )
											}
										/>
									)}
								</FormGroupWrapperComponent>
							</CardComponent>

							<CardComponent
								title={__('Advanced settings', 'vulopilot')}
								titleIcon="editor-list"
								desc={__(
									'Fine-tune size, exclusions, and images for large or complex sites.',
									'vulopilot'
								)}
							>
								<FormGroupWrapperComponent>
									<FormGroupComponent
										row
										label={__('Links per sitemap', 'vulopilot')}
										desc={__('Max number of links on each sitemap page.', 'vulopilot')}
									>
										<TextInput
											type="number"
											size={10}
											value={(setting.sitemap_links_per_page as number) ?? ''}
											onChange={(value) => scheduleSave('sitemap_links_per_page', value)}
										/>
									</FormGroupComponent>
									<FormGroupComponent
										row
										label={__('Exclude posts', 'vulopilot')}
										desc={__(
											'Post IDs to exclude from the sitemap, separated by commas. Applies across all included post types.',
											'vulopilot'
										)}
									>
										<TextInput
											size={10}
											value={(setting.sitemap_exclude_posts as string) ?? ''}
											onChange={(value) => scheduleSave('sitemap_exclude_posts', String(value))}
										/>
									</FormGroupComponent>
									<FormGroupComponent
										row
										label={__('Exclude terms', 'vulopilot')}
										desc={__(
											'Term IDs to exclude, separated by commas. Applies across all included taxonomies.',
											'vulopilot'
										)}
									>
										<TextInput
											size={10}
											value={(setting.sitemap_exclude_terms as string) ?? ''}
											onChange={(value) => scheduleSave('sitemap_exclude_terms', String(value))}
										/>
									</FormGroupComponent>
									{renderToggle(
										'sitemap_include_images',
										__('Images in sitemaps', 'vulopilot'),
										__(
											"Include references to images from the post content in sitemaps - this helps search engines index the important images on your pages.",
											'vulopilot'
										)
									)}
									{sitemapIncludeImages &&
										renderToggle(
											'sitemap_include_featured_images',
											__('Include featured images', 'vulopilot'),
											__(
												"Include the featured image too, even if it doesn't appear directly in the post content.",
												'vulopilot'
											)
										)}
								</FormGroupWrapperComponent>
							</CardComponent>

							<CardComponent
								title={__('HTML Sitemap', 'vulopilot')}
								titleIcon="web-page-website"
								desc={__(
									'A human-readable page listing every included post, page, and taxonomy term.',
									'vulopilot'
								)}
							>
								<FormGroupWrapperComponent>
									{renderToggle(
										'html_sitemap_enabled',
										__('Enable HTML sitemap', 'vulopilot'),
										__(
											'A human-readable page listing every included post, page, and taxonomy term.',
											'vulopilot'
										)
									)}

									{htmlSitemapEnabled && (
										<>
										<NoticeComponent
												displayPosition="inline-notice"
												type="info"
												message={__(
													'Use this shortcode to display the HTML sitemap anywhere on your site: <code>[vulopilot_html_sitemap] </code>',
													'vulopilot'
												)}
											/>
											<FormGroupComponent
												row
												label={__('Display format', 'vulopilot')}
												desc={__('How you want to display the HTML sitemap.', 'vulopilot')}
											>
												<SelectInput
													type="single-select"
													size={10}
													options={DISPLAY_FORMAT_OPTIONS}
													value={(setting.html_sitemap_display_format as string) ?? 'list'}
													isClearable={false}
													onChange={(value) =>
														handleSettingChange('html_sitemap_display_format', value)
													}
												/>
											</FormGroupComponent>
											<FormGroupComponent
												row
												label={__('Sort by', 'vulopilot')}
												desc={__('How to sort the items in the HTML sitemap.', 'vulopilot')}
											>
												<SelectInput
													type="single-select"
													size={15}
													options={SORT_BY_OPTIONS}
													value={(setting.html_sitemap_sort_by as string) ?? 'published_date'}
													isClearable={false}
													onChange={(value) => handleSettingChange('html_sitemap_sort_by', value)}
												/>
											</FormGroupComponent>
											{renderToggle(
												'html_sitemap_show_dates',
												__('Show dates', 'vulopilot'),
												__('Show published dates for each post & page.', 'vulopilot')
											)}
											<FormGroupComponent
												row
												label={__('Item titles', 'vulopilot')}
												desc={__(
													'Show the post/term titles, or the SEO titles, in the HTML sitemap.',
													'vulopilot'
												)}
											>
												<SelectInput
													type="single-select"
													size={15}
													options={ITEM_TITLES_OPTIONS}
													value={(setting.html_sitemap_item_titles as string) ?? 'post_title'}
													isClearable={false}
													onChange={(value) =>
														handleSettingChange('html_sitemap_item_titles', value)
													}
												/>
											</FormGroupComponent>
										</>
									)}
								</FormGroupWrapperComponent>
							</CardComponent>
						</ColumnComponent>

						<ColumnComponent grid={4}>
							<SitemapHowItWorksCard />
						</ColumnComponent>
					</ContainerComponent>
				</>
			)}
			<PopupComponent
				open={isProPopupOpen}
				onClose={() => setIsProPopupOpen(false)}
				width={31.25}
				height="auto"
				position="lightbox"
			>
				<ShowProPopup />
			</PopupComponent>
		</div>
	);
};

export default SitemapPanel;
