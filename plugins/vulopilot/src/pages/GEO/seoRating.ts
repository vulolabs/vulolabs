import { __ } from '@wordpress/i18n';

/**
 * Same 3-tier 0-100 score thresholds used throughout the SEO tab (the
 * "SEO Health Score" ring, "SEO areas" tiles, and "Pages that need
 * attention") — pulled out of SeoTab.tsx so other real callers could reuse
 * the exact same real labels/classes rather than inventing their own
 * scale. Both of this file's original intended consumers beyond SeoTab.tsx
 * itself (PagesNeedingAttentionTable.tsx, WhatShouldIFixFirstCard.tsx) are
 * gone now — folded into SeoIssuesByPageTable.tsx and deleted as a
 * confirmed-orphaned file respectively, in earlier passes over this
 * folder — leaving only `getRating()`/`ratingColor()` with real remaining
 * callers; `ratingClass()` was removed from here for the same reason.
 */
export const getRating = (score: number): string => {
	if (score >= 70) {
		return __('Good', 'vulopilot');
	}
	if (score >= 40) {
		return __('Needs Work', 'vulopilot');
	}
	return __('At Risk', 'vulopilot');
};

/**
 * Same 3-tier thresholds as `getRating()` above, as one of
 * zyra's own `$color-palette` names — for call sites (`AnalyticsComponent`'s
 * `colorClass`) that resolve against that real palette instead of the
 * `is-good`/`is-attention`/`is-poor` semantic classes.
 */
export const ratingColor = (score: number): string => {
	if (score >= 70) {
		return 'green';
	}
	if (score >= 40) {
		return 'purple';
	}
	return 'red';
};
