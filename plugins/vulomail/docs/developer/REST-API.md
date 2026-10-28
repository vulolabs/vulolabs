# REST API Reference

Every controller registers under the namespace `vulomail/v1` (`VuloMail()->rest_namespace`).

**All routes require an administrator** (`manage_options`), through `Rest\Controller::check_permission()`. Cookie-authenticated calls must send `X-WP-Nonce` (the admin app reads it from `vulomailAppLocalizer.nonce`).

**No response contains a credential.** Secret connection fields come back masked.

Add your own controller with the `vulomail_rest_controllers` filter (`key => WP_REST_Controller`).

| Class | File | What it does |
|---|---|---|
| `Rest` | `classes/Rest.php` | Instantiates the controllers on `rest_api_init` and registers their routes |
| `Controller` | `classes/Rest/Controller.php` | Base class with the shared permission check |
| `Overview` | `classes/Rest/Overview.php` | The Dashboard's data in one request |
| `Settings` | `classes/Rest/Settings.php` | Read and save settings |
| `Connections` | `classes/Rest/Connections.php` | List, create/update and delete connections |
| `Logs` | `classes/Rest/Logs.php` | List, view, delete and resend log entries |
| `Tools` | `classes/Rest/Tools.php` | Test sends and diagnostics |

## Overview

| Method | Route | Parameters | Returns |
|---|---|---|---|
| GET | `/overview` | `days`: 7, 30 or 90 (default 7) | `days`, `email` and `sms` (each `sent`, `failed`, `enabled`, `ready`, `primary`, `backup`), `recent_failures` (up to 5 log rows with display dates), `logging`, `sms_alerts` (`enabled`, `available`) |

## Settings

| Method | Route | Body | Returns |
|---|---|---|---|
| GET | `/settings` | - | Every setting, flat |
| POST | `/settings` | Flat `{ key: value }` | The full settings; HTTP 400 on a validation problem |
| POST | `/settings` | `{ settingName, setting }` (the auto-saving form) | `{ success, message }`; a validation problem is HTTP 200 with `success: false, type: 'error'` |

Unknown keys are ignored. See [SETTINGS-SYSTEM](SETTINGS-SYSTEM.md#3-wire-format) for the form's value shapes.

## Connections

Every route returns the same payload, so the screen refreshes from one response:

```json
{
	"connections": [
		{ "id": "cab12cd34ef", "channel": "email", "provider": "smtp", "provider_label": "SMTP",
		  "label": "Main", "enabled": true, "settings": { "host": "smtp.example.com", "password": "••••••••word" },
		  "missing": [] }
	],
	"routing": { "email_primary": "cab12cd34ef", "email_backup": "", "sms_primary": "", "sms_backup": "" }
}
```

| Method | Route | Body | Notes |
|---|---|---|---|
| GET | `/connections` | - | |
| POST | `/connections` | `id` (to update), `channel`, `provider`, `label`, `enabled`, `settings` | Creates when `id` is absent. A secret left empty or still masked keeps its stored value. Channel and provider can't be changed on an existing connection. The first SMS connection becomes `sms_primary` |
| DELETE | `/connections/{id}` | - | Clears any routing slot that pointed at it; a deleted primary is replaced by the backup |
| POST | `/connections/{id}/google` | - | Gmail connections using a "Sign in with Google" method: returns `{ url }` to send the browser to for "Sign in with Google" |
| GET | `/google/callback` | `state`, `code` or `error` (query) | **Public**: where Google returns after consent. Authorized by the single-use state; redirects to the Connections screen |

`POST /connections` also returns `saved`: the id of the connection just created or updated.

Errors: 400 `vulomail_unknown_provider`, 400 `vulomail_google_client_missing`, 400 `vulomail_google_app_password`, 404 `vulomail_connection_not_found`.

## Logs

| Method | Route | Parameters / body | Returns |
|---|---|---|---|
| GET | `/logs` | `channel` (`email`/`sms`), `status` (`sent`/`failed`), `search`, `after`, `before` (`YYYY-MM-DD`, read in the site's timezone), `page`, `per_page` (default 10, max 100), `orderby`, `order` | `data`, `total`, `status_counts` (`sent`, `failed`). Rows carry no `body` |
| GET | `/logs/{id}` | - | The full row plus `attempts` and `headers` (decoded), `has_body`, `can_resend` |
| DELETE | `/logs` | `{ "ids": [1, 2] }` or `{ "all": true }` | `{ deleted }` |
| POST | `/logs/{id}/resend` | - | `{ success, message }`. 400 `vulomail_cannot_resend` when the body wasn't stored or the recipients were masked |

Rows include `created_at` (UTC) and the display fields `created_at_display`, `created_at_time`, `created_at_day`.

## Tools

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/tools/test-email` | `to`, optional `connection_id` | `{ success, provider, message, attempts }` |
| POST | `/tools/test-sms` | `to`, optional `connection_id` | `{ success, provider, message, attempts }` |
| GET | `/tools/diagnostics` | - | A list of checks: `id`, `label`, `status` (`good`/`warning`/`error`/`info`), `message`, `fix`, `action` |

Without `connection_id` a test goes through the live routing, the same path every other message takes, including failover. With it, the test goes through that one connection only. Both are logged with source `vulomail-test`.

A failed test is HTTP 200 with `success: false` and the provider's error in `message`. Invalid input is HTTP 400.
