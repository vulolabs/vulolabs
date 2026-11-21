/** One row of free's `GET /automations` (classes/Automations/Rest/Automations.php). */
export interface AutomationRow {
	id: number;
	name: string;
	category: string;
	trigger_type: string;
	/** JSON: `{ frequency, day_of_week? }` for the two built-ins. */
	trigger_config: string | null;
	status: 'enabled' | 'disabled' | 'draft';
	last_triggered_at: string | null;
	last_run_status: 'running' | 'completed' | 'failed' | null;
	/** Set for scheduled triggers only. */
	next_run_at: string | null;
	last_run_finished_at: string | null;
}

/** Automations\BuiltinAutomationSeeder's two trigger types - the only automations free has. */
export const SCAN_TRIGGER = 'free_full_site_scan';
export const REPORT_TRIGGER = 'free_visibility_report';
