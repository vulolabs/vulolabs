/* global appLocalizer */

/**
 * Whether the real, Pro-only `content-tools` module
 * (vulopilot-pro's own modules/ContentTools/Module.php) is currently
 * active — the real gate for 9 of Create Content's own "Content Tools"
 * grid tiles (`ContentTool.pro === true` in ContentToolsGrid.tsx: Landing
 * Pages, Product Descriptions, FAQ Generator, Schema Generator, Image Alt
 * Text, Meta Generator, Content Optimizer, Content Refresh, Media Library
 * AI), per direct instruction. The other 3 tiles (AI Writer, Blog
 * Generator, Duplicate Content) are NOT gated by this — they stay free,
 * gated only on `useAiCredits()`'s own real AI-connected check
 * (ConnectVuloCloudPopup), the same way this whole grid used to work
 * before this split.
 *
 * A distinct id from `copilot-chat` (useCopilotChatEnabled.ts's own gate
 * for "Chat with VuloPilot" — a different feature) and from `ai-copilot`
 * (useAiCopilotEnabled.ts's own free master gate, still also required
 * server-side: "Fix with AI" buttons on individual findings run several
 * of these exact same actions and explicitly stay free — see
 * ContentTools\Rest.php's own docblock for why only these 9 tiles' entry
 * point moved). `active_modules` is already localized synchronously at
 * page load (see FrontendScripts.php's own localize_scripts()), so this
 * is a plain read, no fetch, no loading state needed.
 *
 * Cardless (no Settings → Modules toggle of its own) — an active Pro
 * license alone turns this on (VuloPilotPro::CARDLESS_MODULE_IDS), so
 * `false` here means "no active Pro license," not "toggled off."
 *
 * Server-side, the same real check backs vulopilot-pro's own
 * ContentTools\Rest.php permission callback
 * (`VuloPilot()->modules->is_active( 'content-tools' )`) — this hook is
 * the client-side half, not the enforcement itself.
 */
export const useContentToolsEnabled = (): boolean =>
	appLocalizer.active_modules?.includes('content-tools') ?? false;
