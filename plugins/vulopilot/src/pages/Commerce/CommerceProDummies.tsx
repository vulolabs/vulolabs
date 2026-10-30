import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import {
	AnalyticsComponent,
	BadgeComponent,
	CardComponent,
	ChartComponent,
	ColumnComponent,
	ListComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import DummyDataNotice from '../../components/DummyDataNotice';
import { BlurredProContent } from '../../components/UpgradeToProOverlay';

interface CommerceProDummiesProps {
	onClick: () => void;
	/** Once Pro itself is licensed, the only remaining reason `vulopilot_commerce_panel`
	 * doesn't resolve is the Commerce module being off - every card's own overlay needs
	 * to say that, not "Upgrade to Pro" (see Commerce.tsx's own docblock on this prop). */
	isModuleGate?: boolean;
}

const DummyCard = ({
	title,
	titleIcon,
	desc,
	contentClassName,
	onClick,
	action,
	children,
	isModuleGate,
}: {
	title: string;
	titleIcon: string;
	desc: string;
	contentClassName: string;
	onClick: () => void;
	action?: ReactNode;
	children: ReactNode;
	isModuleGate?: boolean;
}) => (
	<CardComponent title={title} titleIcon={titleIcon} desc={desc} action={action}>
		<BlurredProContent
			contentClassName={contentClassName}
			onClick={onClick}
			icon={isModuleGate ? 'unlock' : undefined}
			title={isModuleGate ? __('Enable Commerce module', 'vulopilot') : undefined}
			desc={
				isModuleGate
					? __(
							'Turn the Commerce module on from Settings → Modules to see this here.',
							'vulopilot'
						)
					: undefined
			}
			buttonText={isModuleGate ? __('Enable module', 'vulopilot') : undefined}
		>
			{children}
		</BlurredProContent>
		<DummyDataNotice />
	</CardComponent>
);

const DUMMY_REVENUE = [
	{ day: __('Day 1', 'vulopilot'), revenue: 320 },
	{ day: __('Day 2', 'vulopilot'), revenue: 410 },
	{ day: __('Day 3', 'vulopilot'), revenue: 380 },
	{ day: __('Day 4', 'vulopilot'), revenue: 520 },
	{ day: __('Day 5', 'vulopilot'), revenue: 610 },
	{ day: __('Day 6', 'vulopilot'), revenue: 570 },
	{ day: __('Day 7', 'vulopilot'), revenue: 690 },
];

const DUMMY_TILES: { icon: string; title: string; desc: string }[] = [
	{ icon: 'shield', title: __('Store Readiness', 'vulopilot'), desc: __('Shop, cart, checkout & my account pages.', 'vulopilot') },
	{ icon: 'cash', title: __('Checkout & Payments', 'vulopilot'), desc: __('Payment methods & failed orders.', 'vulopilot') },
	{ icon: 'cart', title: __('Products', 'vulopilot'), desc: __('Pricing, stock, images & product info.', 'vulopilot') },
	{ icon: 'database', title: __('Inventory', 'vulopilot'), desc: __('Out of stock & running low.', 'vulopilot') },
	{ icon: 'order', title: __('Orders', 'vulopilot'), desc: __('Failed, on hold & pending too long.', 'vulopilot') },
	{ icon: 'price', title: __('Coupons', 'vulopilot'), desc: __('Active & expiring soon.', 'vulopilot') },
	{ icon: 'person', title: __('Customer Insights', 'vulopilot'), desc: __('Total customers.', 'vulopilot') },
	{ icon: 'bar-chart', title: __('Revenue Reports', 'vulopilot'), desc: __('Today, this week, and this month.', 'vulopilot') },
];

const CommerceProDummies = ({ onClick, isModuleGate }: CommerceProDummiesProps) => (
	<>
		<ColumnComponent fullHeight grid={6}>
			<DummyCard
				title={__('Bulk AI optimization', 'vulopilot')}
				titleIcon="ai"
				desc={__('Select an AI action and a batch of products - each product gets its own proposal to review.', 'vulopilot')}
				contentClassName="commerce-dummy-bulk"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				<div className="commerce-dummy-field">{__('Rewrite product title', 'vulopilot')}</div>
				<div className="commerce-dummy-field">{__('Search products by name…', 'vulopilot')}</div>
				<ButtonInput
					position="left"
					buttons={{ text: __('Run bulk optimization', 'vulopilot'), icon: 'ai', disabled: true, onClick: () => {} }}
				/>
			</DummyCard>
		</ColumnComponent>

		<ColumnComponent fullHeight grid={6}>
			<DummyCard
				title={__('At a Glance', 'vulopilot')}
				titleIcon="analytics"
				desc={__("Your store's key numbers for the selected period.", 'vulopilot')}
				contentClassName="commerce-dummy-glance"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				<ChartComponent
					type="dynamic-line"
					data={DUMMY_REVENUE}
					dataKey="revenue"
					xKey="day"
					height={180}
				/>
				<AnalyticsComponent
					variant="small"
					cols={3}
					data={[
						{ icon: 'price green', number: '$12,480', text: __('Total Revenue', 'vulopilot') },
						{ icon: 'cart blue', number: '86', text: __('Orders', 'vulopilot') },
						{ icon: 'bar-chart orange', number: '$145', text: __('Average Order Value', 'vulopilot') },
					]}
				/>
			</DummyCard>
		</ColumnComponent>

		<ColumnComponent>
			<DummyCard
				title={__('Store performance', 'vulopilot')}
				titleIcon="cart"
				desc={__('Key areas of your WooCommerce store at a glance.', 'vulopilot')}
				contentClassName="commerce-locked-preview"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				{DUMMY_TILES.map((tile) => (
					<div className="commerce-locked-tile" key={tile.title}>
						<i className={`adminfont-${tile.icon}`} />
						<div className="commerce-locked-tile-title">{tile.title}</div>
						<div className="commerce-locked-tile-desc">{tile.desc}</div>
					</div>
				))}
			</DummyCard>
		</ColumnComponent>

		<ColumnComponent fullHeight grid={4}>
			<DummyCard
				title={__('AI Sales Optimizer', 'vulopilot')}
				titleIcon="ai"
				desc={__('Real cross-sell, upsell, and bundle opportunities across your store.', 'vulopilot')}
				contentClassName="commerce-dummy-optimizer"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				<AnalyticsComponent
					variant="small"
					cols={3}
					data={[
						{ icon: 'price green', number: '12', text: __('Cross-sell opportunities', 'vulopilot') },
						{ icon: 'bar-chart orange', number: '7', text: __('Upsell opportunities', 'vulopilot') },
						{ icon: 'cart blue', number: '4', text: __('Bundle opportunities', 'vulopilot') },
					]}
				/>
			</DummyCard>
		</ColumnComponent>

		<ColumnComponent fullHeight grid={4}>
			<DummyCard
				title={__('Store Intelligence', 'vulopilot')}
				titleIcon="ai"
				desc={__("Real, actionable insights about your store's revenue and products.", 'vulopilot')}
				contentClassName="commerce-dummy-intelligence"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				<ListComponent
					className="mini-card report"
					items={[
						{ id: 'i1', icon: 'cart', title: __('(Example insight 1) Top product is trending up', 'vulopilot') },
						{ id: 'i2', icon: 'price', title: __('(Example insight 2) Coupon usage is rising', 'vulopilot') },
						{ id: 'i3', icon: 'order', title: __('(Example insight 3) Orders peak on weekends', 'vulopilot') },
					]}
				/>
			</DummyCard>
		</ColumnComponent>

		<ColumnComponent fullHeight grid={4}>
			<DummyCard
				title={__('AI Sales Assistant', 'vulopilot')}
				titleIcon="ai"
				desc={__('Real open WooCommerce findings, summarized.', 'vulopilot')}
				contentClassName="commerce-dummy-assistant"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				<div className="desc">
					{__('(Example) 5 findings could be affecting sales. I can help optimize a batch of products with AI.', 'vulopilot')}
				</div>
				<ButtonInput
					position="left"
					buttons={{ text: __('Let AI Optimize My Store', 'vulopilot'), icon: 'ai', disabled: true, onClick: () => {} }}
				/>
			</DummyCard>
		</ColumnComponent>

		<ColumnComponent grid={6}>
			<DummyCard
				title={__('All WooCommerce Issues', 'vulopilot')}
				titleIcon="error"
				desc={__('Findings from your most recent scans, grouped by check.', 'vulopilot')}
				contentClassName="commerce-dummy-issues"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				<ListComponent
					className="mini-card report"
					items={[
						{ id: 'f1', icon: 'cart', title: __('(Example product 1) is missing a price', 'vulopilot') },
						{ id: 'f2', icon: 'cash', title: __('(Example finding 2) Test mode is on for payments', 'vulopilot') },
						{ id: 'f3', icon: 'order', title: __('(Example finding 3) 2 orders on hold too long', 'vulopilot') },
					]}
				/>
			</DummyCard>
		</ColumnComponent>

		<ColumnComponent grid={6}>
			<DummyCard
				title={__('Stockout risk', 'vulopilot')}
				titleIcon="database"
				desc={__('Products projected to run out of stock soon.', 'vulopilot')}
				contentClassName="commerce-dummy-stockout"
				onClick={onClick}
				isModuleGate={isModuleGate}
			>
				<ListComponent
					className="mini-card report"
					items={[
						{ id: 's1', icon: 'cart purple', title: __('(Example product 1)', 'vulopilot'), tags: <BadgeComponent color="red" text={__('3 days left', 'vulopilot')} /> },
						{ id: 's2', icon: 'cart purple', title: __('(Example product 2)', 'vulopilot'), tags: <BadgeComponent color="orange" text={__('6 days left', 'vulopilot')} /> },
						{ id: 's3', icon: 'cart purple', title: __('(Example product 3)', 'vulopilot'), tags: <BadgeComponent color="green" text={__('9 days left', 'vulopilot')} /> },
					]}
				/>
			</DummyCard>
		</ColumnComponent>
	</>
);

export default CommerceProDummies;
