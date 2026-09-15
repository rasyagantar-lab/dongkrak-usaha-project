# DongkrakUsaha AI Marketing & SEO Publisher

## Current Phase
- Phase: 2 (engine complete) -> handover-ready for 7 PKL operators
- Status (2026-09-14): full text pipeline PROVEN with real keys; MD contracts are live runtime input; market-siege drafting/realisation PROVEN; visual pipeline = real base photo + local caption (PROVEN), optional AI base photo (implemented, awaits a provider token); welcome splash + low-RAM animation pass VERIFIED in a real browser. See "Roadmap Completion Summary" near the end of this file.

## Project Overview
This project is a local VS Code codebase for the DongkrakUsaha AI marketing and SEO publisher. It combines a React frontend, Express backend, Gemini API integration, and a Chrome extension that bridges a real DongkrakUsaha tab to the publisher app.

## Project History
- It began in Google AI Studio and was moved into local development.
- Local development now expects .env-based configuration instead of AI Studio-provided environment injection.
- Several historical bugs were already identified and fixed, including stale extension source and cache issues.

## Source of Truth
- Primary web app code: src/
- Primary backend: server.ts
- Primary extension source: public/extension/
- Do not recreate or rely on the old root extension folder.

## Architecture
### Frontend
- React + Vite + TypeScript
- Main UI is in src/components/PublishingHub.tsx

### Backend
- Express server in server.ts
- Handles Gemini routes, campaign storage, history, and ZIP download generation

### Extension
- Manifest V3 extension under public/extension/
- Background worker coordinates inspection and bridge recovery
- Content script bridges browser page state into the web app via window.postMessage

## Verified Bugs / Fixes
### Bug 1 - Stale Duplicate Extension Source
Status: PROVEN / FIXED
Root Cause: There were duplicate extension sources and the build used the wrong one.
Fix: Use only public/extension as the source of truth.

### Bug 2 - CDN / ETag Cache
Status: PROVEN / FIXED
Root Cause: ZIP downloads could be cached by intermediaries.
Fix: Added no-store headers and cache busting via timestamp query parameter.

### Bug 3 - Iframe DOM Race
Status: PROVEN / FIXED
Root Cause: all_frames and match_about_blank caused empty frames to answer first.
Fix: Removed those settings and pinned the inspection to frameId: 0.

### Bug 4 - Duplicate Content Script Injection
Status: PROVEN / FIXED
Root Cause: service worker re-injected content.js after it was already alive.
Fix: Added PING guard and safer recovery logic.

### Bug 5 - dotenv / Local Environment
Status: FIXED BUT UNVERIFIED
Root Cause: AI Studio injected env vars, but local runtime did not load .env.
Fix: Added import "dotenv/config" at the top of server.ts.
Verification needed: actual local Gemini API runtime test.

## Current Open Problems
- Strategy route is implemented in server.ts and mapped to its dedicated feature registry.
- Project memory and model registry were updated to reflect the premium workflow.
- Keyword route passed live validation and returned a local keyword using Gemini 3.6 Flash.
- Content and audit request routing use their feature-specific keys and current provider model IDs.
- Image stage now has a dedicated creative-brief route; actual bitmap generation remains dependent on a configured image provider.

### Runtime Validation Finding
- First keyword smoke test reached the new route but all old keyword models returned provider 404 responses.
- This was a model availability issue, not a route or schema issue.
- Keyword → content smoke test passed once after the registry update.
- A later full chain was blocked by provider demand/quota; the router now isolates that cooldown from other specialist features.
- The clean audit smoke test succeeded after the isolation fix. The audit response was `WARNINGS`, SEO score `75`, model `gemini-3.6-flash`.
- Provider logs also showed content `503 UNAVAILABLE` followed by `429 RESOURCE_EXHAUSTED`; fallback attempts were made as designed.

## Next Phase 2 Step
- Begin image generation only after the validated audit result is accepted or its warnings are handled.
- WebP conversion and final packaging remain blocked until image output exists.
- The first image-stage deliverable is a structured creative brief, not a fabricated image file.
- Image brief is now validated; actual bitmap generation and WebP conversion remain the next implementation gates.
- Bitmap generation route is now implemented with OpenAI Image API and local PNG persistence; live success depends on `OPENAI_API_KEY_IMAGE` and provider quota.
- Bitmap smoke test confirmed the provider key is not configured in the current local environment; valid prompts return a clear 503 until the key is added.
- Bitmap input validation was corrected and verified: short prompts return 400, while valid prompts without the provider key return 503.
- API-key ownership is now strict: each Gemini worker resolves only its own `GEMINI_API_KEY_<FEATURE>` key; no global `GEMINI_API_KEY` fallback remains. Bitmap generation uses only `OPENAI_API_KEY_IMAGE`.
- Runtime smoke test confirmed a missing keyword key returns `GEMINI_API_KEY_KEYWORD` configuration error instead of borrowing another key.
- WebP route passed runtime validation: a 1x1 PNG converted to WebP with preserved dimensions, and a traversal path was rejected with HTTP 400.
- Final orchestrator package route now merges specialist outputs, preserves audit findings, and blocks publishing readiness when audit or image/WebP gates are incomplete.
- Final package smoke test passed: incomplete input returned `INCOMPLETE` with two blockers; complete assets plus `READY` audit returned `COMPLETE` and `readyForPublishing: true`.
- Publishing audit confirmed there is no production form-fill or submit action yet; `mark-published` is bookkeeping, not autoposting.
- Autopost vertical slice is now implemented behind a confirmation gate: extension field mapping/autofill, CAPTCHA detection, and submit command are connected to the Manual Assist panel.
- Runtime validation still requires a real logged-in DongkrakUsaha form; CAPTCHA behavior is detected at runtime rather than assumed absent.
- Autopost static validation passed: TypeScript/build and both extension syntax checks are clean. A live logged-in form test is still required before claiming successful listing creation.
- Autopost UI previously had no timeout when the extension bridge failed, leaving the status stuck indefinitely. Added request tracking and a 10-second timeout with reload guidance.
- Live test found autofill worked but the UI stayed in a waiting message because the result did not report completed field counts. The result now returns filled/missing counts and page URL immediately.
- Field matching now includes associated labels, parent text, title/data-label, and expanded meta-description aliases.
- Live retest identified exactly two remaining misses: `kategori` and `metaDeskripsi`. Category matching now normalizes and partially matches select option value/text; meta description matching now covers additional attribute/label aliases and returns `missingDetails` for diagnosis.
- Latest live result was `0 field diisi, 7 belum ditemukan` despite the extension confirming 65 authoritative fields. The target controls are `#kategori`, `#penawaran`, `#produk`, `#deskripsi`, `#keyword`, `#metadesc`, and `#no_wa`.
- Root-cause hypothesis: heuristic matching was not reliably binding the live controls. Autofill now prioritizes exact `name`/`id` matches before heuristics and returns matched selector plus select-option diagnostics.
- Documentation correction: the latest 0/7 result was not recorded immediately in the prior cycle; it is now recorded before the next retest, following read -> work -> verify -> record.
- Latest live result improved to `6 field diisi, kategori belum ditemukan`. Screenshots confirmed `#kategori` is a custom searchable dropdown: the campaign value is a longer phrase such as `Jasa Rakit Furniture`, while the selectable option is `Furniture`.
- Category autofill now ranks option text/value overlap, selects the best authoritative option, dispatches native events, and synchronizes common custom dropdown widgets.
- Live category result confirmed the mapper was faithfully using the campaign source value. The user clarified the intended category is `Jasa Furniture`, not `Jasa Kontraktor`.
- The first campaign now uses `Jasa Furniture` consistently in business category, mapped category, and Dongkrak listing category; category selection must follow confirmed campaign data, not guess from the product title.
- Validation passed after reverting the mistaken category: all three campaign category sources are `Jasa Furniture`, and TypeScript plus production build pass.
- Publishing taxonomy correction: business category remains `Jasa Furniture`, while the DongkrakUsaha listing category is now the platform option `Furniture`. These are intentionally separate values.
- The live Deskripsi screenshot shows a CKEditor rich-text iframe; autofill now has a dedicated CKEditor/iframe path plus textarea synchronization.
- Validation passed: business `category` and `mappedCategory` remain `Jasa Furniture`, listing `kategori` is `Furniture`, and extension syntax plus TypeScript/production build are clean.
- Live browser confirmation: Deskripsi is visible in the publishing app and successfully autofills into the DongkrakUsaha form through the rich-text editor path.
- Live submit test did not create a listing; the tab remained on the product form and no result appeared. Root cause hypothesis: submit used only a button click without a robust form submit fallback or result detection.
- Submit now uses `requestSubmit()` when available, with submit-event/click fallback and submitter diagnostics. Stale furniture campaign categories are normalized to platform option `Furniture` during autofill.
- Image upload is not part of the current autofill payload yet: image generation belongs to the image specialist/provider stage, while attaching the generated file to the DongkrakUsaha file input is a separate autopost implementation step.
- The live form requires a photo. Autofill now downloads the first campaign image and assigns it to the DongkrakUsaha file input; submit is blocked when image upload fails.
- Submit status was a false positive: `success: true` previously meant only dispatch, not publish. It now returns `dispatched: true, submitted: false` until a success URL/page confirmation exists.
- Validation passed after the image/submit correction: extension syntax, TypeScript, and production build are clean. Browser retest is required for real image transfer and publish confirmation.

## Product Priority Decision
- The primary product promise is automatic publishing to DongkrakUsaha, so real autopost integration is the next priority.
- Do not delay autopost implementation while polishing additional AI stages; the existing AI pipeline already defines the campaign payload contract.
- Build and validate a vertical autopost slice first: payload mapping → extension field fill → user confirmation → form submit → success URL detection → history persistence.
- Keep a dry-run/confirmation gate until real submit behavior is verified in the target site.
- Live browser confirmation received: the campaign successfully published to DongkrakUsaha with the required image. Field fill, image attachment, and submit now have functional proof.
- Next hardening step: detect the success URL/page automatically and persist the published URL to campaign history without manual entry.
- Automatic publish finalization is now wired to public listing URL detection from the extension bridge; it calls `mark-published`, updates the campaign, and persists history only for a public URL outside the member form.
- Validation passed after adding automatic finalization: TypeScript and production build are clean. Live verification should confirm the next public listing URL automatically appears in campaign history.
- After the next publish-history retest, resume the deferred AI specialist work, starting with the configured image specialist/provider path.

## AI Agent Engine - Key Slots, Quota Router, Orchestrator (2026-09-14)
Status: IMPLEMENTED, HAPPY PATH UNVERIFIED (no API key exists in this environment yet)

What changed:
- Quota router re-keyed to `(key fingerprint x model)`. Quota is consumed per provider key, so tracking it per feature was wrong whenever two agents shared a key. Key values are never stored or exposed; only a sha256 prefix.
- Removed a latent defect where the router re-sorted each feature's model list by a global ranking, overriding the per-feature order that AI_MODELS.md deliberately specifies.
- `.env.example` rewritten to be the real key-slot checklist for all six Gemini agents plus the OpenAI bitmap slot; the AI Studio-era global `GEMINI_API_KEY` is documented as deprecated and unused.
- `/api/gemini/status` now reports per-agent key configuration, per-model live status (cooldown seconds, success/failure counts), missing key names, and which agents share a key.
- Specialist prompts extracted into shared runner functions so the standalone routes and the orchestrator pipeline cannot drift apart.
- `/api/orchestrator/run` rewritten into a real delegation pipeline (strategy -> keyword -> content -> audit -> image brief) with a task ledger and dependency-aware skipping. It previously made one Gemini call and never invoked a specialist.
- New `AI Orchestrator` tab with ledger UI and an apply-to-campaign action; the old fake orchestrator panel removed from PublishingHub; ModelStatusIndicator rebuilt around per-agent slots.

Verification:
- `npx tsc --noEmit` and `npm run build` clean.
- Live pipeline run with zero keys returned HTTP 200 and a correct ledger: plan/strategy/keyword `failed` each naming its exact missing env var, content/audit/image `skipped` with dependency reasons, summary `0 done / 3 failed / 3 skipped`. No crash, no fabricated output.
- The success path has NEVER run. No key slot is configured, so output quality, real quota rollback, and shared-key accounting have no runtime evidence yet.

Next gate:
- User creates Gemini API keys and fills the slots in `.env`, then restarts the server.
- Re-run the orchestrator and confirm the ledger shows real models used per stage, then exercise quota rollback with real provider limits.

## FIRST SUCCESSFUL FULL AI PIPELINE RUN (2026-09-14)
Status: PROVEN by live runtime evidence -- the success path has now actually run for the first time in this project's history.

What happened: User created 7 real Gemini API keys at AI Studio and filled all 7 `.env` slots (`GEMINI_API_KEY_ORCHESTRATOR/STRATEGY/KEYWORD/CONTENT/AUDIT/IMAGE/BITMAP`). After a clean full process restart (see "Env Reload Bug" entry below for why a restart was required), `/api/gemini/status` reported `missingKeys: []` for the first time.

Live full-pipeline test (`POST /api/orchestrator/run`, real business data: "Jaya Furniture", Jasa Furniture, Bandung):
- Result: `{"total":6,"done":6,"failed":0,"skipped":0,"fallbacksUsed":3}` -- every stage (plan, strategy, keyword, content, audit, image brief) completed for the first time ever.
- All 6 stages ended up on `gemini-3.6-flash`. 3 of them (plan, keyword, audit) show `fallbackOccurred:true` because their registry-primary model `gemini-3.1-pro-preview` returned `429 RESOURCE_EXHAUSTED` with `limit: 0` on the free tier (see finding below) and the router correctly rolled to `gemini-3.6-flash`, which succeeded. Strategy/content/image show `fallbackOccurred:false` only because `gemini-3.1-pro-preview` was already cooling down from an earlier direct smoke test by the time those stages ran in this same request -- not a separate bug.
- Output quality is real and coherent: strategy, keyword clusters, SEO content, and image brief were all specific to the supplied business (kayu jati custom furniture, Bandung). The audit agent correctly flagged real gaps (`"Nomor kontak WhatsApp/Telepon tidak diisi"`, `"Alamat bisnis tidak diisi"`) because the test payload genuinely omitted them -- this is the audit rubric working, not fabrication.
- `readyForPublishing: false` with blockers `["Audit kualitas menghasilkan WARNINGS yang perlu ditinjau.", "Bitmap image dan konversi WebP belum dijalankan (stage terpisah)."]` -- exactly per the packaging contract in `ai-agents/orchestrator.md`.

Verification: This is now PROVEN, not FIXED BUT UNVERIFIED -- the first real Gemini generation, the first real fallback-on-quota-error, and the first real full orchestrator success all have direct runtime evidence in this entry.

## Real-Provider Finding: Free-Tier Quota Is `limit: 0` For Preview/Image Models On This Project (2026-09-14)
Status: CONFIRMED by direct provider error payloads; not a code defect.

- `gemini-3.1-pro-preview` (the registry-primary for orchestrator/keyword/audit/strategy) returns `429 RESOURCE_EXHAUSTED` with the provider stating `limit: 0` for `generate_content_free_tier_requests` on this Google Cloud project -- not "used up", structurally zero. `gemini-3.6-flash` (the registry-primary for content, secondary elsewhere) has real working quota and succeeds.
- All three bitmap candidate models (`gemini-2.5-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`) returned the identical `limit: 0` 429 on a real generation attempt, even though `GET /api/gemini/models?feature=bitmap` confirms all three ARE visible/listed on this account (`candidatesPresentOnAccount` matched all 3). Being listed is not the same as having quota -- this is exactly why AI_MODELS.md Rule 4 requires a real successful call, not just a registry/listing match, before calling a model "available".
- Router behavior was correct throughout: each 429 was classified as quota, the specific slot was cooled down 15 minutes, and the router tried the next candidate in order before giving up. `/api/gemini/status` confirmed all 3 bitmap slots at `QUOTA_EXHAUSTED` with matching cooldowns after the attempt.
- Practical consequence: text generation works today using `gemini-3.6-flash` (and any other non-preview stable model with real quota). Bitmap image rendering does NOT work yet on this Google Cloud project's free tier -- not a bug in this codebase, a provider-side entitlement gap. Likely next step is enabling billing on the project behind these API keys, or requesting a quota increase in Google Cloud Console; this has not been tried or verified.
- Do not re-attempt bitmap generation assuming it will succeed until either (a) billing/quota is confirmed changed on the Google Cloud project, or (b) `GET /api/gemini/models?feature=bitmap` is paired with an actual successful `/api/image/generate` call.

### Follow-up: Second Key (User's Main "Gemini Go" Account) -- Same `limit: 0` (2026-09-14)
Status: CONFIRMED, still blocked. This rules out "it was just the throwaway free account" as the explanation.
- User replaced `GEMINI_API_KEY_BITMAP` and `GEMINI_API_KEY_IMAGE` with keys generated from their main Google account, which has a "Gemini Go" consumer subscription. Verified the new key values actually loaded (fingerprint recomputed independently from the live `.env` file and matched the running server: bitmap `e0a84ecf2d77`, image `c0ae293ad8a9` -- see the env-reload bug entry above for why this double-check was necessary).
- Discovery (`GET /api/gemini/models?feature=bitmap`) still showed all 3 candidates present on the account.
- A real `/api/image/generate` call still failed on all 3 models with the identical `429`, `limit: 0` message.
- Working hypothesis (NOT verified): "Gemini Go" is a consumer subscription for the Gemini chat app (gemini.google.com), which is a different product from Cloud Billing on the Google Cloud project that issues API keys / backs AI Studio. A personal Gemini Go subscription does not automatically enable pay-as-you-go billing on an API project. If true, the fix is enabling Cloud Billing on the specific Google Cloud project tied to this key (in Google Cloud Console or AI Studio's billing settings), not switching accounts. This has not been checked or confirmed by the user yet.
- Per user instruction, no UI work was started following this result -- reported back first as agreed.

### Isolation Probe: The Keys Are Healthy, Only Image Models Are Blocked (2026-09-14)
Status: PROVEN. This closes the diagnosis -- it is neither a key problem, an account problem, nor a code problem.
Method: a direct probe against the provider (bypassing this app's router) using each key on both a text model and the image models, printing only slot/model/status so no key value was ever exposed.
Results:
- `GEMINI_API_KEY_BITMAP` -> `gemini-3.6-flash`: **HTTP 200**, real text reply.
- `GEMINI_API_KEY_IMAGE` -> `gemini-3.6-flash`: **HTTP 200**, real text reply.
- `GEMINI_API_KEY_BITMAP` -> `gemini-2.5-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`: all **429 `limit: 0`**.
- `GEMINI_API_KEY_IMAGE` -> `gemini-2.5-flash-image`: **429 `limit: 0`** (same block, so it is not slot-specific).
Conclusion: both keys have working quota. The free tier grants exactly zero allowance for image-OUTPUT models, on every image model offered and on both keys. Image generation via the Gemini API requires a billing-enabled (paid tier) project; no amount of key/account switching changes this.
Additional check: this account exposes NO `imagen-*` models at all. The only `predict`-capable models are `veo-3.1-*` (video), which are also paid-tier. Google's image path is fully closed here without billing.

### Alternative Image Providers - Evidence So Far (2026-09-14)
- Pollinations (`image.pollinations.ai`, no API key, no signup): live test returned **HTTP 200, a real 47KB JPEG**. BUT the returned image carries a visible `pollinations.ai` watermark even with `nologo=true`, and quality was soft/blurry with distorted furniture proportions. Verdict: usable to prove the pipeline end-to-end, NOT acceptable for real DongkrakUsaha product listings.
- Not yet tested (each needs a free account/token the user must create, no credit card required): Cloudflare Workers AI (FLUX-1-schnell, documented free daily allowance) and Hugging Face Inference (FLUX.1-schnell). Do not claim either works until probed with a real token -- AI_MODELS.md Rule 4.
- Architectural note for whichever is chosen: the `bitmap` feature currently assumes provider `gemini`. Supporting a non-Gemini renderer needs provider routing inside that feature, which the existing per-key cooldown/fallback machinery can carry unchanged.

### Gemini Image EDITING Is Blocked Too; Vision (Reading Images) Works (2026-09-14)
Status: PROVEN. Tested because the user reasonably hypothesised that only generation, not editing, might be free-tier restricted.
- Image editing (send an existing JPEG + an edit instruction to an image model): `429 limit: 0` on `gemini-2.5-flash-image` and `gemini-3.1-flash-image`, on BOTH the bitmap and image keys. Identical block to generation. Hypothesis disproven.
- Vision INPUT works: `gemini-3.6-flash` accepted the same inline JPEG and returned a normal HTTP 200 text answer about the photo.
- Rule that follows: Gemini on this account can READ images but cannot EMIT pixels, by any route (generate or edit). Any pixel-producing step must be local or non-Gemini.

### DECISION PATH: Local Composite Over One Real Base Photo Per Category (2026-09-14)
Origin: user's own proposal -- one manually uploaded real photo per service category, reused across listings with different per-listing text (subtitle, promo line) rather than a new AI image each time.
Key realisation: this needs no image-generation provider at all. `sharp` is ALREADY a project dependency (it backs `/api/image/convert-webp`), and it can composite an SVG text overlay onto a base photo locally.
PROVEN by runtime test: composited a two-line gradient caption bar (title + subtitle) onto a 768x768 base photo. Output 768x768 PNG, first variant 1944ms (sharp cold start), second variant **121ms**. Text rendered crisp and correctly.
Why this is better than any AI image provider here:
- No quota, no API key, no signup, no cost, no watermark, no rate limit.
- Deterministic: the same campaign always renders the same asset, so what is reviewed is exactly what is published.
- Text renders perfectly. Image-generation models are notoriously unreliable at rendering exact text, especially non-English strings -- a real risk for Indonesian business/promo copy.
- The base photo is a REAL product photo, which is both more credible on a marketplace listing and consistent with the quality-audit agent's factual-accuracy rules. A generated photo of furniture that does not exist would be a factual risk on a live listing.
AI still contributes where it actually works: the Image Brief agent (operational) decides WHAT the caption should say per listing, and Gemini vision (proven working above) can analyse the uploaded base photo.
IMPLEMENTED (backend only, 2026-09-14). Three new routes in server.ts:
- `POST /api/image/base-photo` -- registers/replaces the one real base photo for a service category. Takes `{category, imageBase64}`, slugifies the category into a filename, re-encodes through sharp (which both validates that the upload really is an image and normalises it to JPEG q90), and stores it at `public/base-photos/<slug>.jpg`.
- `GET /api/image/base-photos` -- lists stored base photos with slug, path, size, and last-updated.
- `POST /api/image/compose` -- takes `{basePath | baseBase64, title, subtitle?, badge?, outputFormat?, quality?}` and renders the caption over the photo via sharp, persisting to `public/generated-images/composed-<ts>.<ext>`. Supports webp (default), png, and jpeg.
Security/robustness decisions worth remembering:
- Caption text is injected into an SVG document, so all XML metacharacters are escaped. Without this a business name containing `&` or `"` would break the render outright. Verified with a title containing both.
- `basePath` is resolved against `public/` with the same traversal guard used by the WebP route, so a caller cannot read arbitrary files.
Verification (live, 2026-09-14): `npx tsc --noEmit` clean. Upload returned 200 with a normalised 768x768 JPEG. Compose produced a 24KB WebP in 338ms and a PNG variant with badge + escaped `"`/`&` in 133ms, both visually confirmed correct. Path traversal to `../../.env` was rejected with HTTP 400; a missing title was rejected with HTTP 400. Test artifacts were deleted from `public/` afterwards.
### Visual Asset Studio UI + Caption Contract Completed (2026-09-14)
Sequencing note: the user green-lit "the UI", but building it first would have meant building against an incomplete backend -- the Image Brief agent's MD contract had been updated to produce caption copy while its actual schema still only had a free-form `textOverlay`. The schema was completed first so the UI's "Ambil dari AI" button had something real to bind to.

1. Image Brief agent now emits structured caption copy (server.ts):
   - `IMAGE_BRIEF_SCHEMA` gained a required `caption { title, subtitle, badge }`.
   - The prompt states these strings are drawn verbatim onto a REAL photo with no further interpretation, sets hard limits (title 28 / subtitle 40 / badge 14 chars), requires an empty badge when no promo exists in the business data, and forbids inventing discounts, prices, or guarantees.
   - Live-verified: returned `title: "Custom Furniture Kayu Jati"` (26), `subtitle: "Jasa Custom & Rakit di Bandung"` (30), `badge: "GRATIS KONSUL"` (13) -- all within limits, and the badge was grounded in the campaign's real CTA rather than fabricated.

2. CORS fix for listing assets (server.ts) -- REQUIRED for autopost, not cosmetic:
   - `public/extension/content.js` fetches the listing image from INSIDE the dongkrakusaha.com tab, so every asset request is cross-origin. The old Unsplash sample worked only because Unsplash returns permissive CORS headers; a locally served file has none, so `response.blob()` would have failed and the image upload would have died silently mid-publish.
   - Added an explicit static mount for `/generated-images` and `/base-photos` that sets `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`. These directories hold generated listing artwork only, no secrets.
   - Verified live: both paths return the headers with correct content types.

3. New `Visual Aset` tab (`src/components/VisualAssetStudio.tsx`, registered in Header.tsx + App.tsx):
   - Step 1 uploads/replaces the base photo for the active campaign's category (mirrors the server's slugify so it can show the right stored photo).
   - Step 2 edits caption fields with live character counters against the same limits, plus "Ambil dari AI" which calls `/api/gemini/image-brief` directly. It deliberately does NOT depend on the orchestrator having run, and deliberately does not require a Campaign type change to store the brief.
   - Step 3 previews the render and "Gunakan untuk Campaign Ini" writes an ABSOLUTE url (`window.location.origin + assetUrl`) to the front of both `businessData.images` and `dongkrakListingData.images`, which is the exact order `content.js` reads. A relative path would resolve against dongkrakusaha.com and 404.

Verification: `npx tsc --noEmit` and `npm run build` both clean. Full chain exercised live: upload base photo -> AI caption -> compose -> asset served with CORS headers; the rendered image was visually confirmed correct (badge, title, subtitle all legible and properly placed). All test artifacts were deleted from `public/` afterwards.

NOT yet done / known gaps:
- The whole flow has never been run through the real browser UI, only through the API. Needs a live pass: open the Visual Aset tab, upload a REAL product photo, pull the caption, render, apply, then publish and confirm the image actually lands on DongkrakUsaha.
- The app must stay running at publish time, since the asset URL points at localhost.
- The 3-tab restructure (SEO/Content/Audit into inspection views) is still NOT done -- deliberately deferred as a separate reviewable change, since those tabs currently work and the change is reorganisation rather than new capability.

## Bitmap Image Renderer Migrated From OpenAI To Gemini (2026-09-14)
Status: IMPLEMENTED AND ROUTED CORRECTLY; blocked on provider-side free-tier quota (see finding above), not on missing code or missing keys.

Why: this account has Gemini keys only. The OpenAI bitmap path had never rendered a single image -- every run stopped at "OPENAI_API_KEY_IMAGE not configured" -- so it was a permanently blocked stage, not a working feature being replaced.

What changed:
- New feature class `bitmap` with its own key slot `GEMINI_API_KEY_BITMAP` (seventh slot). It is deliberately NOT the image-brief slot: rendering draws a different and much smaller allowance than text, so sharing would let the brief agent starve the renderer.
- `/api/image/generate` rewritten to call Gemini through the existing `generateWithFallback` router, so it inherits the model chain, per-key cooldown, and fallback accounting rather than re-implementing them. It reads the inline base64 image part from the response and persists it under `public/generated-images`, returning the model actually used, fallback flag, key fingerprint, and attempt list.
- One deliberate retry: if a model rejects `responseModalities`/`imageConfig` as an invalid argument (the router rethrows caller-side errors without rolling models, correctly), the route retries once with a bare config before failing.
- New `GET /api/gemini/models?feature=<feature>` discovery route: asks the provider which models the feature's own key can actually see, and reports which registry candidates are present on the account. Returns metadata plus a key fingerprint, never the key.
- OpenAI variables are now dead and marked deprecated in `.env.example`.

Model-name honesty: the bitmap chain (`gemini-2.5-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`) is a CANDIDATE list taken from Google's published image-model family. Documentation is not proof of what this account can call. A wrong ID is survivable: it returns 404, the router cools that slot for 24h and rolls to the next. The discovery route exists precisely so the candidates can be replaced with confirmed IDs before anything is called "available".

Verification:
- `npx tsc --noEmit` and `npm run build` clean.
- Unhappy-path (no key): discovery returned 503 naming `GEMINI_API_KEY_BITMAP`; bitmap generate returned 503 naming the same variable; a 5-character prompt still returned 400.
- With a real key configured: `GET /api/gemini/models?feature=bitmap` confirmed all 3 registry candidates are visible on the account. A real `/api/image/generate` call correctly attempted all 3 in order and correctly classified/cooled each on `429 limit:0` (see the free-tier quota finding above) -- the request/response wiring, model chain, and error handling are proven correct end-to-end.
- STILL NOT verified: an actual image file has ever been produced. The blocker is provider-side quota (`limit: 0`), not the code -- the modality config, inline-part extraction, and file persistence steps have never been reached because every attempt fails before the provider returns image data.

## Bug - Campaigns And History Were Never Persisted (2026-09-14)
Status: FIXED AND VERIFIED. Caused real data loss before the fix.
Root Cause (PROVEN): `campaignsStore` was `let campaignsStore = [...INITIAL_CAMPAIGNS]` and `publishRecordsStore` was a bare in-memory array. Nothing was ever written to disk, so every server restart silently reset all campaigns back to the three built-in samples and emptied publish history. Restarts are routine (the dev script has no watch, so every server change needs one), and this session alone restarted the server about ten times -- destroying any campaign work done in between.
User impact: the user reported "campaign nya kok udah habis ya bro?" -- their edited campaigns were gone. This was self-inflicted by the development process, not an external fault.
Fix:
- Campaigns persist to `data/campaigns.json` (`loadCampaignsFromDisk` on boot, `persistCampaigns()` after every mutation: create, update, mark-submitted, mark-published). The samples now only seed a FIRST run; a stored empty array is respected as a real state rather than re-seeded.
- Publish history persists to `data/publish-history.json` in `server/dongkrakusahaAdapter.ts`, written on add and on in-place update.
- `data/`, `public/base-photos/`, and `public/generated-images/` added to `.gitignore` -- runtime working data and user artwork, not source.
Verification (live): changed a campaign title via the API, confirmed the new title was present in `data/campaigns.json` on disk, killed the server, restarted, and confirmed the title survived. Test value was then reverted.

## Fix - Model Chains Were Artificially Limited To Two Models (2026-09-14)
Status: FIXED AND VERIFIED. Raised by the user, who was right.
Problem: each feature's chain was a hand-written two-model list, so the UI implied a key only had two models and an agent died when both were cooling down -- even though discovery showed the account exposes 40 `generateContent` models, of which ~15 are usable text models.
Fix: chains are now built from the provider's own ListModels response. The registry list stays the PREFERENCE order (AI_MODELS.md Rule 1C still holds) and discovered models are appended after it, capped at `MAX_CHAIN_LENGTH` (8) so a fully-blocked feature cannot spend forever failing. Results are cached per key fingerprint for 6 hours; a discovery failure degrades to registry-only rather than disabling the agent.
Non-hallucination property: every model in an extended chain came from the provider's own response for that specific key. Nothing is guessed.
Model-family separation (a bug introduced and caught during this same change): the first version appended text models to the `bitmap` chain, which would have asked an image renderer to run on `gemini-2.5-flash` and returned prose instead of pixels. `FeatureConfig` now carries `modelKind: 'text' | 'image'` and each feature is only extended with its own family.
Verification (live): text features report 15 discovered models and an 8-model chain; `bitmap` reports 7 discovered IMAGE models and a 7-model image-only chain. Content chain begins with the documented preference (`gemini-3.6-flash`, `gemini-3.1-pro-preview`) before any discovered model.

## Feature - Audit Feedback Loop In The Orchestrator (2026-09-14)
Status: IMPLEMENTED AND VERIFIED, including its safety guard.
Requested by the user: the audit result should return to the orchestrator, and if the auditor says the listing is not good enough, the orchestrator should re-commission the content agents rather than shipping rejected content.
Implementation (server.ts, stage 4b):
- After the audit, while readiness is `WARNINGS` or `BLOCKED` and under `MAX_REVISIONS` (2), the orchestrator calls `runContentAgent` with a `revision` payload carrying the previous draft plus the audit's specific findings, then re-audits.
- `runContentAgent` gained an optional `revision` argument that switches the prompt into rewrite mode. It explicitly instructs the agent NOT to fix "missing data" findings by inventing data (no fabricated WhatsApp numbers or addresses) and to preserve what already works.
- Anti-degradation guard: a revision is only kept if the re-audit scores it at least as high as before. A worse revision is discarded and the original draft is retained.
- The loop exits early on `READY`, on a rejected revision, or on any agent failure.
- `revisionHistory` and `summary.revisions`/`summary.revisionsAccepted` are returned so the UI can show what happened.
Verification (live run): audit returned `WARNINGS` at SEO 88, the orchestrator commissioned `content-revisi-1`, the re-audit scored 85, and the ledger recorded "Revisi DITOLAK dan dibuang: skor turun 88 -> 85. Draft lama dipertahankan." The guard did exactly its job; the loop cannot make content worse.

## UI - AI Content And QC Audit Tabs Removed, Merged Into Orchestrator (2026-09-14)
Status: DONE. This corrects a misread on my part: I had previously proposed keeping those tabs as "inspection rooms" and deferred the change; the user's actual instruction was to delete them and consolidate into the orchestrator.
- `content-writer` and `qc-audit` tabs removed from Header nav and from App's render switch. `SeoResearch`'s "next" navigation now points at the orchestrator.
- `ContentGenerator.tsx` and `QualityControlAudit.tsx` files are intentionally KEPT on disk but unmounted, so their single-agent prompts remain recoverable. They are dead code as of now -- do not assume they are wired.
- `OrchestratorPanel` now renders the full outputs rather than one-line summaries: keyword cluster with secondary keywords, the complete generated content (SEO title, meta description, scrollable full description, CTA), the full audit block (three score tiles plus every finding colour-coded by type), and the image brief including the caption (title/subtitle/badge) that feeds the Visual Aset renderer.
- A new "Loop Revisi Audit" panel shows each revision round with score before/after and whether it was kept or discarded.
Not done: the `seo-research` tab still exists as a separate manual stage and was left alone.

## Mandatory Working Rule
...

## Runtime Agent Boundary (revised 2026-09-14)
- PROJECT_KNOWLEDGE.md, AI_MODELS.md, and ai-agents/phase2-workflow.md are builder memory. Runtime agents never see them.
- Each of the six LLM-backed agents DOES now read its own `ai-agents/<agent>.md` -- literally, not as a discipline: the application loads that one file from disk on every call and prepends it to the agent's prompt (`FEATURE_MODEL_REGISTRY[...].contractFile` + `runAgent()`). An agent still never sees another agent's contract or any builder memory file.
- The application still injects model/provider/key/fallback metadata from AI_MODELS.md; the contract file adds the agent's behavioural rules on top of that routing metadata.
- The orchestrator and every specialist remain isolated by feature-specific key namespace.
- Agents may append (never rewrite) to their own contract via the optional `selfImprovementNote` field -- see the "MD Files Are Now Live Contracts" entry below and AI_MODELS.md Rule 1I.
- `bitmap` and `webp` have no contract file: bitmap's prompt goes straight to an image model, webp has no LLM call. `webp-converter.md` is documentation only.

## MD Files Are Now Live, Self-Developing Agent Contracts (2026-09-14)
Status: PROVEN by live runtime evidence.

Why: the user's standing rule is that reading its MD before a task is MANDATORY for every agent, and that agents should develop their own MD. Until now that was only true of the builder (me): `server.ts` never opened `ai-agents/*.md`; every prompt was hand-written, so an MD edit changed nothing until I noticed and re-edited the prompt by hand. The agents themselves could neither read nor write their files.

What changed (server.ts):
- `FeatureConfig.contractFile` set on the six JSON-schema features. `loadAgentContract()` does a plain `fs.readFileSync` on every call -- deliberately no cache, call volume is a handful of generations, and always-current is the whole point.
- `runAgent()` (the single choke point every agent AND the orchestrator pipeline funnel through) prepends the file behind `=== KONTRAK AGENT ANDA ... WAJIB DIPATUHI ===` and appends a standing instruction inviting an optional one-sentence `selfImprovementNote` (omit rather than fabricate).
- `selfImprovementNote: { type: Type.STRING }` added to all six schemas' `properties` -- never to `required`; verified against the installed `@google/genai` type declarations that this is the supported way to make a field optional.
- `appendSelfImprovementNote()`: append-only, dated bullets under `## Self-Improvement Log (auto-recorded)`, capped at 20, single synchronous read-modify-write (no interleaving under Node's event loop, same property `persistCampaigns()` relies on), never touches anything above the section. Isolated test of the string logic passed 10/10 cases including cap trimming and preserving a human section added after the log.

Verification (live, no restart between steps):
1. Appended a sentinel to `campaign-strategy.md` instructing the agent to set `brandTone` to `KONTRAK-TERBACA-ALPHA`. Called `/api/gemini/strategy`. Response: `brandTone: "KONTRAK-TERBACA-ALPHA"`. The agent also returned a `selfImprovementNote`, and it landed on disk under the auto-recorded heading.
2. Changed the sentinel to `...-BETA` on disk. Called again. Response: `brandTone: "KONTRAK-TERBACA-BETA"`. Proves a fresh read every call, no in-memory copy. A second note was appended.
3. Test artifacts (sentinel + the two notes from fictional test businesses) were removed by restoring the pre-test file, so the log fills from real use only.

Also fixed: `phase2-workflow.md`'s "Required Project Files" omitted itself and made a now-false blanket claim -- rewritten into builder-memory / live-contract / documentation-only groups. `webp-converter.md` never mentioned `/api/image/compose` -- added. All six contracts' "Self-Improvement Rule" sections now describe the real mechanism instead of an aspiration. Root `CLAUDE.md` created so the builder-side read/update discipline loads automatically every session.

Known trade-off accepted: contract files mix timeless rules with dated changelog notes that now reach the model verbatim. Low risk (output is schema-constrained) and not worth restructuring six files pre-emptively; revisit if prompts get noticeably long.

## AI Base-Photo Generation: Cloudflare Workers AI + Hugging Face (2026-09-14)
Status: IMPLEMENTED, unhappy paths VERIFIED, real generation UNVERIFIED (no provider token exists yet).

Why: the user chose to add real AI image providers after Gemini image generation was proven dead on this account (`429 limit: 0` on every image model, both keys). AI_MODELS.md Rule 1F still governs: the final captioned listing image stays local sharp compose. This only adds a way to produce the BASE photo underneath when there is no real one to upload.

Provider decision (live doc research, cite-checked in the plan): Cloudflare first, Hugging Face second. Cloudflare: 10,000 free Neurons/day, no card, no gating, fully published contract (~170 flux-1-schnell images/day, estimated). Hugging Face: this model routes to a paid third-party provider, free users get ~$0.10/month (~30 images, hard stop), and the model is gated behind a click-through. Legacy `api-inference.huggingface.co` is dead -- hostname does not resolve.

What changed:
- `FeatureConfig.provider` widened to include `"cloudflare" | "huggingface"`.
- `@huggingface/inference` (4.13.28) added -- official SDK, used because HF publishes no stable raw URL for text-to-image. `textToImage()` needs an explicit `{ outputType: "blob" }` second argument, otherwise TypeScript resolves the wrong overload and types it as `string`.
- `generateImageViaCloudflare` (plain fetch to the documented REST URL, body `{prompt, steps: 4}`, parses `result.image` base64 -- MODEL-SPECIFIC to flux-1-schnell), `generateImageViaHuggingFace` (SDK, Blob -> Buffer), and `generateBasePhotoWithAI` which walks that chain using the same `(key x model)` cooldown slots as the Gemini router (keyed `<provider>:flux-1-schnell`) and `classifyProviderError`. Each provider call attaches an HTTP `status` to thrown errors because plain fetch does not throw on non-2xx, unlike the Gemini SDK.
- `storeBasePhotoBuffer(category, buffer)` extracted from the upload route so both paths share validation, sharp normalisation, filename slugging, and response shape. While there, undecodable bytes now return a clean 400 ("File is not a readable image.") instead of a 500 with sharp's raw message -- a pre-existing rough edge, not a regression.
- New route `POST /api/image/generate-base-photo` `{category, prompt}`.
- Three env vars documented in `.env.example` with non-developer token-creation steps: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN_BITMAP`, `HUGGINGFACE_API_TOKEN_BITMAP`.
- `VisualAssetStudio.tsx` Step 1 gained a "Buat dengan AI" toggle with a prompt box (auto-filled from the Image Brief's `visualPrompt` when the caption is fetched) and an explicit on-screen warning to describe the photo WITHOUT text, since the caption is added locally later. Steps 2 and 3 are untouched.

Verification (live): no token -> 503 naming the exact env vars; 5-char prompt -> 400; missing category -> 400; bad image bytes -> 400; the existing upload route still stores a valid 768x768 JPEG through the shared function. `npx tsc --noEmit` clean.

### Cloudflare PROVEN with a real token (2026-09-14, same day)
The user created a Cloudflare Workers AI token + Account ID and filled both vars. After a full process restart (the env-reload gotcha), the first real call succeeded on the first attempt: `provider: cloudflare`, 1024x1024, 164KB JPEG stored at `/base-photos/jasa-furniture.jpg`, 2.3 s, `attempts: [{cloudflare, ok:true}]`. Visually reviewed: a clean catalogue-style teak chair in a bright room, no watermark, no text -- a completely different tier from the Pollinations output rejected earlier.

Full chain then proven end to end: that AI base photo -> `/api/gemini/image-brief` caption (`title "Custom Furniture Kayu Jati"`, `subtitle "Jasa Custom & Rakit di Bandung"`, `badge "KONSUL GRATIS"` -- grounded in the campaign's real CTA) -> `/api/image/compose` -> 1024x1024 WebP, 73KB, 485 ms. Visually reviewed: production-quality listing image with crisp Indonesian text. This confirms the Rule 1F division of labour works as designed: AI for the photo, local sharp for the text.

The generated base photo was kept in `public/base-photos/jasa-furniture.jpg` as a usable asset for that category (replaceable any time via "Ganti Foto"); the composed test output was removed.

Hugging Face remains UNVERIFIED (no token; and given Cloudflare's result it is now a low-priority fallback).

Status line for this feature is therefore: Cloudflare path PROVEN; HF path implemented/unverified.

## Market Siege ("Kepung Pasar"): Draft Every Sub-Area Free, Realise Only What Is Chosen (2026-09-14)
Status: PROVEN by live runtime evidence (draft + realise + isolation + delete guard).

Why: the app's purpose is to encircle a market area with SEO -- one business, every kecamatan in a city. Generating AI content for all of them blindly would burn quota on areas that may never be used. The user chose manual area entry over a bundled geo-dataset.

Key enabler found during exploration: the furniture sample (`cmp-001`) already writes every text field with a literal `[Nama Daerah Target]` placeholder. Drafting a clone per area is therefore pure string substitution -- zero AI calls.

What changed:
- `Campaign` gained `siegeBatchId`, `siegeTargetArea`, `siegeParentId` (all optional; the parent carries none).
- `POST /api/campaigns/siege` `{parentCampaignId, areaNames[]}`: deep-clones the parent and runs a generic recursive string-walker over every string leaf (not a hand-kept field list) -- a `[...]` placeholder is replaced with the area name; otherwise the parent's primary `targetCities[0]` text is replaced wherever it literally appears. Then `targetCities` (business + SEO) is overridden to `[areaName]`, the title gets `— {areaName}` appended if it does not already contain the area, a new id/batch id/status `Draft` are assigned, and `externalListingId`/`publishedUrl`/`validationScore` are stripped so a clone never inherits the parent's live listing identity or audit verdict. Areas are trimmed/de-duplicated server-side; max 100 per batch. Response reports `aiCallsMade: 0` explicitly. Comma-splitting is the CLIENT's job (`parseAreaNames`); the server takes the array as given.
- `DELETE /api/campaigns/:id` (new -- no delete existed before): refuses with 409 unless the campaign is `Draft`, since submitted/published campaigns have a listing and a history row behind them.
- `MarketSiegePanel.tsx` (new tab "Kepung Pasar"): parent picker (non-clone campaigns only) -> textarea of areas (newline or comma separated) -> "Buat N Draft" -> the app's first checkbox list, grouped by batch, all unchecked by default -> "Realisasikan (N)" runs `/api/orchestrator/run` STRICTLY one clone at a time (shared per-key Gemini quota; parallel would just race into 429s), applies with the same logic as `OrchestratorPanel.handleApply`, tracks per-item status via the previously unused `BulkQueueItem` type, and continues past individual failures. Draft rows have a delete button with a confirm.
- `App.tsx` gained `handleReloadCampaigns()` (re-pulls `/api/campaigns`) since the server creates records the client never built.

Verification (live):
- Drafted `["Ciputat", "Pamulang, Serpong", "  Pamulang  ", ""]` from `cmp-001`: 3 created (trim + dedupe + empty dropped), `aiCallsMade: 0`, every string field correctly substituted (title, address, keywords, listing fields), no placeholder left in any string leaf, `validationScore` stripped. (A first check reported leftover placeholders -- that was a test bug: the regex matched JSON array brackets. A string-leaf-only walk confirmed clean.)
- Realised ONLY the Ciputat clone via the orchestrator: COMPLETE 6/6, audit READY / SEO 92, real AI title. After PUT, Ciputat = `Ready to Publish`; the two siblings remained `Draft` with their substitution-only titles and no audit -- isolation proven.
- During that real run, `keyword-strategy.md`, `campaign-strategy.md`, `content-generator.md`, `image-generator.md` and `orchestrator.md` each received a genuine self-improvement note from their agent -- Phase 1's mechanism working in production, not in a test. Those notes were left in place.
- DELETE on the READY clone -> 409 with a clear message; after flipping to Draft, all three deleted; store back to 3 campaigns.
- `npx tsc --noEmit` clean.

Not yet done: the realise flow has only been exercised through its API calls; the tab itself renders correctly in a real browser (see Phase 4 verification) but the checkbox -> realise click path has not been driven end-to-end in a browser.

## Welcome Splash + Low-RAM-Safe Animation Pass (2026-09-14)
Status: VERIFIED in a real headless Chromium run (14/14 checks) plus screenshots.

Why: client-facing polish for 7 PKL interns on laptops that are often <=8GB RAM with integrated GPUs, and a credit to the student who built the app and their pembimbing. Research this session was decisive: do NOT adopt `motion`/`framer-motion` (installed but used nowhere; ~35-40kB gzip for the tier `AnimatePresence` needs; a second animation paradigm; does not auto-respect reduced-motion), do NOT use `backdrop-filter: blur()` (a full-viewport blur is the worst case for integrated GPUs sharing memory bandwidth with the CPU), animate only `transform`/`opacity`.

What changed:
- `src/index.css`: five small `@keyframes` (fade/scale in+out, panel settle-in) exposed as Tailwind v4 `@utility` classes (`animate-du-*`), all transform+opacity only, 180-280ms.
- `src/components/WelcomeSplash.tsx` (new): fixed overlay with a SOLID `bg-slate-900/60` scrim (no blur), centred card reusing the header's blue-600 badge + Globe mark. Credits Muhamad Rasya Ramadhan (siswa PKL, SMK Yadika 5) and pembimbing Aceng Komarudin. Dismiss via button, Esc, or click-outside. Shown once per `sessionStorage` (a new tab/window shows it again). Storage access is try/catch-wrapped so a blocked-storage context can never break the app. Every animated element carries `motion-reduce:animate-none`.
- `src/App.tsx`: splash mounted at the top, independent of the active tab. `<main key={activeTab}>` remounts the panel on every tab switch, re-triggering a 180ms settle-in -- the crossfade the plan called for, without any JS animation library.
- `index.html`: `lang="id"`, real `<title>`, `theme-color`, and an inline-SVG favicon using the same blue badge + globe mark (none existed before).
- `package.json`: `motion` removed (confirmed zero usages).
- `src/components/Header.tsx`: the campaign `<select>` could push the page 7px wider than a 400px viewport when a campaign name is long -- a pre-existing bug surfaced by the phone-width check, fixed with `min-w-0`/`max-w-[70vw]`/`truncate`.
- `CLAUDE.md` "UI conventions" records the Tailwind-only / no-blur / transform-opacity-only policy so a future session does not reintroduce the cost.

Verification (real headless Chromium, `playwright-chromium`): splash visible on first load with all four credit strings and the title; scrim has no backdrop-filter; page title set; dismisses on "Mulai"; "Kepung Pasar" tab renders its heading; "Buat dengan AI" button present on Visual Aset; splash NOT shown again after a same-session reload; splash shown again in a fresh browser context; no horizontal scroll at 400px (after the header fix); zero page errors. Screenshots reviewed: splash and Kepung Pasar both match the app's slate/blue palette.

## Operator Feedback Round 1: "I don't understand how to use this" (2026-09-14)
Status: FIXED (four concrete defects) + navigation reshaped. Deeper tab merge pending the user's decision.

The user, after actually using the app, reported: no visible UI change, unclear how to use it, no idea what "SEO & Keyword" or "Profil Bisnis" are for, a dropdown flooded with ~30 identical campaigns and no way to delete them, and the image pipeline feeling disconnected from the orchestrator. Honest assessment: correct on every point. The app had grown a tab per feature across sessions without ever being simplified, and the "client-ready UI" phase was a splash on top of a confusing structure.

Diagnosis of the "30 identical campaigns": the user had used Kepung Pasar correctly -- all 30 kecamatan of Kota Bandung, correctly substituted, Andir even realised and submitted. The feature worked; the header dropdown rendered `businessData.name` (identical for every clone) instead of the area, so 30 valid clones looked like junk. My defect.

Fixes:
1. Header dropdown: parents listed first, then each siege batch as an `<optgroup>` labelled "Kepung Pasar · <business> (N area)" with clones labelled by `siegeTargetArea` + status.
2. "SEO & Keyword" tab removed -- it ran the keyword agent alone, which the orchestrator already does. Same reasoning as the earlier Content/Audit removals. `SeoResearch.tsx` kept on disk, unmounted.
3. Orchestrator -> Visual Aset connected: `Campaign.imageBrief` (typed `ImageBrief`) is now persisted by "Terapkan ke Campaign" (and by siege realisation). Visual Aset prefills title/subtitle/badge AND the AI photo prompt from it, so the image-brief agent is no longer re-called (that was a wasted Gemini call per visit). "Ambil dari AI" remains as a fallback / "Buat ulang".
4. Delete: a "Hapus" button on the active campaign in Data Bisnis (Draft-only, disabled with a tooltip otherwise) and a "hapus N draft" bulk action per batch in Kepung Pasar, so 29 drafts do not need 29 confirmations.
Navigation reshaped: tabs reordered to the real work order and numbered (1. Data Bisnis, 2. Kepung Pasar, 3. AI Orchestrator, 4. Visual Aset, 5. Preview, 6. Publish, then Koneksi and Riwayat as utilities). New `GettingStartedGuide` on the landing tab: five plain-language cards (what / when / click to jump), collapsible and remembered per browser.

Verified in headless Chromium: dropdown shows 3 parents then a 30-area group with area labels; tabs render in the numbered order; guide renders; `npx tsc --noEmit` clean.

Open decision for the user: whether to merge Preview + Publish + Koneksi into one "Publish" tab (the largest remaining simplification) -- proposed, not done.

### Bug found in round 2: switching campaigns did not switch the panels (2026-09-14)
Status: FIXED and VERIFIED in headless Chromium.
Symptom (user): "when I pick a campaign the business-data form doesn't change" -- which made the whole campaign concept look meaningless.
Root cause: every per-campaign panel seeds local state from the `campaign` prop once on mount (`BusinessManager`: `useState({...campaign.businessData})`; `OrchestratorPanel`: `run`/`applied`; `VisualAssetStudio`: caption drafts). App rendered them without a campaign-dependent key, so a dropdown switch changed the prop but not the mounted state. Worse: `OrchestratorPanel` kept campaign A's `run` on screen after switching to B, and "Terapkan ke Campaign" merges `run.outputs` into the CURRENT `campaign` prop -- it would have written A's content into B.
Fix: the `<main>` wrapper is keyed on `activeTab + ':' + activeCampaign.id` -- every panel remounts fresh on either a tab or a campaign change.
Verified: dropdown Andir -> Katering -> AC Servis -> Antapani; the name and address fields followed each time.
Guide updated with a plain definition: one campaign = one listing to publish = business data + one target area + its AI outputs; the dropdown chooses which one every tab is working on; tab 3 runs the AI for that one, "Realisasikan" in Kepung Pasar runs the same engine for many.

## EXPERIMENT (not a decision): Cloud Run deployment via GitHub, branch `experiment/cloud-run` (started 2026-09-14)
Status: IN PROGRESS, UNVERIFIED. Nothing in this section is proven until stated otherwise. If it fails, the proven state is one command away -- see "Rollback" below. The LAN/single-laptop path remains the known-good way to run this app for the PKL team.

Why: the user wants to try hosting the app so 4 PKL interns + a supervisor can use it from anywhere, and proposed handing the repo to AI Studio to deploy. Concerns the user raised, in their words: the deploying AI must not modify the files; will the API keys (especially the non-Google Cloudflare key) be a problem.

Rollback (the whole point of this section):
- `master` is commit `29781fe` = the proven local/LAN state (MD contracts live, market siege, Cloudflare base photo proven, splash, persistence, operator-feedback fixes). `git checkout master` returns to it. Nothing on the experiment branch is merged unless a real deploy succeeds AND the user says so.
- `.env`, `data/`, `public/base-photos/`, `public/generated-images/` are git-ignored, so switching branches never touches campaigns, keys, or photos.
- The experiment adds a storage layer (`server/storage.ts`) that stays in LOCAL mode unless `GCS_BUCKET` is set. With that variable absent, every code path is intended to behave exactly as on `master`; this is re-verified locally before any deploy (see verification below once done).

Facts verified in code before starting (these are what make a naive "press deploy" fail):
1. Container filesystem on Cloud Run is disposable (wiped on restart / scale-to-zero). Eight runtime disk writes exist: `data/campaigns.json`, `data/publish-history.json`, `public/base-photos/*`, `public/generated-images/*` (3 routes), the extension zip, and the agents' self-improvement notes in `ai-agents/*.md`. All would be lost -- the "campaigns vanished" bug made permanent.
2. `const PORT = 3000` was hardcoded; Cloud Run injects `PORT` (8080) and kills containers that do not listen on it.
3. The server reads NINE env vars (`GEMINI_API_KEY_ORCHESTRATOR/STRATEGY/KEYWORD/CONTENT/AUDIT/IMAGE/BITMAP`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN_BITMAP`). The AI Studio era injected only a single `GEMINI_API_KEY`, which this app deliberately no longer reads. On Cloud Run they must be set explicitly (console/secrets). The Cloudflare key itself is not a problem: to the server it is just an env var and an outbound HTTPS call.
4. No Dockerfile existed; `npm start` runs `dist/server.cjs`, which only exists after `npm run build`.
5. No git remote exists; Docker is not installed on this machine, so the image cannot be build-tested locally -- that verification is deferred to the first Cloud Build.
6. The extension already whitelists `*.run.app` and a Cloud Run URL is https, so the mixed-content problem that blocks the LAN option does NOT apply here.
7. "The deploying AI must not modify files": this cannot be guaranteed if an AI agent is in the deploy loop. The mitigation chosen: make the repo deploy cleanly with zero edits (Dockerfile, PORT, storage) and recommend Cloud Run's own "deploy from GitHub repository" path, which involves no AI agent at all. AI Studio is then only the place the Gemini keys come from.
8. Billing: Cloud Run is believed to require a billing account on the GCP project even within the free tier. NOT verified here -- the user must check on the deploy screen. If it demands billing, that is the same card/KTP blocker as before and the experiment stops there.

Planned changes on the branch (each recorded as done/verified when it is):
- `server/storage.ts` (new): `readText/writeText/readBinary/writeBinary/list/remove`, local disk by default, GCS when `GCS_BUCKET` is set. Auth on Cloud Run via the service account (ADC), no key file.
- server.ts: `PORT` from env; campaigns/history/base photos/generated images/self-improvement logs routed through storage; assets served by a route that reads from storage (URLs unchanged); startup log of storage mode + which env var NAMES are set (never values).
- `Dockerfile` + `.dockerignore`; `DEPLOY_CLOUD_RUN.md` with exact console steps and a "do not modify" preamble aimed at any AI that reads the repo.

Progress on branch `experiment/cloud-run` (2026-09-14, later the same day):

DONE and VERIFIED LOCALLY:
- `server/storage.ts` written; `server.ts` and `server/dongkrakusahaAdapter.ts` route every runtime write through it (campaigns, history, base photos, generated images, agent self-improvement logs). `PORT` now from env. Startup prints storage mode + which key NAMES are set. Dead `resolvePublicPath`/`BASE_PHOTO_DIR` removed.
- Local-mode regression (no `GCS_BUCKET`): 33 campaigns intact incl. the user's Submitted Andir clone; base photo listed and served with CORS headers; traversal (`..%2F`) -> 400; compose read+write via storage landed on disk; convert-webp ok; history 200; status 8 features / 0 missing. Behaviour identical to master.
- Production bundle run exactly as the container CMD (`NODE_ENV=production PORT=8080 node dist/server.cjs`): listened on 8080, served `dist/index.html`, loaded 33 campaigns, served assets through the route, and completed a REAL strategy-agent call (contracts read from `<cwd>/ai-agents`, matching the Dockerfile's `COPY ai-agents`). `npx tsc --noEmit` and `npm run build` clean.
- `Dockerfile` (Node 22 Debian for sharp's glibc binaries; multi-stage; `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so playwright-chromium's ~150MB browser is not pulled), `.dockerignore` (excludes node_modules, dist, data, .env*, artwork), `DEPLOY_CLOUD_RUN.md` (console steps, the 10 env vars, bucket IAM, max-instances=1, what the startup log must show), README rewritten (the old one told readers to set a single `GEMINI_API_KEY` in `.env.local` -- wrong var, wrong file -- exactly the kind of thing that invites an AI agent to "fix" the repo). Both README and DEPLOY carry a do-not-modify preamble aimed at AI agents.

NOT VERIFIED (cannot be, from this machine):
- The Docker image itself (Docker not installed here) -- first real build happens in Cloud Build.
- GCS mode end to end. `server/storage.ts`'s gcs branch has never executed against a real bucket. Unknowns: ADC auth on the Cloud Run service account, `list()` metadata shape, `primeContractCache` merge with a populated bucket.
- Whether the user's GCP project can enable billing at all (external blocker).
- Design caveat to remember: in gcs mode the self-improvement log lives in the bucket and the RULES come from the image; editing `ai-agents/*.md` requires a redeploy to take effect. Documented in DEPLOY_CLOUD_RUN.md.

Rollback: `git checkout master` (checkpoint `29781fe`). Local data untouched. ONE CAVEAT: the agents keep appending self-improvement notes to `ai-agents/*.md` while the experiment branch is checked out (they are committed there). A plain checkout of master would revert those files and drop notes added since the checkpoint. To keep them: `git checkout master && git checkout experiment/cloud-run -- ai-agents/ && git commit -m "carry agent notes"`.

### Finding: AI Studio DID modify the repo despite the do-not-modify notices (2026-09-14, evening)
Method: the user uploaded a zip of `experiment/cloud-run` to AI Studio, deployed, and exported AI Studio's copy as a zip. Both zips were extracted OUTSIDE the repo (scratch folder) and diffed file by file. Nothing from AI Studio's copy was merged.
What AI Studio changed (exact, verified by diff):
1. `server.ts` -- `const PORT = Number(process.env.PORT) || 3000` reverted to `const PORT = 3000` (removes plain-Cloud-Run compatibility; only works where the platform proxies to 3000, which AI Studio's runtime does).
2. `server.ts` -- `getFeatureApiKey` gained `|| (config.provider === "gemini" ? process.env.GEMINI_API_KEY : undefined)`: a silent fallback to a single global key. This directly violates AI_MODELS.md Rule 1 ("a worker must never fall back to GEMINI_API_KEY"). Consequence on AI Studio: all 7 agents share one key and one quota. Not invisible -- the fingerprint-based status will list all 7 under `sharedKeys` -- but the isolation design is defeated.
3. `.env.example` -- every comment stripped (the intern-facing token-creation instructions, the key-slot model explanation, the deprecation note) and `GEMINI_API_KEY=` ADDED back at the top. `GCS_BUCKET` is absent, so AI Studio has no idea storage can be external.
4. `package.json` -- `playwright-chromium` removed (harmless: only used by scratch test scripts and `test_dongkrakusaha.cjs`, never by the server).
5. `index.html` -- title changed to "DongkrakUsaha AI Marketing & SEO Publisher", meta/og description added (cosmetic; the splash still says Asisten Premium).
6. DELETED: `Dockerfile`, `package-lock.json`, `bun.lock`. AI Studio builds with its own pipeline, so our container definition is discarded and installs are no longer lockfile-reproducible.
7. ADDED: `metadata.json` declaring `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` -- the manifest that makes AI Studio inject `GEMINI_API_KEY`.
Untouched: `ai-agents/*.md`, `server/storage.ts`, `server/dongkrakusahaAdapter.ts`, all of `src/`, `.dockerignore`, the MD files.
Assessment: exactly the failure mode predicted in the experiment's opening entry (item 7). The README/DEPLOY notices are requests, not controls. Whether the deployed app is usable depends on two things the diff cannot tell: (a) whether the user set the 7 per-agent keys + Cloudflare vars (else everything runs on the one injected key), and (b) whether `GCS_BUCKET` and bucket IAM were set on the underlying Cloud Run service (else storage=local on an ephemeral disk and all data vanishes on restart -- the original blocker, unaddressed).
Decision so far: none of AI Studio's edits are adopted. The repo's `experiment/cloud-run` branch is unchanged. Next evidence needed: the service's `[Startup]` log lines.

### Round 2: AI Studio's corrections, verified against its second export (2026-09-14, late evening)
The user relayed the diff findings to AI Studio; it replied that everything was reverted. Its claims were checked by diffing its NEW export (`dongkrak-usaha-project (1).zip`) against the originally sent zip, in a scratch folder, nothing merged:
- PORT restored to `Number(process.env.PORT) || 3000` -- TRUE (only the comment was reworded; `getFeatureApiKey` now returns `value.trim()`, harmless).
- Global `GEMINI_API_KEY` fallback removed -- TRUE. `server.ts` is otherwise identical to ours.
- "Dockerfile was never deleted, 100% intact" -- FALSE for the export: `Dockerfile` is absent from BOTH exports (as is `bun.lock`). Whether it exists inside AI Studio's workspace cannot be checked from here; the artifact the user would push does not contain it.
- `package-lock.json` regenerated -- TRUE and sound: lockfile v3, `@google-cloud/storage 8.1.0`, `sharp 0.35.4`, `@huggingface/inference 4.13.28`, `@google/genai 2.22.0` all present; `playwright-chromium` removed consistently with `package.json` (harmless -- never imported by the server).
- `.env.example` restored -- TRUE: comments back (19 lines), `GCS_BUCKET` documented, no global `GEMINI_API_KEY=`.
- Reported status `sharedKeys: []` with 7 distinct fingerprints -- consistent with reality: three of the fingerprints (`c0ae293ad8a9` image, `e0a84ecf2d77` bitmap, `f4e7e70c6aaf` strategy) match the user's real keys as seen locally earlier the same day. The user must have entered all 7 keys + Cloudflare in AI Studio's environment settings, which also means custom env vars ARE settable there.
- Its startup log: `storage=local node_env=development ... running on :3000`. This is AI Studio's DEV SANDBOX (`npm run dev` under vite middleware), not a production Cloud Run deployment. Data there is still ephemeral, and `GCS_BUCKET` is unset.
Remaining unrequested edits in the export: `index.html` title/meta (cosmetic) and the playwright removal. Neither adopted; our branch is unchanged and already contains everything correct plus the Dockerfile.
Conclusion: after correction, AI Studio's copy is functionally equal to `experiment/cloud-run` minus the Dockerfile. The sound path forward is unchanged: push OUR branch to GitHub (it has the Dockerfile) and deploy through Cloud Run itself with `GCS_BUCKET` set; or, if staying inside AI Studio, set `GCS_BUCKET` + bucket IAM in its environment and confirm the startup log flips to `storage=gcs`. The experiment is still UNVERIFIED end to end -- no `storage=gcs` log line has been seen yet.

### Working arrangement fixed by the user (2026-09-15)
- Working rules unchanged (read MD before, record after, evidence-first).
- Claude in this repo = app developer AND debugger. AI Studio = cloud host ONLY. It is not a developer and its edits are never merged back; the repo is the single source of truth and deploys flow one way, repo -> AI Studio.
- Next: the user will propose the next update tomorrow. The cloud experiment stays open and UNVERIFIED until a `storage=gcs` startup log is seen.

## Operator Feedback Round 3: slow orchestrator, endless audit loop, quota opacity (2026-09-15)
Status: FIXED and VERIFIED live. Same campaign (cmp-001, placeholder area name): 111 s -> 36 s, revisions 2 -> 0, 7/7 stages done.

The user reported the orchestrator was very slow, "kept auditing" because quality stayed low, and named two causes: some models "not found" (not quota), and the audit re-revising over a bad area name that the orchestrator cannot change. Both confirmed and fixed; several more causes found in the ledger.

What the ledger showed (run 1, 111 s): every pro-first stage paid a 429 on `gemini-3.1-pro-preview` (limit 0) before falling back; the discovery-extended chain walked `gemini-2.5-flash`/`2.5-pro` which return 404 "no longer available to new users" (retired models, still listed by ListModels); one audit call took 49 s; two revision rounds (4 extra LLM calls) ran against a placeholder area name no rewrite could fix.

Fixes (server.ts):
1. Quota classification. `parseGeminiQuota()` reads the provider's 429 body (`RetryInfo.retryDelay`, `QuotaFailure.violations[].quotaId`, and "limit: 0" in the message) and classifies the hit as `minute` (cool for retryDelay+2 s, min 5 s), `day` (cool 1 h), or `none` = no free allowance at all (cool 24 h). Unit-tested against the real body from 2026-09-14 and three edge cases. `/api/gemini/status` exposes `quotaScope`/`retryAfterSeconds`; the status widget now says "limit per menit - coba lagi 23 dtk" / "limit harian habis" / "tanpa jatah gratis (limit 0)" instead of one opaque "quota exhausted 15m". This is the user's "two categories of limit" request.
2. Slot state persisted to `data/model-slots.json` (write-through, 500 ms debounce; reloaded at boot, expired cooldowns dropped). Restarts -- constant in the AI Studio sandbox -- no longer re-walk dead models.
3. Retired models are global. A 404 from ANY key adds the model to `RETIRED_MODELS` (persisted to `data/retired-models.json`, also seeded at boot from persisted MODEL_NOT_FOUND slots) and removes it from every feature's chain. Verified: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` excluded on boot; chains now end with real 3.x models instead.
4. Thinking effort. `thinkingConfig: { thinkingLevel: "low" }` is sent to text agents. Probe showed the parameter accepted by `gemini-3.6-flash` and `flash-lite-latest` while `thinkingBudget: 0` was REJECTED (400) by flash-lite -- so the hint is per-model resilient: a 400 adds the model to `THINKING_HINT_UNSUPPORTED` and the same slot is retried once without it, never counted as a failure. Observed: 0 rejections in live runs.
5. Plan and strategy stages run concurrently (`Promise.allSettled`): different keys, no data dependency, saves the briefing's full latency every run.
6. Transient handling. 503 "high demand" cooldown 5 min -> 45 s. If a chain is exhausted and any failure was 5xx, the router waits (soonest recovery, 8-50 s) and walks the chain once more instead of failing the stage -- one failed stage used to skip everything downstream. HTTP timeout 60 s per call so a hung call cannot stall a stage indefinitely.
7. Self-improvement notes deduplicated on append (normalised text match or >=0.7 token overlap). Existing logs cleaned once (campaign-strategy 6 -> 4, image 8 -> 7, orchestrator 4 -> 3). Prompts were growing with repeated sentences.

Audit hand-off (the user's design, implemented):
- `AUDIT_SCHEMA` findings now carry `fixableBy: "ai" | "human"`, `field` (targetCities, address, phoneWhatsApp, businessName, category, description, productsServices, priceRange, website, other) and `suggestion`. `normaliseFinding()` guards against a missing/odd classification (required-data/location complaints default to human, with a field guess from the message).
- `quality-audit.md` (live contract) gained the rule, and the audit prompt explains it -- including "never suggest inventing data for a human finding".
- Orchestrator: while ANY human-required finding exists, the revision loop is skipped and a `handoff` ledger entry explains why. Rationale: the "ai" findings are almost always consequences of the "human" ones (a placeholder area name shows up in the title, keywords and address), so rewriting first burns two rounds for nothing. Revisions run only when the remaining findings are all AI-fixable.
- Response carries `humanActionRequired[]`; blockers say "N temuan audit butuh input pemilik usaha".
- OrchestratorPanel renders a "Perlu Input Anda" panel: one editor per flagged field (list fields comma-separated, description as textarea), the auditor's message + suggestion, "Simpan ke Campaign" and "Simpan & Jalankan Ulang" (updates the campaign, mirrors targetCities into seoStrategy, re-runs with the corrected data -- `handleRun` accepts an override so it does not race the prop update). Findings in the audit block are badged "PERLU ANDA" / "DIPERBAIKI AI".

Verified live on cmp-001 (area = "[Nama Daerah Target]"): audit returned two `human` findings with fields `targetCities` and `address`; ledger shows `handoff`; `revisions: 0`; `humanActionRequired` = those two. Fourth run: 36 s, all 7 stages `done`, `fallbacksUsed: 1`.

Caveat recorded honestly: run 2 and run 3 were SLOWER (155 s; then a pipeline collapse) because Google returned 503 "high demand" on `gemini-3.6-flash`, `flash-latest` and `2.5-flash` repeatedly during those minutes. Item 6 above came out of that. Wall-clock time remains partly at the provider's mercy; what is now under our control (dead models, pointless revisions, thinking effort, serial briefing) is fixed.

## Fix - Caption Text Rendered As Boxes (Tofu) On The Hosted Copy (2026-09-15)
Status: FIXED and VERIFIED locally; structurally proven platform-independent.

The user's screenshot from the AI Studio-hosted copy showed every caption glyph in a composed listing image drawn as a hollow box. Cause: `buildCaptionSvg` emitted `<text font-family="Segoe UI, Arial, sans-serif">`, and librsvg (sharp's SVG rasteriser) resolves that through fontconfig. The Linux container has no fonts installed at all, so there is nothing to draw with -- it was never a text-encoding problem, and it never reproduced on the developer's Windows box because Segoe UI exists there.

Fix (server.ts, `server/fonts/`, Dockerfile):
- Inter Regular + Bold (SIL OFL, Latin subset, ~30 KB each, licence file alongside) are bundled in `server/fonts/` and copied into the Docker image.
- `opentype.js` parses them at boot; `textToPath()` converts each caption string to a single `<path d="...">` outline (per-glyph: charToGlyph, pair kerning, advance width). `captionText()` emits that path, or a `<text>` element only if the font failed to load (last resort; logged at boot as `[Caption] could not load font`).
- Per-glyph shaping deliberately bypasses opentype.js's GSUB pipeline (`font.getPath()` throws "substitutionType: 62 lookupType: 6 ... not yet supported" on Inter's contextual lookups). Indonesian is unshaped Latin, so nothing is lost.
- Side benefit: the badge width is now measured from real advances instead of `chars * 0.55em`, so it fits its text.
- Import gotcha: opentype.js is CommonJS. Under tsx (ESM dev mode) `import * as ns` exposes the API on `ns.default`; under the esbuild CJS bundle it is on `ns` itself. `server.ts` resolves whichever has `parse` -- the first attempt (`ns.parse` directly) failed at boot with "opentype.parse is not a function" and silently fell back to `<text>`.

Verified: boot log clean (no `[Caption]` line); `POST /api/image/compose` 1024x1024 PNG in 259 ms; the caption SVG for the test strings contains 3 `<path`, 0 `<text`, 0 `font-family`, and no character mapped to `.notdef`; the PNG was visually reviewed (title, subtitle, badge all crisp in Inter). Because no system font is consulted anywhere, the Linux output is the same bytes -- the only remaining check on the hosted copy is a redeploy.

## Fix - Tabs Now Work In The Background; Job Tray Shows Per-Tab Progress (2026-09-15)
Status: FIXED and VERIFIED (headless Chromium end-to-end, twice).

User report: "every time I switch tabs, the previous tab loses its progress." Two real causes, both fixed:

1. Panels unmounted on tab switch. `<main key={tab:campaign}>` remounted everything, so an orchestrator run's fetch kept going on the network but its result landed in a component that no longer existed. Now every tab stays mounted (`TabPanel`: `<section hidden>`), keyed only per campaign where a panel seeds state from the campaign prop (Orchestrator, Data Bisnis, Visual, Preview). Form inputs, results and the publishing hub's extension handshake all survive tab switches. The settle-in animation restarts when a section goes hidden -> shown, so tabs still feel like a transition.
2. **Vite full-page reload on every agent call** (found during verification, not from the report). The agents append to `ai-agents/*.md` on each call; Vite's watcher saw a changed file and reloaded the page -- the dev log shows `[vite] (client) page reload ai-agents/campaign-strategy.md` etc. -- wiping ALL client state the moment a stage finished. Same for `data/*.json` writes and the extension zip rebuild. `vite.config.ts` now ignores `ai-agents/`, `data/`, generated images, `*.md`, `*.log`. Verified: 0 reload lines during a full run (was 4+). This only affects local dev (`npm run dev`); the built server has no Vite.

Job Center (`src/jobs.tsx`): long work is started via `startJob(spec, runner)` and owned by an App-level provider, keyed by a stable id (`orchestrator:<campaignId>`, `siege:realize`, `image:base:<categorySlug>`). A panel that mounts later reads status/progress/result back from the store, so even a campaign switch mid-run loses nothing. Orchestrator, Kepung Pasar realisation, and AI base-photo generation use it.

Live progress: the server keeps an `ORCH_PROGRESS` snapshot per run (`runId` sent by the client; `GET /api/orchestrator/progress/:runId` returns label, completed/total, ledger so far; expires 2 min after finish). The client polls every 2 s while the run is in flight. The orchestrator panel shows a progress bar + live ledger chips ("Boleh pindah tab -- proses tetap jalan di latar belakang"); the realisation batch shows "Ciputat (3/8) · Tahap 4/6 · Audit kualitas".

Job tray (`src/components/JobTray.tsx`): bottom-left stack (above the model-status widget on phones), one row per job -- tab icon, label, campaign, elapsed time, stage text, scaleX progress bar. Click = jump to that tab and campaign. Done rows auto-dismiss after 15 s; errors stay until closed. Transform/opacity only.

Verified end-to-end (Playwright, headless): start run on cmp-001 -> switch to Data Bisnis (tray: "Tahap 1/6 · Briefing & strategi kampanye", 7 s) -> switch to Visual Aset -> tray reaches "COMPLETE · 7/7 stage · 2 perlu input Anda" (36 s) -> back to Orchestrator: result, ledger and "Perlu Input Anda" present without re-running; header campaign still cmp-001; clicking the tray row from another tab lands on the result. Separately, the progress route was polled from a second process while a run was in flight: labels advanced plan -> keyword -> content -> audit -> handoff -> image, finished=true at the end.

Not moved to the Job Center (deliberately): the publishing hub's extension autopost. Its submit-result listener already lives at the App root (see "Autopost Publish Finalization Listener" bug), and the hub now stays mounted anyway.

## Feature - One Click To DongkrakUsaha's "Input Produk" Form (2026-09-15)
Status: FIXED BUT UNVERIFIED on the real site (needs the operator's logged-in session). Finder logic PROVEN on synthetic pages.

User report: "Buka halaman input produk" in the Publish tab lands on the product LIST, not the entry form; asked for a feature that presses DongkrakUsaha's own "Input Produk" button.

We do not know the entry form's URL (only the list URL `panelMember/index.php?menu=produk` is proven), so the extension reaches the form the way a human does:
- `content.js` (dongkrak page): new `CLICK_INPUT_PRODUK` action -> `clickInputProdukButton()` scans visible `a / button / input[type=button|submit] / [role=button] / .btn`, scores by visible text (exact "Input Produk" / "Tambah Produk" / "Add Produk" > loose match > href hint `aksi=tambah|input|add`), skips hidden elements, clicks the best, and returns `{matchedText, href, tag}` -- or `INPUT_PRODUK_BUTTON_NOT_FOUND` with the first 15 visible button labels so a miss is diagnosable from the app.
- `background.js`: `OPEN_DONGKRAK_INPUT_PRODUK` re-uses an existing dongkrakusaha tab (navigates it to the list) or opens one, waits for `status: complete`, sends the click with up to 5 retries (content script settle), waits for the resulting navigation, then triggers the normal inspection so the app's field list refreshes on the form.
- `content.js` (app page): `DONGKRAK_REAL_EXT_OPEN_INPUT_PRODUK` -> background -> `DONGKRAK_INPUT_PRODUK_RESULT` posted back with the payload.
- `PublishingHub.tsx`: "Buka Form Input Produk (klik otomatis)" is now the primary button in all three places (authenticated banner, "no form detected" box, manual-assist link); the old list-only open is kept as a secondary "Hanya buka daftar produk". A status line shows the outcome (button text matched + landed URL, or the not-found diagnosis, or a 30 s timeout).
- Extension manifest version 1.0.0 -> 1.1.0 so Chrome shows the update; the zip is rebuilt at boot (85 KB).

Verified: content/background pass `node --check`; `tsc` clean; the finder run in headless Chromium against a synthetic list page (visible "+ Input Produk" link, a hidden duplicate, a "PRODUK" nav link, Share/Duplicate/Edit/Hapus buttons) picked the visible link and clicked it (navigation attempted); on a synthetic login page it returned NOT_FOUND with `visibleButtons: ["Login"]`.

To verify on the real site (operator): reinstall/reload the extension from the new zip, log in to DongkrakUsaha, press the button in the Publish tab. Expected: the list tab opens, the form opens, the status line names the matched button and the landed URL -- record that URL here; it becomes the proven direct link. If it reports NOT_FOUND, the listed visible buttons tell us what the real label is.

## Roadmap Completion Summary (2026-09-14)
All four phases of the approved plan are implemented. Evidence status per phase:
- Phase 1 MD contracts: PROVEN (sentinel twice, notes on disk, then real notes from a production siege run).
- Phase 2 AI base photo: Cloudflare path PROVEN with a real token (first call succeeded; full photo -> caption -> compose chain visually reviewed). Hugging Face path implemented but unverified (no token, now low priority).
- Phase 3 Kepung Pasar: PROVEN (0-AI drafting, single-clone realisation, sibling isolation, Draft-only delete guard).
- Phase 4 Splash + animation: VERIFIED in a real browser.
Final regression: `/api/gemini/status` 8 features / 0 missing keys / 15 discovered models; campaigns persisted (3, no leftover test clones); history persisted; all test artifacts removed from `public/`; `npx tsc --noEmit` and `npm run build` clean.
Remaining human steps: click through Kepung Pasar realise and Visual Aset in a browser (the Cloudflare token is now in place and proven); publish one realised clone end-to-end to DongkrakUsaha.

## Bug - Autopost Publish Finalization Listener Unmounted On Tab Switch
Status: FIXED BUT UNVERIFIED
Root Cause (SUPPORTED by code + user-confirmed reproduction steps): The automatic "public listing URL detected -> POST /api/dongkrakusaha/mark-published -> update campaign/history" logic lived entirely inside PublishingHub.tsx's own `useEffect` window-message listener, plus a `pendingAutopostCampaignRef`/`autopostFinalizedUrlRef` pair scoped to that component. App.tsx only renders PublishingHub while `activeTab === 'publishing-hub'`, so navigating to any other tab (e.g. History, to check the result) unmounts PublishingHub and removes that listener. If the DongkrakUsaha tab's redirect to the public listing URL completes after that navigation, the resulting STATE_UPDATED broadcast is never received by anything, so the URL is never captured and no history record is written.
Evidence: User ran a real live test: clicked the app's own "Konfirmasi & Submit" button (confirmed via direct question, not the old manual copy-paste path), then navigated to the app's "Riwayat Publish" tab to check the result before DongkrakUsaha finished redirecting (confirmed via direct question). Result: "URL Listing yang Berhasil Dipublish" field stayed empty and Publishing History showed "Belum Ada Catatan Publishing" even though the listing itself was actually published and the image was uploaded successfully.
Fix: Moved `pendingAutopostCampaignRef` and `autopostFinalizedUrlRef` ownership to App.tsx (mounted for the entire app session) along with a new always-on `window.addEventListener('message', ...)` effect there that performs the actual public-URL detection and `POST /api/dongkrakusaha/mark-published` call, then folds the result into `campaigns` state. The same two refs are passed down to PublishingHub as props so `handleSubmitCampaign` still marks the pending campaign id, and PublishingHub's own message handler now only uses them to update on-screen status text (no second fetch, avoiding duplicate history writes).
Verification: TypeScript (`npx tsc --noEmit`) and production build (`npm run build`) both pass.
Retest Result (2026-09-13): Live retest performed -- user submitted via the app's "Konfirmasi & Submit" button again and switched tabs immediately afterward. Result unchanged: no URL captured, no history record, identical to the pre-fix symptom.
ROOT CAUSE FOUND (PROVEN by direct screenshot evidence, 2026-09-13): The premise behind the whole automatic-detection feature was wrong. After submit, DongkrakUsaha does NOT navigate the tab to a public listing URL (e.g. `/iklan/...`). It redirects back to the admin product list page `panelMember/index.php?menu=produk`, where the new product appears as a table row with action buttons (Share web, Duplicate, Detail, Edit, Hapus, Tag Keywords). A banner on that page also states the "List DU1000" button needs a 1x24 hour wait after product input before it works (404 before that). Since `isPublicListingUrl` explicitly excludes any URL containing `menu=produk`, and that IS the URL the tab lands on, the check was guaranteed to always fail -- there was never a tab-navigation event to a public URL to detect in the first place. The earlier "Bug - Autopost Publish Finalization Listener Unmounted On Tab Switch" fix (moving the listener to App.tsx) was a real, independent improvement worth keeping, but it could never have fixed this symptom because the thing it was waiting for (a tab navigating to a public URL) never happens.
"Share web" Investigated (PROVEN, 2026-09-13): User clicked "Share web" on the product row (URL `panelMember/index.php?menu=produk&aksi=share&id=962358`). It is NOT a URL-reveal action. It shows a confirmation alert ("Selamat! Data berhasil di Share!") then a page titled "PRODUK share" with a "List Domain" checkbox for a partner domain (`boxmoro.com`) and Submit/Reset buttons -- this is a cross-posting/syndication feature to push the listing to partner domains, unrelated to getting dongkrakusaha.com's own public listing URL. No clipboard permission prompt occurred and nothing was copied, consistent with this not being a copy-link action.
Platform Constraint Confirmed: Based on current evidence, DongkrakUsaha does not expose a live public listing URL immediately after product submit. The only path visible in the UI ("List DU1000") is explicitly gated by the platform itself behind a mandatory ~24 hour delay (returns 404 before that). This means "detect the public URL automatically right after submit" is not achievable at all with the current understanding of the platform -- not a code bug, a platform-level timing constraint. Do not attempt further tab-navigation-based auto-detection for the immediate post-submit moment.
Decision: User chose the simple option -- mark "Submitted" immediately on proven submit-dispatch success (no automatic 24h-later URL check for now), URL added manually later via the existing "Tandai Selesai" flow.
Redesign Implemented (2026-09-13): Removed the now-provably-dead "public URL via tab navigation" detection entirely (it could never fire, per the finding above). Added `'Submitted'` to `CampaignStatus` (src/types.ts). Added `POST /api/dongkrakusaha/mark-submitted` (server.ts) which sets `campaign.status = 'Submitted'` and writes a history record with status `'Submitted'` (no publishedUrl yet) -- does not touch the adapter's `markPublished` (that stays reserved for when a real URL exists). App.tsx's global listener now reacts to `DONGKRAK_SUBMIT_RESULT` directly: when `pendingAutopostCampaignRef` is set and the payload reports `success && dispatched`, it calls the new endpoint immediately (no waiting on any later broadcast). Removed `autopostFinalizedUrlRef` (no longer needed) from both App.tsx and PublishingHub.tsx. PublishingHistory.tsx now renders `'Submitted'` as a distinct amber/Clock badge instead of falling into the red "Failed" branch, with its own explanatory text instead of "No error details recorded."
Verification: `npx tsc --noEmit` and `npm run build` both pass. Server-side smoke test via curl confirmed the new endpoint works mechanically: `POST /api/dongkrakusaha/mark-submitted` with a real campaign id flipped its status to `Submitted` and created a matching history record; a bogus id correctly returned 404. Dev server was restarted afterward to clear that smoke-test artifact from the in-memory store (campaigns/history reset to defaults on restart, no real DongkrakUsaha side effect was ever involved in this endpoint).
UX Relocation (2026-09-13, user-directed): User pointed out it is more rational to fill in the public URL from the Riwayat Publish (History) page itself, next to the `Submitted` record, rather than in a disconnected Manual Assist field on Publishing Hub. Implemented:
- Removed the old standalone "URL Listing yang Berhasil Dipublish" input + "Tandai Selesai" button and its state (`manualPublishUrl`, `isPublishing`, `publishResultMsg`, `publishErrorMsg`, `handleMarkPublishedManual`) entirely from PublishingHub.tsx. That section now just points to Riwayat Publish with a short explanatory note.
- Added `OfficialDongkrakUsahaAdapter.updateHistoryRecord(id, patch)` (server/dongkrakusahaAdapter.ts) to update a history record in place instead of always appending a new one.
- `/api/dongkrakusaha/mark-published` now accepts an optional `historyRecordId`: if given, it updates that existing record (status -> Published, sets URL/externalListingId) instead of creating a duplicate row for the same campaign; falls back to the old create-new behavior if omitted (backward compatible).
- PublishingHistory.tsx now renders an inline URL input + "Simpan" button directly on each `Submitted` row, calling `mark-published` with `{campaignId, publishedUrl, historyRecordId: record.id}` and refetching history on success.
Verification: `npx tsc --noEmit` and `npm run build` both pass. Full flow smoke-tested via curl end-to-end: mark-submitted -> history shows 1 record with status `Submitted` -> mark-published with that record's id and a URL -> history STILL shows exactly 1 record (same id), now status `Published` with `publishedUrl`/`externalListingId` set and `lastUpdated` refreshed while original `publishedAt` preserved. No duplicate row was created. Dev server restarted afterward to clear this smoke-test data from the in-memory store.
Still Unverified: The full live path with a real browser has not been retested end-to-end -- Autofill -> Konfirmasi & Submit on a real DongkrakUsaha form -> confirm the app shows `Submitted` and History shows the amber row with a working inline URL field, then (24h+ later) actually filling in a real URL from History and confirming it flips to Published in place.
Files Changed: src/types.ts, server.ts, server/dongkrakusahaAdapter.ts, src/App.tsx, src/components/PublishingHub.tsx, src/components/PublishingHistory.tsx

## Bug - Dev Server Restart Did Not Reload New .env Values
Status: WORKAROUND VERIFIED (kill all node processes, then start fresh)
Root Cause (SUPPORTED): `dotenv/config` only runs once, at the top of `server.ts`'s first import, when the Node process boots. Vite's own file watcher separately detects `.env` changes and logs `"[vite] .env changed, restarting server..."`, but this is Vite restarting its own internal dev-server pipeline (for `import.meta.env` on the client side), not a full Node process respawn -- so `process.env` in the already-running Express process keeps whatever it read at boot.
Evidence: After the user filled all 7 Gemini key slots in `.env`, a plain `Stop-Process` on the tracked server PID followed by `npm run dev` still returned `keyConfigured:false`/`missingKeys` for every agent. A standalone `node -e "require('dotenv').config(); ..."` run directly against the same `.env` file correctly showed all 7 keys as SET, proving the file itself was fine and the stale state was specific to the long-running process.
Fix: `Get-Process -Name node | Stop-Process -Force` to kill every Node process tied to the dev server (not just the tracked PID), confirm the port is free, then start `npm run dev` fresh. After this, `/api/gemini/status` correctly showed `missingKeys: []`.
Consequence for future work: whenever `.env` is edited while the dev server is already running, a full process kill + restart is required -- a `.env`-triggered Vite "restart" log line is not sufficient proof that new values are loaded.

## Verified Bug - Stale Fields Survive NO_TAB
Status: VERIFIED
Root Cause: The app-side state reducer kept previous fields when a new payload had zero fields, even when the extension explicitly reported NO_TAB. This caused stale field counts to remain visible until a full app refresh.
Evidence: The code previously did `finalFields = fields && fields.length > 0 ? fields : prev.fieldsDiscovered` whenever the tab state was treated as still valid; it did not explicitly clear data when `NO_TAB` was reported.
Fix: When the payload indicates NO_TAB, clear `fieldsDiscovered` and `formDetected`, and keep the app UI in `NO_TAB` state until a real tab is detected again.
Files Changed: src/components/PublishingHub.tsx

## Mandatory Working Rule
- Always read PROJECT_KNOWLEDGE.md before starting a new task.
- Update PROJECT_KNOWLEDGE.md after every meaningful change or verified finding.
- Treat the knowledge file as the project memory, not as optional notes.
- Do not re-open solved bugs without fresh evidence.
- Do not claim a fix is verified without runtime proof.
- Keep the file short, factual, and free of secrets.
- Every feature must be documented in AI_MODELS.md with model, provider, key, fallback chain, and rollback behavior.
- Every new model or API key usage must be added to AI_MODELS.md before production use.
- Model availability must be tied to documented registry entries, not assumption or memory.
- The builder or human coder must read the relevant agent file before changing the application.
- Runtime orchestrator and specialist workers follow their supplied behavior contracts; they do not read builder markdown files from the filesystem.
- Every code build, bug fix, feature task, or validation must be recorded in the project markdown memory after completion.
- Before any builder implementation work, read the relevant markdown file(s), then perform the task, then update the markdown file(s) with the result.
- After completing a task, update the relevant markdown file with: what changed, why it changed, what was validated, and what remains next.
- The builder must never rely only on default model memory; always check the project markdown files before acting.
- This is a required workflow discipline: read → work → record → repeat.

## Current Verified Status
- Build sanity check passes: npx tsc --noEmit && npm run build
- dotenv local env fix is implemented in server.ts
- Extension popup state-shape bug has been fixed and verified by syntax check
- Phase 1 browser runtime verification is complete: tab detect, bridge sync, close-tab cleanup, reopen rediscovery, and refresh recovery all passed in real browser flow

## Verified Bug - Extension Popup Read Wrong State Shape
Status: VERIFIED
Root Cause: The popup UI read top-level properties from the background response, but the background always returns state inside dongkrakState.
Evidence: The `chrome.runtime.sendMessage` response payload from background is shaped as { dongkrakState: {...}, discoveredFields: [...], ... }, while popup logic checked `res.tabDetected`, `res.authStatus`, and `res.formDetected` directly.
Fix: Normalize the response with `const state = res?.dongkrakState || res || {};` and read from the nested object before rendering UI.
Files Changed: public/extension/popup.js

## Key Files
- [server.ts](server.ts)
- [src/components/PublishingHub.tsx](src/components/PublishingHub.tsx)
- [public/extension/background.js](public/extension/background.js)
- [public/extension/content.js](public/extension/content.js)
- [public/extension/manifest.json](public/extension/manifest.json)
- [README.md](README.md)

## Immediate Priority
Phase 1 is complete and verified in browser runtime. The next priority is Phase 2 planning and implementation, not rechecking solved Phase 1 issues.

## Mandatory Task Cycle
1. Read the relevant memory files first: PROJECT_KNOWLEDGE.md, AI_MODELS.md, and the relevant specialist agent markdown file.
2. Perform the task or implementation.
3. Run the smallest relevant verification command.
4. Record the result in the corresponding markdown file(s).
5. Continue only after the markdown memory reflects the current state.
6. Never skip the documentation step.

## Agent Discipline
- Human developer or AI agent is not allowed to treat markdown files as optional notes.
- Markdown files are the working memory and execution protocol.
- If a task is done without recording it in markdown, the task is considered incomplete from the project discipline standpoint.

## Important Decisions
- Keep only one extension source of truth: public/extension/
- Do not treat logs from the DongkrakUsaha tab as proof for web app behavior
- Do not claim verification without concrete runtime evidence

## Evidence Log
- Server start was verified locally.
- Gemini key resolution works with .env loading in local runtime.
- Real browser verification passed: extension-to-app bridge state, tab detect, close-tab cleanup, reopen rediscovery, and refresh recovery all behaved correctly.

## Things Not To Reinvestigate
- Historical stale duplicate extension root issue
- Historical CDN/ETag stale ZIP issue
- Historical iframe race condition
- Historical duplicate content script injection issue

## Testing Procedures
- Local backend: npm run dev
- Typecheck: npm run lint
- Production build: npm run build
- Validate feature behavior using actual runtime evidence, not only compile success
