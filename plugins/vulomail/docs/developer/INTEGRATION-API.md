# VuloMail integration API

API version: **1.0** (`VULOMAIL_API_VERSION`, `vulomail_api_version()`).

The functions, hooks and interfaces on this page are the supported surface. The minor version rises when something is added; the major version rises only on a breaking change. Anything not listed here is internal and may change.

Wait for the `vulomail_loaded` action, and guard calls so your plugin works without VuloMail:

```php
if ( function_exists( 'vulomail_send_sms' ) && vulomail_is_sms_ready() ) {
	vulomail_send_sms( $phone, $text, array( 'source' => 'my-plugin' ) );
}
```

## Functions

| Function | Returns | Notes |
|---|---|---|
| `vulomail_api_version()` | `string` | e.g. `"1.0"` |
| `vulomail_is_email_ready()` | `bool` | A usable email connection exists and routing is on. |
| `vulomail_is_sms_ready()` | `bool` | A usable SMS connection exists and SMS is on. |
| `vulomail_send_email( array $args )` | `true\|WP_Error` | `to`, `subject`, `message` required; `headers`, `attachments`, `source` optional. |
| `vulomail_send_sms( string $to, string $message, array $args = [] )` | `true\|WP_Error` | `source` optional. |

`vulomail_send_email()` is `wp_mail()` with a labelled log entry and a real error on failure. With no connection configured it still sends, through WordPress's own mailer. Plain `wp_mail()` calls are routed through VuloMail too; you only need this function for the `source` label and the error detail.

`vulomail_send_sms()` accepts international numbers (`+14155550123`) or national numbers when a default country code is set. HTML is stripped. Messages over 1530 characters are refused.

`source` is your plugin's slug. It appears in the delivery log.

## Actions

| Action | Arguments |
|---|---|
| `vulomail_loaded` | - |
| `vulomail_email_sent` | `Message $message, Result $result` |
| `vulomail_email_failed` | `Message $message, Result $result` (every connection failed) |
| `vulomail_sms_sent` | `string $number, string $body, Result $result` |
| `vulomail_sms_failed` | `string $number, string $body, Result $result` |

Core's `wp_mail_succeeded` and `wp_mail_failed` also fire for email VuloMail delivers.

## Filters

| Filter | Value | Purpose |
|---|---|---|
| `vulomail_should_handle_email` | `bool`, `array $atts` | Return `false` to leave one message to WordPress. |
| `vulomail_email_message` | `Message`, `array $atts` | Change a message before it is sent and logged. |
| `vulomail_sms_message` | `string $body`, `string $number`, `string $source` | Change an SMS; return `''` to cancel it. |
| `vulomail_email_providers` | `array<string, class-string>` | Add or replace email adapters. |
| `vulomail_sms_providers` | `array<string, class-string>` | Add or replace SMS adapters. |
| `vulomail_sms_triggers` | `array` | Add SMS alert definitions. |
| `vulomail_email_tracking` | `array{opens: bool, clicks: bool}`, `Message` | Switch open or click tracking off for one email. |
| `vulomail_track_link` | `bool`, `string $url` | Return `false` to keep one link out of click tracking. Links can also carry `data-vulomail-notrack`. |
| `vulomail_log_data` | `array\|false $row`, `string $channel` | Change a log row, or return `false` to skip it. |
| `vulomail_diagnostics` | `array $checks` | Add diagnostics results: `id`, `label`, `status`, `message`, optional `fix` and `action`. |
| `vulomail_http_timeout`, `vulomail_smtp_timeout` | `int` seconds | Default 15. |
| `vulomail_rest_controllers` | `array<string, WP_REST_Controller>` | Add REST controllers. |

## Delegating delivery from your plugin

VuloMail has no built-in integration with any particular plugin. If your plugin sends its own email or SMS and you want VuloMail to deliver it when present, the code lives in **your** plugin and uses only the functions and hooks on this page.

**Email** needs nothing if you already send with `wp_mail()`: VuloMail routes it like any other email once the site owner has set a primary connection. Call `vulomail_send_email()` instead only when you want your plugin's name in the log and the real error back.

**SMS** is an explicit hand-over. Keep your own gateway as the fallback:

```php
function my_plugin_send_sms( $number, $text ) {
	$delegate = function_exists( 'vulomail_send_sms' )
		&& version_compare( vulomail_api_version(), '1.0', '>=' )
		&& vulomail_is_sms_ready()
		&& get_option( 'my_plugin_use_vulomail' ); // your own opt-in setting

	if ( $delegate ) {
		$sent = vulomail_send_sms( $number, $text, array( 'source' => 'my-plugin' ) );

		if ( true === $sent ) {
			return true;
		}
		// Fall through to your own gateway, or return $sent (a WP_Error) to report the failure.
	}

	return my_plugin_own_gateway()->send( $number, $text );
}
```

Guidelines:

- **Make it opt-in.** Installing VuloMail should not silently change how your plugin delivers. Offer a setting, off by default for existing sites.
- **Send once.** Either VuloMail sends or your gateway does. Only fall back after VuloMail has returned a `WP_Error`.
- **Keep your content.** Templates, recipients and the decision to send stay in your plugin. VuloMail is only the transport.
- **Check readiness at send time,** not at load: the site owner can add or remove a connection at any moment.
- **Report yourself.** Add a row to Tools → Diagnostics with the `vulomail_diagnostics` filter so the site owner can see that your plugin delivers through VuloMail, or why it does not:

```php
add_filter( 'vulomail_diagnostics', function ( $checks ) {
	$checks[] = array(
		'id'      => 'my_plugin',
		'label'   => 'My Plugin',
		'status'  => vulomail_is_sms_ready() ? 'good' : 'warning',
		'message' => vulomail_is_sms_ready()
			? 'My Plugin sends its text messages through VuloMail.'
			: 'My Plugin is set to use VuloMail, but VuloMail has no SMS connection, so it is using its own gateway.',
	);
	return $checks;
} );
```

Phone numbers: pass international format (`+14155550123`). A number without `+` is treated as national and needs VuloMail's default country code.

## Adding a provider

```php
use VuloMail\Delivery\Result;
use VuloMail\Sms\GatewayInterface;

class My_Gateway implements GatewayInterface {
	private $config;
	private $http;

	public function __construct( array $config, $http ) {
		$this->config = $config; // secrets already decrypted
		$this->http   = $http;   // VuloMail\Security\HttpClient
	}

	public static function definition() {
		return array(
			'label'  => 'My Gateway',
			'desc'   => 'Example gateway.',
			'fields' => array(
				array( 'key' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true ),
			),
		);
	}

	public function send( $to, $body ) {
		$response = $this->http->post( 'https://api.example.com/sms', array( 'Authorization' => 'Bearer ' . $this->config['api_key'] ), array( 'to' => $to, 'text' => $body ) );

		if ( is_wp_error( $response ) || 200 !== $response['code'] ) {
			return Result::fail( 'my_gateway_error', 'Could not send.' );
		}

		return Result::ok( $response['json']['id'] ?? '' );
	}
}

add_filter( 'vulomail_sms_providers', function ( $providers ) {
	$providers['my_gateway'] = My_Gateway::class;
	return $providers;
} );
```

Field types: `text`, `password`, `number`, `select` (with `options`), `toggle`. Optional keys: `required`, `secret`, `default`, `help`, `show_if`.

An adapter must not throw and must not put credentials in an error message. `HttpClient::post()` only allows HTTPS and never follows redirects.

## For VuloLabs products

A product that needs to send mail or texts should call the functions above when VuloMail is active and keep its own behaviour otherwise. It should not store provider credentials or keep its own delivery log. VuloMail never calls into another product; the dependency only runs one way.
