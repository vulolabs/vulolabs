/* global vulocartLocalizer */
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { getApiLink, getApiResponse, sendApiResponse } from '@zyra/core';
import {
	FormGroupWrapperComponent,
	SectionComponent,
	NoticeManager,
	PopupComponent,
} from '@zyra/components';
import { ButtonInput } from '@zyra/inputs';

interface VuloCloudStatus {
	connected: boolean;
	configured: boolean;
	credits: number;
	buy_credits_url: string;
}

const nonceHeaders = { headers: { 'X-WP-Nonce': vulocartLocalizer.nonce } };

/**
 * Settings → Integrations, VuloCloud AI section. AI is served by VuloCloud: connect this site once and requests run
 * on the connected Organization's AI key and credits; there is no provider or API key to enter here. VuloCloud
 * redirects back to this URL with `connect_status=connected|error` (classes/AI/ConnectBrokerCallbackHandler.php).
 */
const VuloCloudAiPanel = () => {
	const [ status, setStatus ] = useState< VuloCloudStatus >( {
		connected: false,
		configured: false,
		credits: 0,
		buy_credits_url: '',
	} );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ isConnecting, setIsConnecting ] = useState( false );
	const [ isDisconnecting, setIsDisconnecting ] = useState( false );
	const [ confirmDisconnect, setConfirmDisconnect ] = useState( false );

	const load = () => {
		setIsLoading( true );

		getApiResponse< { vulocloud_status: VuloCloudStatus } >( getApiLink( vulocartLocalizer, 'vulocloud-ai-connection' ), nonceHeaders )
			.then( ( response ) => {
				if ( response ) {
					setStatus( response.vulocloud_status );
				}
			} )
			.finally( () => setIsLoading( false ) );
	};

	useEffect( load, [] );

	useEffect( () => {
		const params = new URLSearchParams( window.location.hash.split( '?' )[ 1 ] || window.location.hash.substring( 1 ) );
		const connectStatus = params.get( 'connect_status' );

		if ( 'connected' === connectStatus ) {
			NoticeManager.add( {
				uniqueKey: 'vulocart-connect-broker-connected',
				type: 'success',
				position: 'float',
				message: __( 'Connected to VuloCloud.', 'vulocart' ),
			} );
		} else if ( 'error' === connectStatus ) {
			NoticeManager.add( {
				uniqueKey: 'vulocart-connect-broker-failed',
				type: 'error',
				position: 'float',
				message: __( 'Could not connect to VuloCloud. Please try again.', 'vulocart' ),
			} );
		}
	}, [] );

	const handleConnect = () => {
		setIsConnecting( true );

		getApiResponse< { url: string } >( getApiLink( vulocartLocalizer, 'vulocloud-ai-connection/broker-authorize-url' ), nonceHeaders )
			.then( ( response ) => {
				if ( response?.url ) {
					window.location.href = response.url;
					return;
				}

				setIsConnecting( false );
				NoticeManager.add( {
					uniqueKey: 'vulocart-connect-broker-unavailable',
					type: 'error',
					position: 'float',
					message: __( 'VuloCloud isn’t configured for this build yet.', 'vulocart' ),
				} );
			} )
			.catch( () => setIsConnecting( false ) );
	};

	const handleDisconnect = () => {
		setConfirmDisconnect( false );
		setIsDisconnecting( true );

		sendApiResponse( vulocartLocalizer, getApiLink( vulocartLocalizer, 'vulocloud-ai-connection/disconnect' ), {} )
			.then( ( response ) => {
				NoticeManager.add( {
					uniqueKey: 'vulocart-vulocloud-disconnected',
					type: response ? 'success' : 'error',
					position: 'float',
					message: response
						? __( 'Disconnected from VuloCloud.', 'vulocart' )
						: __( 'Could not disconnect from VuloCloud.', 'vulocart' ),
				} );

				if ( response ) {
					load();
				}
			} )
			.finally( () => setIsDisconnecting( false ) );
	};

	const badgeColor = ! status.connected ? 'red' : status.configured ? 'green' : 'orange';
	const badgeText = ! status.connected
		? __( 'Not Connected', 'vulocart' )
		: status.configured
			? __( 'Connected', 'vulocart' )
			: __( 'Awaiting AI key', 'vulocart' );
	const description = ! status.connected
		? __( 'Connect this site to VuloCloud to use the AI key managed by your Organization.', 'vulocart' )
		: status.configured
			? __( 'Connected - AI requests run on your Organization’s AI key and use your AI credits.', 'vulocart' )
			: __( 'Connected to VuloCloud, but your Organization hasn’t configured an AI key yet. Ask your Organization to add one.', 'vulocart' );

	return (
		<>
			<div className="settings-section-group">
				<div className="settings-left-section">
					<SectionComponent
						icon="ai"
						title={ __( 'VuloCloud AI', 'vulocart' ) }
						desc={ __( 'Connect VuloCloud AI to power AI features across VuloCart. No API key is needed on this site.', 'vulocart' ) }
					/>
				</div>
				<div className="settings-right-section">
				<FormGroupWrapperComponent>
					{ isLoading ? (
						<div className="desc">{ __( 'Loading…', 'vulocart' ) }</div>
					) : (
						<div className="common-card">
							<div className="common-card-header">
								<i className="common-card-icon adminfont-ai zyra-orange" />
								<div className="common-card-content">
									<div className="common-card-title">
										{ __( 'VuloCloud AI', 'vulocart' ) }
										<span className={ `admin-badge ${ badgeColor }` }>{ badgeText }</span>
									</div>
									<div className="common-card-desc">{ description }</div>
									{ status.connected && status.configured && (
										<div className="common-card-desc">
											{ __( 'AI credits remaining:', 'vulocart' ) } <strong>{ status.credits }</strong>
											{ status.buy_credits_url && (
												<>
													{ ' · ' }
													<a href={ status.buy_credits_url } target="_blank" rel="noopener noreferrer">
														{ __( 'Buy credits', 'vulocart' ) }
													</a>
												</>
											) }
										</div>
									) }
								</div>
								{ ! status.connected ? (
									<ButtonInput
										buttons={ {
											text: isConnecting ? __( 'Connecting…', 'vulocart' ) : __( 'Connect to VuloCloud', 'vulocart' ),
											icon: 'link',
											color: 'orange-bg',
											disabled: isConnecting,
											onClick: handleConnect,
										} }
									/>
								) : (
									<ButtonInput
										buttons={ {
											text: isDisconnecting ? __( 'Disconnecting…', 'vulocart' ) : __( 'Disconnect', 'vulocart' ),
											icon: 'close',
											color: 'text-red',
											disabled: isDisconnecting,
											onClick: () => setConfirmDisconnect( true ),
										} }
									/>
								) }
							</div>
						</div>
					) }
				</FormGroupWrapperComponent>
				</div>
			</div>
			<PopupComponent position="lightbox" open={ confirmDisconnect } onClose={ () => setConfirmDisconnect( false ) } width={ 31.25 } height="auto">
				<div className="popup-confirm">
					<i className="popup-icon adminfont-suspended admin-badge red"></i>
					<div className="title">{ __( 'Disconnect VuloCloud', 'vulocart' ) }</div>
					<div className="desc">
						{ __( 'Disconnect this site from VuloCloud? AI features will stop working until you connect again.', 'vulocart' ) }
					</div>
					<ButtonInput
						position="center"
						buttons={ [
							{ icon: 'close', text: __( 'Cancel', 'vulocart' ), color: 'red', onClick: () => setConfirmDisconnect( false ) },
							{ icon: 'delete', text: __( 'Disconnect', 'vulocart' ), onClick: handleDisconnect },
						] }
					/>
				</div>
			</PopupComponent>
		</>
	);
};

export default VuloCloudAiPanel;
