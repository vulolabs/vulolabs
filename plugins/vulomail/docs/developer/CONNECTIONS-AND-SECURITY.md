# Connections and Security

## Classes

| Class | File | What it does |
|---|---|---|
| `ProviderRegistry` | `classes/Connections/ProviderRegistry.php` | Knows which adapter classes exist per channel; returns their field schemas; builds an adapter from a connection |
| `ConnectionRepository` | `classes/Connections/ConnectionRepository.php` | Stores connections in one option; encrypts secret fields; validates input; masks for display |
| `Secrets` | `classes/Security/Secrets.php` | Encrypts and decrypts credentials; masks them |
| `Redactor` | `classes/Security/Redactor.php` | Scrubs credentials out of error text; masks emails and phone numbers |
| `HttpClient` | `classes/Security/HttpClient.php` | The one place adapters make outbound HTTP requests from |
| `GoogleOAuth` | `classes/Connections/GoogleOAuth.php` | "Sign in with Google" for the Gmail connection: sign-in URL, callback, token refresh ([section 7](#7-sign-in-with-google)) |

## 1. Providers

`ProviderRegistry::classes( $channel )` returns `provider id => class`, after the `vulomail_email_providers` or `vulomail_sms_providers` filter. A class that doesn't exist or doesn't implement the channel's interface is dropped.

Each adapter describes itself through a static `definition()`:

```php
array(
	'label'  => 'Mailgun',
	'desc'   => 'Mailgun transactional email API.',
	'fields' => array(
		array( 'key' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true ),
		array( 'key' => 'region', 'label' => 'Region', 'type' => 'select', 'default' => 'us', 'options' => array( ... ) ),
	),
)
```

Field types: `text`, `password`, `number`, `select`, `toggle`. Optional keys: `required`, `secret`, `default`, `options`, `help`, `show_if` (`array( 'auth' => true )`: the field only applies, and is only required, while that other field has that value).

The definitions are sent to the admin app in `vulomailAppLocalizer.providers`, and the connection form is generated from them. Adding a provider needs no JavaScript.

## 2. Connections

Stored in the `vulomail_connections` option (not autoloaded) as `id => record`:

```php
array(
	'id'       => 'cab12cd34ef',
	'channel'  => 'email',          // or 'sms'
	'provider' => 'mailgun',
	'label'    => 'Main',
	'enabled'  => true,
	'settings' => array( 'api_key' => 'vm1:...', 'domain' => 'mg.example.com', 'region' => 'eu' ),
)
```

Which connection is used is not part of the record: the settings `email_primary`, `email_backup`, `sms_primary` and `sms_backup` hold connection ids.

| Method | Purpose |
|---|---|
| `save( array $input )` | Create or update. Validates every field against the schema; returns the record or a `WP_Error` |
| `config( $connection )` | Settings with secrets decrypted, ready for an adapter |
| `missing_fields( $connection )` | Labels of required fields that are empty, or whose secret can't be decrypted |
| `is_usable( $connection )` | Enabled and nothing missing |
| `for_display( $connection )` | The shape REST returns: secrets replaced by a mask |
| `delete( $id )` | Remove |

Rules in `save()`:

- **Channel and provider are fixed** once a connection exists; its stored secrets belong to them.
- **A secret left empty, or still holding its mask, keeps the stored value.** The browser never has the real secret to send back.
- **No line breaks in any stored value.** Several end up in SMTP commands or HTTP headers.
- A `select` value must be one of its options.

Email connections are not put into use when saved: the WordPress mailer stays the default until the site owner sets a primary. The first SMS connection does become the primary, because SMS has no default to fall back on (`Rest\Connections::save_item()`). Deleting a primary promotes the backup.

## 3. Encryption at rest

`Secrets::encrypt()` uses `sodium_crypto_secretbox` with a random nonce; stored values look like `vm1:<base64(nonce . ciphertext)>`.

The key is `sha256( secret . '|' . material )`, where:

- `material` is a random value generated once and stored in the `vulomail_key_material` option;
- `secret` is the `VULOMAIL_ENCRYPTION_KEY` constant if defined in `wp-config.php`, otherwise `wp_salt( 'auth' )`.

So neither a database dump nor the config file alone is enough to read a credential.

**Consequence:** if the site's salts change (or the constant does), `decrypt()` returns `''`, the connection reports its secret fields as missing, and the credential must be entered again. Diagnostics reports this.

`Secrets::mask()` returns eight bullets plus the last four characters, or bullets only for a secret of eight characters or fewer.

## 4. Outbound HTTP

`HttpClient::post()`:

- refuses any URL that isn't `https`;
- sets `redirection => 0`, because a redirect would forward the credential to another host;
- uses `wp_safe_remote_request()`, which refuses private and loopback addresses;
- times out after 15 seconds (`vulomail_http_timeout`).

Endpoints are constants in each adapter. Where an account identifier becomes part of the URL (Mailgun domain, Twilio Account SID, Plivo Auth ID) the adapter validates its format first.

SMTP is the exception: the host is whatever the site owner entered.

## 5. Error text

Provider responses can echo a credential. `Redactor::scrub( $text, $secrets )` removes the adapter's known secret values verbatim, then `Authorization` headers and `api_key=`/`token=`/`password=`-style pairs, then HTML. Adapters run every error through it before it reaches a `Result`, and from there the log and the screen.

## 6. Access control

- Every REST route requires `manage_options` (`Rest\Controller::check_permission()`). Core's REST cookie authentication verifies the `wp_rest` nonce before the permission callback runs.
- The admin page is registered with the same capability.
- Logged message bodies are shown as text in a `<pre>`, never rendered as HTML.
- Values passed to zyra props that render HTML go through `escapeHtml()` (`src/services/types.ts`).

## 7. Sign in with Google

The `gmail` provider (`Email\Mailers\Gmail`) offers three sign-in methods in its `auth_mode` field:

| `auth_mode` | Sends through | Asks for |
|---|---|---|
| `oneclick` (only while the connect service is configured; then the default) | Gmail API | Nothing; "Sign in with Google" |
| `app_password` (the default otherwise) | Google's SMTP server, via `GmailSmtp` | Gmail address, app password |
| `own` | Gmail API | Client ID and Client Secret of the site owner's Google app, then "Sign in with Google" |

Gmail connections saved before `auth_mode` existed are given `app_password` by `Install::migrate_connections()` (schema version 3), and the adapter reads a missing value the same way. `GoogleWorkspaceSmtp` still extends `GmailSmtp` and is listed separately.

**Fields.** Besides `auth_mode`: `username` and `password` (app password only), `client_id` and `client_secret` (own app only), and two `hidden` fields filled by the sign-in, never typed: `account_email` and `refresh_token` (secret, required while a Google method is chosen, so such a connection is "Incomplete" until signed in). `show_if` accepts a list of values for this (`ConnectionRepository::field_applies()`, mirrored in the form). The definition carries `oauth: 'google'`; the form shows `src/components/GoogleSignIn.tsx` in place of the hidden `refresh_token` field while that field applies. `client_id` and `client_secret` are marked `advanced`: the form draws them inside that panel's collapsed "Advanced: use your own Google app" section, with the setup steps, instead of in the field list. "Sign in with Google" with either still empty opens that section rather than starting a sign-in.

**Flow** (authorization code + PKCE, `GoogleOAuth`):

1. The form saves the connection, then `POST /connections/{id}/google` returns the sign-in URL. A random 128-bit `state` holding the connection id, mode and PKCE verifier is kept in a transient for 15 minutes.
2. The browser signs in at Google (own mode) or at the connect service (one-click).
3. The browser returns to `GET /google/callback` (`rest_url()`, so `?rest_route=` on plain permalinks; Google allows query strings in redirect URIs). This route is public: it carries no REST nonce, and the single-use state is its authorization. The code is exchanged, the `gmail.send` grant is checked (the consent screen lets it be unticked), and the refresh token is stored encrypted on the connection. The browser is sent to the Connections screen with `google=connected|failed&google_message=…`, which the screen shows once and removes from the address.

Scopes: `openid email https://www.googleapis.com/auth/gmail.send`. `gmail.send` is a *sensitive* scope (Google verifies the app, no security assessment); the connection can send as the account but never read its mail. The account address comes from the ID token's `email` claim; the token comes straight from the token endpoint over TLS, which OpenID Connect accepts in place of a signature check.

**Sending.** `GoogleOAuth::access_token()` refreshes the access token and caches it, encrypted, in a transient until five minutes before it expires; a 401 from Gmail drops the cache. The message is built by `Smtp::compose()` (so `phpmailer_init` still applies) with `Mailer = 'sendmail'`, which keeps To, Subject and Bcc in the raw message, and uploaded to `upload/gmail/v1/users/me/messages/send?uploadType=media` as `message/rfc822` (Gmail's 35 MB limit). Gmail sends from the signed-in account or one of its "Send mail as" aliases; any other From is replaced.

**Own mode.** The site owner's Google Cloud project: Gmail API enabled, External consent screen **published** (an app left in "Testing" gets refresh tokens that expire after 7 days), and a "Web application" OAuth client listing the redirect URI the form shows. Google shows its "unverified app" warning for this, which is expected for a personal app.

### One-click: the connect service contract

One-click is offered only when `VULOMAIL_GOOGLE_CONNECT_URL` (config.php, overridable in wp-config.php or by the `vulomail_google_connect_url` filter) is an `https://` URL. That service holds VuloLabs' Google-verified OAuth client; its credentials never reach a site. It must implement Google's own request and response shapes, minus the client credentials:

| Endpoint | Called by | Receives | Must do |
|---|---|---|---|
| `GET {url}/authorize` | the browser | `redirect_uri` (the site's callback), `state`, `code_challenge`, `code_challenge_method=S256`, `scope`, `access_type=offline`, `prompt`, `site` (home URL) | Send the user through Google consent with its own client, then redirect to the site's `redirect_uri` with `code` (its own one-time code, bound to the PKCE challenge) and the unchanged `state`, or with `error=access_denied` |
| `POST {url}/token` (form-encoded) | the site, server to server | `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`, `site` | Verify the PKCE verifier, return JSON `{ access_token, expires_in, refresh_token, email, scope }` |
| `POST {url}/token` | the site | `grant_type=refresh_token`, `refresh_token`, `site` | Refresh with Google and return `{ access_token, expires_in }`; on a revoked grant return HTTP 400 `{ "error": "invalid_grant" }` |

Errors use Google's shape: `{ "error": "...", "error_description": "..." }`. The service only proxies the OAuth handshake and refreshes; mail goes from the site to Gmail directly. Licensing or rate limits, if any, are the service's own business.

