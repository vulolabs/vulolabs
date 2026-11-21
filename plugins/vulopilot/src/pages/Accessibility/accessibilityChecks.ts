import { __ } from '@wordpress/i18n';
import type { Tone } from '../../components/ui';

export interface AccessibilityCheck {
	/** React key, and the tab key SectionedIssuesTable.tsx uses for this check's own tab. */
	key: string;
	title: string;
	description: string;
	scannerIds: string[];
	/** adminfont-* icon name (no prefix). */
	icon: string;
	/** Real hex color, shared by the tile's count/icon and its "Review" button border. */
	color: string;
	emptyMessage: string;
	/** The page's check list: a plain icon and tone for its tile, and the line shown when nothing is open. */
	tileIcon?: string;
	tone?: Tone;
	clearText?: string;
}

/** The reference mockup's 5-tile "Accessibility Checks" grid. */
const REAL_ACCESSIBILITY_CHECKS: AccessibilityCheck[] = [
	{
		key: 'page-structure',
		tileIcon: 'editor-list',
		tone: 'violet',
		clearText: __('Headings and landmarks are in order.', 'vulopilot'),
		title: __('Page Structure', 'vulopilot'),
		description: __('Some pages harder to use.', 'vulopilot'),
		scannerIds: ['accessibility'],
		icon: 'editor-list purple',
		color: '#7c3aed',
		emptyMessage: __(
			'No page structure findings yet - run a scan to check heading hierarchy.',
			'vulopilot'
		),
	},
	{
		key: 'images-media',
		tileIcon: 'image',
		tone: 'green',
		clearText: __('Every image has a description.', 'vulopilot'),
		title: __('Images & Media', 'vulopilot'),
		description: __(
			'Not all images explained.',
			'vulopilot'
		),
		scannerIds: ['images'],
		icon: 'image green',
		color: '#16a34a',
		emptyMessage: __(
			'No image findings yet - run a scan to check for missing alt text.',
			'vulopilot'
		),
	},
	{
		key: 'links-forms',
		tileIcon: 'link',
		tone: 'amber',
		clearText: __('Links and form fields are clearly labelled.', 'vulopilot'),
		title: __('Links & Forms', 'vulopilot'),
		description: __(
			'Some controls may be difficult to understand.',
			'vulopilot'
		),
		scannerIds: ['form-labels', 'aria-attributes', 'wcag-scanner'],
		icon: 'link yellow',
		color: '#d97706',
		emptyMessage: __(
			'No link/form findings yet - run a scan to check for unlabeled fields and ambiguous link text.',
			'vulopilot'
		),
	},
	{
		key: 'keyboard-use',
		tileIcon: 'coding',
		tone: 'blue',
		clearText: __('Everything can be reached without a mouse.', 'vulopilot'),
		title: __('Keyboard Use', 'vulopilot'),
		description: __(
			'Some visitors may have trouble.',
			'vulopilot'
		),
		scannerIds: ['keyboard-accessibility'],
		icon: 'coding blue',
		color: '#2563eb',
		emptyMessage: __(
			'No keyboard accessibility findings yet - run a scan to check.',
			'vulopilot'
		),
	},
	{
		key: 'visual-readability',
		tileIcon: 'eye',
		tone: 'red',
		clearText: __('Text is easy to see and read.', 'vulopilot'),
		title: __('Visual Readability', 'vulopilot'),
		description: __('Some text may be difficult to see.', 'vulopilot'),
		scannerIds: ['readability'],
		icon: 'eye pink',
		color: '#e11d48 ',
		emptyMessage: __(
			'No readability findings yet - run a scan to check.',
			'vulopilot'
		),
	},
];

/** Every real scanner id any of the 5 buckets above covers. */
export const ACCESSIBILITY_SCANNER_IDS = REAL_ACCESSIBILITY_CHECKS.flatMap(
	(check) => check.scannerIds
);

/** The 5 real buckets above, plus a 6th synthetic `'all'` tile. */
export const ACCESSIBILITY_CHECKS: AccessibilityCheck[] = [
	...REAL_ACCESSIBILITY_CHECKS,
	{
		key: 'all',
		title: __('All Checks', 'vulopilot'),
		description: __(
			'Every accessibility check, combined.',
			'vulopilot'
		),
		scannerIds: ACCESSIBILITY_SCANNER_IDS,
		icon: 'security lime',
		color: '#65a30d',
		emptyMessage: __(
			'No accessibility findings yet - run a scan to check everything at once.',
			'vulopilot'
		),
	},
];
