<?php
/**
 * ProviderRegistry class file.
 *
 * @package VuloMail
 */

namespace VuloMail\Connections;

use VuloMail\Email\Mailers;
use VuloMail\Security\HttpClient;
use VuloMail\Sms\Gateways;
use VuloMail\Utill;

defined( 'ABSPATH' ) || exit;

/**
 * Knows which provider adapters exist for each channel and builds them from a saved connection.
 */
class ProviderRegistry {

	/**
	 * HTTP client handed to every API adapter.
	 *
	 * @var HttpClient
	 */
	private $http;

	/**
	 * Constructor.
	 *
	 * @param HttpClient|null $http HTTP client handed to every API adapter.
	 */
	public function __construct( $http = null ) {
		$this->http = $http ? $http : new HttpClient();
	}

	/**
	 * Provider id => adapter class for a channel.
	 *
	 * @param string $channel Utill::CHANNEL_EMAIL or Utill::CHANNEL_SMS.
	 * @return array<string, string>
	 */
	public function classes( $channel ) {
		if ( Utill::CHANNEL_SMS === $channel ) {
			$classes   = array(
				'twilio'     => Gateways\Twilio::class,
				'vonage'     => Gateways\Vonage::class,
				'plivo'      => Gateways\Plivo::class,
				'clickatell' => Gateways\Clickatell::class,
			);
			$interface = \VuloMail\Sms\GatewayInterface::class;

			/**
			 * Filters the SMS gateway adapters. Each class must implement VuloMail\Sms\GatewayInterface.
			 *
			 * @param array<string, string> $classes Provider id => class name.
			 */
			$classes = apply_filters( 'vulomail_sms_providers', $classes );
		} else {
			$classes   = array(
				'smtp'             => Mailers\Smtp::class,
				'sendgrid'         => Mailers\SendGrid::class,
				'mailgun'          => Mailers\Mailgun::class,
				'brevo'            => Mailers\Brevo::class,
				'postmark'         => Mailers\Postmark::class,
				'elastic_email'    => Mailers\ElasticEmail::class,
				'mailjet'          => Mailers\Mailjet::class,
				'mailersend'       => Mailers\MailerSend::class,
				'maileroo'         => Mailers\Maileroo::class,
				'mailtrap'         => Mailers\Mailtrap::class,
				'mandrill'         => Mailers\Mandrill::class,
				'netcore'          => Mailers\Netcore::class,
				'resend'           => Mailers\Resend::class,
				'sendlayer'        => Mailers\SendLayer::class,
				'sparkpost'        => Mailers\SparkPost::class,
				'smtp2go'          => Mailers\Smtp2Go::class,
				'zeptomail'        => Mailers\ZeptoMail::class,
				'socketlabs'       => Mailers\SocketLabs::class,
				'sendpulse'        => Mailers\SendPulse::class,
				'bird'             => Mailers\Bird::class,
				'mailercloud'      => Mailers\Mailercloud::class,
				'sweego'           => Mailers\Sweego::class,
				'emailit'          => Mailers\Emailit::class,
				'gmail'            => Mailers\Gmail::class,
				'google_workspace' => Mailers\GoogleWorkspaceSmtp::class,
				'outlook'          => Mailers\OutlookSmtp::class,
				'microsoft365'     => Mailers\Microsoft365Smtp::class,
				'zoho_mail'        => Mailers\ZohoSmtp::class,
				'yahoo'            => Mailers\YahooSmtp::class,
				'icloud'           => Mailers\IcloudSmtp::class,
				'aol'              => Mailers\AolSmtp::class,
				'yandex'           => Mailers\YandexSmtp::class,
				'fastmail'         => Mailers\FastmailSmtp::class,
				'titan'            => Mailers\TitanSmtp::class,
				'purelymail'       => Mailers\PurelymailSmtp::class,
				'migadu'           => Mailers\MigaduSmtp::class,
				'namecheap'        => Mailers\NamecheapSmtp::class,
				'rackspace'        => Mailers\RackspaceSmtp::class,
				'amazon_ses'       => Mailers\AmazonSesSmtp::class,
				'amazon_workmail'  => Mailers\AmazonWorkmailSmtp::class,
				'cloudflare'       => Mailers\CloudflareSmtp::class,
			);
			$interface = \VuloMail\Email\MailerInterface::class;

			/**
			 * Filters the email provider adapters. Each class must implement VuloMail\Email\MailerInterface.
			 *
			 * @param array<string, string> $classes Provider id => class name.
			 */
			$classes = apply_filters( 'vulomail_email_providers', $classes );
		}

		$valid = array();

		foreach ( (array) $classes as $id => $class ) {
			if ( is_string( $class ) && class_exists( $class ) && is_subclass_of( $class, $interface ) ) {
				$valid[ sanitize_key( $id ) ] = $class;
			}
		}

		return $valid;
	}

	/**
	 * Field schema for one provider, as rendered by the connection form.
	 *
	 * @param string $channel  Channel.
	 * @param string $provider Provider id.
	 * @return array|null
	 */
	public function definition( $channel, $provider ) {
		$classes = $this->classes( $channel );

		if ( ! isset( $classes[ $provider ] ) ) {
			return null;
		}

		$definition            = call_user_func( array( $classes[ $provider ], 'definition' ) );
		$definition['id']      = $provider;
		$definition['channel'] = $channel;

		return $definition;
	}

	/**
	 * Get every provider definition.
	 *
	 * @return array<int, array> Every provider definition, both channels.
	 */
	public function definitions() {
		$definitions = array();

		foreach ( array( Utill::CHANNEL_EMAIL, Utill::CHANNEL_SMS ) as $channel ) {
			foreach ( array_keys( $this->classes( $channel ) ) as $provider ) {
				$definitions[] = $this->definition( $channel, $provider );
			}
		}

		return $definitions;
	}

	/**
	 * Builds the adapter for a connection.
	 *
	 * @param string $channel  Channel.
	 * @param string $provider Provider id.
	 * @param array  $config   Decrypted connection settings.
	 * @return \VuloMail\Email\MailerInterface|\VuloMail\Sms\GatewayInterface|null
	 */
	public function make( $channel, $provider, array $config ) {
		$classes = $this->classes( $channel );

		if ( ! isset( $classes[ $provider ] ) ) {
			return null;
		}

		return new $classes[ $provider ]( $config, $this->http );
	}
}
