// WordPress packages the editor and admin load at runtime (webpack externals: wp.components, wp.data, ...).
// They are not npm dependencies of this plugin, so tsc has no types for them. The members used here are declared
// with the signatures WordPress gives them, loosely (any other prop is accepted), so callbacks are typed.
/* eslint-disable no-unused-vars */

declare module '@wordpress/data' {
	/** `select( 'core/editor' )` and friends: a store's selectors. */
	type Select = (storeName: string) => any;

	export function useSelect<T>(mapSelect: (select: Select) => T, deps?: readonly unknown[]): T;
	export function useDispatch(storeName: string): any;
	export const select: Select;
	export function dispatch(storeName: string): any;
	export function subscribe(listener: () => void): () => void;
}

declare module '@wordpress/components' {
	import type { ComponentType, KeyboardEvent, ReactNode } from 'react';

	interface Props {
		[prop: string]: any;
	}

	interface TextProps extends Props {
		onChange?: (value: string) => void;
		onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
	}

	interface DropdownRenderProps {
		isOpen: boolean;
		onToggle: () => void;
		onClose: () => void;
	}

	export const Button: ComponentType<Props>;
	export const Spinner: ComponentType<Props>;
	export const PanelBody: ComponentType<Props>;
	export const PanelRow: ComponentType<Props>;
	export const Notice: ComponentType<Props>;
	export const Modal: ComponentType<Props>;
	export const RadioControl: ComponentType<TextProps>;
	export const TextControl: ComponentType<TextProps>;
	export const TextareaControl: ComponentType<TextProps>;
	export const SelectControl: ComponentType<TextProps>;
	export const ToggleControl: ComponentType<Props & { onChange?: (checked: boolean) => void }>;
	export const Dropdown: ComponentType<
		Props & {
			renderToggle: (props: DropdownRenderProps) => ReactNode;
			renderContent: (props: DropdownRenderProps) => ReactNode;
		}
	>;
	export const TabPanel: ComponentType<
		Props & {
			children: (tab: { name: string; title: string; [key: string]: any }) => ReactNode;
		}
	>;
}

declare module '@wordpress/plugins';
declare module '@wordpress/editor';
declare module '@wordpress/edit-post';
declare module '@wordpress/blocks';
declare module '@wordpress/block-editor';
declare module '@wordpress/rich-text';
