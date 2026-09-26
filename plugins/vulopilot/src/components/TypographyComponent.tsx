import type { ElementType, ReactNode } from 'react';

interface TypographyComponentProps {
	/** Which real HTML tag to render as - defaults to 'div'. */
	as?: ElementType;
	variant?: string;
	className?: string;
	children?: ReactNode;
	/** Forwarded to the real rendered tag as-is - e.g. BrokenLinksSection.tsx's own `onClick={toggleRowExpansion}` on an `as="span"` real click target. */
	[extraProp: string]: unknown;
}

const TypographyComponent = ({
	as: Tag = 'div',
	variant,
	className,
	children,
	...rest
}: TypographyComponentProps) => {
	const classes = [variant ? `typography-${variant}` : '', className]
		.filter(Boolean)
		.join(' ');

	return (
		<Tag className={classes || undefined} {...rest}>
			{children}
		</Tag>
	);
};

export default TypographyComponent;
