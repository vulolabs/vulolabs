import React from 'react';
import { ButtonInput } from '@zyra/inputs';
import infoBannerBg from '../assets/images/info-banner-bg.png';
import infoBanner from '../assets/images/info-banner.png';
import './InfoBanner.scss';

interface InfoBannerProps {
	/** adminfont icon name shown in the leading circle badge (e.g. `'info'`). */
	icon?: string;
	title: React.ReactNode;
	desc: React.ReactNode;
	actionLabel?: string;
	onAction?: () => void;
	/** Omit for a non-dismissible banner - no close control rendered at all. */
	onDismiss?: () => void;
	/** Colours the icon badge: a state that needs action (`warn`) or is fine (`good`). */
	tone?: 'info' | 'warn' | 'good';
	/** A pill beside the title, e.g. "Not enabled". */
	badge?: React.ReactNode;
	/** Short facts under the description. */
	meta?: React.ReactNode[];
	/** A quieter second action beside the main one. */
	secondaryAction?: { label: string; onClick: () => void };
}

/** Shared full-width illustrated banner with a background pattern and right-side illustration. */
const InfoBanner: React.FC<InfoBannerProps> = ({
	icon = 'info',
	title,
	desc,
	actionLabel,
	onAction,
	onDismiss,
	tone = 'info',
	badge,
	meta = [],
	secondaryAction,
}) => {
	return (
		<div
			className={`info-banner is-${tone}`}
			style={{ backgroundImage: `url(${infoBannerBg})` }}
		>
			{onDismiss && (
				<i
					className="adminfont-close info-banner-close"
					role="button"
					tabIndex={0}
					onClick={onDismiss}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onDismiss();
						}
					}}
				/>
			)}

			<div className="info-banner-icon">
				<i className={`adminfont-${icon}`} />
			</div>

			<div className="info-banner-content">
				<div className="info-banner-title">
					{title}
					{badge}
				</div>
				<div className="desc">{desc}</div>
				{meta.length > 0 && (
					<ul className="info-banner-meta">
						{meta.map((item, index) => (
							<li key={index}>{item}</li>
						))}
					</ul>
				)}
			</div>

			<img className="info-banner-illustration" src={infoBanner} alt="" />

			{actionLabel && onAction && (
				<ButtonInput
					wrapperClass="info-banner-action"
					buttons={[
						...(secondaryAction
							? [{ text: secondaryAction.label, color: 'purple', onClick: secondaryAction.onClick }]
							: []),
						{
							text: actionLabel,
							rightIcon: 'pagination-right-arrow',
							color: 'purple-bg',
							onClick: onAction,
						},
					]}
				/>
			)}
		</div>
	);
};

export default InfoBanner;
