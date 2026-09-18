# AI Models & API Key Registry

## Mandatory Rule
- Every feature must declare its model/provider registry here before implementation.
- Every feature must use a dedicated API key or a dedicated provider key namespace.
- Never reuse one provider key across multiple unrelated workflows unless the provider explicitly supports it and it is documented.
- Every model must have a fallback model.
- If a model hits rate limit, daily quota, or temporary failure, the server must automatically roll to the next available model in that feature registry.
- Do not claim a model is available unless it is in this registry and has a verified fallback chain.
- This file is the project memory for model usage, quotas, and fallback behavior.
- Every runtime AI worker has exactly one owning API-key namespace. A worker must never fall back to `GEMINI_API_KEY` or another worker's key.

## Feature Registry

| Feature | Primary Goal | Provider | Primary Model | Fallback Model | Env Key | Fallback Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| Orchestrator Chat | Master controller that communicates with the audience and routes jobs to specialist AI workers | Gemini | Gemini 3.1 Pro Preview | Gemini 3.6 Flash | GEMINI_API_KEY_ORCHESTRATOR | 404 retired model, 429, quota exhausted, timeout, routing failure |
| Content Generation | Generate marketing copy, product description, captions, ad copy | Gemini | Gemini 3.6 Flash | Gemini 3.1 Pro Preview | GEMINI_API_KEY_CONTENT | 404 retired model, 429, quota exceeded, timeout, provider error |
| SEO Keyword Strategy | Keyword clustering, search intent, topic planning | Gemini | Gemini 3.1 Pro Preview | Gemini 3.6 Flash | GEMINI_API_KEY_KEYWORD | 404 retired model, rate limit, model disabled, poor output quality |
| Quality Control Audit | Review copy quality, tone, SEO compliance, factual checks | Gemini | Gemini 3.1 Pro Preview | Gemini 3.6 Flash | GEMINI_API_KEY_AUDIT | 404 retired model, quota exhausted, validation failure |
| Image Brief Specialist | Create visual concepts and provider-ready prompts | Gemini | Gemini 3.6 Flash | Gemini 3.1 Pro Preview | GEMINI_API_KEY_IMAGE | 404 retired model, 429, quota exhausted, provider outage |
| Bitmap Image Renderer | Create PNG social media / product / banner images | Gemini | Gemini 2.5 Flash Image (CANDIDATE) | Gemini 3.1 Flash Lite Image → Gemini 3.1 Flash Image (CANDIDATES) | GEMINI_API_KEY_BITMAP | 404 retired/unknown model, 429, quota exhausted, provider outage |
| PNG to WebP Conversion | Convert generated PNG images to WebP for Dongkrak support | Local conversion or dedicated remote API | local sharp conversion | remote conversion provider | WEBP_CONVERTER_API_KEY | local conversion unavailable, remote fallback |
| Caption Composite | Render per-listing caption/badge over one real base photo per category | Local (no provider) | local sharp composite | none needed -- no network call | none | n/a |
| AI Base Photo (optional) | Generate the photo UNDERNEATH the caption when no real product photo exists | Cloudflare Workers AI, then Hugging Face | `@cf/black-forest-labs/flux-1-schnell` (PROVEN 2026-09-14) | `black-forest-labs/FLUX.1-schnell` via HF Inference Providers (unverified) | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN_BITMAP`; `HUGGINGFACE_API_TOKEN_BITMAP` | 429, 5xx, auth failure -> cooldown + next provider |
| Campaign Strategy | Brand positioning, marketing plan, funnel strategy | Gemini | Gemini 3.1 Pro Preview | Gemini 3.6 Flash | GEMINI_API_KEY_STRATEGY | 404 retired model, quota exceeded, output quality low |

## Provider Rules
### Rule 1: Separate key per feature class
- orchestrator chat uses its own key
- content generation uses its own key
- keyword strategy uses its own key
- audit uses its own key
- image uses its own key
- image brief specialist uses `GEMINI_API_KEY_IMAGE`
- bitmap renderer uses `GEMINI_API_KEY_BITMAP`
- webp conversion uses its own key
- campaign strategy uses its own key
- No specialist may read or use another specialist's key.
- The orchestrator uses only `GEMINI_API_KEY_ORCHESTRATOR`.
- The image brief specialist uses only `GEMINI_API_KEY_IMAGE`.
- The bitmap renderer uses only `GEMINI_API_KEY_BITMAP`; it never receives or reuses the Gemini image-brief key. Both are Gemini keys now, but they stay separate slots because image rendering and text generation draw different (and differently sized) allowances.
- The builder's project-memory files are instructions for the builder, not runtime inputs for specialist AI workers.
- Each runtime agent reads only its own `ai-agents/<agent>.md` contract; AI_MODELS.md is compiled by the builder/application into the metadata assigned to that agent.

This prevents one feature from consuming the whole project quota and makes rollback and isolation easier.

### Rule 1A: Master orchestrator architecture
- The master chat must be the only layer that speaks directly with the audience.
- The orchestrator decides which specialist must run the task.
- Specialist AI workers must not converse directly with the audience unless the orchestrator explicitly delegates that specific task.
- Each specialist still keeps its own API key, provider, and fallback chain.
- The orchestrator has its own key and fallback chain as well, so the orchestrator itself cannot become a single point of failure.

This design keeps the system efficient, auditable, and quota-aware.

### Rule 1B: Quota belongs to the key, not to the feature
- Provider quota is consumed per API key, so cooldown/exhaustion state MUST be tracked per `(key x model)` pair, never per `(feature x model)`.
- Implemented in server.ts as `MODEL_SLOT_STATE`, keyed by `sha256(key).slice(0,12) : modelId`.
- The raw key is never stored in that state or returned by any API; only the one-way fingerprint is.
- Consequence: if two agents are pointed at the same key value, they correctly share one allowance. The previous per-feature tracking made each agent assume a private allowance, so agent B would keep calling a model agent A had already been rate-limited on using the very same key.
- `/api/gemini/status` reports which agents share a fingerprint under `sharedKeys`, so shared quota is visible rather than surprising.

### Rule 1C: Registry order is the priority order
- The per-feature `models` array in the registry IS that feature's preference order (content is flash-first, keyword/audit/strategy/orchestrator are pro-first).
- The router must NOT re-sort that list by any global model ranking. Doing so silently overrode the documented per-feature preference (this was a real defect in the earlier router and has been removed).

### Rule 1D: Bitmap rendering moved from OpenAI to Gemini (2026-09-14)
- Reason: this project's account has Gemini keys only. The OpenAI bitmap path had never produced a single image; every run ended at "provider key not configured".
- Gemini returns bitmaps from the ordinary `generateContent` call as inline base64 parts, so `/api/image/generate` now goes through the same `generateWithFallback` router as every text agent. It inherits the model chain, per-key cooldown, and fallback accounting instead of re-implementing them.
- `OPENAI_API_KEY_IMAGE` and `OPENAI_IMAGE_MODEL` are now dead variables, kept only as deprecation notes in `.env.example`.
- Model IDs in the bitmap chain are CANDIDATES, not verified availability. They come from Google's published image-model family, which is documentation, not proof about this account. Rule 4 still applies: none of them may be called "available" until a real call succeeds.
- Wrong IDs are survivable by design: a 404 marks that slot `MODEL_NOT_FOUND`, cools it for 24h, and the router rolls to the next candidate.

### Rule 1E: Model availability must be discovered, not assumed
- `GET /api/gemini/models?feature=<feature>` lists the models the provider actually exposes to that feature's own key, plus which registry candidates are present on the account.
- Use it to replace candidate model IDs with confirmed ones before claiming a chain is valid.
- It returns model metadata and a key fingerprint only; it never returns the key.

### Rule 1F: Not every visual step needs a model (2026-09-14)
- Gemini on this account can READ images but cannot EMIT pixels -- generation AND editing both return `429 limit: 0` on every image model, on every key tested. Proven, see PROJECT_KNOWLEDGE.md.
- The chosen production path for listing visuals is therefore NOT an image model: one real base photo per service category, plus a local `sharp` caption composite per listing (`POST /api/image/compose`). No provider, no key, no quota.
- Prefer this over an image model even if bitmap generation later becomes available: it is free, deterministic, instant, watermark-free, renders exact Indonesian text reliably (image models do not), and keeps a real product photo underneath, which the quality-audit agent's factual-accuracy rules favour.
- AI keeps the part it is actually good at: the Image Brief agent decides what the caption should say; Gemini vision can analyse an uploaded base photo. Both are text tasks on models that work.
- The caption is rendered as vector outlines from a font bundled in the repo (`server/fonts/Inter-*.woff` via opentype.js), never via `<text>` + a system font. Reason: the hosted Linux container has no fonts and drew every glyph as a box (2026-09-15). Do not reintroduce `font-family` in the composite SVG.

### Rule 1G: Discovered models extend the chain; the registry only sets preference (2026-09-14)
- The per-feature `models` array is the PREFERENCE order, not the limit of what a key can reach. Hardcoding two models per feature killed an agent whenever both were cooling down, while the account actually exposed ~15 usable text models.
- The router now appends models from the provider's own ListModels response after the preferences, capped at 8 total. Cached 6 hours per key fingerprint; a discovery failure falls back to registry-only rather than disabling the agent.
- This does not violate Rule 4: every appended model came from the provider's response for that exact key, so nothing is asserted without evidence.

### Rule 1H: A fallback must stay inside its own model family
- `FeatureConfig.modelKind` (`text` | `image`) controls which discovered models may extend a chain.
- A text agent must never fall back to an image model: it would return pixels for a JSON-schema request. The bitmap renderer must never fall back to a text model: it would return prose instead of an image.
- This was a real defect during the Rule 1G change -- text models were briefly appended to the bitmap chain -- and is now structurally prevented.

### Rule 1I: Agent contracts are live runtime input, and agents develop them (2026-09-14)
- Each of the six LLM-backed features (`orchestrator`, `strategy`, `keyword`, `content`, `audit`, `image`) declares a `contractFile` in `FEATURE_MODEL_REGISTRY` naming its own `ai-agents/*.md`. `runAgent()` reads that file from disk on EVERY call -- no caching -- and prepends it to the prompt behind a clear delimiter. The markdown is therefore the agent's binding rulebook, not documentation the builder has to remember to re-translate into a hand-written prompt. Editing it changes behaviour on the very next call with no restart.
- PROVEN 2026-09-14: a sentinel line appended to `campaign-strategy.md` was obeyed on the next call; the sentinel was then changed on disk and the NEW value was obeyed immediately, still with no restart.
- Every one of those six response schemas carries an optional `selfImprovementNote` (present in `properties`, never in `required`). When the agent returns one, `appendSelfImprovementNote()` adds it as a dated bullet to a `## Self-Improvement Log (auto-recorded)` section at the end of that agent's own file. PROVEN the same day: two real notes were written to disk by the agent itself.
- Guardrails: append-only (the model can never rewrite or delete the rules above the log), capped at the most recent 20 entries, single synchronous read-modify-write so concurrent requests cannot interleave (same property `persistCampaigns()` relies on), and the section is machine-owned -- human notes belong in the sections above it. The builder periodically reviews the log, promotes durable lessons into the real rules, and prunes noise.
- `bitmap` and `webp` deliberately have NO contract: bitmap's prompt goes straight to an image model (markdown there would risk being rendered as pixels), and webp has no LLM call at all. `image-generator.md` is therefore injected only for the Image Brief half of that feature.
- Documentation-only claims elsewhere that "runtime agents do not read markdown files" are superseded for these six features; `phase2-workflow.md`'s "Required Project Files" is the authoritative list of which files are live contracts.

### Rule 1J: AI base photos come from Cloudflare first, Hugging Face second -- and never carry the caption (2026-09-14)
- Rule 1F is unchanged: the FINAL listing image is always a real/base photo plus a locally composited caption. This rule only covers where the base photo may come from when the business has none to upload.
- `POST /api/image/generate-base-photo` `{category, prompt}` tries Cloudflare Workers AI (`@cf/black-forest-labs/flux-1-schnell`), then Hugging Face (`black-forest-labs/FLUX.1-schnell` through Inference Providers), then stores the result through the same `storeBasePhotoBuffer()` the manual upload uses -- so the two paths produce identical files and identical responses, and Steps 2-3 of the Visual Aset tab are untouched.
- Why this order (live documentation research, 2026-09-14): Cloudflare gives ~10,000 free Neurons/day with no card, no gating, and a fully published request/response contract (~170 images/day by its per-unit prices -- an estimate, not an official figure). Hugging Face routes this exact model to a paid third-party provider (Nscale), gives free users only ~$0.10/month (~30 images, hard stop), and the model is gated behind a click-through on its page.
- Neither provider shares the Gemini SDK, so neither goes through `generateWithFallback`. They reuse its provider-agnostic parts only: `classifyProviderError` (each provider call attaches an HTTP `status` to thrown errors so 429/5xx/401 classify uniformly) and the same `(key x model)` cooldown slots, keyed as `<provider>:flux-1-schnell`, so an exhausted provider is skipped rather than hammered and shows up on the status page.
- Cloudflare's response is MODEL-SPECIFIC: flux-1-schnell returns JSON `{result:{image:<base64>}}`, while Cloudflare's Stable Diffusion models return raw PNG bytes. The parser is written for flux-1-schnell and must change if the model does.
- Hugging Face is called through the official `@huggingface/inference` SDK on purpose: HF publishes a stable raw URL only for chat completions, not for text-to-image, so a hand-rolled fetch would be guessing.
- Legacy `api-inference.huggingface.co` is dead (the hostname no longer resolves); anything referencing it is obsolete.
- STATUS: Cloudflare PROVEN 2026-09-14 with a real token -- first live call returned a 1024x1024 image in 2.3 s, and the full base-photo -> agent caption -> local compose chain was visually reviewed as listing-ready. Hugging Face remains implemented but UNVERIFIED (no token); given Cloudflare's result it is a low-priority fallback, and Rule 4 still applies to it.

### Rule 1K: Quota scope, retired models, and transient storms (2026-09-15)
- A 429 is parsed, not guessed: `minute` (cool for the provider's retryDelay), `day` (cool 1 h), `none` = "limit: 0", no free allowance (cool 24 h). The status API and widget show which one it was. Cooldowns are persisted (`data/model-slots.json`) so restarts do not forget.
- A 404 "no longer available to new users" marks the model RETIRED for every key and every feature (`data/retired-models.json`), and it is dropped from all chains at boot. Discovery lists retired models; only a real call reveals them (Rule 4 again).
- 503 "high demand" is a spike: cool 45 s, and if a whole chain fails on 5xx the router waits once (8-50 s) and walks it again before failing the stage. Per-call HTTP timeout 60 s.
- Text agents request low thinking effort (`thinkingConfig.thinkingLevel: "low"`) -- rules arrive in the prompt, deliberation is waste; a 49 s audit call was the symptom. Any model that rejects the parameter (400) is remembered and retried without it.
- Rule 3's "retry twice" is superseded by this rule's parsed cooldowns + one storm-wait; do not add blind retries on top.

### Rule 1L: Model health is per MODEL across keys; hangs are cut at 30 s (2026-09-16)
- 503/504/timeouts describe the model, not the key. They are recorded in `MODEL_HEALTH` once for all keys; the model leaves every chain only after an expensive failure (>=15 s) or a second strike within 2 min, with backoff 45 s -> 3 min -> 10 min, reset on success. A cheap first 503 keeps only the per-key cooldown so the preferred model is re-probed. 429 remains per key (Rule 1K).
- Per-call timeout: 30 s when a fallback exists behind the candidate, 60 s for the last candidate. Evidence: `gemini-flash-latest` hung for 24-60 s on four consecutive stages and no call that exceeded 30 s ever succeeded; the slowest good call under load was 15 s.
- Every attempt (call or router wait) is recorded with its duration in the ledger (`attempts[]`). Read that trail before changing any timing constant; do not add blind retries.

### Rule 1M: Long-form output is measured, not trusted (2026-09-18)
The content stage now produces a 500-1000 word article (roughly 1.2-2k output tokens, well inside every candidate's limit and the 30 s hedged timeout on Flash: 10 s measured). Models do not count their own words -- flash-lite lands ~15 % under a per-section budget, Flash lands inside it -- so `server.ts` counts and, on a miss, spends ONE extra content call with the measured number. Budget one extra call per content stage in storm mode (flash-lite fallback) and none in calm mode.

### Rule 2: Fallback chain
Each feature must define a strict fallback order, for example:
- Primary model / primary key
- Secondary model / secondary key
- Tertiary model / tertiary key
- Local fallback if available

### Rule 3: Retry policy
- Retry once for short timeout.
- Retry twice on 429 or quota limit with next model.
- Do not retry indefinitely.
- Log the failure type and the model used.

### Rule 4: No hallucinated availability
A model is considered available only if:
- it is configured in the env file
- it is in the model registry here
- it has a known fallback path
- it passes a smoke test at least once

## Default Fallback Strategy

```ts
const modelPolicy = {
  orchestrator: ["gemini-3.1-pro-preview", "gemini-3.6-flash"],
  content: ["gemini-3.6-flash", "gemini-3.1-pro-preview"],
  keyword: ["gemini-3.1-pro-preview", "gemini-3.6-flash"],
  audit: ["gemini-3.1-pro-preview", "gemini-3.6-flash"],
  image: ["gemini-3.6-flash", "gemini-3.1-pro-preview"],
  bitmap: ["gemini-2.5-flash-image", "gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"],
  strategy: ["gemini-3.1-pro-preview", "gemini-3.6-flash"],
  webp: ["local-sharp", "remote-webp-api"]
};
```

This must be implemented as a runtime router, not as hardcoded assumptions in individual components.

## Rollback Logic

The backend must use a unified provider manager with this flow:
1. Select feature.
2. Read that feature's provider and dedicated key namespace.
3. Pick the highest-priority model for that feature only when its own key is configured and not exhausted.
4. Execute request.
5. If response is rate-limited, quota-limited, or failed, switch to the next model in the feature list.
6. Continue until a model succeeds or all fallback models fail.
7. Return structured error payload with which model attempted and which failed.

### Error conditions that trigger rollback
- 429 Too Many Requests
- `RESOURCE_EXHAUSTED`
- `daily limit reached`
- `quota exceeded`
- temporary timeout
- provider-specific outage or major API failure

### Do not trigger rollback for
- prompt validation errors
- user input formatting issues
- local validation errors that do not involve the provider

## Implementation Guidance
### Orchestrator chat
- Use a dedicated orchestrator key and model fallback chain.
- The orchestrator owns the audience conversation and task routing.
- It receives user intent, breaks work into tasks, and delegates each task to the right specialist.
- The orchestrator must keep a task ledger with statuses and provider/model used.

### Content generation
- Use dedicated key for marketing content
- Keep prompt separated by use case: ad copy, description, CTA, landing page
- Use a model that is stable for copy creation and not just a generic default

### Quality audit
- Use a stricter model for scoring and validation
- Compare generated output against rubric: tone, structure, keyword, clarity, CTA, compliance

### Keyword strategy
- Use a model with stronger reasoning for search intent and topic clustering
- Keep keyword suggestions in a structured JSON schema

### Image generation
- Keep image generation isolated from text generation.
- Use `GEMINI_API_KEY_BITMAP` through `/api/image/generate`.
- The route sends the brief as a plain prompt with `responseModalities: ["TEXT","IMAGE"]`, and retries once with a bare config if a model rejects those hints as an invalid argument.
- Persist the inline base64 output under `public/generated-images` and return asset metadata including the model actually used and whether a fallback occurred.
- Use `/api/gemini/image-brief` as the prompt preparation stage; the brief agent and the renderer are separate features with separate keys.

### WebP conversion
- Prefer local conversion using sharp or equivalent
- Remote conversion API becomes fallback only
- This keeps costs lower while preserving compatibility with DongkrakUsaha

## Work Stages by Feature
### Stage 1: Prompt contract
Define input schema and output schema.

### Stage 2: Provider/router config
Assign model, key, and fallback order.

### Stage 3: Runtime health check
Check provider status and quota metadata.

### Stage 4: Execution
Send request to selected model.

### Stage 5: Post-processing
Transform output to project output format.

### Stage 6: Audit
Review final output quality.

### Stage 7: Store result
Save result, provider, model used, and quality score.

## Documentation Requirements
- Every new feature must add a section here.
- Every model change must update the registry and fallback chain.
- Any quota issue or provider outage must be noted in the project memory file.
- Every model/detail used in production must be explicitly documented; no undocumented provider behavior is allowed.

## Environment Configuration
- All agent key slots are documented in `.env.example`, which is the checklist for what must exist in `.env`.
- Required Gemini slots: `GEMINI_API_KEY_ORCHESTRATOR`, `GEMINI_API_KEY_STRATEGY`, `GEMINI_API_KEY_KEYWORD`, `GEMINI_API_KEY_CONTENT`, `GEMINI_API_KEY_AUDIT`, `GEMINI_API_KEY_IMAGE`, `GEMINI_API_KEY_BITMAP` (seven slots).
- No non-Gemini provider key is required any more. WebP conversion is local and needs no key. `OPENAI_API_KEY_IMAGE` / `OPENAI_IMAGE_MODEL` are dead after the bitmap migration.
- The legacy global `GEMINI_API_KEY` is NOT used and is never a fallback.
- An empty slot disables that agent: its route returns a configuration error naming the exact missing variable, and `/api/gemini/status` lists it under `missingKeys`.
- Status as of 2026-09-14: all 7 Gemini slots are now configured with real keys. Text agents (orchestrator/strategy/keyword/content/audit/image-brief) are PROVEN working end-to-end -- see PROJECT_KNOWLEDGE.md "FIRST SUCCESSFUL FULL AI PIPELINE RUN". The bitmap renderer is blocked by a provider-side free-tier quota gap (`limit: 0` on all 3 image-capable models on this Google Cloud project), not by missing code or missing keys -- see PROJECT_KNOWLEDGE.md "Real-Provider Finding" for the exact evidence.
- Practical note: `gemini-3.1-pro-preview` also returns `limit: 0` on this project's free tier; every feature that lists it as primary (orchestrator, keyword, audit, strategy) currently succeeds only via fallback to `gemini-3.6-flash`. Content (flash-first) and image-brief (flash-first) do not need to fall back.

## Source of Truth
- This file is the model registry source of truth.
- [PROJECT_KNOWLEDGE.md](PROJECT_KNOWLEDGE.md) stores project-wide working rules.
- In each feature implementation, the developer must read both files before coding.
