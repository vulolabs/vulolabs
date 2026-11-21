/* global vulopilotAppLocalizer */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiResponse, getApiLink } from '@zyra/core';
import { __ } from '@wordpress/i18n';
import type { CategoryCount, QueryProps } from '@zyra/table';

export interface ApiListResult<T> {
	data: T[];
	total: number;
	/** `[{value, label, count},...]`, one entry per `categoryFilter.options` entry. */
	categoryCounts: CategoryCount[];
	isLoading: boolean;
	error: string | null;
	/** `{ silent: true }` reloads in the background. */
	 
	// eslint-disable-next-line no-unused-vars
	refetch: (options?: { silent?: boolean }) => void;
	/** Pass straight through to TableCard's `onQueryUpdate` prop. */
	// Base no-unused-vars doesn't understand TS function-type parameters; @typescript-eslint's does.
	 
	// eslint-disable-next-line no-unused-vars
	onQueryUpdate: (query: TableCardQuery) => void;
}

/** zyra TableCard's query state, which this hook forwards to the REST request. */
type TableCardQuery = QueryProps;

/** A status-like categorical dimension a list page wants surfaced as a TableCard status-count pill bar. */
export interface CategoryFilterConfig {
	key: string;
	options: { label: string; value: string }[];
}

type ListResponse<T> = T[] | { data?: T[]; total?: number; [key: string]: unknown };

/**
 * Fetches a VuloPilot REST list endpoint.
 *
 * @param endpoint REST resource path relative to the vulopilot/v1 namespace.
 * @param params Optional static query params.
 * @param categoryFilter Optional status-count pill bar config.
 * @param enabled When false, no request is made.
 */
export const useApiList = <T = Record<string, unknown>>(
	endpoint: string,
	params: Record<string, string | number | undefined> = {},
	categoryFilter?: CategoryFilterConfig,
	enabled = true
): ApiListResult<T> => {
	const [data, setData] = useState<T[]>([]);
	const [total, setTotal] = useState(0);
	const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState(0);
	// Set by a `refetch({ silent: true })` call, consumed by the next fetch.
	const silentRef = useRef(false);
	// Matches TableCard's own initial `{ paged: 1, per_page: 10 }` state (zyra's TableCard.tsx).
	const [tableQuery, setTableQuery] = useState<TableCardQuery>({
		paged: 1,
		per_page: 10,
	});

	const onQueryUpdate = useCallback((query: TableCardQuery) => {
		setTableQuery(query);
	}, []);

	const mergedParams: Record<string, string | number | undefined> = {
		...params,
		page: tableQuery.paged,
		// A caller-supplied static per_page wins over tableQuery's own per_page.
		per_page: params.per_page ?? tableQuery.per_page,
		search: tableQuery.searchValue,
		orderby: tableQuery.orderby || params.orderby,
		order: tableQuery.order || params.order,
		...(categoryFilter && tableQuery.categoryFilter !== 'all'
			? { [categoryFilter.key]: tableQuery.categoryFilter }
			: {}),
		...tableQuery.filter,
	};

	const query = Object.entries(mergedParams)
		.filter(([, value]) => value !== undefined && value !== '')
		.map(
			([key, value]) => `${key}=${encodeURIComponent(String(value))}`
		)
		.join('&');

	useEffect(() => {
		if (!enabled) {
			setIsLoading(false);
			return undefined;
		}

		let cancelled = false;
		const isSilent = silentRef.current;
		silentRef.current = false;

		if (!isSilent) {
			setIsLoading(true);
		}
		setError(null);

		// getApiLink() already returns a URL containing its own `?` on sites with plain permalinks (rest_url() resolves to `index.php?rest_route=/…`).
		const baseUrl = getApiLink(vulopilotAppLocalizer, endpoint);
		const separator = baseUrl.includes('?') ? '&' : '?';
		const url = baseUrl + (query ? `${separator}${query}` : '');

		getApiResponse<ListResponse<T>>(url, {
			headers: { 'X-WP-Nonce': vulopilotAppLocalizer.nonce },
		})
			.then((response) => {
				if (cancelled) {
					return;
				}

				if (!response) {
					setError(
						__(
							'Something went wrong while loading this data.',
							'vulopilot'
						)
					);
					setData([]);
					setTotal(0);
					setCategoryCounts([]);
					return;
				}

				const list = Array.isArray(response)
					? response
					: (response.data ?? []);
				const rowTotal = Array.isArray(response)
					? list.length
					: (response.total ?? list.length);

				setData(list);
				setTotal(rowTotal);

				if (categoryFilter && !Array.isArray(response)) {
					const counts =
						(response[`${categoryFilter.key}_counts`] as Record<
							string,
							number
						>) ?? {};

					setCategoryCounts(
						categoryFilter.options.map((option) => ({
							value: option.value,
							label: option.label,
							count: counts[option.value] ?? 0,
						}))
					);
				}
			})
			.finally(() => {
				if (!cancelled) {
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [endpoint, query, reloadToken, enabled]);

	const refetch = useCallback((options?: { silent?: boolean }) => {
		silentRef.current = Boolean(options?.silent);
		setReloadToken((n) => n + 1);
	}, []);

	return {
		data,
		total,
		categoryCounts,
		isLoading,
		error,
		refetch,
		onQueryUpdate,
	};
};
