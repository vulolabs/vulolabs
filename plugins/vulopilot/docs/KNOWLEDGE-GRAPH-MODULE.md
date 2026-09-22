# VuloPilot — Knowledge Graph module

Companion to [`DATABASE.md`](DATABASE.md), [`SCANNERS.md`](SCANNERS.md),
[`DASHBOARD-WIDGETS.md`](DASHBOARD-WIDGETS.md),
[`BRAND-INTELLIGENCE-MODULE.md`](BRAND-INTELLIGENCE-MODULE.md), and to
`vulopilot-pro`'s own
[`KNOWLEDGE-GRAPH-MODULE.md`](../../../../plugins/vulopilot-pro/docs/KNOWLEDGE-GRAPH-MODULE.md).
Unlike
every prior phase, Knowledge Graph is a genuinely new conceptual area —
there was no existing entity-extraction, entity-relationship, or graph
data structure anywhere in this codebase to build on. This doc covers the
audit that established that, the deterministic design that resulted, and
what's genuinely new in Free vs. Pro.

## Audit: what already existed

Every existing "entity"-adjacent scanner (`SchemaScanner`,
`OrganizationSchemaScanner`, `AuthorSchemaScanner`,
`GeoEntityNamingConsistencyScanner`, `StructuredDataValidationScanner`)
turned out to be a **boolean regex presence check**, not a parser — none
of them decode JSON-LD into structured fields or extract a name/type from
arbitrary content. The one real, structured entity in the whole codebase
is the Organization sub-object Pro's own
`MechanicalFixRunner::generate_organization_schema()` nests into
`vulopilot_homepage_schema_json` as `publisher` — real name/url/logo, but
only present once a site owner has run that Pro fix, and only ever one
Organization (the site itself). No Service/Location/LocalBusiness concept
exists anywhere (confirmed by exhaustive grep). No taxonomy-as-entity
reading exists (`get_terms()`'s only real usage is sitemap generation). No
graph/adjacency data structure has ever been built or persisted —
`InternalLinkingScanner`/`OrphanPageScanner` both discard the link data
they parse per-post, never accumulating it.

**Conclusion**: "Entity Extraction" (Free) is built entirely from real,
already-existing WordPress/WooCommerce data — never NLP/NER-style text
mining, which this codebase has no capability for and none is introduced.
"Entity Relationships" (Pro) is the first genuinely graph-shaped persisted
data this codebase has ever had.

## Free — `Services\EntityExtractor`

Six entity types, each backed by a real, deterministic data source:

| Type | Real source |
|---|---|
| People | WP users who authored at least one published post/page (`get_userdata()` per distinct `post_author`) |
| Organizations | `vulopilot_homepage_schema_json`'s own `publisher` sub-object when a site owner has run that Pro fix, falling back to the site's own title/URL (always real) otherwise |
| Products | Real WooCommerce products (`wc_get_products()`, `class_exists('WooCommerce')` guard — same pattern `ProductMissingCategoriesScanner` already uses), `null` when WooCommerce isn't active |
| Services | Owner-curated: newline-separated page URLs/ids (new `entity_service_pages` setting), each resolved to a real published page |
| Locations | Owner-curated: newline-separated `Name \| Address` lines (new `entity_business_locations` setting) |
| Categories | Real taxonomy terms currently attached to at least one published post/product (`get_terms(['taxonomy' => [...], 'hide_empty' => true])`) |

Services/Locations are owner-curated rather than auto-derived because
there is no existing Service/LocalBusiness concept anywhere in this
codebase to read them from automatically — same "Free owns the setting,
deterministic once provided" posture `geo_competitor_urls` already
established. Nothing is fabricated: both are empty arrays until
configured, and `products` is `null` (not `0`) when WooCommerce isn't
active, matching `Dashboard`'s own `category_scores.woocommerce`
convention.

Gated on the `entity-extraction` module being active
(`VuloPilot()->modules->get_active_modules()`) — this service has no
scanner/finding of its own to gate through `ScannerRegistry`'s usual
category mechanism, so it checks module state directly.
`modules/EntityExtraction/Module.php`'s own job is narrow but real: bust
`EntityExtractor`'s 1-hour transient cache on the WordPress hooks that
would actually change its output (`save_post`/`deleted_post`/
`created_term`/`edited_term`/`delete_term`).

`GET /entities` (`Controllers\EntityExtraction`) exposes
`extract_all()`'s own grouped shape. The Knowledge Graph page
(`src/pages/KnowledgeGraph/KnowledgeGraph.tsx`) lists all 6 groups with
real counts, and hosts Pro's own 3 card slots
(`vulopilot_knowledge_graph_visualization_card`/
`_recommendations_card`/`_health_card`) plus a Dashboard widget
(`knowledge-graph`, entity counts per type).

## Pro (`modules/KnowledgeGraph/`)

### Entity Relationships — deterministic, no AI cost

`EntityRelationshipBuilder` computes edges entirely from data
`EntityExtractor` already returns — deliberately **not** by re-scanning
raw post content for name mentions (which would duplicate
`GeoEntityNamingConsistencyScanner`'s own "find variants of a known
string" approach for a much weaker signal: a name appearing in text
doesn't reliably mean a real relationship). Two kinds of real edges:

- `authored_content_for` (Person → Organization), `offered_by` (Service →
  Organization), `located_at` (Location → Organization) — every real
  extracted Person/Service/Location connected to the site's own
  Organization entity (a hub-and-spoke shape).
- `categorized_as` (Product → Category) — a product's own real
  `category_ids` (already in `EntityExtractor`'s own Product meta) cross-
  referenced against extracted Category entities by term id. No new
  WooCommerce query needed.

Stored in a new table, `vulopilot_entity_relationships`
(`EntityRelationshipRepository`, extends Free's `AbstractRepository` —
Free owns the table schema/migration in `Install.php`, same
`BrandScoreHistoryRepository` split). Rebuilds are idempotent
(`upsert_relationship()` dedupes on an md5 hash of from/to/type) and
self-cleaning (`delete_relationships_not_in()` drops edges for entities
that no longer exist). `EntityGraphScheduler` rebuilds daily and fires
`vulopilot_pro_entity_relationships_built`.

### Knowledge Graph Health — a genuinely new scoring shape

Every other composite score in this codebase
(`Controllers\BrandIntelligence`'s scanner-severity-breakdown deduction,
`CrawlReport`'s totals) is either a severity-weighted deduction or a raw
count. Knowledge Graph Health is neither — it's an **entity/relationship
completeness ratio**, confirmed to have no prior precedent anywhere in
this codebase. `KnowledgeGraphHealthSnapshotBuilder::calculate_health_score()`
averages whichever of these dimensions actually apply to the site (each
skipped entirely, not counted as 0, when the site has none of that entity
type — same honesty `category_scores.woocommerce`'s own `null`-when-
inactive convention practices):

- % of People with a real author bio.
- % of Locations with a real address.
- % of Products with a real `categorized_as` relationship (skipped
  entirely when WooCommerce is inactive).
- Whether the Organization entity has a real logo (always evaluated —
  `extract_organizations()` always returns at least the site-title
  fallback, so this dimension is never skipped).

Same Snapshot-Builder → Scheduler → Monitor triad
`BrandScoreSnapshotBuilder`/`BrandScoreSnapshotScheduler`/`BrandMonitor`
already establish, but chained onto the relationship rebuild rather than
its own separate cron: `Module.php` hooks
`vulopilot_pro_entity_relationships_built` (fired by
`EntityGraphScheduler` once the graph rebuild completes) to immediately
also rebuild the health snapshot, so Health always reflects the
just-rebuilt graph. Stored in `vulopilot_kg_health_history`
(`KnowledgeGraphHealthHistoryRepository`, same Free-owns-the-table split).
`KnowledgeGraphHealthMonitor` logs every run and emails
(`email_on_kg_health_drop`/`kg_health_drop_threshold`) on a real drop,
same pattern `BrandMonitor` already uses.

### Entity Recommendations — a real AI call, action-driven

`EntityRecommendationAnalyzer` is the one class in this phase that spends
real AI money — same "safety-validate → fallback chain → send → sanitize"
sequence `GeoAnalysis\GeoAnalyzer` already goes through via
`AiRequestSender`. Unlike GeoAnalyzer/`ContentIntelligence\ContentAnalyzer`
(both Free classes, since per-post AI scoring started as a Free feature
before its own route/UI moved to Pro), Entity Recommendations never
existed in Free at all — it's genuinely new to Pro, so this class lives
entirely in Pro, consuming Free's shared `ai_request_sender`/BYOK provider
infrastructure directly (`VuloPilot()->ai_request_sender`), the same
legitimate cross-boundary reuse `Automation\Module` already does for
Free's own `RuleEngine`/`FindingRepository`. Action-driven
(`POST /knowledge-graph/recommendations`), not persisted anywhere — same
posture `BrandCompetitorAnalyzer`/`CompetitorComparisonCard.tsx` already
establish for an on-demand analysis with no natural "one row per X" home.
Strict response validation, same "every expected key present, or throw"
rule `GeoAnalyzer::parse_response()` already uses.

### Entity Automation — one new trigger, no new mutating action

`KnowledgeGraphBuiltTrigger` implements `TriggerInterface` directly
(no per-object WP hook to extract an id from — same object_type `'*'`/
object_ref `null` convention `AbstractCronTrigger` already uses for a
sitewide fire), registered via `vulopilot_trigger_sources`. It doesn't
schedule anything itself; it hooks the same
`vulopilot_pro_entity_relationships_built` action `EntityGraphScheduler`
already fires. This lets a site owner wire an automation using the
existing action library (`SendEmailAction`/`CreateNotificationAction`) to
run whenever the graph rebuilds — deliberately **no new mutating
`ActionInterface` action** this phase; a genuinely new "auto-tag/auto-link
entity" action would need real design work of its own this phase's scope
didn't call for.

### Graph Visualization — no new dependency

`KnowledgeGraphVisualizationCard.tsx` is a plain, dependency-free SVG
radial layout — no force-graph/D3/network-visualization library was added
for one card. The Organization entity anchors the center; every other
real entity is placed on a circle around it; every real edge
(`GET /knowledge-graph/relationships`) is drawn as a line between the two
real node positions it connects. No physics simulation — a fixed circular
layout is simple, legible, and correct for the hub-and-spoke shape this
phase's own relationship types actually produce.

### REST

`Rest.php` registers under array key `knowledge_graph_pro` (Free's own
`entities` key is different regardless, but kept distinct anyway for
consistency with every other Free/Pro controller pairing's own key-
collision-avoidance convention). Three routes:
`GET /knowledge-graph/relationships` (Graph Visualization's edge data),
`GET /knowledge-graph/health-history` (Knowledge Graph Health),
`POST /knowledge-graph/recommendations` (Entity Recommendations, the one
real AI call).

### Reports

`KnowledgeGraphReport` extends `AbstractReportType` directly (not
`AbstractCategoryReportType` — this isn't `vulopilot_scan_findings` data),
registered via `vulopilot_report_type_sources` the same way
`AiCrawlerAnalytics\CrawlReport`/`AdvancedReports\HealthReport` already
are.

## Tests

`test-entity-extractor.php` (Free) — real unit tests over
`EntityExtractor`'s own deterministic `extract_*()`/`get_homepage_publisher()`
methods (invoked via Reflection, same posture
`test-about-page-analysis-scanner.php` already documents), stubbing only
the plain WordPress functions each one touches. `extract_products()`'s
"WooCommerce active" branch isn't covered (would need a real/mocked
`WC_Product` graph this test suite has no precedent for); its "WooCommerce
inactive" branch is covered for free since the `WooCommerce` class
genuinely doesn't exist in this Brain\Monkey-only bootstrap.

`test-entity-relationship-builder.php`,
`test-knowledge-graph-health-snapshot-builder.php`,
`test-entity-recommendation-analyzer.php`, and
`test-knowledge-graph-report.php` (Pro) — same Brain\Monkey-based fast-
unit-test posture every prior module's own Tests section documents. Run
with `vendor/bin/phpunit` from either plugin directory.

React tests (`wp-scripts test-unit-js`) cover
`src/pages/KnowledgeGraph/__tests__/KnowledgeGraph.test.tsx` (the 6
entity-group listing, including the `products: null` "not applicable"
state) and `KnowledgeGraph.pro-filters.test.tsx` (Pro filter-slot
rendering), plus `src/dashboard-widgets/__tests__/KnowledgeGraphWidget.test.tsx`
(Free), and `EntityRecommendationsCard.test.tsx`/
`KnowledgeGraphHealthCard.test.tsx`/`KnowledgeGraphHealthWidget.test.tsx`/
`KnowledgeGraphVisualizationCard.test.tsx` (Pro). Run with
`pnpm test:unit:js` from either plugin directory.

## What's not here yet

- **A shared PHP/TS source of truth for relationship-type display
  labels** — `authored_content_for`/`offered_by`/`located_at`/
  `categorized_as` are plain strings on both sides today, same kind of
  manual-sync gap `AI-CRAWLER-ANALYTICS-MODULE.md`'s own bot-signature
  list already documents.
- **A "mentions" relationship type** (post content referencing an entity
  by name) — deliberately out of scope this phase; see the audit section
  above for why re-scanning content for name mentions was rejected as too
  weak a signal to persist as a real graph edge.
- **A mutating Entity Automation action** — this phase's trigger only
  ever fires into the existing action library; no new
  `AIActionInterface`/`ActionInterface` action was added.
