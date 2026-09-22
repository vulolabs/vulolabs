# VuloPilot — AI request architecture

Companion to [`RULE-ENGINE.md`](RULE-ENGINE.md), [`SCANNERS.md`](SCANNERS.md), and
[`DATABASE.md`](DATABASE.md). Covers how an AI call gets from a feature to VuloCloud and back:
`AiRequestSender`, the exceptions it throws, safety validation, and where AI actions live.

There is **no provider concept** in this plugin. VuloCloud is the only place an AI answer comes
from — it holds every key and decides which vendor serves a call — so there is nothing to register,
select, decorate or fall back between. Earlier versions had a `ProviderRegistry`,
`AIProviderInterface`, a `VuloCloudProxyProvider` adapter, three decorators and a fallback chain
around that single gateway call; all of it was removed, and the decorators' real work (budget,
retry, history) became plain steps inside `AiRequestSender`.

## The request path (`classes/AI/`)

```
feature  →  VuloPilot()->ai_request_sender->send( $messages, $image, $surface )
              1. AISafetyValidator::validate_prompt()      (UnsafePromptException)
              2. AiCreditsConnection::is_connected()        (\RuntimeException "No AI connection is configured.")
              3. per-minute request budget                  (RateLimitExceededException)
              4. AiByokGatewayClient::execute()             {feature, prompt, context, site_tone} → VuloCloud
                 retried on TransientGatewayException, exponential backoff, 3 attempts
              5. one vulopilot_ai_history row              (success and failure both)
              6. AISafetyValidator::sanitize_response()
```

`AiRequestSender` is built once in `VuloPilot::init_classes()` and shared — every caller
(`AiCopilot\ActionRunner`, `Geo\GeoAnalyzer`, `ContentIntelligence\ContentAnalyzer`,
`Services\SiteToneLearner`, and vulopilot-pro's analyzers/REST controllers) is handed that same
instance (`VuloPilot()->ai_request_sender`) rather than constructing its own.

- **Budget.** `MAX_REQUESTS_PER_MINUTE` (20), a WP transient counter keyed by minute
  (`vulopilot_ai_rate_vulocloud_<minute>`). Every attempt, retries included, spends from it. It is
  a local pre-emptive guard against burning AI credits, not a spend cap.
- **History.** Recorded around the retries, so one call is one row regardless of how many attempts
  it took. Failures are recorded too (`status = 'failure'`, zero tokens) so the audit trail covers
  what was tried, not only what worked. The `provider` column and `AIResponse::get_provider()` are
  kept as a source label (always `'vulocloud'` today) — it is stored data, not a provider concept.
- **Images.** `AIRequest::get_image()` exists, but the VuloCloud wire contract carries text only,
  so nothing sends one. Image attachments in Copilot chat get the same honest "can't be read" note
  any other unsupported file does.

## Contracts and value objects

```
classes/
├── Contracts/AI/
│   └── AIActionInterface.php         one AI-assisted workflow (see AI-ACTIONS.md)
├── ValueObjects/
│   ├── AIRequest.php                 model, messages, temperature, max_tokens, image, surface
│   └── AIResponse.php                content, provider, model, prompt/completion tokens, finish_reason
├── Exceptions/
│   ├── AiRequestException.php          base — catch this for "the AI request failed"
│   ├── TransientGatewayException.php   retry-eligible (network error, 5xx, 429)
│   ├── GatewayRequestException.php     not retry-eligible (malformed request, rejected)
│   ├── RateLimitExceededException.php  thrown before the request is sent
│   ├── AiByokNotConfiguredException.php VuloCloud has no AI key that resolves for this site
│   └── UnsafePromptException.php       thrown by the safety validator; deliberately NOT an AiRequestException
└── AI/
    ├── AiRequestSender.php
    └── AISafetyValidator.php
```

A caller that wants to turn any request failure into a 502 catches `AiRequestException`; one that
wants to tell "not connected" apart catches `\RuntimeException` (thrown by the sender when this site
isn't connected to VuloCloud).

## VuloCloud connection and credits

This site holds no AI credential. `Services\AiCreditsConnection` is the site-scoped connection to
VuloCloud (the passwordless broker flow behind Settings → Connections → VuloCloud AI, served by
`Controllers\VuloCloudAiConnection`), and `Services\AiByokGatewayClient` is the call itself.

AI Credits are a separate, metered path, not a layer on top: `Services\AiCreditGatewayClient` calls
VuloCloud's credit-metered `POST /plugin/ai/execute` (a different wire contract —
`{featureId, action, context}`). `AiCopilot\ActionRunner::send_prompt_or_credits()` is where the two
meet: it always sends through `AiRequestSender` first, and only falls through to credits — for the
action ids in `CREDIT_FEATURE_MAP` — when that throws `AiByokNotConfiguredException`. Every other
action id's "not configured" is a final `\RuntimeException`.

## AI actions (`modules/AiCopilot/`)

AI actions belong to the AI Copilot module: `ActionRegistry`, `ActionRunner`,
`ContentCreationOrchestrator`, every `Actions\*Action` class, and the `Rest\AiActionRuns` and
`Rest\Copilot` controllers all live under `modules/AiCopilot/` (`VuloPilot\AiCopilot\…`). The
contract they implement, `Contracts\AI\AIActionInterface`, stays in shared core because vulopilot-pro
implements it too. See [`AI-ACTIONS.md`](AI-ACTIONS.md) for the full lifecycle
(propose → validate → preview → approve → execute → rollback → log).

`ai_action_registry` and `ai_action_runner` are constructed in `VuloPilot::init_classes()` and read
from the container by vulopilot-pro and the Dashboard/History controllers, so they exist whether or
not the module is active; the REST surface itself gates on the module being active.

## Safety validation (`AI\AISafetyValidator`)

Two gates, called from `AiRequestSender` for every caller:

- **`validate_prompt()`** — runs *before* a request is ever sent. Rejects prompts over 32,000
  characters (`MAX_PROMPT_LENGTH`), and rejects (rather than silently stripping) any prompt whose
  text matches a known API-key shape (OpenAI-style `sk-[a-zA-Z0-9]{20,}`, Google
  `AIza[0-9A-Za-z\-_]{35}`, a PEM `-----BEGIN (RSA |EC )?PRIVATE KEY-----` header) — a
  self-consistency check against a prompt-builder interpolating a credential, not a general PII
  scanner.
- **`sanitize_response()`** — runs on every response before anything sees it. Strips all
  HTML/script content via `wp_kses( $content, array() )` — an AI response is never trusted as
  safe-to-render markup just because the HTTP call succeeded.

## Extension strategy

- **A new AI action**: implement `AIActionInterface` and add the class through
  `vulopilot_ai_action_sources` (`AiCopilot\ActionRegistry`), the same discovery-by-filter shape as
  `SCANNERS.md`/`RULE-ENGINE.md`. vulopilot-pro's `AbstractBasicAction` is the model.
- **A new AI backend**: not an extension point. Which vendor answers is a VuloCloud-side change
  (`contexts/vulopilot/ai-byok`), not a class here.

## What's not here yet

- **Multimodal (vision) messages** — see "Images" above; needs a VuloCloud-side wire contract
  change. `AI-ACTIONS.md`'s `GenerateAltAction` is context-based, not vision-based, as an honest
  answer to that gap.
- **Quota enforcement** — nothing reads or increments a spend/token budget. The per-minute budget
  in `AiRequestSender` limits *rate*, not total spend, a related but different mechanism.
