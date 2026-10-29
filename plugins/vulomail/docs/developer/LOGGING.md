# Logging

## Classes

| Class | File | What it does |
|---|---|---|
| `Logger` | `classes/Logging/Logger.php` | Builds one log row per message, applies the privacy settings, schedules and runs retention |
| `LogRepository` | `classes/Logging/LogRepository.php` | Database access for the log table: insert, get, query, delete, daily counts |

Table and columns: [DATABASE](DATABASE.md).

## 1. What gets logged

One row per message, written by:

- `Email\Dispatcher::send()` - a success, or a final failure;
- `Email\WpMailInterceptor` - a send by WordPress's own mailer, including one handed back after VuloMail's connections failed;
- `Sms\Dispatcher::send()` - every SMS, including one refused for an invalid number;
- the test tools, for a test through one named connection.

`attempts` holds the JSON of every attempt in order (`Result::to_array()`): provider, connection id, success, provider message id, error code and message. `used_fallback` is 1 when something other than the primary delivered.

## 2. Privacy rules

Applied in `Logger::write()`:

| Setting | Effect |
|---|---|
| `log_enabled` off | Nothing is written; `write()` returns 0 |
| `log_content` off (default) | `body` is stored as `NULL` |
| `mask_recipients` on | Recipients are stored masked (`j•••@example.com`, `•••••••••123`) |

A row with no body, or with masked recipients, can't be resent (`Rest\Logs::can_resend()`).

`vulomail_log_data` filters the row before it is stored; return `false` to skip a message.

Error messages are already scrubbed of credentials by the adapters ([CONNECTIONS-AND-SECURITY](CONNECTIONS-AND-SECURITY.md#5-error-text)).

## 3. Retention

`Logger::register_retention()` schedules the daily `vulomail_prune_logs` event. `prune()` deletes rows older than `log_retention_days`; 0 keeps everything. The event is cleared on deactivation.

## 4. Querying

`LogRepository::query( $args )` accepts `channel`, `status`, `search` (recipients or subject), `after`, `before` (UTC datetimes), `page`, `per_page` (default 10, maximum 100), `orderby` (one of `SORTABLE`), `order`.

It returns `data`, `total` and `status_counts`. The counts are taken before the status filter is applied, so the status pills each show their own total within the current channel, search and date range.

List rows omit `body`; it is fetched per row by `GET /logs/{id}`.

## 5. Dates

`created_at` is stored in UTC. The REST layer adds display fields with `Utill::with_display_dates()`:

| Field | Content |
|---|---|
| `created_at_display` | Date and time in the site's date format, time format, timezone and language (`wp_date()`) |
| `created_at_time` | The time only |
| `created_at_day` | "Today", "Yesterday", or the date |

The admin app shows these and does no date formatting of its own. The date-range filter sends calendar days (`YYYY-MM-DD`); `Rest\Logs::day_boundary()` reads them in the site's timezone and converts to UTC.

## 6. Open and click tracking

Off by default (`track_opens`, `track_clicks`), and only ever applied while `log_enabled` is on, because the counts live on the log row. Implemented by `Email\Tracking` (`classes/Email/Tracking.php`).

**Which messages.** HTML email (`Message::is_html()`) that VuloMail delivers through a connection, including one its connections failed and handed back to WordPress's mailer (`WpMailInterceptor::track_handed_back()` on `phpmailer_init`). Plain-text email, SMS, test sends, and mail VuloMail is only observing are never changed. `vulomail_email_tracking` can switch either kind off for one message.

**Once per message.** `Dispatcher::send()` calls `Tracking::prepare()` before the failover loop: it sets `$message->tracking` (`token`, `opens`, `clicks`) and returns a tracked copy for the mailers. Every attempt and the WordPress hand-back send the same copy under the same token. The log stores the original body, so **Resend** goes through `wp_mail()` again and gets a new token. `prepare()` never throws; on any error the message goes out untracked. The token is logged only for a message that was delivered.

**Rewriting** (`Tracking::rewrite()`, deterministic for a body and token):

- Opens: a 1×1 image just before the last `</body>`, or at the end of a fragment.
- Clicks: every `<a href>` whose link `is_trackable()`: `http`/`https` with a host, no template placeholders, not already tracked, not matching `SENSITIVE_PATTERN` (unsubscribe, password reset, sign-in, confirmation, one-time codes) and not marked `data-vulomail-notrack`. `vulomail_track_link` can exclude more. Only the `href` value changes.

**Endpoint** (`Tracking::handle_request()` on `init`, priority 1): `/?vulomail_open={token}` returns a GIF; `/?vulomail_click={token}&n={position}&u={base64url link}&s={hmac}` redirects. The signature is an HMAC of token, position and link keyed with `wp_salt( 'auth' )`, so the redirect only goes to the email's own link (no open redirect) and keeps working after the row is pruned. Anything that fails verification redirects to the home page and records nothing. Only `GET` requests are counted (scanners often probe with `HEAD`). No IP address or user agent is read or stored.

**Recording.** `LogRepository::find_by_token()` (indexed), then `record_open()` / `record_click()` as single `UPDATE ... SET count = count + 1` statements; a click also upserts its `vulomail_log_links` row. Opens are recorded only when `track_opens` applied, clicks only when `track_clicks` did, and only on `sent` rows.

**Reporting.** `Rest\Logs::with_engagement()` adds `opened` and `clicked` (`yes`, `no`, `not_tracked`) to list and detail responses. A click counts as an open. The detail adds `tracking` (counts, display dates, clicked links) and leaves out the token.

The numbers are estimates: images can be blocked (missed opens) or fetched by mail-privacy proxies and scanners (opens and clicks that weren't a person). The admin screens say so.

