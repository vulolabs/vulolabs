# Database

VuloMail adds two tables and a handful of options. It adds no post types, no user meta and no post meta.

## Table: `{prefix}vulomail_logs`

Created by `Install::create_database_tables()` with `dbDelta`. One row per message.

| Column | Type | Content |
|---|---|---|
| `id` | bigint unsigned, PK | |
| `channel` | varchar(10) | `email` or `sms` |
| `status` | varchar(20) | `sent` or `failed` |
| `provider` | varchar(50) | Provider id of the final attempt; `default` for WordPress's own mailer |
| `connection_id` | varchar(40) | Connection that made the final attempt |
| `used_fallback` | tinyint | 1 when something other than the primary delivered |
| `recipients` | text | Comma-separated; masked when that setting is on |
| `subject` | varchar(255) | Email only |
| `body` | longtext, nullable | `NULL` unless "store message content" is on |
| `headers` | text, nullable | JSON: From, Reply-To, Content-Type (email only) |
| `attachments` | smallint unsigned | Count |
| `source` | varchar(100) | Plugin or theme folder that sent it, `core`, or a caller-supplied slug |
| `message_id` | varchar(255) | Provider's id for the message |
| `error_code` | varchar(100) | |
| `error_message` | text, nullable | |
| `attempts` | text, nullable | JSON list of every attempt |
| `tracking_token` | varchar(32) | Random token in a tracked email's pixel and links; `''` when not tracked |
| `track_opens`, `track_clicks` | tinyint | Which tracking was applied to this message |
| `open_count`, `first_opened_at`, `last_opened_at` | int unsigned, datetime | Observed opens (UTC) |
| `click_count`, `first_clicked_at`, `last_clicked_at` | int unsigned, datetime | Observed clicks across all links (UTC) |
| `created_at` | datetime | UTC |

Indexes: `(channel, status)`, `(created_at)`, `(tracking_token)`.

## Table: `{prefix}vulomail_log_links`

One row per tracked link that has been clicked at least once ([LOGGING](LOGGING.md#6-open-and-click-tracking)). Rows are only created on a click, so links nobody clicked are never stored.

| Column | Type | Content |
|---|---|---|
| `id` | bigint unsigned, PK | |
| `log_id` | bigint unsigned | The message's log row |
| `position` | smallint unsigned | The link's place among the message's tracked links, from 1 |
| `url` | text | The link without its query string and fragment |
| `click_count` | int unsigned | |
| `first_clicked_at`, `last_clicked_at` | datetime | UTC |

Unique key: `(log_id, position)`. Removed together with their log row by every `LogRepository` delete path, including retention.

Schema changes: bump `Install::SCHEMA_VERSION` (and `VULOMAIL_PLUGIN_VERSION` on release). `VuloMail::init_plugin()` re-runs `Install` when either stored value differs, and `dbDelta` applies the difference. Do not write `CREATE TABLE IF NOT EXISTS`; `dbDelta` would read `IF` as the table name.

## Options

| Option | Autoload | Content |
|---|---|---|
| `vulomail_settings` | no | Every admin-editable setting ([SETTINGS-SYSTEM](SETTINGS-SYSTEM.md)) |
| `vulomail_connections` | no | Saved connections, secrets encrypted |
| `vulomail_key_material` | no | Random half of the encryption key material |
| `vulomail_plugin_db_version` | yes | Version the schema was last installed at |
| `vulomail_db_schema_version` | yes | `Install::SCHEMA_VERSION` the tables were last installed at |
| `vulomail_run_installer` | yes | Set on activation, cleared after install |

## Transients

| Transient | Lifetime | Purpose |
|---|---|---|
| `vulomail_dns_{md5(host)}` | 10 minutes | Cached SPF/DMARC lookup for Diagnostics |
| `vulomail_email_failed_alert` | 15 minutes | Spaces out the "email failed" SMS alert |

## Scheduled events

| Hook | Recurrence | Purpose |
|---|---|---|
| `vulomail_prune_logs` | daily | Log retention |

## Uninstall

`Install::uninstall()` does nothing unless `keep_data_uninstall` is `delete_everything`. Then it drops both tables, deletes the options and `vulomail_` transients, and clears the scheduled event.
