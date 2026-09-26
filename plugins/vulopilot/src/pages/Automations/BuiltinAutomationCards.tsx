/* global vulopilotAppLocalizer */
import { useEffect, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import { CardComponent, FormGroupComponent, FormGroupWrapperComponent, ColumnComponent } from '@zyra/components';
import { ButtonInput, MultiCheckboxInput, SelectInput } from '@zyra/inputs';
import { formatWpDate, formatWpTime, isWpToday } from '../../services/formatWpDate';
import type { AutomationRow } from './automationsTypes';

/** Automations\BuiltinAutomationSeeder's own two TRIGGER_* constants - the only trigger_type values this component ever renders a card for. */
const FULL_SITE_SCAN_TRIGGER = 'free_full_site_scan';
const VISIBILITY_REPORT_TRIGGER = 'free_visibility_report';

/**
 * Same ids `automationsTypes.ts`'s own `FREE_TEMPLATES` uses
 * ('run-full-site-scan'/'send-visibility-report') - kept as a local
 * trigger_type → template id map rather than importing that file's own
 * `AutomationTemplate` list, since this component only ever needs the 2 id
 * strings themselves (to match `highlightTemplateId` below against a real
 * row's own `trigger_type`), not the full template shape.
 */
const TRIGGER_TYPE_TO_TEMPLATE_ID: Record<string, string> = {
	[FULL_SITE_SCAN_TRIGGER]: 'run-full-site-scan',
	[VISIBILITY_REPORT_TRIGGER]: 'send-visibility-report',
};

interface BuiltinTriggerConfig {
	frequency: string;
	day_of_week?: number;
}

interface BuiltinRow extends AutomationRow {
	trigger_config: string | null;
}

const DAY_OPTIONS = [
	{ label: __('Monday', 'vulopilot'), value: '1' },
	{ label: __('Tuesday', 'vulopilot'), value: '2' },
	{ label: __('Wednesday', 'vulopilot'), value: '3' },
	{ label: __('Thursday', 'vulopilot'), value: '4' },
	{ label: __('Friday', 'vulopilot'), value: '5' },
	{ label: __('Saturday', 'vulopilot'), value: '6' },
	{ label: __('Sunday', 'vulopilot'), value: '7' },
];

const parseTriggerConfig = (row: BuiltinRow): BuiltinTriggerConfig => {
	try {
		const parsed = JSON.parse(row.trigger_config || '{}');
		return { frequency: 'disabled', ...parsed };
	} catch {
		return { frequency: 'disabled' };
	}
};

/** Same day list `DAY_OPTIONS` above uses, keyed by number - for the "Every Monday" wording on the report card's frequency tile. */
const dayLabel = (day: number): string =>
	DAY_OPTIONS.find((option) => option.value === String(day))?.label ?? '';

/** Human wording for a row's real `trigger_config.frequency` (+ `day_of_week`) - the mockup's own "Every day"/"Every Monday". */
const frequencyLabel = (config: BuiltinTriggerConfig): string => {
	switch (config.frequency) {
		case 'daily':
			return __('Every day', 'vulopilot');
		case 'weekly':
			return sprintf(
				/* translators: %s is a weekday name, e.g. "Monday". */
				__('Every %s', 'vulopilot'),
				dayLabel(config.day_of_week ?? 1)
			);
		case 'monthly':
			return __('Every month', 'vulopilot');
		case 'manual':
			return __('Manual only', 'vulopilot');
		default:
			return __('Not scheduled', 'vulopilot');
	}
};

/** "Today, 9:00 AM" / "September 17, 2026" + time - same real site-timezone formatting helpers the rest of this page already uses. */
const formatRunTime = (isoDate: string): { primary: string; secondary: string } => {
	const time = formatWpTime(isoDate);

	if (isWpToday(isoDate)) {
		return { primary: __('Today', 'vulopilot'), secondary: time };
	}

	return { primary: formatWpDate(isoDate), secondary: time };
};

interface InfoTileProps {
	icon: string;
	label: string;
	value: string;
	sub?: string;
}

const InfoTile = ({ icon, label, value, sub }: InfoTileProps) => (
	<div className="builtin-automation-tile">
		<span className="builtin-automation-tile-icon">
			<i className={`adminfont-${icon}`} />
		</span>
		<div>
			<div className="builtin-automation-tile-label">{label}</div>
			<strong className="builtin-automation-tile-value">{value}</strong>
			{sub && <div className="builtin-automation-tile-sub">{sub}</div>}
		</div>
	</div>
);

interface BuiltinAutomationCardProps {
	row: BuiltinRow;
	kind: 'scan' | 'report';
	title: string;
	description: string;
	frequencyOptions: { label: string; value: string }[];
	onChanged: () => void;
	/** Real DOM id `Automations.tsx`'s own deep-link scroll target looks up (`builtin-automation-${templateId}`) - set directly on this card's own `CardComponent` instead of a wrapping `<div>`. */
	id: string;
	/** Briefly true while this card is the deep-linked/highlighted one - added onto `CardComponent`'s own `className` instead of a wrapping `<div>`. */
	isHighlighted: boolean;
}

const BuiltinAutomationCard = ({
	row,
	kind,
	title,
	description,
	frequencyOptions,
	onChanged,
	id,
	isHighlighted,
}: BuiltinAutomationCardProps) => {
	const [isRunning, setIsRunning] = useState(false);
	const config = parseTriggerConfig(row);
	const isEnabled = 'enabled' === row.status;

	const patch = (data: Record<string, unknown>) => {
		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, `automations/${row.id}`), data).then(
			(response) => {
				if (response) {
					onChanged();
				}
			}
		);
	};

	const handleToggle = () => {
		patch({ status: isEnabled ? 'disabled' : 'enabled' });
	};

	const handleFrequencyChange = (value: string) => {
		const nextConfig: BuiltinTriggerConfig = { frequency: value };

		if ('weekly' === value) {
			nextConfig.day_of_week = config.day_of_week ?? 1;
		}

		patch({ trigger_config: nextConfig });
	};

	const handleDayChange = (value: string) => {
		patch({ trigger_config: { frequency: config.frequency, day_of_week: Number(value) } });
	};

	const handleRunNow = () => {
		setIsRunning(true);

		sendApiResponse(vulopilotAppLocalizer, getApiLink(vulopilotAppLocalizer, `automations/${row.id}/run`), {})
			.then((response) => {
				if (response) {
					onChanged();
				}
			})
			.finally(() => setIsRunning(false));
	};

	const nextRun = row.next_run_at ? formatRunTime(row.next_run_at) : null;
	const lastRun = row.last_run_finished_at ? formatRunTime(row.last_run_finished_at) : null;

	// The report card's primary button is "Enable report" while it's off (the
	// mockup's own wording) and only becomes a real "send now" once enabled;
	// the scan card's is always "Run scan now".
	const isEnableAction = 'report' === kind && !isEnabled;
	let primaryText = 'scan' === kind ? __('Run scan now', 'vulopilot') : __('Send report now', 'vulopilot');

	if (isEnableAction) {
		primaryText = __('Enable report', 'vulopilot');
	} else if (isRunning) {
		primaryText = __('Running…', 'vulopilot');
	}

	return (
		<CardComponent
			id={id}
			className={`builtin-automation-card${isHighlighted ? ' builtin-automation-card-highlighted' : ''}`}
			title={
				<>
					{title}
					<span className={`admin-badge ${isEnabled ? 'green' : 'gray'}`}>
						{isEnabled ? __('Active', 'vulopilot') : __('Not active', 'vulopilot')}
					</span>
				</>
			}
			titleIcon={'scan' === kind ? 'search' : 'mail'}
			desc={description}
			action={
				<MultiCheckboxInput
					look="toggle"
					options={[{ key: `automation-${row.id}-enabled`, value: 'enabled', label: '' }]}
					value={isEnabled ? ['enabled'] : []}
					onChange={handleToggle}
					modules={[]}
				/>
			}
		>
			<div className="builtin-automation-tiles">
				<InfoTile
					icon="mail"
					label={'scan' === kind ? __('Scan frequency', 'vulopilot') : __('Report frequency', 'vulopilot')}
					value={frequencyLabel(config)}
				/>
				{'scan' === kind ? (
					nextRun ? (
						<InfoTile
							icon="clock"
							label={__('Next scan', 'vulopilot')}
							value={nextRun.primary}
							sub={nextRun.secondary}
						/>
					) : (
						<InfoTile
							icon="clock"
							label={__('Last scan', 'vulopilot')}
							value={lastRun ? lastRun.primary : '-'}
							sub={lastRun ? lastRun.secondary : __('Not run yet', 'vulopilot')}
						/>
					)
				) : (
					<>
						<InfoTile
							icon="mail"
							label={__('Recipients', 'vulopilot')}
							value={__('Admin email', 'vulopilot')}
							sub={__('Set in Settings → Notifications', 'vulopilot')}
						/>
						<InfoTile
							icon="document"
							label={__('Last sent', 'vulopilot')}
							value={lastRun ? lastRun.primary : '-'}
							sub={lastRun ? lastRun.secondary : __('Not sent yet', 'vulopilot')}
						/>
					</>
				)}
			</div>

			<FormGroupWrapperComponent>
				<FormGroupComponent row label={__('When should this automation run?', 'vulopilot')}>
					<SelectInput
						value={config.frequency}
						size={15}
						onChange={(value) => handleFrequencyChange(value as string)}
						options={frequencyOptions}
					/>
				</FormGroupComponent>
				{'weekly' === config.frequency && (
					<FormGroupComponent row label={__('Run on', 'vulopilot')}>
						<SelectInput
							value={String(config.day_of_week ?? 1)}
							size={15}
							onChange={(value) => handleDayChange(value as string)}
							options={DAY_OPTIONS}
						/>
					</FormGroupComponent>
				)}
				{'monthly' === config.frequency && (
					<FormGroupComponent row label={__('Run on', 'vulopilot')}>
						<span className="builtin-automation-fixed-day">
							{__('1st day of every month', 'vulopilot')}
						</span>
					</FormGroupComponent>
				)}
			</FormGroupWrapperComponent>

			<ButtonInput
				possition='left'
				buttons={[
					{
						text: primaryText,
						icon: isEnableAction ? undefined : 'play-arrow',
						disabled: isRunning,
						onClick: isEnableAction ? handleToggle : handleRunNow,
					},
				]}
			/>
		</CardComponent>
	);
};

interface BuiltinAutomationCardsProps {
	/** Bumped by the host after something changes elsewhere on the page - refetches this component's own copy of the two rows. */
	refetchSignal: number;
	/** Called after this component's own mutations (toggle/frequency/run now) so sibling cards (stats, attention, activity) refetch too. */
	onChanged: () => void;
	highlightTemplateId?: string | null;
}

/** How long the matched card's own highlight flash stays visible before fading back to normal - long enough to register as "this is the one you clicked", short enough not to linger as visual noise on a page the user keeps working on. */
const HIGHLIGHT_DURATION_MS = 2500;

/**
 * The real UX the spec calls for - "Automation → Choose frequency → Save"
 * - for Free's exactly-2 built-in automations (Automations\
 * BuiltinAutomationSeeder). No template picker, no wizard: each row's own
 * `status`/`trigger_config` (JSON: `{frequency, day_of_week?}`) is the
 * entire editable surface, autosaved via the same `PATCH /automations/{id}`
 * route every other automation status-toggle already uses (now also
 * accepting `trigger_config` for these two rows specifically - see
 * Controllers\Automations::validate_builtin_trigger_config()'s own
 * docblock).
 */
const BuiltinAutomationCards = ({ refetchSignal, onChanged, highlightTemplateId }: BuiltinAutomationCardsProps) => {
	const [rows, setRows] = useState<BuiltinRow[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	/** Which card (by real template id) is currently showing the highlight flash - `null` once `HIGHLIGHT_DURATION_MS` has elapsed, or if nothing was ever deep-linked. */
	const [flashedTemplateId, setFlashedTemplateId] = useState<string | null>(null);

	// `isLoading` only starts true for the first load - refetches after a
	// toggle/frequency change/run must NOT flip it back on, since the
	// `if ( isLoading ) return null` below would unmount both cards and
	// remount them a moment later (reads as a page reload/flash).
	const fetchRows = () => {
		getApiResponse<{ data: BuiltinRow[] } | BuiltinRow[]>(
			`${getApiLink(vulopilotAppLocalizer, 'automations')}?per_page=100`,
			{ headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce } }
		)
			.then((response) => {
				const list = Array.isArray(response) ? response : (response?.data ?? []);
				setRows(
					list.filter((row) =>
						[FULL_SITE_SCAN_TRIGGER, VISIBILITY_REPORT_TRIGGER].includes(row.trigger_type)
					)
				);
			})
			.finally(() => setIsLoading(false));
	};

	// eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-fetches only on mount and when refetchSignal bumps; fetchRows is redefined every render.
	useEffect(fetchRows, [refetchSignal]);

	// Scrolls to and flashes the deep-linked card once these 2 rows have
	// really loaded (their own real DOM ids below only exist post-render) -
	// `hasHighlighted` guards this to the first successful match only, so a
	// later refetch (e.g. toggling the row itself, which bumps
	// `refetchSignal`) never re-triggers the
	// scroll/flash a second time.
	const hasHighlightedRef = useRef(false);

	useEffect(() => {
		if (hasHighlightedRef.current || isLoading || !highlightTemplateId) {
			return;
		}

		const target = document.getElementById(`builtin-automation-${highlightTemplateId}`);

		if (!target) {
			return;
		}

		hasHighlightedRef.current = true;
		target.scrollIntoView({ behavior: 'smooth', block: 'center' });
		setFlashedTemplateId(highlightTemplateId);

		const timeout = window.setTimeout(() => setFlashedTemplateId(null), HIGHLIGHT_DURATION_MS);
		return () => window.clearTimeout(timeout);
	}, [isLoading, highlightTemplateId]);

	if (isLoading) {
		return null;
	}

	const scanRow = rows.find((row) => FULL_SITE_SCAN_TRIGGER === row.trigger_type) ?? null;
	const reportRow = rows.find((row) => VISIBILITY_REPORT_TRIGGER === row.trigger_type) ?? null;

	// `onChanged` bumps the host's `refetchSignal`, which already re-runs
	// `fetchRows` through the effect above - calling it here too fetched twice.
	const handleChanged = () => {
		onChanged();
	};

	return (
		<>
			<ColumnComponent grid={6} fullHeight>
				{scanRow && (
					<BuiltinAutomationCard
						id={`builtin-automation-${TRIGGER_TYPE_TO_TEMPLATE_ID[FULL_SITE_SCAN_TRIGGER]}`}
						isHighlighted={
							flashedTemplateId === TRIGGER_TYPE_TO_TEMPLATE_ID[FULL_SITE_SCAN_TRIGGER]
						}
						row={scanRow}
						kind="scan"
						title={__('Automatic website scan', 'vulopilot')}
						description={__(
							'VuloPilot automatically scans your website and updates your insights.',
							'vulopilot'
						)}
						frequencyOptions={[
							{ label: __('Manual only', 'vulopilot'), value: 'manual' },
							{ label: __('Every day', 'vulopilot'), value: 'daily' },
							{ label: __('Every week', 'vulopilot'), value: 'weekly' },
							{ label: __('Every month', 'vulopilot'), value: 'monthly' },
						]}
						onChanged={handleChanged}
					/>
				)}
			</ColumnComponent>
			<ColumnComponent grid={6} fullHeight>
				{reportRow && (
					<BuiltinAutomationCard
						id={`builtin-automation-${TRIGGER_TYPE_TO_TEMPLATE_ID[VISIBILITY_REPORT_TRIGGER]}`}
						isHighlighted={
							flashedTemplateId === TRIGGER_TYPE_TO_TEMPLATE_ID[VISIBILITY_REPORT_TRIGGER]
						}
						row={reportRow}
						kind="report"
						title={__('Email visibility report', 'vulopilot')}
						description={__(
							"Get a summary of your website's visibility, issues, and opportunities.",
							'vulopilot'
						)}
						frequencyOptions={[
							{ label: __('Every week', 'vulopilot'), value: 'weekly' },
							{ label: __('Every month', 'vulopilot'), value: 'monthly' },
						]}
						onChanged={handleChanged}
					/>
				)}
			</ColumnComponent>
		</>
	);
};

export default BuiltinAutomationCards;
