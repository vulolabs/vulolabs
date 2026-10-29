/* global vulomailAppLocalizer */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import { BadgeComponent } from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';
import { notify } from '../services/notify';

interface GoogleSignInProps {
	/**
	 * The site owner's own Google app fields (Client ID and Secret), shown with the setup steps in a
	 * collapsed "Advanced" section; null when the connection doesn't sign in through its own app.
	 */
	advanced: ReactNode;
	/** Whether a required own-app field is still empty, so signing in can't start yet. */
	needsSetup: boolean;
	/** Whether the connection holds a Google sign-in. */
	isConnected: boolean;
	accountEmail: string;
	isBusy: boolean;
	onSignIn: () => void;
}

const external = (href: string, label: string) => (
	<a href={href} target="_blank" rel="noopener noreferrer">
		{label}
	</a>
);

/**
 * The Gmail connection's sign-in: which Google account it sends as, the "Sign in with Google" button,
 * and, for a site using its own Google app, the one-time Google Cloud steps.
 */
const GoogleSignIn = ({
	advanced,
	needsSetup,
	isConnected,
	accountEmail,
	isBusy,
	onSignIn,
}: GoogleSignInProps) => {
	const redirectUri = vulomailAppLocalizer.google_redirect_uri;
	// Open from the start when the app is already filled in, so it can be checked or changed.
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(
		Boolean(advanced) && !needsSetup
	);

	const signIn = () => {
		if (needsSetup) {
			setIsAdvancedOpen(true);
			notify(
				'info',
				__(
					'First set up your Google app under "Advanced": follow the steps, then paste its Client ID and Client Secret.',
					'vulomail'
				),
				'vulomail-google'
			);

			return;
		}

		onSignIn();
	};
	let status = __('Not connected', 'vulomail');

	if (isConnected) {
		status = accountEmail
			? sprintf(
					/* translators: %s: Gmail address. */
					__('Connected as %s', 'vulomail'),
					accountEmail
				)
			: __('Connected', 'vulomail');
	}

	const copyRedirect = () => {
		navigator.clipboard
			?.writeText(redirectUri)
			.then(() =>
				notify('success', __('Redirect URI copied.', 'vulomail'))
			)
			.catch(() =>
				notify(
					'error',
					__(
						'Could not copy. Select the address and copy it yourself.',
						'vulomail'
					)
				)
			);
	};

	return (
		<div className="vulomail-google">
			<div className="vulomail-field-row">
				<div className="vulomail-field-text">
					<label>{__('Google account', 'vulomail')}</label>
					<span>
						{isConnected
							? __(
									'Email is sent from this account. Sign in again to switch accounts.',
									'vulomail'
								)
							: __(
									"Sign in with the Google account your site's email should come from.",
									'vulomail'
								)}
					</span>
				</div>
				<div className="vulomail-field-control vulomail-google-control">
					<BadgeComponent
						color={isConnected ? 'green' : 'yellow'}
						text={status}
					/>
					<ButtonInput
						buttons={{
							text: isConnected
								? __('Sign in again', 'vulomail')
								: __('Sign in with Google', 'vulomail'),
							icon: 'link',
							disabled: isBusy,
							onClick: signIn,
						}}
					/>
				</div>
			</div>
			{advanced && (
				<details
					className="vulomail-google-advanced"
					open={isAdvancedOpen}
					onToggle={(event) =>
						setIsAdvancedOpen(
							(event.currentTarget as HTMLDetailsElement).open
						)
					}
				>
					<summary>
						{__('Advanced: use your own Google app', 'vulomail')}
					</summary>
					{advanced}
					<div className="vulomail-google-steps">
						<p className="vulomail-google-steps-title">
							{__(
								'Set up your Google app (one time, about 5 minutes)',
								'vulomail'
							)}
						</p>
						<ol>
							<li>
								{external(
									'https://console.cloud.google.com/projectcreate',
									__(
										'Create a Google Cloud project',
										'vulomail'
									)
								)}
								{__(
									' (any name, for example "My site email").',
									'vulomail'
								)}
							</li>
							<li>
								{external(
									'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
									__('Turn on the Gmail API', 'vulomail')
								)}
								{__(' for that project.', 'vulomail')}
							</li>
							<li>
								{external(
									'https://console.cloud.google.com/auth/overview',
									__('Set up the consent screen', 'vulomail')
								)}
								{__(
									': choose "External", fill in the app name and your email, then under Audience click "Publish app". While it stays in "Testing", Google signs you out every 7 days.',
									'vulomail'
								)}
							</li>
							<li>
								{external(
									'https://console.cloud.google.com/auth/clients',
									__('Create an OAuth client', 'vulomail')
								)}
								{__(
									' of type "Web application", and add this as an Authorized redirect URI:',
									'vulomail'
								)}
								<span className="vulomail-google-uri">
									<code>{redirectUri}</code>
									<ButtonInput
										buttons={{
											text: __('Copy', 'vulomail'),
											icon: 'copy',
											color: 'purple',
											onClick: copyRedirect,
										}}
									/>
								</span>
							</li>
							<li>
								{__(
									'Paste the Client ID and Client Secret above, save, then click "Sign in with Google". Google may warn that the app isn\'t verified: it is your own app, so choose "Advanced" and continue.',
									'vulomail'
								)}
							</li>
						</ol>
						{!/^https:\/\//.test(redirectUri) &&
							!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(
								redirectUri
							) && (
								<p className="vulomail-google-warning">
									{__(
										'Google only accepts redirect addresses that start with https://. Switch your site to HTTPS before signing in.',
										'vulomail'
									)}
								</p>
							)}
					</div>
				</details>
			)}
		</div>
	);
};

export default GoogleSignIn;
