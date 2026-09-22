import { __ } from '@wordpress/i18n';

/**
 * Settings → Get Started → Business Information — a plain declarative
 * `modal` (InputRenderer), replacing the former hand-built `PanelComponent`
 * (BusinessInformation.ts/BusinessInformationPanel.tsx, deleted) now that
 * PageSpeed Insights has moved to ConnectionsPanel.tsx and no longer needs
 * a real component composed in above this tab's own "Business" fields.
 *
 * `id: 'business-information'` (this file used to carry a typo'd
 * `'business-informa'`, which briefly duplicated this tab under 2 ids at
 * once) — kept as the one real id 2 existing deep links already point to
 * (`KnowledgeGraphSection.tsx`'s own `ENTITY_SETTINGS_URL`, `Modules/index.ts`'s
 * own `settingsLink`), same `getSettingById()` recurse-by-id-alone
 * reasoning the deleted file's own docblock already documented.
 *
 * "Tracked competitors"/"About Page" (all real fields: `geo_competitor_urls`,
 * `brand_about_page_min_words`, plus `brand-drop-threshold-note`) merged in
 * from the former Settings → Scanning → Brand Intelligence tab per direct
 * instruction — that tab (`Scanning/BrandIntelligence.ts`, `id:
 * 'brand-intelligence'`) is deleted entirely, not just emptied. Same real
 * keys/backend (BRAND-INTELLIGENCE-MODULE.md's own AboutPageAnalysisScanner
 * etc.), only where the UI for them lives moved.
 */
export default {
    id: 'business-information',
    priority: 1,
    headerTitle: __('Business Information', 'vulopilot'),
    headerDescription: __(
        'Tell VuloPilot about your business so it can build a more complete Knowledge Graph and Business Profile.',
        'vulopilot'
    ),
    groupBySections: true,
    hideSettingHeader: true,
    headerIcon: 'category',
    submitUrl: 'settings',
    modal: [
        {
            key: 'entity-section-business',
            type: 'section',
            icon: 'category',
            title: __('Business', 'vulopilot'),
            desc: __(
                'What kind of business this is — shown on the Business Profile card, not written into any structured data.',
                'vulopilot'
            ),
        },
        {
            key: 'site_tone',
            type: 'text',
            label: __('Site tone', 'vulopilot'),
            settingDescription: __(
                'A short description of how this site should sound (e.g. "Friendly and casual" or "Formal and technical") — included with every AI request.',
                'vulopilot'
            ),
        },
        {
            key: 'entity_business_type',
            type: 'text',
            label: __('Business type', 'vulopilot'),
            settingDescription: __(
                'e.g. Software Company, Online Store, Consulting Agency.',
                'vulopilot'
            ),
        },
        {
            key: 'entity_service_pages',
            type: 'textarea',
            label: __('Service pages', 'vulopilot'),
            settingDescription: __(
                'e.g. https://example.com/consulting/ or just the page ID.',
                'vulopilot'
            ),
        },
        {
            key: 'entity_business_locations',
            type: 'textarea',
            label: __('Business locations', 'vulopilot'),
            settingDescription: __(
                'e.g. Downtown Store | 123 Main St, Springfield.',
                'vulopilot'
            ),
        },
        {
            key: 'general_settings',
            type: 'section',
            icon: 'person',
            title: __('Competitors', 'vulopilot'),
            desc: __(
                'Used to calculate Share of Voice on the Brand Visibility page.',
                'vulopilot'
            ),
        },
        {
            // Moved here from Settings → Scanning → Brand Intelligence
            // (`geo_competitor_urls`, same key, same real backend — this is
            // a pure UI relocation) per direct instruction. Still gated
            // `moduleEnabled: 'geo'` (the free, always-active GEO module,
            // not a Pro one) rather than `brand-intelligence` — this field
            // is shared by three different Pro modules' analyzers
            // (BrandIntelligence\BrandCompetitorAnalyzer,
            // ContentIntelligence\ContentGapAnalyzer, GeoInsights\
            // CompetitorVisibilityAnalyzer), so gating it to just one of
            // them would be wrong.
            key: 'geo_competitor_urls',
            type: 'textarea',
            label: __('Competitor URLs', 'vulopilot'),
            settingDescription: __(
                'One competitor URL per line. Powers the GEO page\'s Competitor Visibility comparison (VuloPilot Pro).',
                'vulopilot'
            ),
            moduleEnabled: 'geo',
        },
    ],
};
