# Testing and Release

## 1. Unit tests

```bash
composer install
pnpm run test:php        # or vendor/bin/phpunit
```

PHPUnit with Brain\Monkey. The tests run without WordPress: `tests/php/bootstrap.php` defines the constants and a minimal `WP_Error`, and `TestCase` supplies working stand-ins for the WordPress functions the delivery code calls. Options are kept in memory per test.

| File | Covers |
|---|---|
| `test-security.php` | Encryption round trip, tampering, salt rotation, masking, scrubbing |
| `test-message-factory.php` | Every `wp_mail()` input shape, core defaults, sender override, header injection, attachments |
| `test-connections.php` | Secrets encrypted and masked, masked value keeps the stored secret, schema validation, settings sanitization |
| `test-email-providers.php` | Request shape, success detection and failure handling per provider; SMTP transport applied after `phpmailer_init`; no leaked credentials |
| `test-email-dispatch.php` | Failover, logging rules, `wp_mail()` interception in every state, the public API |
| `test-email-tracking.php` | Open/click tracking: off by default, pixel placement, link eligibility, signed redirects and tampering, failover and hand-back reuse, fresh token on resend |
| `test-sms.php` | Phone numbers, each gateway, SMS dispatch and failover |
| `test-sms-triggers.php` | Alert firing rules |
| `test-diagnostics.php` | Diagnostics checks |

### Doubles (`tests/php/src/Doubles.php`)

| Double | Use |
|---|---|
| `FakeHttp` | Records requests; replays queued responses or a `WP_Error` |
| `FakeLogs` | Keeps log rows in memory |
| `ScriptedMailer`, `ScriptedGateway` | Adapters that succeed, fail or throw according to their `outcome` setting |
| `ScriptedRegistry` | A registry exposing only the scripted adapters |
| `FakePhpMailer` | Stand-in for PHPMailer that records how it was configured |

Adapters take their HTTP client through the constructor, and `Smtp` takes an optional PHPMailer factory, so nothing in the suite touches the network.

Not unit-tested: the REST controllers and `LogRepository`, which need WordPress.

## 2. End-to-end

There is no checked-in integration suite. During development the plugin was exercised on a real WordPress with:

- SQLite (the `sqlite-database-integration` drop-in), so no database server is needed;
- a local SMTP sink that accepts `AUTH` and records each message;
- provider HTTP calls answered through the `pre_http_request` filter;
- a script run with `wp eval-file` that drives the REST routes with `rest_do_request()`.

That covers what the unit tests can't: table creation, permissions on every route, real SMTP delivery and failover, logging, both uninstall modes, and installing from the release zip. If you add an integration suite, that is the shape to give it.

**No provider has been called with a real account.** Request formats follow each provider's documented API.

## 3. Linters

```bash
composer run-script phpcs                                 # WordPress-Extra + PHPCompatibility
pnpm exec eslint plugins/vulomail/src --ext .ts,.tsx      # from the vulolabs/ root
pnpm exec stylelint "plugins/vulomail/src/**/*.scss"
```

`Generic.Commenting.DocComment.MissingShort` is reported for docblocks that hold only tags. The rest of the repository carries the same warnings.

Watch `WordPress.WP.CapitalPDangit` when running `phpcbf`: it rewrites the literal string `'wordpress'` to `'WordPress'`, including in identifiers. That is why the default mailer's provider id is `default` and the core source label is `core`.

## 4. Release

```bash
pnpm run build:zip       # install, readme, build, make-pot, make-json, release
```

`tools/scripts/release.mjs` copies a fixed list of paths (`assets`, `classes`, `languages`, `vendor`, `readme.txt`, `config.php`, `composer.json`, `composer.lock`, the main file), runs `composer install --no-dev`, and writes `release/vulomail-v<version>.zip`.

Anything outside that list is not shipped. That is why the public API file is `classes/Integrations/functions.php` and uninstall is a hook rather than `uninstall.php`. `docs/`, `src/` and `tests/` stay in the repository.

Bump the version in `vulomail.php`, `config.php`, `package.json` and the `Stable tag` in `readme.txt` (`pnpm run version` does the replacement).
