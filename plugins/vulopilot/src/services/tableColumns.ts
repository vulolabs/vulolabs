import type { ReactNode } from 'react';
import type { ActionItem, TableHeaderConfig, TableRow } from '@zyra/table';

/**
 * Typed column and row helpers for zyra's TableCard. zyra calls a column's `render`, and a row action's callbacks,
 * with the row objects the list passed in, but types them as its own loose `TableRow` / `Record<string, unknown>`,
 * and its `TableHeaderConfig` leaves out `key` although `renderCell()` reads `row[header.key]`. These let a list
 * describe its columns against its own row type; at runtime both helpers return what they are given.
 */

/* eslint-disable no-unused-vars -- parameter names in type signatures, not variables. */

/** A row action whose callbacks receive the list's own row type. */
export type RowAction<Row> = Omit<ActionItem, 'label' | 'icon' | 'onClick' | 'color' | 'hidden'> & {
	label?: string | ((row: Row) => string);
	icon?: ReactNode | ((row: Row) => string);
	onClick: (row: Row) => void;
	color?: string | ((row: Row) => string);
	hidden?: (row: Row) => boolean;
};

/** A column as zyra reads it: its header config plus `key`, with `render` and `actions` typed to the row. */
export type Column<Row> = Omit<TableHeaderConfig, 'render' | 'actions'> & {
	key?: string;
	render?: (row: Row) => ReactNode;
	actions?: RowAction<Row>[];
};

/* eslint-enable no-unused-vars */

export const columns = <Row>(headers: Record<string, Column<Row>>): Record<string, TableHeaderConfig> =>
	headers as unknown as Record<string, TableHeaderConfig>;

export const tableRows = <Row extends object>(rows: Row[]): TableRow[] => rows as unknown as TableRow[];
