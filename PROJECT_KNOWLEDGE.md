# DongkrakUsaha AI Marketing & SEO Publisher

## Current Phase
- Phase: 2 (engine complete) -> handover-ready for 7 PKL operators
- Status (2026-09-19 night, v2.9): Persona theme stages 0-3b shipped and owner-approved ("lumayan suka"); standard theme proven unchanged. NEXT SESSION STARTS HERE: stage 3c (canvas during a live run, NodeInspector as PERSONA-background panel, guide speech-bubble tail, LOAD GAME splash, regroup Data Bisnis / GettingStartedGuide grids, Preview as profile card, phone polish) -- confirm the list with the owner first; owner still has to deploy c1ac004 to AI Studio and run the field-limit procedure. References: 14 screens in the local folder `Persona 5 UI Data Base/` (git-excluded), tabulated in THEME_PERSONA.md.
- Earlier status (2026-09-18, v2.8): orchestrator canvas live; white screen root-caused and fixed; operator instructions take precedence (length in kata/kalimat/karakter, measured by the server); description length default 500-1000 kata PENDING field-limit verification (extension "Ukur Field" + Publish tab panel ready). Earlier status (2026-09-14): full text pipeline PROVEN with real keys; MD contracts are live runtime input; market-siege drafting/realisation PROVEN; visual pipeline = real base photo + local caption (PROVEN), optional AI base photo (implemented, awaits a provider token); welcome splash + low-RAM animation pass VERIFIED in a real browser. See "Roadmap Completion Summary" near the end of this file.

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

### Bug 7 - Preview And Autofill Showed A Stale Description (2026-09-19)
Status: FIXED / VERIFIED (tests + browser)
Symptom: the Konten node reported the new article (owner's case: 1.917 karakter, 257 kata, six sections -- the instruction was in karakter, so the "1.900-an" was characters, not words), while the Preview tab and the extension autofill showed the description from before the run. Owner's guess was "the agent wrote into the meta field"; the meta field was fine (134/165).
Root Cause: `campaign.dongkrakListingData` was a second copy of the content. The only code that ever wrote `deskripsi` from AI output was the legacy ContentGenerator, unmounted since content moved into the orchestrator; "Terapkan ke Campaign" updated `generatedContent` but never the listing, and the Preview preferred the stored listing. BusinessManager's save also wrote a mixed-key object (businessName, seoContent, …) that is not the listing shape, so a campaign saved there without a prior listing previewed an empty description.
Fix: `src/lib/listingData.ts` `buildListingData(campaign, previous)` is the single mapping (tests in `tests/listingData.test.ts`): the Preview derives the listing from the current content, Terapkan and the Data Bisnis save store what the builder returns, and the autofill message carries a freshly built listing. Operator-typed fields (marketplace links, WhatsApp opener, strike-through price) are carried over from the previous listing. Meta limits live in `LISTING_LIMITS` (165 / 155).
Verified: `npm test` 21/21; headless Preview shows the campaign's `generatedContent.seoDescription` (961 chars) instead of the stored 253-char listing.

### Bug 6 - App Bridge Dies When The Extension Is Reloaded (2026-09-18)
Status: MECHANISM FIXED (harness-verified) / OWNER VERIFICATION ON THE REAL SITE PENDING
Symptom: the popup reports the DongkrakUsaha tab, login and N fields, but the app's Publish tab stays at 0 fields ("Authoritative form container not yet locked") and "Isi Form Otomatis" is disabled (it requires formDetected).
Root Cause: reloading/updating the unpacked extension invalidates every content script in open tabs. The app-page bridge detects this and self-destructs (it posts DONGKRAK_BRIDGE_CONTEXT_INVALIDATED), but nothing on the page can resurrect it -- only the background can inject. The background did re-inject on onInstalled, yet (a) it never sent the freshly injected bridge any state (the boot inspection broadcast fired in the same tick, before injection finished, and reached the dead bridge), and (b) the broadcast catch path re-injected and then dropped the very message the tab needed. The hub has no retry timer, so the page sat at 0 until it was reloaded.
Fix: background.js pushStateToTab() right after each successful app-tab injection + a debounced REINJECT inspection; the boot inspection waits 1.2 s for the recovery pass; the broadcast catch path re-sends the failed payload after re-injecting. PublishingHub shows an amber banner ("Extension baru saja di-reload…") with the two real remedies (popup Refresh Status, or reload the page) whenever the bridge reports an invalidated context.
Not a regression of 1.2.0: with the current code in the harness (unpacked extension in Chromium, mock product form served at the real URL, app on localhost) REFRESH LIVE DOM finds 8 fields and "Isi Form Otomatis" fills the form; pushStateToTab + scheduleReinjectInspection from the service worker deliver the state and log the REINJECT inspection. The extension-reload event itself cannot be reproduced under Playwright (the reloaded worker is not observable), so the owner's real-site check is the final proof.

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

Also fixed: `phase2-workflow.md`'s "Required Project Files" omitted itself and made a now-false blanket claim -- rewritten into builder-memory / live-contract / documentation-only groups. `webp-converter.md` never mentioned `/api/image/compose` -- added. All six contracts' "Self-Improvement Rule" sections now describe the real mechanism instead of an aspiration. Root `DEVELOPMENT_RULES.md` created so the builder-side read/update discipline loads automatically every session.

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
- `DEVELOPMENT_RULES.md` "UI conventions" records the Tailwind-only / no-blur / transform-opacity-only policy so a future session does not reintroduce the cost.

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
Status: PERSISTENCE VERIFIED on AI Studio via Firestore (2026-09-17, see "Hosted Result #7"); the GCS path remains unverified and is closed on Starter Tier. Nothing else in this section is proven until stated otherwise. If it fails, the proven state is one command away -- see "Rollback" below. The LAN/single-laptop path remains the known-good way to run this app for the PKL team.

Why: the user wants to try hosting the app so 4 PKL interns + a supervisor can use it from anywhere, and proposed handing the repo to AI Studio to deploy. Concerns the user raised, in their words: the deploying AI must not modify the files; will the API keys (especially the non-Google Cloudflare key) be a problem.

Rollback (the whole point of this section):
- `master` is commit `1171f88` = the proven local/LAN state (MD contracts live, market siege, Cloudflare base photo proven, splash, persistence, operator-feedback fixes). `git checkout master` returns to it. Nothing on the experiment branch is merged unless a real deploy succeeds AND the user says so.
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

Rollback: `git checkout master` (checkpoint `1171f88`). Local data untouched. ONE CAVEAT: the agents keep appending self-improvement notes to `ai-agents/*.md` while the experiment branch is checked out (they are committed there). A plain checkout of master would revert those files and drop notes added since the checkpoint. To keep them: `git checkout master && git checkout experiment/cloud-run -- ai-agents/ && git commit -m "carry agent notes"`.

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
- The developer working in this repo = app developer AND debugger. AI Studio = cloud host ONLY. It is not a developer and its edits are never merged back; the repo is the single source of truth and deploys flow one way, repo -> AI Studio.
- The cloud experiment's persistence question was settled on 2026-09-17 by Firestore, not GCS: the startup line to look for is `storage=firestore (...) via rest-anonymous|rest-unauthenticated` and a green Koneksi status.

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
Status: VERIFIED on the real site by the operator (2026-09-16). First attempt "did not work" because the browser still ran extension 1.0.0; after loading the 1.1.0 zip the button opened the real entry form. Landed URL not recorded yet -- capture it from the status line on a later run. Finder logic PROVEN on synthetic pages.

User report: "Buka halaman input produk" in the Publish tab lands on the product LIST, not the entry form; asked for a feature that presses DongkrakUsaha's own "Input Produk" button.

We do not know the entry form's URL (only the list URL `panelMember/index.php?menu=produk` is proven), so the extension reaches the form the way a human does:
- `content.js` (dongkrak page): new `CLICK_INPUT_PRODUK` action -> `clickInputProdukButton()` scans visible `a / button / input[type=button|submit] / [role=button] / .btn`, scores by visible text (exact "Input Produk" / "Tambah Produk" / "Add Produk" > loose match > href hint `aksi=tambah|input|add`), skips hidden elements, clicks the best, and returns `{matchedText, href, tag}` -- or `INPUT_PRODUK_BUTTON_NOT_FOUND` with the first 15 visible button labels so a miss is diagnosable from the app.
- `background.js`: `OPEN_DONGKRAK_INPUT_PRODUK` re-uses an existing dongkrakusaha tab (navigates it to the list) or opens one, waits for `status: complete`, sends the click with up to 5 retries (content script settle), waits for the resulting navigation, then triggers the normal inspection so the app's field list refreshes on the form.
- `content.js` (app page): `DONGKRAK_REAL_EXT_OPEN_INPUT_PRODUK` -> background -> `DONGKRAK_INPUT_PRODUK_RESULT` posted back with the payload.
- `PublishingHub.tsx`: "Buka Form Input Produk (klik otomatis)" is now the primary button in all three places (authenticated banner, "no form detected" box, manual-assist link); the old list-only open is kept as a secondary "Hanya buka daftar produk". A status line shows the outcome (button text matched + landed URL, or the not-found diagnosis, or a 30 s timeout).
- Extension manifest version 1.0.0 -> 1.1.0 so Chrome shows the update; the zip is rebuilt at boot (85 KB).

Verified: content/background pass `node --check`; `tsc` clean; the finder run in headless Chromium against a synthetic list page (visible "+ Input Produk" link, a hidden duplicate, a "PRODUK" nav link, Share/Duplicate/Edit/Hapus buttons) picked the visible link and clicked it (navigation attempted); on a synthetic login page it returned NOT_FOUND with `visibleButtons: ["Login"]`.

To verify on the real site (operator): reinstall/reload the extension from the new zip, log in to DongkrakUsaha, press the button in the Publish tab. Expected: the list tab opens, the form opens, the status line names the matched button and the landed URL -- record that URL here; it becomes the proven direct link. If it reports NOT_FOUND, the listed visible buttons tell us what the real label is.

## UI Pass 2: Bottom Navigation, New Splash, Stale Copy Removed (2026-09-15)
Status: DONE and VERIFIED (headless Chromium at 1280 px and 400 px; no page errors; no horizontal overflow).

User requests: macOS-like smooth animation that stays light on low-end devices; a splash they actually like (the first was disliked); tabs at the BOTTOM with a wipe/bubble animation that stays on the active tab; remove useless/out-of-date interface such as the "Phase 1" extension naming -- but keep the extension console panel.

- `src/components/BottomNav.tsx` (new): fixed bottom bar, 8 tabs (1-6 numbered flow + Koneksi + Riwayat). One blue pill sits under the active tab and GLIDES to the clicked one -- `transform: translateX()` with a spring curve (`cubic-bezier(0.34, 1.4, 0.64, 1)`, measured overshoot 821 px -> 799 px), then an inner layer does a small squash-bounce on landing (`du-bubble` keyframe, keyed on the tab so it re-triggers). Width is set instantly, never animated. Tabs with a running background job show a pulsing count badge (opacity only). On phones the bar scrolls horizontally with short labels and keeps the active tab in view; `env(safe-area-inset-bottom)` respected. Height is the CSS var `--du-bottom-nav` (60 px); the root container pads by it, and the model-status widget + job tray offset from it (`.du-above-nav`, `.du-tray`).
- `Header.tsx`: the old top tab row is gone; it is now the identity strip + campaign picker + connection badge (subtitle hidden on phones). Badge "v2.4 Pro" -> "v2.5".
- `WelcomeSplash.tsx` rewritten: soft gradient/blob backdrop (static, no filters), breathing logo mark (scale 1 -> 1.06, 3.2 s), seven blocks that rise in sequence (`du-rise`, staggered `animation-delay`), the three-step promise, credits in a two-column card, "Mulai", and a "Jangan tampilkan lagi" checkbox (localStorage) on top of the once-per-session rule. Still transform/opacity only; everything gated by `motion-reduce:`.
- `PublishingHub.tsx`: "Phase 1: Real Extension Inspection & Login Bootstrap" badge -> "Ekstensi Chrome v1.1"; mode button "Real Extension Bridge (Phase 1)" -> "Ekstensi Chrome"; the "Phase 1: Read-Only Inspection Mode" banner deleted outright (it claimed the extension never fills or submits -- false since autopost shipped); zip description now lists what the extension actually does. The "Developer Extension Architecture Diagnostics" console panel is untouched, as asked. Footer credits the developer and pembimbing. Getting-started guide copy updated ("Tab di bawah layar").
- `index.css`: new utilities `ease-du-spring`, `animate-du-bubble`, `animate-du-pulse`, `animate-du-rise`, `animate-du-breathe`, `no-scrollbar` (was referenced but never defined); panel-in eased to 240 ms expo-out.

Verified: build clean; screenshots at both widths reviewed (splash, orchestrator, publish); nav bottom edge == viewport bottom; `scrollWidth == viewport width` at 400 px; 0 "Phase 1" strings visible in the Publish tab; splash suppressed on reload within the session.

## Re-verified: Agents Read Their MD Contracts Live (2026-09-15, after today's server changes)
Status: PROVEN again, same sentinel method as 2026-09-14, on the current `server.ts` (post quota/retired-model/progress changes).
- Inserted a temporary rule into `ai-agents/campaign-strategy.md` ("first word of positioning MUST be ZEBRA-7741"), called `POST /api/gemini/strategy` WITHOUT restarting the server: response `positioning` began with `ZEBRA-7741` (model `gemini-flash-lite-latest`).
- Changed the marker to KOALA-2026 on disk, called again, still no restart: response began with `KOALA-2026`, ZEBRA gone. So the contract is read fresh on every call, not cached at boot.
- Contract restored from backup; no sentinel text remains in the repo.
- Self-improvement writes also confirmed today as a side effect of the Step E test runs: 12 new dated lines landed across campaign-strategy / keyword-strategy / orchestrator / quality-audit (dedupe kept it to 12 across 4 runs).

## History Rewritten: Co-Author Trailer Removed (2026-09-16)
A tool-added co-author trailer had made a second account appear in the GitHub contributor list; the owner asked for it to disappear. All 13 affected commit MESSAGES on master and experiment/cloud-run were rewritten (trees, authors, dates untouched; verified content-identical) and experiment/cloud-run was force-pushed. Every commit SHA changed as a result: the master checkpoint is now 1171f88 (was 29781fe), experiment head ef65ec6 at the time of the rewrite. Older SHAs quoted in earlier entries (b25c13e, 5e663b5, 22dbe65, f75de33, d0bc279) no longer exist; find those commits by subject instead. Local backup tags backup/before-trailer-strip-* hold the old history. From here on, commits carry no attribution trailer.

## Operator Feedback Round 4: "Orchestrator takes 3-5 minutes" -- Root Cause PROVEN, Fixed (2026-09-16)
Status: PROVEN by attempt-level evidence (hosted run + 6 local runs); FIXED and VERIFIED under a live Google 503 storm.

Evidence, hosted copy (AI Studio; its `server.ts` was diffed and is identical to ours): 145.9 s total; ledger showed Orchestrator/Strategy 47.0 s and Image Brief ~86 s (the number was hidden behind the status widget -- the "missing 78 s" was that stage), the other four stages 16 s together; 5/6 stages FALLBACK. Local reproduction the same hour: 208.8 s, and the new attempt trail named the culprit exactly:

| stage | pro-preview | 3.6-flash | flash-latest | flash-lite |
|---|---|---|---|---|
| keyword | 429 0.3 s | 503 1.5 s | **503 after 24.0 s** | ok 1.7 s |
| content | 503 2.3 s | 429 0.3 s | **503 after 35.6 s** | ok 2.2 s |
| audit | 429 0.4 s | 503 3.0 s | **hung 60.0 s (client timeout)** | ok 1.9 s |
| image | 503 3.3 s | 429 0.4 s | **504 after 59.0 s** | ok 1.8 s |

Root cause (two of our own parameters, not the models' quality): (1) `gemini-flash-latest` (a discovered alias, third in every chain) HANGS instead of failing fast, and the per-call HTTP timeout was 60 s; (2) cooldowns were per key, and the six agents use six keys, so every stage re-learned the same hang. 4 stages x ~45 s = the whole delay. Not a cause: prompt size, thinking, revisions (0 rounds), our stage sequencing (sum of stages == total, gap 0-2 ms on every local run).

Fixes (server.ts, router only; prompts/registry order/audit logic untouched):
1. Attempt trail. `GenerationAttempt` gained `durationMs`, `kind: 'call'|'wait'`, `note`; attempts are carried across the router's wait-and-retry recursion (previously the first pass was lost); the ledger UI shows chips per attempt ("flash-latest · 504 · 29.0s", "tunggu · 45s") and a "Salin ledger (JSON)" button. This is what to read before touching any timing again.
2. Model health shared across keys (`MODEL_HEALTH`). A transient failure (503/504/timeout/abort -- "This operation was aborted" is now classified transient too) is recorded per MODEL. It takes the model out of every key's chain only when the failure was EXPENSIVE (>=15 s, i.e. a hang) or it is the second strike within 2 minutes; a cheap first 503 keeps the per-key cooldown only, so the preferred model is re-probed by the next stage (measured: the same second one stage got a 503 from 3.6-flash, its sibling stage got an answer). Backoff 45 s -> 3 min -> 10 min, reset on success. Exposed in `/api/gemini/status` (`unhealthy`, `unhealthyModels`) and worded in the widget ("model sedang bermasalah di Google (504 after 29s) · dilewati 45 dtk"). 429 stays per key.
3. Hedged timeout. A candidate with siblings behind it gets 30 s (slowest successful call observed with low thinking: 15 s under load); the last candidate keeps 60 s. Per request via `config.httpOptions`.

Verified (same campaign cmp-001, same hour, Google in a visible 503 storm): 23.1 s when calm (all 3.6-flash); 44.7 / 85.6 / 59.4 / 45.2 s during the storm, with 3.6-flash still chosen on 4/6 stages when it answered -- versus 146-209 s before. Audit output unchanged in shape (WARNINGS, 65-70, same two human findings). Remaining ceiling is the provider: a run cannot be faster than its slowest healthy model, and flash-latest still costs one ~29 s probe when its backoff expires (then 3 min, then 10 min).

Not done, deliberately: no hedged parallel requests (would double free-tier quota use), no permanent blacklist of flash-latest (AI_MODELS Rule 4 -- a today-sick alias may be healthy tomorrow; the backoff handles it), no persistence of MODEL_HEALTH (a fresh process should re-probe).

## Welcome Splash v3: Update Log + GitHub Profile With Live README (2026-09-16)
Status: DONE and VERIFIED (headless Chromium, desktop + 400 px).

User request: the welcome card should carry an update log, and a "GitHub profile" block that, when pressed, shows the developer's profile README as on GitHub -- scrollable, including the "Languages and Tools" icons.

- Profile URL verified against the GitHub API before use (the owner's GitHub account of the day; superseded by the account move recorded on 2026-09-17): profile README repo exists, branch main.
- `GET /api/github/profile` (server.ts): fetches the user record and the README already RENDERED by GitHub (`Accept: application/vnd.github.html`) -- no markdown library added. Rewrites the README's relative paths (`./assets/header.png`, `./assets/divider.png` -> raw.githubusercontent.com; `href="./x"` -> the file's GitHub page), strips any `<script>`/inline handlers as belt-and-braces, caches for 1 h in memory, serves the last good copy on failure, 502 with the profile link when there is none. Login overridable via `GITHUB_PROFILE_LOGIN`; optional `GITHUB_TOKEN` raises the 60/h anonymous rate limit (server-side only, never in the client).
- `src/changelog.ts` (new): `CHANGELOG` entries written for the PKL team in plain Indonesian, newest first, plus `APP_VERSION`. Rule added to DEVELOPMENT_RULES.md: every user-visible change ships with an entry.
- `WelcomeSplash.tsx` rewritten with three tabs: Tentang (steps, credits, and the "Profil GitHub pengembang" block that jumps to the GitHub tab), Log Update (changelog list), Profil GitHub (avatar/name/bio/repo+follower counts + "Buka GitHub" + the README in a 52vh scrollable box styled by `.gh-readme` in index.css). README is fetched lazily only when that tab opens. Card widened to max-w-2xl with an internal scroll area so the footer (Mulai / Jangan tampilkan lagi) stays visible.

Verified: API returns 25.5 KB of HTML with 0 relative paths left and 0 scripts; in the browser all 47 README images loaded (header art, badges, 33 tool icons), the box scrolls (1001 px content in 468 px), headings "About me / Connect with me / Languages and Tools" present; no page errors; 400 px width has no horizontal overflow. Screenshots reviewed for all three tabs.

Note: the README's header image is a 1.2 MB PNG served from raw.githubusercontent.com; it is the user's own asset and loads only when the GitHub tab is opened.

## Data Loss On AI Studio Confirmed; Backup/Restore Added; Splash Enlarged; Changelog Trimmed (2026-09-16)
Status: backup/restore VERIFIED (API round trip + browser download); the AI Studio loss itself is EXPECTED behaviour, not a bug, and is only truly fixed by `GCS_BUCKET`.

User report: campaigns and publish history disappeared on the AI Studio copy. Cause is the one already recorded: AI Studio runs the app without `GCS_BUCKET`, so `server/storage.ts` writes to the container's disk, which is discarded on every redeploy/restart. The permanent fix is the operator's: DEPLOY_CLOUD_RUN.md steps 1 (bucket) and 4 (Storage Object Admin for the service account) and `GCS_BUCKET` in AI Studio's environment, then confirm `[Startup] storage=gcs` in the log. Until then the hosted copy is a demo, not a store.

Safety net that works on any hosting (this session):
- `GET /api/backup` -> one JSON (`format: dongkrakusaha-backup`, version 1, campaigns + publish history, storage mode, timestamp) with a Content-Disposition filename. `POST /api/restore` accepts that file; `mode: merge` (default; upsert by id, incoming wins, history merged by id) or `mode: replace`; rejects anything without the format marker. Adapter gained `replaceHistory()`. Body limit was already 10 MB (a 33-campaign backup is 215 KB).
- `BackupPanel.tsx` at the top of the Koneksi tab: "Unduh cadangan (JSON)", "Pulihkan dari file" with a merge/replace selector (replace asks for confirmation), result line. Written for the team: why it exists and when to use it.
- Verified: backup of 33 campaigns downloaded (browser download event observed, filename `dongkrakusaha-backup-<stamp>.json`); the file plus one fabricated campaign restored in merge mode -> +1 added, 33 updated, total 34; test campaign deleted; a non-backup JSON rejected with 400.

Also in this batch: splash card enlarged (max-w-3xl, bigger title/tabs/steps, README box 58vh) after "kurang besar"; changelog cut to engine + audience-facing UI only, per the user ("jangan semua diceritain").

## Repository Moved To A New Account; Splash v4 (2026-09-17)
Status: DONE and VERIFIED via the GitHub API and headless Chromium.

Repository:
- New home: `https://github.com/rasyagantar-lab/dongkrak-usaha-project` (branches `experiment/cloud-run` = default, `master`). A fresh repo was chosen over "Transfer ownership" so no unreachable objects or cached contributor data could follow.
- History was rebuilt twice with plumbing (`commit-tree`; trees/dates preserved): first to scrub the old rules-file name from two messages, then to set author+committer to the owner's new identity. Verified on the new repo: 22 commits, contributors = `rasyagantar-lab` only, 0 tool mentions in messages or tracked files. Local git identity switched; `origin` = new repo, `old-origin` kept only until the old repository is deleted.
- Working-rules file renamed to `DEVELOPMENT_RULES.md`; a git-ignored local pointer loads it for the assistant. Rule (DEVELOPMENT_RULES.md, "Commits"): no attribution trailers, and neither commits nor tracked files name the tooling.

Splash v4 (`WelcomeSplash.tsx`): one wide two-pane dialog. Left = how it works (3 steps), credits, and the developer's GitHub card (`rasyagantar-lab`) that expands IN PLACE to the profile README (no separate tab, per the owner). Right = Log Update. Panes scroll independently on desktop, stack on phones; header/footer fixed height.
- `/api/github/profile` now defaults to `rasyagantar-lab` and HEAD-checks the README's relative assets, dropping images whose file is missing in the profile repo instead of rendering broken ones. Observed: `assets/divider.png` is not yet in the new profile repo -> 4 uses dropped; 43/43 remaining images load, "Languages and Tools" present. Once the owner copies `assets/divider.png` over, it appears without a code change.
- Verified: API login/name correct; README 24 KB, 0 relative paths left; browser: 43 images loaded, 0 broken, box scrolls; 400 px width has no overflow; no page errors.
- Read-gate (owner request): "Mulai" is disabled, and Esc/click-outside refused with a nudge, until the Log Update has been scrolled to the bottom (desktop: right pane; phone: the whole card). Progress fills the button (scaleX). A pane that fits without scrolling counts as read. Verified headless at both widths: locked at 0-2%, Esc refused, unlocked after scroll, closes on Mulai.

## Persistence On AI Studio: Storage Probe + Operator-Visible Status (2026-09-17)
Status: probe VERIFIED in both modes locally; GCS end-to-end still awaits the owner's bucket (the code path now reports its own success or failure, so the next deploy is self-proving).

Owner report: campaigns, base images and history reset whenever the AI Studio container is stopped or restarted. Cause unchanged and expected: no `GCS_BUCKET` there, so `server/storage.ts` runs in local mode on a disposable disk. The storage layer itself already routes every runtime write (campaigns, history, base photos, generated images, agent logs) through the bucket when configured -- what was missing was the bucket and a way to SEE whether it works.

Added:
- `storage.probe()`: writes `data/.probe-<ts>.json`, reads it back, deletes it; returns `{mode, bucket, persistent, ok, latencyMs, error?, hint?}`. Hints map the provider's messages to the fix ("bucket does not exist" -> check GCS_BUCKET; 403 -> grant Storage Object Admin; missing ADC -> laptop only).
- Startup logs the probe result: `[Startup] storage probe ok (local, 4 ms) -- NOT persistent on hosted containers: set GCS_BUCKET` or `... probe FAILED (gcs bucket=X): <error> -- <hint>`. This is the line every hosted deploy is judged by.
- `GET /api/storage/status` runs the same probe on demand; the Koneksi -> Cadangan Data card shows it as a status line (green = bucket connected; amber = local disk, not persistent on hosting; red = configured but failing, with the fix) and a re-check button.
- DEPLOY_CLOUD_RUN.md gained an AI Studio-specific section: create the bucket in the same project, set `GCS_BUCKET` where the Gemini keys are set, redeploy, confirm the green line, then restore the last backup.

Verified: local probe ok in 2-4 ms, no leftover probe file; forced gcs mode with a non-existent bucket -> `ok:false`, error "The specified bucket does not exist.", hint about GCS_BUCKET spelling, `persistent:false`; browser shows the amber local-disk line in Koneksi. Not yet verified (owner's step): a real bucket turning the line green on AI Studio.

## Bucket Auto-Creation: Persistence On AI Studio Is Now One Variable (2026-09-17)
Status: IMPLEMENTED; local/no-credential paths VERIFIED; the creation itself UNVERIFIED until the first hosted boot with `GCS_BUCKET` set (that boot proves it via the startup line + Koneksi status).

- `storage.ensureBucket()`: in gcs mode, checks the bucket and creates it if missing (region `GCS_LOCATION`, default `asia-southeast2`; uniform bucket-level access). Runs at startup before the probe, and again from `GET /api/storage/status` so the operator's "periksa ulang" button can finish the setup after fixing permissions without a redeploy. Startup logs `bucket X did not exist and was created` / `found` / `missing and could not be created: <error>`.
- New probe hints: billing ("The billing account for the owning project is disabled" -- seen live against a foreign bucket name; this is the likeliest real blocker, cf. EXPERIMENT item 8), 409 name taken, and a not-found variant that mentions auto-creation.
- Verified locally: local mode unaffected (ensure is a no-op, probe 2 ms); gcs mode without credentials reports the credential error from ensure and the not-found error from the anonymous probe, both with hints; `tsc` clean; status route returns `bucketCreated`/`bucketError`.
- First hosted attempt (AI Studio, 2026-09-17, bucket `dongkrakusaha-data-rasya-2026`): status showed "The specified bucket does not exist" -- i.e. auto-creation FAILED and the screen only showed the consequence. Fixed the same hour: `probe(creationError)` now reports the creation error as the primary message with its own hint (`hintFor()` shared); the 403 hint names the role needed for creation (Storage Admin on the project) vs the manual-bucket fallback (Storage Object Admin on the bucket). The actual cause on AI Studio is pending the operator pasting `/api/storage/status` (`bucketError`) or redeploying.
- Operator path is now: set `GCS_BUCKET` in AI Studio -> redeploy -> Koneksi shows green. DEPLOY_CLOUD_RUN.md updated accordingly; manual bucket + IAM demoted to the fallback for a permission error.

## Finding: AI Studio Runs In A "Starter Tier" Project -- No Cloud Storage, No IAM; Firestore Backend Added (2026-09-17)
Status: finding PROVEN (Google docs + the live 403); Firestore backend IMPLEMENTED and its logic VERIFIED against a fake client; hosted end-to-end UNVERIFIED until the next deploy's Koneksi line.

Evidence chain:
1. `GCS_BUCKET` set on AI Studio -> Koneksi red; `/api/storage/status` -> `bucketError: "331242708018-compute@developer.gserviceaccount.com does not have storage.buckets.create access"`. Credentials and service account work; only bucket creation is denied.
2. The Cloud Console for that project (`civic-ally-z9v0l`) shows "You're in a Starter Tier project ... Upgrade for full access".
3. Google's Starter Tier documentation (https://docs.cloud.google.com/docs/starter-tier): only Cloud Run, Firebase Authentication, Firestore, Cloud SQL for PostgreSQL and a Maps demo key are provided; "Available Google Cloud regions, IAM roles, quotas, organization policies, and API enablements are strictly managed by Google"; "You can't enable other Google Cloud APIs within that same project"; upgrading to a standard project requires a Cloud Billing account. Blog (https://cloud.google.com/blog/topics/developers-practitioners/the-starter-tier-for-google-ai-studio-explained): Firestore limits 1 GiB, 40k writes/day, 50k reads/day, 10 GiB egress/month; the AI Studio agent provisions Firestore "when your prompt implies the need for structured data storage".
Conclusion: the bucket path is closed on AI Studio without billing. This resolves EXPERIMENT item 8 ("billing?") -- yes for GCS, no for Firestore.

Implementation (`server/storage.ts` rewritten, same exported API):
- Third mode `firestore`: one document per key in `du_storage` (`key, kind, contentType, size, updatedAt, chunks, data`), payloads > 900 KB split into `du_storage_chunks` documents (`<id>%23<n>`) because a Firestore document is capped at 1 MiB; `list(prefix)` is a range query on the single auto-indexed `key` field (chunks in a separate collection, so no composite index); `remove` deletes chunks then the object; rewriting a key drops stale chunks first. Client: `@google-cloud/firestore` (server SDK, ADC, project id from the Cloud Run metadata server; `FIRESTORE_DATABASE`/`FIRESTORE_COLLECTION` optional).
- Mode selection: `STORAGE_BACKEND` if set; else gcs when `GCS_BUCKET`; else firestore when `K_SERVICE` (Cloud Run, incl. AI Studio); else local. `backendLabel()` feeds logs and the Koneksi line. `ensureBackend()` (alias `ensureBucket`) checks Firestore reachability or creates the bucket. Hints are per mode (Firestore: database missing / permission / credentials).
- server.ts: the three "gcs" branches for agent contracts now mean "any remote mode" (`!== "local"`), so self-improvement logs persist in Firestore too.
- Verified: fake-client test -- small text round trip, 2.5 MB binary chunked into 3 docs and read back byte-identical, rewrite drops stale chunks, prefix listing, remove clears chunks, probe ok; no-credential path reports "Unable to detect a Project Id" with the laptop hint; local mode regression -- boot label "disk lokal", 33 campaigns intact, status route ok; `tsc` and `npm run build` clean. First real Firestore write happens on the next AI Studio boot; its Koneksi line is the verdict.
- Hosted result #2 (AI Studio, 2026-09-17 02:23 UTC): mode `firestore` auto-selected; probe error `7 PERMISSION_DENIED: Cloud Firestore API has not been used in project ais-asia-southeast1-0c344f99aa before or it is disabled`. So: credentials fine, Firestore simply not provisioned yet. The runtime project id is `ais-asia-southeast1-0c344f99aa` (the console the owner opened showed `civic-ally-z9v0l`; whether these are the same project under two names is unknown -- record what the next status line says). AI Studio offered its own provisioning tool (`set_up_firebase`); decision: let it provision (hosting-side infrastructure) with an explicit instruction not to touch any repo file. Hint text for this exact message added (was mis-mapped to a permission hint).
- AI Studio edited its copy AGAIN while doing this: it reports removing `GCS_BUCKET` from `.env.example` and "disabling it in the server runtime". Not adopted; the next GitHub deploy overwrites its copy (roles rule).
- Hosted result #3 (after AI Studio ran `set_up_firebase`): same "API not enabled in ais-asia-southeast1-0c344f99aa" error, because the client used the metadata project. AI Studio's report: the container runs in a Google-managed sandbox project (`ais-asia-southeast1-0c344f99aa`) while Firestore was provisioned in the owner's project `civic-ally-z9v0l` as a NAMED database (`ai-studio-dongkrakusahapro-75788e3d-62bf-44c2-837a-7c059a6d1e0b`), recorded in a file it created, `firebase-applet-config.json` (despite the no-file-changes instruction; treated as its provisioning artifact, not adopted). Fix: `server/storage.ts` resolves project/database from `FIRESTORE_PROJECT`/`FIRESTORE_DATABASE`, else from that applet file if present in cwd, else the client default; label shows both. OPEN QUESTION the next status line answers: whether the sandbox project's service account may write to Firestore in the owner's project (cross-project IAM). If PERMISSION_DENIED there, the hint names it; the alternative would be Firestore's REST API with the web API key under security rules -- not built yet.
- Robustness found while testing the unreachable case locally: (1) google-auth-library rejected in a background timer and KILLED the process -- global unhandledRejection/uncaughtException handlers added (log, keep serving); (2) boot awaited the storage reads unconditionally, so a dead backend blocked listening -- on Cloud Run that becomes a crash loop. Every boot read now races a deadline (20 s remote / 60 s local) and falls back to defaults with a `[Startup] <what>: storage did not answer` line. Verified: firestore mode with no credentials -> listens after ~40 s, serves the 3 sample campaigns, status route red with the cause; local mode unchanged (33 campaigns, probe 6 ms).
- Hosted result #4 (after pulling e3dbb30 and setting FIRESTORE_PROJECT/DATABASE): `mode: gcs` -- GCS_BUCKET was still in the AI Studio ENVIRONMENT (its earlier "removed" only touched files). Runtime identity there is `ais-sandbox@ais-asia-southeast1-0c344f99aa.iam.gserviceaccount.com` (a Google sandbox SA, not the owner's project SA). Applet config confirmed as `{projectId: civic-ally-z9v0l, firestoreDatabaseId: ai-studio-dongkrakusahapro-…, appId, authDomain, storageBucket, …}` -- both keys the resolver already reads. Next: force `STORAGE_BACKEND=firestore` + remove the env var; the cross-project permission question is still open.
- Operator instruction (DEPLOY_CLOUD_RUN.md): remove `GCS_BUCKET` from AI Studio, redeploy, read the line. If it says the database does not exist, Firestore must be provisioned once (AI Studio agent, without code changes, or the console).

## Hosted Result #5: Sandbox Service Account Has No IAM On The Owner's Firestore -> REST Transport (2026-09-17)
Status: finding PROVEN (`7 PERMISSION_DENIED: Missing or insufficient permissions` with STORAGE_BACKEND=firestore + explicit project/database); REST transport IMPLEMENTED and VERIFIED against an in-memory Firestore REST fake; hosted end-to-end UNVERIFIED until the next status line.

The container on AI Studio runs as `ais-sandbox@ais-asia-southeast1-0c344f99aa.iam.gserviceaccount.com` (Google's sandbox project); Firestore lives in the owner's project `civic-ally-z9v0l`. IAM in a Starter Tier project is managed by Google, so the service-account path is closed there. AI Studio's own analysis agreed and named the two options: grant `Cloud Datastore User` to that service account in `civic-ally-z9v0l` (worth one try in the console; may be refused on Starter Tier), or use Firestore as a client (Web SDK / REST with the Firebase web API key under Security Rules) -- the way AI Studio's generated apps work.

Implementation (`server/firestoreTransport.ts` new; `server/storage.ts` refactored to a `Transport` interface):
- Transports: `admin` (@google-cloud/firestore, ADC) and `rest` (Firestore REST v1 with `?key=<web API key>`, typed-JSON encoding, bytes as base64, `:runQuery` for the key range / equality queries, doc ids percent-encoded once more in the URL). REST runs either after an anonymous Firebase sign-in (Identity Toolkit `accounts:signUp`, refreshed via securetoken) or unauthenticated.
- Selection at boot and on every "periksa ulang": try admin, then rest-anonymous, then rest-unauthenticated, each with a real write/read/delete of a readiness document; the first that works is used and the label says `via <transport>`; if none works, the error lists every attempt and the hint names the fix (enable the Anonymous provider; rules allowing `du_storage`/`du_storage_chunks` for `request.auth != null`).
- Target resolution (project, database, API key): env `FIRESTORE_PROJECT`/`FIRESTORE_DATABASE`/`FIREBASE_API_KEY`, else AI Studio's `firebase-applet-config.json` (fields `projectId`, `firestoreDatabaseId`, `apiKey` -- shape confirmed from AI Studio's dump). The web API key is not a secret in Firebase's model (it identifies the project; Security Rules are the guard) but it is still never written into any MD.
- Verified with a fake fetch implementing the REST endpoints: transport falls through admin (no ADC) to rest-anonymous; text and 2.5 MB binary round trips; chunking; prefix list; delete; fallback to rest-unauthenticated when anonymous sign-in returns ADMIN_ONLY_OPERATION; all-denied error + hint. Local mode regression: 33 campaigns, probe 7 ms; `tsc` and build clean.
- Hosted result #6 (77887e6 deployed, applet config present): all three transports tried -- [admin] PERMISSION_DENIED (no IAM, expected); [rest-anonymous] ADMIN_ONLY_OPERATION = Anonymous provider NOT enabled in Firebase Auth; [rest-unauthenticated] 403 = rules correctly deny unauthenticated clients. Code path is complete; the remaining two settings are Firebase-console side: enable Anonymous, publish rules allowing du_storage + du_storage_chunks for request.auth != null on the named database. Security note recorded: anyone holding the web API key can then sign in anonymously and read/write those two collections -- the standard AI Studio Firebase model, acceptable for publish-bound listing data, to be tightened later (App Check or a server-issued token) as a separate task.
- Hosted result #7 (2026-09-17 09:22 UTC): **GREEN** -- `ok:true, persistent:true, via rest-unauthenticated, 343 ms`. AI Studio published Firestore rules for the named database through its own tooling (it reports the Firebase console is restricted on Starter Tier) but did NOT enable the Anonymous provider, so the rules it published allow unauthenticated access to the two collections. First real write/read/delete on Firestore from the hosted copy = the Firestore persistence path is VERIFIED end to end. Open: (a) restart-survival check by the operator (restore backup -> restart -> data still there); (b) tighten to `request.auth != null` + Anonymous provider, after which the transport flips to rest-anonymous on the next check.
- OWNER DECISION (2026-09-17): feature closed here -- enough time spent. Accepted as-is: transport rest-unauthenticated with open rules on the two collections. Deferred, not forgotten: (a) operator restart-survival check, (b) Anonymous provider + request.auth != null rules. Do not reopen unless the owner asks or data actually goes missing.
- What the hosted line can say next: green `via rest-anonymous` (done); green `via rest-unauthenticated` (works, but rules are open -- ask AI Studio to tighten to `request.auth != null` and enable Anonymous, then it flips to anonymous); red with the three attempts (rules deny both client paths -> fix rules / enable Anonymous in Firebase Console).

## Extension Zip No Longer Drifts On Every Server Start (2026-09-18)

`public/dongkrakusaha-publisher-extension.zip` is tracked, and `generateExtensionZipBuffer` in `server.ts` rewrites it at every startup. JSZip stamps each entry -- the six files AND the directory entry -- with "now", so the file changed by ~42 bytes per start with identical contents and sat in source control as a phantom edit after every `npm run dev`. Fixed by pinning `date: EXTENSION_ZIP_DATE` (local-time 2026-01-01, so the DOS timestamp is timezone-independent) on the files and on an explicitly created directory entry (`zip.folder()` reuses an existing entry, so it must be created before the call). **Verified:** two restarts 61 s apart produce the same SHA-1; the zip still lists 7 entries with one shared date. From now on a dirty zip means the extension sources really changed.

Also committed in the same batch: one self-improvement line the Strategy agent appended to `ai-agents/campaign-strategy.md` during the 2026-09-18 test run. Those runtime lines are the contract-growth mechanism (see `ai-agents/*.md` "Self-Improvement Rule"); they are committed as they appear, not reverted.

## Persona Theme, Stage 3b: Structure -- Rail Menu, Screen Words, Flattened Panels, LOAD Tables, Result Banner (2026-09-19)

**References finally on disk:** the owner had put the 14 screens in the project folder (`Persona 5 UI Data Base/`, now in `.git/info/exclude` so copyrighted screenshots never enter the repo). Read as two contact sheets; each screen's lesson is tabulated in `THEME_PERSONA.md` "Referensi terkunci". Owner's three layout decisions: left rail menu on desktop (bottom bar stays on phones), giant screen word + red band + fewer/larger tilted panels, result banner on COMPLETE and on a successful submit.

**Built.** `src/theme/persona/PersonaRail.tsx` (P5 COMMAND menu: NAV_ITEMS shared with BottomNav, running-job counts, per-item rotation, active item = red slash block with yellow giant number; bottom nav hidden and `main` padded at >= 1024 px under Persona; `--du-bottom-nav` becomes 0 there). `ScreenTitle.tsx` (giant cut-out word + yellow number over a diagonal red band, rendered by `TabPanel` for every tab, nothing in the standard theme). `ResultBanner.tsx` (portal overlay: red band, white slash, yellow cut-out title, 120 px number with red hard shadow, label strips, 10 star sprites once; fired by `showResult()` from OrchestratorPanel on a COMPLETE run -- once per runId -- and from PublishingHub on a successful submit). CSS: nested `du-card` inside `du-card` loses its frame and becomes a section (fewer, larger panels without regrouping JSX), top-level panels skew -3deg with content counter-skewed at >= 1024 px, section headings get a red strip, tables get the LOAD grammar (red header, alternating stripes, Anton first column, slanted last cell, white hover row), Publish mode switcher becomes torn tags (`du-tabs`/`du-tab`, wraps on phones). Also fixed for both themes: `main code { overflow-wrap: anywhere }` -- the 72 px overflow on Publish@400 was a long URL in `<code>`, not the mode switcher.

**Verified.** Persona: 8 tabs at 1440 (rail navigation) and 400 (bottom bar), zero page errors, no horizontal overflow anywhere now; banner appears on the event and is gone after ~2.6 s; screenshots reviewed (Data Bisnis 1440: rail + screen word; Riwayat 1440 with the banner mid-flight; Publish 400 with torn tags) and copied to `Preview Apps Dongkra-Usaha/persona-stage1/p5b-*.png`. Standard theme fingerprint still 14/16 identical (Koneksi = picker). `npm test` 25/25, `tsc`, `vite build` clean. Craft-floor pass applied at inspection: contrast (white on #0B0B0B, black on white tags, yellow only on result/number), one motion moment per event, browser surfaces themed, states (hover/active/disabled) present.

**Remains (3c):** canvas during a run (red slash edges already; node stamp + COMPLETE banner now fire), NodeInspector as the PERSONA-background panel, guide speech-bubble tail, splash reveal, GettingStartedGuide and BusinessManager inner grids regrouped, Preview as profile card, phone-specific polish.

## Persona Theme, Owner Verdict After Stage 2: "Painted On" -- Corrections + Structural Rework Ordered (2026-09-19)

**Owner's verdict (accepted):** Stage 1 retinted the app; it did not restructure it. Two proofs in the owner's screenshots: purple buttons on Visual Aset (the violet scale was never remapped -- a fourth colour, against the dictionary) and the canvas still drew soft blue bezier edges with plain dark boxes. The owner ordered Stage 3 together with the corrections and a genuine structural rework ("ultimate rework = the whole thing"). Also answered honestly: the owner's OneDrive reference folder still holds one file on disk (checked four times); references so far are the developer's own plus the owner's two result screens.

**Corrections shipped (this commit):** every remaining Tailwind hue (violet, purple, indigo, cyan, teal, green, orange, yellow, gray) is mapped into the red/white/black family (yellow only to the result accent). Canvas 3a: edge colours moved to CSS variables (`--du-edge-*`, `--du-particle`, `--du-canvas-panel`; standard values in `index.css`, so the standard theme is unchanged), edges rendered with `style={{stroke}}` because SVG attributes cannot read `var()`; under Persona edges become P5 slashes (`slashPath()`: straight segments with one sharp break, built from the bezier's endpoints), 3 px idle / 6 px active, red when active, white when done, yellow loop; node cards get `du-node` hooks: black cut-out with 3 px white border, Anton title, skewed status stamp (red while running, white when done, red fill on failure), icon as a black block. Fingerprint check: standard theme still identical on 14/16 tabs (Koneksi = picker).

**Next (with owner decisions):** structural layer -- desktop navigation as a P5 main-menu rail, giant cut-out screen titles over a diagonal red band, fewer and larger tilted panels per tab, P5 list rows, result banner on COMPLETE, splash reveal. Recorded in THEME_PERSONA.md once decided.

## Persona Theme, Stage 2: The Guide (Mitsuru) Shipped (2026-09-19)

**Built.** `src/guide/persona.ts` (name, two owner-supplied portraits converted to WebP in `public/guide/`, idle lines, typing speed, idle delay -- one file to swap the character), `src/guide/guideRegistry.ts` (51 entries: fungsi + fakta drawn from this file's own history: why the canvas exists, why length is measured by the server, the stale-audit bug, the bridge that dies on extension reload, Bug 7 …), `src/guide/GuideCompanion.tsx` (document-level `pointerover` delegation on `[data-guide]` and canvas `[data-node]`, 120 ms debounce, portrait idle→talk, typewriter 18 ms/char, fact line after the sentence completes, back to idle after 4 s, mute chip persisted in `localStorage du-guide-muted`, reduced-motion prints at once, `hidden lg:flex`, renders nothing in the standard theme). `data-guide` attributes on nav items, header campaign select, orchestrator instruction/Terbaca/Jalankan/Terapkan/salin ledger/hemat/zoom/fit/fullscreen, Publish mode/Refresh Live DOM/Buka Form/Isi Form/Submit/Batas field, Koneksi tema/cadangan, Data Bisnis simpan, Preview, Riwayat table, JobTray, status widget. Dialogue styling in `persona.css` (torn black box, red skewed name tag, yellow FAKTA tag, ink-blot portrait with inset ring, open/pop/caret keyframes). Tests: `tests/guideRegistry.test.ts` (nav + node coverage, length limits, id resolution) -- `npm test` now runs three suites.

**Found and fixed during verification (all from one screenshot):** dialogue text invisible because `text-white` maps to black under the theme -- the aside now carries `du-dark`; the name tag was clipped by the box's `clip-path` -- moved outside the clipped element; the portrait's outline was clipped -- replaced by an inset box-shadow on a pseudo-element; the box covered the canvas's zoom/fullscreen controls -- under Persona (>= 1024 px) the canvas controls are mirrored to the bottom-left and the progress pill to the right (`du-canvas-controls`, `du-canvas-progress`).

**Verified (headless Chromium):** six hovers (nav, header select, Jalankan, node Audit, fullscreen, Koneksi tema) each switch to the talk portrait with the right title; 4.8 s of silence returns to idle; mute hides the guide and shows the chip, unmute restores; 400 px: not visible; standard theme: not in the DOM; zero page errors; `npm test` 25/25; `tsc` + `vite build` clean. Screenshot: `Preview Apps Dongkra-Usaha/persona-stage1/p5-guide-speaking.png`.

**Remains:** Stage 3 (canvas slashes/nodes/inspector, tables, forms, Preview, splash, Publish@400 overflow). Known: JobTray (bottom-left) may overlap the mirrored canvas controls while a job runs and the canvas bottom sits near the viewport bottom -- to be resolved when the canvas is restyled.

## Persona Theme, Stage 1: Foundation + Chrome Shipped, Default Proven Unchanged (2026-09-19)

**Dictionary confirmed by the owner** (three decisions): full black with white text (not black desk + white cards), cut-out lettering on labels and card titles too (readability floor kept for paragraphs, input values, table cells, dialog text), no green anywhere. Two reference screens from the owner (Level Up / Item) added the P5 line language (straight slashes with sharp breaks, not curves) and a sparing yellow accent for result moments; both recorded in `THEME_PERSONA.md`.

**Built.** `src/theme/persona.css` (imported by `index.css`): under `[data-theme="persona"]` the Tailwind v4 colour variables are remapped (white -> black, slate 50-300 -> blacks/#333, slate 600-950 -> white, blue/sky -> red, emerald -> white, amber/rose -> red), radii -> 0, shadows -> hard red offsets, `--font-display` Anton (OFL, self-hosted in `public/fonts/`), body halftone, selection/caret/scrollbar/focus themed; `.du-dark` / `.du-canvas` scopes restore the original slate scale for components that are dark by design. Hook classes: `du-card` (3 px white border, torn corner via clip-path, drop-in animation), `du-btn` (skew, hard shadow, white sweep on hover, stamp on press), `du-badge`, `du-label`, `du-nav-item` (active = red skewed block, big number), `du-cutout`. Motion: tab panels slide in skewed (260 ms), cards drop (220 ms, stagger 40 ms), all off under reduced motion. `src/theme/useTheme.ts` (localStorage `du-theme`, pre-paint script in `index.html`), `src/ui/CutoutText.tsx` (deterministic per-letter jitter, bare text in the standard theme), `src/components/ThemePicker.tsx` in Koneksi. Chrome hooked: Header title + version badge, BottomNav items, ErrorBoundary, JobTray, outer cards of Data Bisnis / Kepung Pasar / Visual Aset / Preview / Publish / Koneksi / Riwayat; `du-dark` on the orchestrator toolbar, NodeInspector and the Publish audit panel.

**Verified.** Computed-style fingerprint of all 8 tabs at 1440 and 400 px, standard theme, before (from HEAD via `git stash`) vs after: **14/16 identical**; the two Koneksi hashes differ only by the +28 elements of the new theme picker. First attempt showed +1 element on every tab -- CutoutText's wrapper span in the standard theme -- fixed by returning bare text. Persona theme: all 8 tabs at 1440 and 400 px, zero page errors, Anton loaded, no horizontal overflow except Publish@400 (72 px, pre-existing in the standard theme from the mode switcher's `w-max`; queued for Stage 3). Screenshots reviewed: Data Bisnis 1440/400, AI Orchestrator 1440 (nodes and edges still old shapes -- Stage 3), Koneksi 1440. `npm test` 21/21, `tsc`, `vite build` clean.

**Remains.** Stage 2 (guide) and Stage 3 (deep surfaces incl. canvas slashes/nodes, Riwayat/Publish tables, forms, Preview, splash, Publish@400 overflow). Owner gate: review the four screenshots copied to `OneDrive/Gambar/Preview Apps Dongkra-Usaha/persona-stage1/`.

## Persona Theme, Stage 0: Visual Dictionary Written, Awaiting Owner Confirmation (2026-09-19)

**Request (owner):** an optional, selectable UI theme modelled on Persona 5's interface -- "menyeluruh dan akurat", from the tabs to the orchestrator canvas -- plus a guide character (Mitsuru Kirijo, owner-supplied portraits: idle / speaking) in a corner who explains whatever the cursor points at, in a P5-style dialogue box. The current UI stays the default; the theme is chosen in Koneksi.

**Decisions taken with the owner:** Mitsuru's portraits are the owner's assets and the owner's IP risk (warned: Atlus/SEGA, product meant for sale); the developer places them and never fetches or generates Atlus art; name/assets/voice live in one file for a later swap. References: the owner's site was blocked (403) and the OneDrive folder holds one file, so the dictionary was built from independent sources (Suto interview, three UI analyses, Art of the Title, p5ui archive) plus that one calendar screen; owner screenshots enrich it. Staged delivery with a confirmation gate per stage. Guide hidden below 1024 px.

**Why it is feasible "to the root":** Tailwind v4 compiles utilities to CSS variables, so redefining `--color-*`, `--radius-*`, `--shadow-*`, `--font-*` under `[data-theme="persona"]` retints all 924 colour utilities in 21 components at once; shape (skew, torn polygons, halftone) and motion are a second layer on shared primitives and key surfaces.

**Stage 0 output:** `THEME_PERSONA.md` -- the design contract: direction contract (six blocks), tokens with the Tailwind variable mapping, typography (Anton display, bundled; cutout treatment only on short titles; Inter body), shapes, the motion language (12 app events with durations/easing, transform/opacity only, reduce-motion off), P5 screen -> app surface mapping, status semantics that never rely on colour alone, accessibility/performance floor, and what stays untouched (canvas motion policy, `canvasGraph.ts`, agent contracts). Method: impeccable `new-work` with the world pinned by the brief (no direction roll), colour strategy Committed.

**Gate:** no code until the owner confirms the dictionary. Then Stage 1 (theme foundation + chrome, default pixel-identical), Stage 2 (guide), Stage 3 (deep surfaces incl. the canvas), each verified and confirmed.

## Owner Confirms Bug 6 Closed; "1.900 Kata" Was 1.917 Karakter; Listing Copy Retired (2026-09-19)

Owner report after rest: (1) extension reports 1-2 resolved on the real site (Bug 6 fix confirmed by the owner). (2) "The content agent reports ~1.900 words but the Preview says otherwise." Screenshots showed the instruction had been read as `1.800–2.200 karakter (instruksi operator)`, the Konten node measured 257 kata · 16 kalimat · 1.917 karakter, and the pasted article had the six sub-headed sections in `seoDescription` with a separate 134-char meta -- the agent obeyed. The Preview showed an older text because the listing copy was never rebuilt: Bug 7 above. (3) Next: the owner wants to plan an "ultimate UI rework".

Lesson recorded by the owner and accepted: Bug 6 was the cost of touching the extension without first reading the extension section of the map (rule 1). The rules exist to raise output, not to slow it; criticism of them is welcome, but skipping them is not.

## Owner Report After 1.2.0: Popup Sees 65 Fields, App Sees 0; First Field-Limit Evidence (2026-09-18, night)

**Reports.** (1) Popup "Ukur Field": "Deskripsi di halaman: 0 karakter (textarea)" plus a maxlength list. (2) Autofill does nothing although the Input Produk tab is open. (3) "Real Browser Connection" first showed no live inspection, then worked, then the app's live DOM could not see fields while the popup could.

**(2) and (3) are one problem -- Bug 6 above.** The owner had just reloaded the extension to get 1.2.0 (as instructed); the app tab kept a dead bridge, so its requests went nowhere, the fields stayed at 0, and "Isi Form Otomatis" stayed disabled because it requires formDetected. Verified in the harness that inspection and autofill work with the 1.2.0/1.3.0 code, so the measurement feature did not break them; the recovery gap was pre-existing and is now closed (see Bug 6).

**(1) First evidence about the DongkrakUsaha form, from the owner's popup screenshot (65 fields detected):** every input that declares a maxlength is a META field -- "Meta Keyword = 165" and about twenty-five "Meta Deskripsi <site> = 165" inputs, one per syndication site (dongkrakusaha.com, proviral.my.id, jejaring.my.id, unilink.my.id, viapesan.my.id, prestise.my.id, …). The description field is a plain textarea (the popup said "textarea", not CKEditor) with NO maxlength, and the short description ("penawaran") has no maxlength either -- so the "200 karakter" claim is not enforced by the form, and the description limit, if any, is server-side and still has to be proven by publish -> reopen -> Ukur. Consequences: our metaDescription rule (120-160 chars) fits the 165-char meta inputs; the popup measured 0 characters because the form was empty at that moment, and the Publish tab's verdict now says "masih kosong -- publish dulu" instead of "terpotong" for that case.

**Also:** popup badge reads the manifest version (was a hardcoded "v1.0.0"); extension is 1.3.0.

**Owner's next check (real site):** reload the unpacked extension, keep the app tab open, click the popup's Refresh Status -> the Publish tab must show the fields within ~2 s without a page reload (or show the amber banner with the remedy). Then continue the field-limit procedure in phase2-workflow.md.

## Operator Instructions Take Precedence; Field-Limit Verification Tooling (2026-09-18, evening)

**Report (owner, screenshot of v2.7 on AI Studio):** the instruction field held "format SEO 500 - 1000 kalimat"; the run produced 589 words / 59 sentences and the badge said "syarat 500-1000 kata". From the operator's seat the system ran its programmed rule, not the instruction, and never said how it had read the instruction. Owner's decisions this session: (1) operator instructions WIN over built-in rules (length, structure, tone); the supervisor's 500-1000 words is the default when the field is silent; no-fabrication stays absolute. (2) The final default length is POSTPONED until the DongkrakUsaha description field limit is verified -- the owner's searched claim ("deskripsi singkat 200 karakter; detail direkomendasikan <= 2.000 karakter") contradicts the supervisor's rule and is unverified.

**Why the field looked decorative.** Until v2.7 the objective never reached content/audit; in v2.7 it was one line mid-prompt while `CONTENT_WORDS` forced 500-1000 words and no other unit existed. "500-1000 kalimat" therefore produced a correct-by-the-old-rule 589 words with no feedback.

**What shipped (v2.8).**
- `src/lib/lengthRule.ts` (new, tested by `tests/lengthRule.test.ts`, run with `npm test`): `parseLengthRule(text)` reads ranges, "sekitar N", "minimal/maksimal N", bare "N kata", "s/d | sampai | hingga", thousand separators and "1k", in `kata | kalimat | karakter`; falls back to `DEFAULT_LENGTH` (500-1000 kata, target 650). Technical ceilings (`LENGTH_LIMITS`: 1.500 kata / 120 kalimat / 10.000 karakter, tied to the 30/60 s call timeouts) clamp a request and put a human sentence in `rule.clamped` that quotes the operator's own words ("Diminta 500–1.000 kalimat (≈ 6.000–12.000 kata); dipakai 72–120 kalimat — plafon batas waktu model"). `measure(text)` returns all three units (sentences: terminal punctuation or a line break; common abbreviations excluded; documented approximation). Server and UI import the same module.
- `server.ts`: `operatorBlock()` puts the instruction at the TOP of the content and audit prompts with its precedence spelled out, plus the plan agent's briefing (`outputs.plan.objective` + `taskBreakdown`) so the Orchestrator agent is the interpreter of the operator's words. `runContentAgent(..., objective, rule, brief)` budgets six sections from `rule.target` (with a sentence hint per section), measures in `rule.unit`, and the corrective pass asks for a concrete delta ("TAMBAHKAN sekitar 300 kata; pertahankan draft, perdalam bagian yang tipis") instead of a rewrite. `runAuditAgent(..., objective, rule, brief)` receives all three measurements, asks for an "Instruksi Operator" finding (warning, ai) when the copy ignores the instruction, and the server's own Length finding uses the rule's unit. Revision acceptance: a rewrite that leaves the window is rejected; one that enters it, or gets CLOSER while both are outside, is kept even on a lower score. The run response carries `rules.length` and `measured`.
- UI: "Terbaca:" line under the instruction field (same parser; slate = default, sky = operator rule, amber = clamped with the reason); the Konten node shows "N <unit> · aturan …" plus kata · kalimat · karakter and a standing "> 2.000 karakter: batas field belum diverifikasi" warning (`UNVERIFIED_FIELD_CHARS`); header badge reads `APP_VERSION` (was hardcoded "v2.5").
- Extension 1.2.0 + Publish tab: popup button "Ukur Field Halaman Ini" -> background `MEASURE_DONGKRAK_FIELDS` -> content script `measureDescriptionField()` reads the CKEditor WYSIWYG iframe (or a textarea) and lists every input with a `maxlength`; result shown in the popup and relayed to the app as `DONGKRAK_FIELD_MEASURE`, rendered by `FieldMeasurePanel` ("Batas field terdeteksi": saved chars/words/sentences, sent-vs-saved verdict for the active campaign, maxlength list). The description editor has no maxlength (it is CKEditor), so the limit can only be proven by saving and re-measuring.
- Removed three 0-byte junk files committed on 2026-09-17 (`Usaha`, `UsersWilliVs.CodeDongkrak`, `Projectsrcchangelog.ts`).

**Verified.** `npm test` 16/16; `tsc` + `vite build` clean. Real runs on cmp-001: "Tulis 950–1000 kata …" -> rule 950-1000 kata (operator) reached writer AND auditor (auditor raised "Instruksi Operator"), but every stage ran on flash-lite (503 storm on 3.6-flash) which topped out at 596→645→676→728 words over two revisions; the run ended WARNINGS with both findings naming the gap -- honest, not silent. "40 sampai 60 kalimat, gaya ramah" -> 54 kalimat first draft, READY / SEO 95, 39 s. UI run "sekitar 550 kata" -> 521 words, badge "521 kata · aturan 495–605 kata (instruksi operator)". Headless Chromium: "Terbaca:" switches default -> clamped -> operator as you type; header shows v2.8; zero page errors. Extension loaded unpacked in Chromium with a mock DongkrakUsaha form routed to the real URL: popup reports 3.710 karakter · 600 kata · 60 kalimat (ckeditor-iframe) and maxlength Deskripsi Singkat = 200 / Judul = 120; the Publish tab panel renders the same numbers.

**Also confirmed this session:** the AI Studio export (18 Sep 13:29) equals the repo except the three `PORT` lines AI Studio always rewrites for its proxy (not adopted). 503s are Google "high demand" -- outside our control; what is ours (Rule 1K/1L cooldowns, health across keys, one storm wait, fallback) is visible per attempt in the node inspector. Under a storm the writer is flash-lite, which follows length budgets ~35 % short; that is the cost of the storm, not a bug.

**Remains (owner):** run the field-limit procedure in `ai-agents/phase2-workflow.md` "Verifying The Description Field Limit"; then set `DEFAULT_LENGTH` / `UNVERIFIED_FIELD_CHARS` in `src/lib/lengthRule.ts` from the measured numbers. Deploy v2.8 to AI Studio and reload the unpacked extension (1.2.0).

## Description Is A 500-1000 Word SEO Article; Audit Was Judging Stale Text (2026-09-18)

**Request (owner's supervisor):** the listing description must be an SEO article of 500-1000 words. Owner's observation: typing "500 kata" into the orchestrator's objective field changed nothing, and the agents "do not seem to read their MD contracts".

**What was actually true.** (1) Contracts ARE read on every call (`runAgent` prepends `ai-agents/<file>.md` to the prompt), but no length rule existed anywhere -- not in the contract, the prompt, or the audit contract -- so the model wrote its default ~150-300 words. (2) `objective` reached only the plan, strategy and keyword agents; `runContentAgent` and `runAuditAgent` never received it, so operator instructions about the copy were inert. (3) **Pre-existing bug found by measuring:** both audit inputs were built as `{ businessData, seoStrategy, generatedContent, ...campaign }`. Spreading the stored campaign LAST replaced the fresh `seoStrategy`/`generatedContent` with the previously applied ones, so on any campaign that had been "Terapkan"-ed once, the auditor judged the OLD text and the revision loop accepted/rejected rewrites on the scores of that old text (run 1 below: audit reported "132 kata" while the draft had 493). This alone explains much of "the AI does not listen".

**What shipped.**
- `server.ts`: `CONTENT_WORDS = { min: 500, max: 1000, target: 650 }`, `countWords()` (whitespace tokens). `runContentAgent(businessData, seoStrategy, revision?, objective?)` now receives the operator objective, asks for SIX sections of 110-140 words each with plain-text sub-headings (small models follow per-section budgets far better than one total), measures the draft, and on a miss runs ONE corrective pass with the measured number (both calls plus a `note` land in the ledger's attempt trail). Revision mode shows the whole previous draft (was an 800-char excerpt) and insists the rewrite stays a full article. `runAuditAgent(campaign, objective?)` gets the server-measured count and the objective in its prompt and appends a server-side `Length` finding (error, fixableBy ai) whenever the count is out of range, demoting READY to WARNINGS so the normal revision loop runs. Audit inputs spread the campaign FIRST. Revision acceptance is length-aware: a rewrite that leaves the window is rejected; one that brings a short draft into it is kept even on an equal score.
- Contracts: `content-generator.md` "Length Contract" + "Operator Instructions"; `quality-audit.md` length rule + runtime inputs; `orchestrator.md` "Operator Objective Routing".
- UI: the objective field reads "Tujuan & instruksi untuk semua agent"; the Konten node inspector shows "<n> kata" against the 500-1000 rule. Changelog v2.7.

**Verified (three real runs on cmp-001, objective "Artikel SEO sekitar 700 kata, tonjolkan garansi pengerjaan dan konsultasi WhatsApp"):** run 1 (stale audit input still present): 393 -> 493 words, audit judged the 132-word stored text, revision rejected on noise, 39 s. Run 2 (inputs fixed, 100-130 per section): 466 -> 499, fresh-draft audit raised Length, revision 479 -> 588, re-audit READY / SEO 90, 66 s. Run 3 (110-140 per section, Gemini 3.6 Flash healthy again): first draft 535 words, no correction, no revision, READY / SEO 92, 33 s. No markdown symbols in any output. `tsc` and `vite build` clean.

**Remains / watch:** flash-lite undershoots the per-section budget by ~15 % (466-499 first drafts), so storm-mode runs will usually pay the one corrective call (~+15-25 s). The DongkrakUsaha description field's own character limit is unknown; the extension records `maxlength` when it fills a field (`content.js`), so check the first real publish of a 600-word article.

## White Screen Root Cause: Drag-Release Race In The Canvas Updater (2026-09-18)

**Evidence:** the owner's copied error report (first fruit of the new error boundary): `TypeError: Cannot read properties of null (reading 'x')` at `AgentCanvas.tsx` `onPointerMove`, called from React's `basicStateReducer` -- so the throw happened while React ran a queued `setView(v => ...)` updater, not in the event handler. Breadcrumb before it ("WebSocket closed without opened") is Vite HMR on AI Studio's dev server, unrelated.

**Mechanism:** the updater read `drag.current!.x`. A functional updater runs when React processes the queue, and once the fiber already has a pending update (one earlier move, or any of the 1.2 s progress ticks while a run is in flight) React stops computing it eagerly and defers it to render. A `pointerup` arriving in that gap runs `endPointer`, which nulls `drag.current`; the deferred updater then dereferences null and the render throws. That is why it only ever happened during a run and only sometimes: it needed a queued update plus a release within a few milliseconds of the last move -- a quick drag on a laptop touchpad does exactly that.

**Fix:** `onPointerMove` computes `x`/`y` from the ref at event time and the updater only spreads those numbers; no updater in the file reads a mutable ref any more. **Verified:** a harness dispatching `pointerdown, move, move, up` in one task reproduced the crash deterministically on the old code (boundary panel shown, canvas gone) and passes on the new code; a real-mouse drag still pans the view; `tsc` and `vite build` clean.

**Gotcha recorded in DEVELOPMENT_RULES "UI conventions":** never read a mutable ref inside a functional state updater.

## Canvas Follow-Up: Fullscreen Strip + White-Screen Net (2026-09-18)

Owner's report the morning after the canvas shipped: (1) "Layar penuh" rendered as a thin black strip across the top of the tab; (2) sometimes, while the orchestrator is working, the whole page goes white and only a browser reload brings it back.

**Bug 1 -- fullscreen strip. Root cause (verified):** `TabPanel` animates every tab section with `animate-du-panel-in`, whose `fill-mode: both` leaves a persistent `transform` on the `<section>`. A transformed ancestor becomes the containing block for `position: fixed`, so the `fixed inset-0` overlay sized itself to the tab box instead of the viewport. **Fix:** `AgentCanvas` now renders the fullscreen overlay through `createPortal(..., document.body)`. While there, the fit padding stopped assuming a 104 px toolbar: it measures the floating toolbar (`toolbarRef.offsetHeight + 28`), because on a phone the campaign name, objective field and run button stack to about twice the desktop height and the first node was hiding under them.

**Bug 2 -- white screen. Root cause: found the same day, through the boundary (see the next paragraph and the 2026-09-18 "Drag-Release Race" entry).** Earlier that day: Every render path in `canvasGraph.ts`, `AgentCanvas.tsx`, `NodeInspector.tsx`, `OrchestratorPanel.tsx`, `JobTray.tsx` and `jobs.tsx` was traced for unguarded reads on partial run data (unknown stages, missing `attempts`, `outputs` of an in-flight run, a selected node that disappears, an active edge that is not laid out) -- all are guarded. A real run (25 s, calm quota) hammered with 11 tab switches / campaign switches / node clicks / fullscreen toggles / zooms produced zero page errors. In React a white page means an uncaught render error unmounted the root, and this app had no error boundary anywhere, so whatever threw left no trace. **What shipped instead:** `src/components/ErrorBoundary.tsx` -- one boundary around each `TabPanel` (label = tab name) and one around the whole shell inside `JobCenterProvider` (label "Aplikasi", so a retry re-mounts the UI while running jobs survive). The panel shows the error name/message, "Coba lagi" re-mounts only that part, and "Salin detail error" copies name, message, the first stack frames, the component stack and the last six `window` error / unhandled-rejection breadcrumbs recorded before the crash. The next occurrence therefore produces a readable report instead of a dead tab; the owner has been asked to paste that text.

**Gotcha recorded:** the project has no `@types/react`, so `React` is an implicit `any` and a class extending `React.Component` cannot see `this.props` / `this.setState` -- the boundary declares both with `declare`. First class component in the codebase; see DEVELOPMENT_RULES "UI conventions".

**Verified (headless Chromium against the dev server):** fullscreen overlay is a direct child of `<body>` at exactly 1440x900 and 400x780, 8 nodes rendered, Esc exits, first node below the toolbar on the phone shot; the boundary mounted with a child that throws during render shows the panel, the rest of the app stays interactive, and "Coba lagi" re-renders the child once it stops throwing. `tsc` and `vite build` clean.

**Resolved the same evening.** The owner pasted the first "Salin detail error" report from the AI Studio deployment: `TypeError: Cannot read properties of null (reading 'x')` at `AgentCanvas.tsx` inside `basicStateReducer`, i.e. inside a `setView` functional updater. See "Drag-Release Race" below.

## Orchestrator Tab Rebuilt As An Agent Canvas (2026-09-17)
Status: DONE and VERIFIED (19/19 browser checks incl. a real cmp-001 run; desktop 1440 and phone 400).

Why: the tab was a stack of report blocks (734 lines) that hid the product's actual subject -- seven agents handing work to each other. The owner asked for the shape automation tools use (n8n-style node canvas). Mid-build the owner corrected the brief: no maximal effects, the motion must show REAL progress.

What it is now:
- `src/components/orchestrator/canvasGraph.ts` -- the single place server stages map to nodes (`nodeForStage`; `content-revisi-N`/`audit-ulang-N` fold back onto the node they re-run, unknown stages are ignored, not fatal). Holds the topology, two coordinate sets (desktop = two stacked bands, phone = one vertical chain) and `deriveGraphState()` which turns ledger + progress label into per-node status, repeat counts and the <=3 active edges.
- `AgentCanvas.tsx` -- dark canvas, pan/drag, wheel + pinch zoom, fit, fullscreen (Esc), semantic zoom (role line hidden below 78%), node cards with status/duration/×rounds/fallback.
- `NodeInspector.tsx` -- everything the old blocks showed, attached to its node: ledger row, model + key fingerprint, attempt trail chips, stage output, audit findings + revision history, the hand-off editors (Simpan / Simpan & Jalankan Ulang), blockers + Terapkan on the sink node.
- `OrchestratorPanel.tsx` -- shell only; all previous handlers kept (Job Center run, apply, human edits).

Motion policy (owner's correction, now the rule): animation is a status signal.
- Only edges feeding the stage the server reports as running are lit (glow = layered low-opacity strokes, never `filter: blur()`), one packet per edge, dashes flow on those edges only.
- A running node shows an INDETERMINATE bar -- the server cannot report progress inside a stage, so the UI does not fake a percentage.
- Everything stops when the run stops (verified: 0 particles when idle). `prefers-reduced-motion` disables motion; a "gerak/hemat" toggle is always available and remembered in localStorage; a one-second frame sample after a run starts auto-drops to hemat if avg frame > 22 ms.

Bugs found and fixed while verifying (all were real, none cosmetic):
1. `setPointerCapture` on canvas pointerdown swallowed every click on the floating chrome -- Jalankan, zoom, fullscreen and the objective input did nothing. Now pointerdown ignores targets inside `[data-node], button, input, textarea, select, a, label`.
2. `deriveGraphState` returns fresh arrays each poll; keying the layout memo by identity re-ran auto-fit on every render and snapped the operator's zoom back mid-run. Layout is now keyed by array CONTENT and auto-fit runs only when the picture changes shape.
3. Every tab stays mounted, so the panel is laid out at width 0 until opened; the first fit did nothing and never retried. A ResizeObserver fits when the canvas gains size.
4. Composition: one long line fitted at 38% (unreadable) and clipped the first node. Rebuilt as two bands; fit floors at 60%, anchors to the start of the flow when the graph is wider than the frame, and leaves 104 px clear for the floating toolbar. Desktop now opens at 81% with nothing clipped.

Verified: tsc + build clean; a real run drove the canvas keyword -> content -> audit -> image with particles 2 -> 1 -> 0; hemat toggle stops motion mid-run; reduced-motion rule ships; inspector opens per node and carries the hand-off editors; fullscreen 1376 px; no page errors; no horizontal overflow at 400 px. Remaining: the phone chain needs panning to reach the last node (deliberate -- shrinking further would make labels unreadable).

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
