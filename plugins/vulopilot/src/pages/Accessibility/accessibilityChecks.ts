import { __ } from '@wordpress/i18n';

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
}

/**
 * The reference mockup's 5-tile "Accessibility Checks" grid - one bucket
 * merges what AccessibilityTab.tsx previously split into two separate
 * FindingsTable sections ("Forms" + "Links & Buttons") into one "Links &
 * Forms" tile, matching the mockup's own 5-tile IA exactly; every other
 * bucket is a 1:1 rename of an existing section. Shared by
 * AccessibilityHeroCard.tsx (combined scanner id list for its own
 * counts), AccessibilityChecksGrid.tsx (the tiles themselves),
 * AccessibilityPriorityList.tsx ("What should I fix first" - looks up
 * which check a given finding's scanner_id belongs to, for that row's
 * icon/color), and AccessibilityTab.tsx (passed straight through as
 * SectionedIssuesTable.tsx's own `sections` prop, for the merged issues
 * table at the bottom of the page) - one definition, not four driftable
 * copies.
 */
const REAL_ACCESSIBILITY_CHECKS: AccessibilityCheck[] = [
	{
		key: 'page-structure',
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

/** Every real scanner id any of the 5 buckets above covers - the hero card's own combined counts. Deliberately excludes the synthetic `'all'` tile below (its own `scannerIds` already reduces to this same list) so nothing here double-counts. */
export const ACCESSIBILITY_SCANNER_IDS = REAL_ACCESSIBILITY_CHECKS.flatMap(
	(check) => check.scannerIds
);

/**
 * The 5 real buckets above, plus a 6th synthetic `'all'` tile - a real 6th
 * "All Checks" spot for AccessibilityChecksGrid.tsx's own grid (direct
 * instruction), combining every one of the 5 real buckets' own scanner
 * ids into one, same real total `ACCESSIBILITY_SCANNER_IDS` above already
 * is. Deliberately last, not first: `checkForScannerId()` below is a
 * `.find()`, so every real scanner id still resolves to its own specific
 * bucket first - `'all'` is never actually reachable through that lookup,
 * it exists only for the grid tile itself.
 *
 * Not passed to SectionedIssuesTable.tsx's own `sections` prop
 * (Accessibility.tsx filters this `'all'` entry back out before passing
 * it down) - that component already synthesizes its own "All" tab above
 * `sections` (see its own docblock), so including this tile there would
 * render two.
 */
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
