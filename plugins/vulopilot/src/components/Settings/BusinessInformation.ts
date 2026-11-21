import { __ } from '@wordpress/i18n';

/**
 * Settings → Business Information, a standalone top-level tab defined as a declarative `modal`.
 *
 * Grouped the way people think about their business - who you are, how to reach you and where, what you offer,
 * where you are online, who you compete with. Section boundaries are presentation only: every field keeps its stored
 * key, so saved values and the Organization structured data (HomepageSchemaRenderer) are unchanged. Country and
 * State/region use the `vp-country` / `vp-region` field types (fields/AddressFields.tsx).
 */
export default {
	id: 'business-information',
	priority: 1,
	headerTitle: __('Business Information', 'vulopilot'),
	headerDescription: __(
		'Tell VuloPilot about your business so search engines and AI assistants describe it accurately.',
		'vulopilot'
	),
	groupBySections: true,
	hideSettingHeader: true,
	headerIcon: 'category',
	submitUrl: 'settings',
	modal: [
		// ---- Who you are ----
		{
			key: 'entity-section-profile',
			type: 'section',
			icon: 'storefront',
			title: __('Business profile', 'vulopilot'),
			desc: __(
				'Your name and what you do. The name is published in your Organization structured data; the rest guides VuloPilot and its AI.',
				'vulopilot'
			),
		},
		{
			key: 'entity_business_name',
			type: 'text',
			label: __('Organization name', 'vulopilot'),
			placeholder: __('Your site title is used when this is empty', 'vulopilot'),
			settingDescription: __('The name search engines and AI assistants should call you.', 'vulopilot'),
		},
		{
			key: 'entity_business_type',
			type: 'text',
			label: __('Business type', 'vulopilot'),
			placeholder: __('e.g. Online store, Consulting agency, Software company', 'vulopilot'),
			settingDescription: __('Shown on your Business Profile card.', 'vulopilot'),
		},
		{
			key: 'site_tone',
			type: 'textarea',
			label: __('Brand voice', 'vulopilot'),
			rowNumber: 2,
			placeholder: __('e.g. Friendly and plain-spoken, never salesy', 'vulopilot'),
			settingDescription: __('How your content should sound. Sent with every AI request.', 'vulopilot'),
		},

		// ---- How to reach you, and where ----
		{
			key: 'entity-section-contact',
			type: 'section',
			icon: 'location',
			title: __('Contact & address', 'vulopilot'),
			desc: __(
				'Published in your Organization structured data, so search results and AI answers show how to reach you.',
				'vulopilot'
			),
		},
		{
			key: 'entity_business_email',
			type: 'text',
			label: __('Contact email', 'vulopilot'),
			placeholder: __('hello@example.com', 'vulopilot'),
		},
		{
			key: 'entity_business_phone',
			type: 'text',
			label: __('Contact phone', 'vulopilot'),
			placeholder: __('Include the country code, e.g. +1 555 0100', 'vulopilot'),
		},
		{
			key: 'entity_business_country',
			type: 'vp-country',
			label: __('Country', 'vulopilot'),
			settingDescription: __('Choose this first; the State/region list follows it.', 'vulopilot'),
		},
		{
			key: 'entity_business_region',
			type: 'vp-region',
			countryKey: 'entity_business_country',
			label: __('State / region', 'vulopilot'),
		},
		{
			key: 'entity_business_city',
			type: 'text',
			label: __('City', 'vulopilot'),
			placeholder: __('e.g. Springfield', 'vulopilot'),
		},
		{
			key: 'entity_business_postal_code',
			type: 'text',
			label: __('Postal code', 'vulopilot'),
			placeholder: __('e.g. 62701', 'vulopilot'),
		},
		{
			key: 'entity_business_street',
			type: 'text',
			label: __('Street address', 'vulopilot'),
			placeholder: __('e.g. 123 Main St, Suite 4', 'vulopilot'),
		},

		// ---- What you offer, and where ----
		{
			key: 'entity-section-offering',
			type: 'section',
			icon: 'store-location',
			title: __('Locations & services', 'vulopilot'),
			desc: __(
				'Helps VuloPilot connect your pages to the places you serve and the services you sell.',
				'vulopilot'
			),
		},
		{
			key: 'entity_business_locations',
			type: 'textarea',
			label: __('Other locations', 'vulopilot'),
			rowNumber: 3,
			placeholder: __('Downtown Store | 123 Main St, Springfield', 'vulopilot'),
			settingDescription: __('One per line: a name, then | and the address.', 'vulopilot'),
		},
		{
			key: 'entity_service_pages',
			type: 'textarea',
			label: __('Service pages', 'vulopilot'),
			rowNumber: 3,
			placeholder: __('https://example.com/consulting/', 'vulopilot'),
			settingDescription: __('One per line: a page URL or its ID.', 'vulopilot'),
		},

		// ---- Where you are online ----
		{
			key: 'entity-section-social',
			type: 'section',
			icon: 'social-share',
			title: __('Social profiles', 'vulopilot'),
			desc: __(
				"Listed as your Organization's sameAs links, so search engines and AI tie these accounts to your site.",
				'vulopilot'
			),
		},
		{
			key: 'social_profile_urls',
			type: 'textarea',
			label: __('Profile URLs', 'vulopilot'),
			rowNumber: 4,
			placeholder: __('https://www.linkedin.com/company/your-company\nhttps://x.com/yourhandle', 'vulopilot'),
			settingDescription: __('One per line: Facebook, X, LinkedIn, Instagram, YouTube and so on.', 'vulopilot'),
		},

		// ---- Who you compete with ----
		{
			key: 'general_settings',
			type: 'section',
			icon: 'person',
			title: __('Competitors', 'vulopilot'),
			desc: __('Used to calculate your Share of Voice on the Brand Visibility page.', 'vulopilot'),
		},
		{
			key: 'geo_competitor_urls',
			type: 'dynamic-row',
			moduleEnabled: 'geo-analysis',
			proSetting: true,
			addLabel: __('Add competitor', 'vulopilot'),
			emptyText: __('No competitors added yet.', 'vulopilot'),
			template: {
				fields: [
					{
						key: 'name',
						type: 'text',
						label: __('Name', 'vulopilot'),
						placeholder: __('Competitor name', 'vulopilot'),
					},
					{
						key: 'url',
						type: 'text',
						label: __('URL', 'vulopilot'),
						size: '20rem',
						placeholder: __('https://competitor.com', 'vulopilot'),
					},
				],
			},
		},
	],
};
