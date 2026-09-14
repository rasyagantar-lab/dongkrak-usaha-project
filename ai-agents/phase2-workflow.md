# Phase 2 Workflow Plan

## Execution Principle
This project must advance in a strict sequence. Do not skip ahead to later-stage features before the earlier stage is complete and validated.

## Required Execution Order
1. Orchestrator receives the audience request.
2. Builder prepares the orchestrator task contract from project memory and model registry.
3. Business context is captured from the active campaign or DongkrakUsaha tab data.
4. Strategy agent defines campaign positioning, offer framing, and growth objective. ✅ implemented
5. Keyword strategy agent produces keyword clusters and local SEO intent. ✅ validated
6. Content generation agent creates content based on strategy and business facts. ✅ validated once; provider quota remains a runtime dependency
7. Quality audit agent validates relevance, SEO quality, and publishing readiness. ✅ validated
8. Image generation agent prepares visual concept and creative brief. ✅ brief route validated
9. WebP conversion agent converts output to WebP format if needed. ✅ validated
10. Final orchestrator merges all outputs into a publish-ready package. ✅ gate validated; real bitmap remains provider-gated

## Progress Note
- The strategy stage is running with the dedicated feature registry.
- The keyword stage route is implemented and uses the keyword-specific model key and fallback chain.
- Live testing found retired Gemini 1.5/2.5 IDs in the registry; the runtime registry was updated to Gemini 3.1 Pro Preview and Gemini 3.6 Flash.
- Keyword → content smoke test succeeded with both stages using Gemini 3.6 Flash.
- A subsequent content run hit provider `503` and `429`; fallback behavior was observed, and cooldown state was separated per specialist feature before audit validation continues.
- Clean audit smoke test succeeded with `WARNINGS`, SEO score 75, and Gemini 3.6 Flash.
- Image creative brief route is implemented with the dedicated image feature registry.
- Image brief smoke test returned HTTP 200, a 1080x1080 dimension recommendation, and Gemini 3.6 Flash metadata.

## Current Gate
- Strategy, keyword, content, and audit are complete enough to proceed.
- Audit warnings must remain visible to the user before image generation or publishing.
- Next ordered stage is image generation; WebP and final packaging must wait for image output.
- The current image route produces a provider-ready creative brief. Bitmap generation requires a separate configured image-capable provider.
- The brief route is complete; the next gate is actual bitmap output before WebP conversion.
- Bitmap route `/api/image/generate` is implemented with OpenAI Image API and local PNG persistence.
- Bitmap route validation passed: invalid prompt returns 400; valid prompt without `OPENAI_API_KEY_IMAGE` returns 503 with an actionable configuration message.
- Strict key isolation smoke test passed: missing keyword key returns `GEMINI_API_KEY_KEYWORD` and does not fall back to a global Gemini key.
- WebP conversion smoke test passed with a 1x1 PNG, preserved dimensions, and traversal protection.
- WebP conversion is implemented locally with Sharp and validated; actual bitmap generation remains provider-gated.
- Final package route is implemented and preserves audit warnings and missing-asset blockers.
- Final package smoke test returned `INCOMPLETE` for missing assets and `COMPLETE` with `readyForPublishing: true` for a READY audit and complete assets.
- Autopost vertical slice is implemented after the AI package: field autofill, confirmation gate, CAPTCHA detection, and submit dispatch through the extension.
- Autopost code passes build and extension syntax checks; live validation remains gated on a logged-in DongkrakUsaha product form.
- Autopost requests now have request IDs, explicit runtime-error forwarding, and a 10-second timeout so bridge failures cannot leave the UI stuck indefinitely.
- Live autofill test confirmed fields were filled but status text waited for a page event; result reporting now completes immediately with filled/missing counts.
- Field mapping was expanded to include associated labels, surrounding label text, title/data-label attributes, and meta-description aliases.
- A live result of 5 filled / 2 missing isolated the remaining mapping gap to category select matching and meta-description aliases; both were expanded and build-validated.
- Latest real-extension result was `0/7` while DOM inspection verified 65 fields. Exact target IDs/names were recorded and the mapper now prioritizes `kategori`, `penawaran`, `produk`, `deskripsi`, `keyword`, `metadesc`, and `no_wa` before heuristic matching.
- Exact-field mapper passes extension syntax, TypeScript, and production build validation; live retest is the next discriminating check.
- Live retest reached 6/7 fields; the remaining category control is a custom searchable dropdown whose correct option is `Furniture`. A widget-aware category selector was added and build-validated.
- Category diagnosis is complete: the previous campaign source was wrong for the user's intended taxonomy. The confirmed source category is `Jasa Furniture`.
- The sample campaign now uses `Jasa Furniture`; the next browser retest should confirm the dropdown selects the corresponding Furniture/Jasa Furniture option.
- Source correction is build-validated; reload the app/campaign state before the next browser autofill retest.
- Platform taxonomy is now separated from business taxonomy: business uses `Jasa Furniture`, Dongkrak listing uses `Furniture`.
- Deskripsi uses CKEditor in the live form; a dedicated rich-text iframe/CKEditor autofill handler was added.
- Category/description fix is build-validated; the next browser retest must confirm platform option `Furniture` and visible CKEditor content.
- Live browser confirmation passed for Deskripsi: content is visible in the app and appears in the DongkrakUsaha form.
- Live submit is not complete: the form stayed on the product page and no listing appeared. Submit dispatch was hardened with `requestSubmit()` and fallback diagnostics; a real browser retest remains required.
- Image generation belongs to the image specialist stage; uploading the resulting file into the DongkrakUsaha file input remains an autopost file-transfer task, not yet complete.
- Live form evidence confirms photo upload is mandatory. Autopost now transfers the first campaign image into the file input and blocks submit if the transfer fails.
- Submit dispatch is no longer reported as publish success; confirmation requires a success URL or page evidence.
- Image attachment and submit-status changes pass extension syntax, TypeScript, and production build validation; live browser confirmation remains the gate.
- Live browser confirmation passed: a listing published successfully to DongkrakUsaha with the required image.

- Live retest of automatic history persistence found the gap: user submitted via the app's real "Konfirmasi & Submit" button, then switched to the History tab to check the result before DongkrakUsaha finished redirecting. The URL field stayed empty and history stayed empty, even though the listing and image upload actually succeeded.
- Root cause: the detection listener and pending-campaign refs lived inside PublishingHub.tsx, which unmounts whenever the user navigates to another app tab -- exactly what happened right after a real submit. Moved that state and the actual mark-published call up to App.tsx (mounted for the whole session); PublishingHub now only reads the same shared refs for on-screen status text. TypeScript and production build both pass after the change.
- Retest of the App.tsx-level fix (2026-09-13): still failed identically -- no URL, no history record -- even with the listener moved to App root and the tab-switch reproduced.
- Root cause found via screenshot evidence: submit does not navigate the tab to a public listing URL at all. It returns to the admin product list (`menu=produk`), where the new product appears as a row with a "Share web" button, plus a banner saying the "List DU1000" button needs a 1x24 hour wait (404 before that). The whole "detect tab navigation to a public URL" design was built on a false premise -- there is no such navigation event to detect. The App.tsx listener-lifetime fix from the previous entry remains a valid, separate improvement, but cannot fix this.
- "Share web" investigated: it is a cross-posting/syndication feature to partner domains (checkbox for `boxmoro.com` + Submit), not a way to reveal dongkrakusaha.com's own listing URL. No clipboard prompt/copy occurred, confirming it is not a copy-link action.
- Platform constraint confirmed: there is no live public listing URL available immediately after submit under current evidence. The only path in the UI ("List DU1000") is gated by the platform behind a mandatory ~24 hour delay (404 before that). Automatic detection of a public URL right after submit is not achievable -- this is a platform timing constraint, not a code bug. Stop pursuing tab-navigation-based auto-detection for the immediate post-submit moment.
- User decided: mark "Submitted" immediately on proven submit-dispatch success; skip building a delayed 24h automatic check for now; real URL added manually later.
- Implemented: new `CampaignStatus` value `'Submitted'`; new `POST /api/dongkrakusaha/mark-submitted` route (writes status + history record, no URL); App.tsx's global listener now calls it directly off `DONGKRAK_SUBMIT_RESULT` (dispatched+success) instead of waiting for a URL broadcast that can never arrive; removed the dead tab-navigation URL-detection code and the now-unused `autopostFinalizedUrlRef`; PublishingHistory.tsx renders `Submitted` as its own amber state instead of misclassifying it as red "Failed".
- Validated: TypeScript and production build both clean. `mark-submitted` mechanically smoke-tested via curl (real id -> status flip + history record; bogus id -> 404); dev server restarted afterward to clear that test data from the in-memory store.
- Not yet validated: a real live Autofill -> Konfirmasi & Submit run confirming the app shows `Submitted` immediately and History shows the amber entry, without any URL-detection step involved.
- UX relocation (user-directed): moved the "fill in the public URL" action from a disconnected Manual Assist field on Publishing Hub into an inline input directly on each `Submitted` row in Riwayat Publish (History). `/api/dongkrakusaha/mark-published` now takes an optional `historyRecordId` and updates that record in place (status -> Published) instead of creating a duplicate history row. Full flow curl-tested end-to-end (submit -> Submitted record -> fill URL from that same record -> Published in place, still 1 row). TypeScript and build clean. Real-browser retest of this full path is still outstanding.

## Next Stage After First Successful Publish
- Add automatic success URL/page detection after submit.
- Persist the detected published URL into campaign history without manual URL entry.
- Keep image generation with the image specialist; keep file attachment in the autopost extension layer.
- Public listing URL detection and automatic history persistence are now wired; a form/dashboard URL is not treated as publish success.
- Automatic finalization passes TypeScript and production build validation; one live publish retest remains before treating history automation as complete.
- After that retest, continue deferred AI specialist work, starting with image generation/provider configuration.

## AI Agent Engine Work (2026-09-14)
- Resumed the deferred agent/orchestrator work after the publishing gate was settled.
- Router reworked: quota/cooldown state is now tracked per `(key fingerprint x model)` instead of per `(feature x model)`. Agents sharing a key now correctly share one allowance. See AI_MODELS.md Rule 1B.
- Latent defect removed: the old router re-sorted each feature's model list by a global priority ranking, silently overriding the per-feature preference documented in AI_MODELS.md (e.g. forcing pro-first on content, which is meant to be flash-first). Registry order is now authoritative. See AI_MODELS.md Rule 1C.
- `.env.example` rewritten as the actual key-slot checklist (all six Gemini agent slots plus the OpenAI bitmap slot), replacing the stale AI Studio-era single-key file.
- `/api/gemini/status` rebuilt: reports per-agent key configuration, per-model live status with cooldown seconds and success/failure counts, plus a `sharedKeys` list. Never returns key values, only one-way fingerprints.
- Specialist prompts extracted into single-source runner functions (`runStrategyAgent`, `runKeywordAgent`, `runContentAgent`, `runAuditAgent`, `runImageBriefAgent`). The standalone routes and the orchestrator pipeline now call the same code, so a stage's prompt cannot drift between the two paths.
- `/api/orchestrator/run` replaced with real sequential delegation plus a task ledger and dependency-aware skipping. The previous version was a single Gemini call that returned a plan and never invoked any specialist.
- New `AI Orchestrator` tab (`src/components/OrchestratorPanel.tsx`): objective input, run button, pipeline status, per-stage ledger with model/fallback/duration, blockers, orchestrator briefing, and an "apply outputs to campaign" action. The old fake orchestrator panel was removed from PublishingHub.
- `ModelStatusIndicator` rewritten from a global model chain into per-agent key/quota status with shared-key warnings.
- Validated: TypeScript and production build clean. Live unhappy-path run of the full pipeline with zero keys configured returned HTTP 200 with a correct 6-entry ledger (3 failed naming the exact missing env var, 3 skipped with dependency reasons, no crash).
- NOT validated: the success path. No agent has ever completed a real generation in this environment because no key slot is configured yet. Nothing about output quality, fallback-on-quota behaviour, or shared-key quota accounting has runtime proof.

## Bitmap Stage Unblocked By Provider Migration (2026-09-14)
- The bitmap stage had been provider-gated since it was written: the route targeted the OpenAI Images API while this account only has Gemini keys, so it could never render anything.
- Migrated `/api/image/generate` to Gemini's image models, routed through the shared `generateWithFallback` router, with its own key slot `GEMINI_API_KEY_BITMAP` separate from the image-brief slot.
- Added `GET /api/gemini/models?feature=<feature>` so model availability is discovered from the provider instead of assumed from documentation. The bitmap model chain is explicitly a candidate list until that discovery confirms it.
- Validated: TypeScript and production build clean; unhappy paths smoke-tested live (503 naming the missing variable for both new routes, 400 still returned for a too-short prompt).
- Still gated: an actual rendered image. That requires the user to create a Gemini key, fill `GEMINI_API_KEY_BITMAP`, restart, run discovery to confirm the real image model ID, then generate. WebP conversion and final packaging stay blocked behind that first real bitmap, as the ordering rule requires.

## First Full Pipeline Success + Bitmap Quota Finding (2026-09-14)
- User filled all 7 Gemini key slots. After a full process restart (a plain kill of the tracked PID was not enough -- see PROJECT_KNOWLEDGE.md's env-reload bug entry), `/api/gemini/status` showed zero missing keys for the first time.
- `POST /api/orchestrator/run` completed 6/6 stages for the first time ever: `{"done":6,"failed":0,"skipped":0,"fallbacksUsed":3}`. Output was coherent and business-specific, and the audit agent correctly caught real gaps (missing WhatsApp/address) in the test payload. `readyForPublishing` correctly stayed `false` (audit WARNINGS + no bitmap yet).
- Discovery (`GET /api/gemini/models?feature=bitmap`) confirmed all 3 registry candidate image models are visible on the account. A real generation attempt then hit `429` with `limit: 0` free-tier quota on all 3 -- confirmed structural, not code. `gemini-3.1-pro-preview` (this account's primary model for orchestrator/keyword/audit/strategy) has the same `limit: 0` symptom; those stages currently succeed only via fallback to `gemini-3.6-flash`, which does have working quota.
- Conclusion: the text half of Phase 2 (strategy -> keyword -> content -> audit -> image brief) is now proven end-to-end with a real provider. The bitmap stage remains the sole blocker, and it is a provider entitlement/billing question for this Google Cloud project, not an implementation gap.

## Image Stage Resolved Without An Image Model (2026-09-14)
- Gemini image generation AND editing are both blocked on this account (`429 limit: 0`, every image model, both keys, proven by isolation probe). Vision input works. No `imagen-*` model is exposed at all.
- User proposed the approach that resolved it: one real base photo per service category, reused across listings with different per-listing caption text. This needs no image provider.
- Implemented backend: `POST /api/image/base-photo`, `GET /api/image/base-photos`, `POST /api/image/compose` (local sharp composite, 133-338ms per render, WebP/PNG/JPEG). Live-tested including XML-escaping of caption text and rejection of path traversal.
- Stage ordering impact: the old gate "WebP and final packaging must wait for bitmap output" is now satisfiable without bitmap. The composite route emits WebP directly, so a captioned listing asset can be produced today.
- Caption contract completed: `IMAGE_BRIEF_SCHEMA` now requires `caption {title, subtitle, badge}` with enforced length limits and an explicit ban on inventing promos. Live-verified within limits and grounded in the campaign's real CTA.
- `Visual Aset` tab shipped (`src/components/VisualAssetStudio.tsx`): upload base photo per category -> pull caption from the Image Brief agent -> render -> apply to campaign.
- Required side fix: `/generated-images` and `/base-photos` now serve CORS headers, because the extension fetches the listing image cross-origin from inside the dongkrakusaha.com tab. Without this the publish-time image upload would have failed silently.
- Stage status: the image stage is now COMPLETE END-TO-END at the API level, without any image-generation model. Remaining gate is a real browser pass with a real product photo, through to a confirmed DongkrakUsaha publish.

## Pipeline Closes The Loop + UI Consolidation (2026-09-14)
- The pipeline is no longer one-directional. Audit output returns to the orchestrator, which re-commissions the content agent with the findings and re-audits, up to 2 rounds, discarding any revision that scores worse. Recorded as `content-revisi-N` / `audit-ulang-N` in the ledger.
- The manual `AI Content` and `AI QC Audit` tabs were removed. Running one agent by hand was a second, divergent path to work the orchestrator now does in one pass with dependency chaining and the revision loop. Their component files are kept on disk but unmounted.
- The orchestrator tab now shows every output in full (keywords, complete content, all audit findings, image-brief caption) instead of one-line summaries, plus a revision-loop panel.
- Two correctness fixes landed alongside: campaigns/history now persist to `data/` (they were RAM-only and every restart wiped real work), and model chains are now built from provider discovery with strict text/image family separation.

## MD Contracts Live + Market Siege + AI Base Photo (2026-09-14, single approved plan)
- Phase 1 PROVEN: the six agent contracts are now read fresh from disk and prepended to every prompt; agents append self-improvement notes to their own files. Sentinel test passed twice without a restart.
- Phase 2 IMPLEMENTED / UNVERIFIED: Cloudflare Workers AI (primary) and Hugging Face (fallback) can generate the base photo under a caption; never the captioned image itself. Waits on a real token.
- Phase 3 PROVEN: "Kepung Pasar" drafts one Draft clone per kecamatan by text substitution (0 AI calls) and realises only the selected ones, one at a time, through the unchanged orchestrator. Isolation and the Draft-only delete guard verified live.
- Ordering impact: none of this changes the mandated stage order. Siege realisation runs the same strategy -> keyword -> content -> audit -> image-brief chain per clone.

## Operator Feedback Round 1 (2026-09-14)
- First real operator use surfaced that the app was feature-complete but not operable: tabs in no order, redundant single-agent tabs, siege clones indistinguishable in the picker, no delete, image brief re-fetched instead of reused.
- Fixed: picker grouped by batch with area labels; SEO & Keyword tab removed (orchestrator covers it); `imageBrief` persisted on the campaign and reused by Visual Aset; delete (Draft-only) in Data Bisnis + bulk draft delete per batch; tabs reordered and numbered in work order; a five-step guide on the landing tab.
- Lesson recorded: an engine that is proven at the API level is not "done" until someone who did not build it can find the next step without asking. Verify UI changes with the operator, not only with curl.

## No Jumping Rule
- Do not implement full publishing automation before all earlier stages are working.
- Do not perform image generation before content strategy and keyword alignment are validated.
- Do not perform final publishing logic before QA pass is clear.
- Do not skip fallback logic or model registry checks.

## Success Criteria for Phase 2
- Strategy is documented and aligned with the business.
- Keywords are relevant and conversion-oriented.
- Content is generated from valid business facts.
- Audit passes or identifies concrete improvements.
- Visual assets are created with platform compatibility in mind.
- WebP conversion is compliant with DongkrakUsaha format requirements.

## Required Project Files
Builder-maintained planning files (project memory; not read by runtime agents):
- PROJECT_KNOWLEDGE.md
- AI_MODELS.md
- ai-agents/phase2-workflow.md (this file)

Runtime agent contracts. As of 2026-09-14 these are NOT just documentation: each one is
loaded fresh from disk and prepended to that agent's prompt on every call (see
`FEATURE_MODEL_REGISTRY[...].contractFile` and `runAgent()` in server.ts). Editing one
changes the agent's behaviour on its next call, no restart needed. Each also carries an
auto-recorded `## Self-Improvement Log` section the agent itself appends to:
- ai-agents/orchestrator.md
- ai-agents/campaign-strategy.md
- ai-agents/keyword-strategy.md
- ai-agents/content-generator.md
- ai-agents/quality-audit.md
- ai-agents/image-generator.md (Image Brief half only; the Bitmap Renderer half is
  documentation, since that route sends a raw image prompt with no contract attached)

Documentation-only (no LLM call exists to attach a contract to -- WebP conversion and
caption compositing are local Sharp operations, not agent prompts):
- ai-agents/webp-converter.md

## Improvement Rule
Every completed task in Phase 2 must update this file with what worked, what failed, and what should be improved before moving to the next phase.
