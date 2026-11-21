// '@zyra/table' as tsconfig.json resolves it: zyra's own exports, with the types corrected to what its runtime does.
// - TableCard's `hideHeader` is a real prop (it defaults to `variant === 'transparent'`) that zyra's types leave out.
// - `emptyMessage` is rendered as the empty state's title, so any node works, not only a string.
// - The query TableCard reports through `onQueryUpdate` carries `searchValue` (the search box), which zyra's
//   `QueryProps` leaves out.
// Remove an entry here once zyra's published types include it.
import type { ComponentProps, FC, ReactNode } from 'react';
import type { QueryProps as ZyraQueryProps, TableCard as ZyraTableCard } from '@multivendorx/zyra';

export * from '@multivendorx/zyra';

export type QueryProps = ZyraQueryProps & {
	searchValue?: string;
};

/** One filter's value in a query: a choice, several choices, or a date range. */
export type FilterValue = NonNullable<ZyraQueryProps['filter']>[string];

export declare const TableCard: FC<
	Omit<ComponentProps<typeof ZyraTableCard>, 'emptyMessage' | 'onQueryUpdate'> & {
		hideHeader?: boolean;
		emptyMessage?: ReactNode;
		// eslint-disable-next-line no-unused-vars
		onQueryUpdate?: (query: QueryProps) => void;
	}
>;

/** TableCard's props (zyra exports the type internally only). */
export type TableCardProps = ComponentProps<typeof TableCard>;
