# Email Delivery

## Classes

| Class | File | What it does |
|---|---|---|
| `WpMailInterceptor` | `classes/Email/WpMailInterceptor.php` | Hooks `pre_wp_mail`; routes a message to the dispatcher or leaves it to WordPress; observes core's success/failure hooks to log default-mailer sends |
| `MessageFactory` | `classes/Email/MessageFactory.php` | Turns `wp_mail()` arguments into a `Message`, resolving headers and defaults the way core does |
| `Message` | `classes/Email/Message.php` | A resolved email: to/cc/bcc/reply-to, from, subject, body, content type, charset, extra headers, attachments, source |
| `Dispatcher` | `classes/Email/Dispatcher.php` | Tries the primary connection, then the backup; logs; fires outcome actions |
| `Tracking` | `classes/Email/Tracking.php` | Optional open/click tracking: rewrites the outgoing HTML once per message and serves the pixel and link redirect ([LOGGING](LOGGING.md#6-open-and-click-tracking)) |
| `MailerInterface` | `classes/Email/MailerInterface.php` | Contract for a provider adapter |
| `AbstractApiMailer` | `classes/Email/AbstractApiMailer.php` | Shared plumbing for HTTP API providers: config access, attachment reading, failure building |
| `Mailers\Smtp`, `SendGrid`, `Mailgun`, `Brevo`, `Postmark` | `classes/Email/Mailers/` | The adapters |

Hooks registered by `WpMailInterceptor`: `pre_wp_mail` (999), `wp_mail_from` (999), `wp_mail_from_name` (999), `wp_mail_succeeded` (999), `wp_mail_failed` (999), `phpmailer_init` (999, applies tracking to a handed-back message only).

## 1. Interception

`WpMailInterceptor::maybe_send( $short_circuit, $atts )` runs on `pre_wp_mail` at priority 999, late enough that a plugin which deliberately short-circuits `wp_mail()` itself is respected.

It returns:

| Return | Meaning | When |
|---|---|---|
| the incoming value | Not ours | Another plugin already short-circuited, or `Dispatcher::is_ready()` is false |
| `null` | Let WordPress send | `vulomail_should_handle_email` returned false; the message has no valid recipient; or every connection failed and "fall back to the WordPress default mailer" is on |
| `true` | Delivered | A connection accepted the message. `wp_mail_succeeded` is fired |
| `false` | Failed | Every connection failed and the fallback is off. `wp_mail_failed` is fired with a `WP_Error` |

`Dispatcher::is_ready()` is `email_enabled` plus at least one usable connection in the chain.

### Logging sends VuloMail did not make

When WordPress's own mailer sends (not ready, or handed back), `observe_success()` / `observe_failure()` log the outcome with provider `default`. A message that was handed back after its connections failed is logged once, with those failed attempts followed by the default mailer's result and `used_fallback = 1`.

`announce()` sets a flag while this class fires core's hooks itself, so its own observers don't log the same message twice.

### Source

Each message is labelled with the plugin or theme that called `wp_mail()`: `detect_source()` walks the call stack for the first file under `WP_PLUGIN_DIR` or the theme root and uses that folder name, or `core`. `vulomail_send_email()` sets the label explicitly through `set_next_source()`.

## 2. Building the message

`MessageFactory::from_wp_mail()` accepts every `wp_mail()` input shape:

- `to`: a string, a comma-separated string, or an array; each entry `a@b.c` or `Name <a@b.c>`.
- `headers`: a newline-separated string, a list, or an associative array. `From`, `Content-Type` (with charset), `Cc`, `Bcc` and `Reply-To` are modelled; anything else is kept as a custom header.
- `attachments`: a string, a list, or `name => path`. Unreadable files are dropped.

It then applies core's own filters, in core's order: `wp_mail_from`, `wp_mail_from_name`, `wp_mail_content_type`, `wp_mail_charset`.

**Sender.** `resolve_from_email()` and `resolve_from_name()` apply the configured sender: always when the matching "force" setting is on, otherwise only in place of core's default (`wordpress@<host>`, `WordPress`) or an invalid address. The interceptor registers the same two methods on `wp_mail_from` and `wp_mail_from_name`, so the configured sender also applies when WordPress's own mailer ends up sending. Both are idempotent.

**Injection guards.** An address, display name or header value containing a line break is dropped. A header name must match `[A-Za-z0-9-]+`.

## 3. Dispatch and failover

`Dispatcher::chain()` returns the usable connections in order: the one in `email_primary`, then `email_backup`. A connection is usable when it is enabled and has every required field (see [CONNECTIONS-AND-SECURITY](CONNECTIONS-AND-SECURITY.md)).

`send( Message $message, $log_failure = true )` applies tracking once (`Tracking::prepare()`), then walks the chain with that one tracked copy and stops at the first success. A success is always logged. `$log_failure` is false only when the interceptor will hand a failed message back to WordPress and log the combined outcome itself.

Failover happens on any failure, including a permanent rejection.

`send_via( $connection, $message )` sends through one named connection with no failover and no logging. The test tool uses it.

Actions: `vulomail_email_sent( $message, $result )`, `vulomail_email_failed( $message, $result )`.

## 4. Adapters

| Provider | Endpoint | Success | Notes |
|---|---|---|---|
| SMTP | the configured host | no exception from PHPMailer | Uses the PHPMailer bundled with WordPress. Fires `phpmailer_init` so other plugins can adjust content, then applies the transport afterwards so none of them can redirect the message |
| SendGrid | `api.sendgrid.com/v3/mail/send` | HTTP 202 | Message id from the `x-message-id` header |
| Mailgun | `api.mailgun.net/v3/{domain}/messages` or the EU host | HTTP 200 | The domain is validated as a hostname before it is placed in the URL. Attachments are sent as hand-built `multipart/form-data` |
| Brevo | `api.brevo.com/v3/smtp/email` | HTTP 2xx | |
| Postmark | `api.postmarkapp.com/email` | HTTP 200 and `ErrorCode` 0 | Postmark reports some failures as HTTP 200 |

API adapters refuse attachments over 20 MB in total (`AbstractApiMailer::MAX_ATTACHMENT_BYTES`).

A message whose content type is `multipart/*` (a plugin that pre-builds its own MIME body) is sent as plain text by the API adapters. SMTP passes the content type through.

To add a provider see [INTEGRATION-API](INTEGRATION-API.md#adding-a-provider).
