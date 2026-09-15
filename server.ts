// Load variables from .env before any server code reads process.env.
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import JSZip from "jszip";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { InferenceClient } from "@huggingface/inference";
import * as opentypeNs from "opentype.js";
// opentype.js is a CommonJS module. tsx (ESM dev mode) surfaces its exports under
// .default while the esbuild CJS bundle surfaces them at the top level; resolve once.
const opentype: typeof opentypeNs = ((opentypeNs as any).parse ? opentypeNs : (opentypeNs as any).default) as typeof opentypeNs;
import { 
  OfficialDongkrakUsahaAdapter, 
  PublishResult 
} from "./server/dongkrakusahaAdapter";
import { INITIAL_CAMPAIGNS } from "./src/data/sampleBusinesses";
import * as storage from "./server/storage";
import { Campaign, PublishRecord } from "./src/types";

const app = express();
// Cloud Run (and most PaaS hosts) inject the port to listen on via PORT. Locally it is
// unset, so 3000 stays the dev default and nothing about the LAN/localhost flow changes.
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize DongkrakUsaha Publisher Adapter
const adapter = new OfficialDongkrakUsahaAdapter();

// Campaigns used to live only in memory, seeded from the samples on every boot. That
// meant any restart -- which happens constantly during development -- silently threw
// away real user work and reset the list back to the three samples. Campaigns are now
// persisted to disk and the samples are only used to seed a first run.
const CAMPAIGN_KEY = "data/campaigns.json";

// Storage-backed (local disk by default, GCS when GCS_BUCKET is set -- see
// server/storage.ts). Loaded once at boot in startServer(); the in-memory array stays
// the working copy and every mutation writes through.
let campaignsStore: Campaign[] = [...INITIAL_CAMPAIGNS];

async function loadCampaigns(): Promise<void> {
  try {
    const text = await storage.readText(CAMPAIGN_KEY);
    if (text === null) { campaignsStore = [...INITIAL_CAMPAIGNS]; return; }
    const parsed = JSON.parse(text);
    // An empty stored array is a legitimate state (user deleted everything); only a
    // missing/corrupt file falls back to the samples.
    campaignsStore = Array.isArray(parsed) ? parsed : [...INITIAL_CAMPAIGNS];
  } catch (err) {
    console.error("[Campaigns] Could not read stored campaigns, seeding from samples:", err);
    campaignsStore = [...INITIAL_CAMPAIGNS];
  }
}

// The serialisation happens synchronously (so concurrent mutations cannot interleave
// with it); only the upload/write is async, and a failure is logged rather than thrown
// so a storage hiccup never fails the user's request.
function persistCampaigns() {
  const snapshot = JSON.stringify(campaignsStore, null, 2);
  storage.writeText(CAMPAIGN_KEY, snapshot).catch(err => console.error("[Campaigns] Failed to persist campaigns:", err));
}

type FeatureName = "orchestrator" | "content" | "keyword" | "audit" | "image" | "bitmap" | "strategy" | "webp";

interface FeatureConfig {
  label: string;
  provider: "gemini" | "openai" | "local" | "cloudflare" | "huggingface";
  apiKeyEnv: string;
  models: string[];
  // Which family of discovered models may extend this feature's fallback chain.
  // A text agent must never fall back to an image model (it would return pixels for a
  // JSON request) and the bitmap renderer must never fall back to a text model (it
  // would return prose instead of an image).
  modelKind?: "text" | "image";
  // The agent's own markdown contract inside ai-agents/. When set, runAgent() reads
  // this file fresh from disk on EVERY call and prepends it to the prompt, so the
  // file is the live, binding rulebook for that agent rather than documentation the
  // builder has to remember to re-translate into the hand-written prompt. Left unset
  // for bitmap (its prompt goes straight to an image model -- markdown there would
  // risk being rendered as pixels) and webp (no LLM call exists to attach it to).
  contractFile?: string;
}

const FEATURE_MODEL_REGISTRY: Record<FeatureName, FeatureConfig> = {
  orchestrator: { label: "Orchestrator Chat", provider: "gemini", apiKeyEnv: "GEMINI_API_KEY_ORCHESTRATOR", models: ["gemini-3.1-pro-preview", "gemini-3.6-flash"], modelKind: "text", contractFile: "orchestrator.md" },
  content: { label: "Content Generation", provider: "gemini", apiKeyEnv: "GEMINI_API_KEY_CONTENT", models: ["gemini-3.6-flash", "gemini-3.1-pro-preview"], modelKind: "text", contractFile: "content-generator.md" },
  keyword: { label: "SEO Keyword Strategy", provider: "gemini", apiKeyEnv: "GEMINI_API_KEY_KEYWORD", models: ["gemini-3.1-pro-preview", "gemini-3.6-flash"], modelKind: "text", contractFile: "keyword-strategy.md" },
  audit: { label: "Quality Control Audit", provider: "gemini", apiKeyEnv: "GEMINI_API_KEY_AUDIT", models: ["gemini-3.1-pro-preview", "gemini-3.6-flash"], modelKind: "text", contractFile: "quality-audit.md" },
  image: { label: "Image Brief Specialist", provider: "gemini", apiKeyEnv: "GEMINI_API_KEY_IMAGE", models: ["gemini-3.6-flash", "gemini-3.1-pro-preview"], modelKind: "text", contractFile: "image-generator.md" },
  // Bitmap rendering is a separate feature class with its own key namespace: image
  // generation burns a different (and much smaller) allowance than text, so it must
  // never share the brief agent's slot. Model IDs below are CANDIDATES taken from
  // Google's published image-generation model family and are NOT yet proven against
  // this account -- use GET /api/gemini/models?feature=bitmap to list what the key
  // actually exposes. A wrong ID returns 404 and the router cools that slot and
  // rolls to the next candidate rather than failing the request outright.
  bitmap: { label: "Bitmap Image Renderer", provider: "gemini", apiKeyEnv: "GEMINI_API_KEY_BITMAP", models: ["gemini-2.5-flash-image", "gemini-3.1-flash-lite-image", "gemini-3.1-flash-image"], modelKind: "image" },
  strategy: { label: "Campaign Strategy", provider: "gemini", apiKeyEnv: "GEMINI_API_KEY_STRATEGY", models: ["gemini-3.1-pro-preview", "gemini-3.6-flash"], modelKind: "text", contractFile: "campaign-strategy.md" },
  webp: { label: "PNG to WebP Conversion", provider: "local", apiKeyEnv: "WEBP_CONVERTER_API_KEY", models: ["local-sharp", "remote-webp-api"] }
};

function getFeatureApiKey(feature: FeatureName): string | undefined {
  const config = FEATURE_MODEL_REGISTRY[feature];
  const value = process.env[config.apiKeyEnv];
  if (value && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

// Lazy Gemini AI initialization helper
function getGeminiAI(feature: FeatureName = "content") {
  const config = FEATURE_MODEL_REGISTRY[feature];
  if (config.provider !== "gemini") {
    throw new Error(`${feature.toUpperCase()} feature is configured for ${config.provider}, not Gemini.`);
  }

  const featureKey = getFeatureApiKey(feature);
  if (!featureKey) {
    throw new Error(`${feature.toUpperCase()} feature requires its dedicated API key: ${config.apiKeyEnv}`);
  }
  return new GoogleGenAI({
    apiKey: featureKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      },
      // A single generation should never hang a whole pipeline stage. Under provider
      // load a call was observed taking ~57 s before succeeding; anything beyond this
      // is treated as a temporary failure and the chain moves on.
      timeout: 60_000
    }
  });
}

// ------------------- AI MODEL ROUTER & FALLBACK -------------------

// Quota belongs to the provider key, not to the feature. Two agents pointed at the
// same key share one allowance, so cooldown state is tracked per (key x model).
// Keying this per feature (the previous behaviour) made each agent believe it had a
// private allowance, so agent B would keep hammering a model agent A had already
// been rate-limited on with the very same key.
type ModelSlotStatus = 'AVAILABLE' | 'QUOTA_EXHAUSTED' | 'TEMPORARILY_UNAVAILABLE' | 'MODEL_NOT_FOUND' | 'ERROR';

interface ModelSlotState {
  keyFingerprint: string;
  modelId: string;
  modelName: string;
  available: boolean;
  status: ModelSlotStatus;
  unavailableUntil?: number;
  lastErrorStatus?: number;
  lastErrorMessage?: string;
  successCount: number;
  failureCount: number;
  lastUsedAt?: number;
  // Filled on a 429 by parseGeminiQuota(): which allowance was hit. Lets the UI say
  // "per-minute limit, retry in 23s" vs "daily limit" vs "no free allowance at all",
  // instead of one opaque "quota exhausted 15m".
  quotaScope?: QuotaScope;
  retryAfterSeconds?: number;
}

// 'minute'  -> a per-minute RPM/TPM ceiling; recovers in seconds, cool down for retryDelay.
// 'day'     -> the per-day project ceiling; nothing until the daily reset.
// 'none'    -> provider reports "limit: 0": this key has NO free allowance for this
//              model at all (the pro-preview / image-model case). Retrying is pointless
//              for the rest of the day.
type QuotaScope = 'minute' | 'day' | 'none' | 'unknown';

interface QuotaDetail {
  scope: QuotaScope;
  retryAfterMs?: number;
  limitZero: boolean;
  metrics: string[];
}

// The Gemini SDK surfaces the provider's JSON error body inside err.message. Its
// details[] carry a RetryInfo (retryDelay "23s") and a QuotaFailure whose quotaId
// names the window ("...PerMinute..." / "...PerDay..."), and the message text says
// "limit: 0" when the tier has no allowance. All of that is parsed defensively --
// any missing piece degrades to 'unknown', never throws.
function parseGeminiQuota(err: any): QuotaDetail {
  const raw = String(err?.message || '');
  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* not a JSON body; fall through to text heuristics */ }
  const e = body?.error || body || {};
  const text = String(e?.message || raw);
  const details: any[] = Array.isArray(e?.details) ? e.details : [];

  let retryAfterMs: number | undefined;
  const retry = details.find(d => typeof d?.retryDelay === 'string');
  if (retry) {
    const m = String(retry.retryDelay).match(/([\d.]+)s/);
    if (m) retryAfterMs = Math.ceil(parseFloat(m[1]) * 1000);
  }

  const quotaIds: string[] = [];
  for (const d of details) {
    for (const v of (Array.isArray(d?.violations) ? d.violations : [])) {
      if (typeof v?.quotaId === 'string') quotaIds.push(v.quotaId);
    }
  }
  const limitZero = /limit:\s*0\b/i.test(text);
  const hasDay = quotaIds.some(q => /PerDay/i.test(q)) || /per day|daily/i.test(text);
  const hasMinute = quotaIds.some(q => /PerMinute/i.test(q));

  const scope: QuotaScope = limitZero ? 'none' : hasDay ? 'day' : hasMinute ? 'minute' : 'unknown';
  const metrics = quotaIds.map(q => q.replace(/-FreeTier$/i, ''));
  return { scope, retryAfterMs, limitZero, metrics };
}

function quotaCooldownMs(detail: QuotaDetail): number {
  switch (detail.scope) {
    case 'minute': return Math.max(5_000, (detail.retryAfterMs ?? 60_000) + 2_000);
    case 'day': return 60 * 60 * 1000;         // re-probe hourly; the daily reset time is not exposed
    case 'none': return 24 * 60 * 60 * 1000;   // structurally zero allowance -- stop hammering it
    default: return COOLDOWN_MS.quota;
  }
}

// Slot state used to be memory-only, so every restart (constant in the AI Studio
// sandbox) forgot which models are dead and re-walked 404s and "limit: 0" 429s on the
// first request. It is now written through to storage and reloaded at boot.
const SLOT_STATE_KEY = 'data/model-slots.json';
let slotPersistTimer: NodeJS.Timeout | null = null;
function persistSlotState() {
  if (slotPersistTimer) return;
  slotPersistTimer = setTimeout(() => {
    slotPersistTimer = null;
    const snapshot = JSON.stringify([...MODEL_SLOT_STATE.values()]);
    storage.writeText(SLOT_STATE_KEY, snapshot).catch(err => console.error('[AI Router] slot persist failed:', err));
  }, 500);
}
async function loadSlotState(): Promise<void> {
  try {
    const text = await storage.readText(SLOT_STATE_KEY);
    if (!text) return;
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return;
    const now = Date.now();
    let kept = 0;
    for (const slot of parsed) {
      if (!slot?.keyFingerprint || !slot?.modelId) continue;
      // Only cooldowns still in force are worth restoring; counters come along for the UI.
      if (!slot.available && slot.unavailableUntil && slot.unavailableUntil < now) {
        slot.available = true; slot.status = 'AVAILABLE'; slot.unavailableUntil = undefined;
      }
      MODEL_SLOT_STATE.set(`${slot.keyFingerprint}:${slot.modelId}`, slot);
      kept++;
      // A persisted 404 from any key is evidence the model is retired for everyone.
      if (slot.status === 'MODEL_NOT_FOUND' && !slot.available && !RETIRED_MODELS.has(slot.modelId)) {
        RETIRED_MODELS.add(slot.modelId);
      }
    }
    if (RETIRED_MODELS.size) persistRetiredModels();
    console.log(`[AI Router] restored ${kept} model slot states from storage.`);
  } catch (err) {
    console.error('[AI Router] could not restore slot state:', err);
  }
}

const KNOWN_MODEL_NAMES: Record<string, string> = {
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro Preview",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-2.5-flash-image": "Gemini 2.5 Flash Image",
  "gemini-3.1-flash-lite-image": "Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite)",
  "gemini-3.1-flash-image": "Gemini 3.1 Flash Image (Nano Banana 2)",
  "gemini-3-pro-image": "Gemini 3 Pro Image (Nano Banana Pro)"
};

// A worst-case run walks the whole chain before failing, so this caps how long a
// fully-blocked feature can spend failing. Preferences always occupy the first slots.
const MAX_CHAIN_LENGTH = 8;

const COOLDOWN_MS = {
  quota: 15 * 60 * 1000,
  // 503 "high demand, spikes are usually temporary": measured storms last seconds to a
  // couple of minutes. Five minutes here made whole chains look dead during a spike.
  temporary: 45 * 1000,
  notFound: 24 * 60 * 60 * 1000,
  unknown: 2 * 60 * 1000
};

const MODEL_SLOT_STATE = new Map<string, ModelSlotState>();
// Models that returned 400 when sent thinkingConfig. Learned at runtime, per process.
const THINKING_HINT_UNSUPPORTED = new Set<string>();
// Models the provider says are retired ("no longer available to new users", 404).
// A 404 is a property of the MODEL, not of the key that hit it, so one sighting removes
// the model from every feature's chain. Persisted alongside slot state.
const RETIRED_MODELS = new Set<string>();
const RETIRED_MODELS_KEY = 'data/retired-models.json';
function persistRetiredModels() {
  storage.writeText(RETIRED_MODELS_KEY, JSON.stringify([...RETIRED_MODELS])).catch(err => console.error('[AI Router] retired-models persist failed:', err));
}
async function loadRetiredModels(): Promise<void> {
  try {
    const text = await storage.readText(RETIRED_MODELS_KEY);
    if (!text) return;
    for (const id of JSON.parse(text)) if (typeof id === 'string') RETIRED_MODELS.add(id);
    if (RETIRED_MODELS.size) console.log(`[AI Router] ${RETIRED_MODELS.size} retired model(s) excluded from all chains: ${[...RETIRED_MODELS].join(', ')}`);
  } catch (err) {
    console.error('[AI Router] could not restore retired models:', err);
  }
}

// Short, one-way identifier so quota state and the status API can refer to a key
// without ever storing or exposing the key itself. Identical key values produce
// the same fingerprint, which is exactly what makes shared-quota tracking correct.
function fingerprintKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

function getSlotState(keyFingerprint: string, modelId: string): ModelSlotState {
  const stateKey = `${keyFingerprint}:${modelId}`;
  const existing = MODEL_SLOT_STATE.get(stateKey);
  if (existing) return existing;

  const slot: ModelSlotState = {
    keyFingerprint,
    modelId,
    modelName: KNOWN_MODEL_NAMES[modelId] ?? modelId,
    available: true,
    status: 'AVAILABLE',
    successCount: 0,
    failureCount: 0
  };
  MODEL_SLOT_STATE.set(stateKey, slot);
  return slot;
}

// ---- Real model discovery ----
// The registry's per-feature list is a PREFERENCE order, not the limit of what a key
// can reach. Hardcoding two models per feature meant that when both were cooling down
// or quota-blocked, the agent died even though the account exposed ~40 more usable
// models. The extended chain below is built from the provider's own ListModels
// response, so it can never name a model the account does not actually have.

// Families that support generateContent but cannot serve these agents:
// pixels/audio/video/music/embeddings, plus specialised variants. Gemma and
// deep-research are excluded deliberately -- every agent here requires structured
// JSON output via responseSchema, which those do not reliably honour.
const NON_TEXT_MODEL_PATTERN =
  /image|imagen|nano-banana|tts|audio|transcribe|robotics|embedding|live|omni|lyria|veo|computer-use|antigravity|deep-research|gemma|aqa|customtools/i;

const MODEL_DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;
const MODEL_DISCOVERY_CACHE = new Map<string, { models: string[]; fetchedAt: number }>();

const IMAGE_MODEL_PATTERN = /image|imagen|nano-banana/i;

async function discoverModels(apiKey: string, keyFingerprint: string, kind: "text" | "image"): Promise<string[]> {
  const all = await discoverAllGenerateContentModels(apiKey, keyFingerprint);
  return kind === "image"
    ? all.filter(id => IMAGE_MODEL_PATTERN.test(id))
    : all.filter(id => !NON_TEXT_MODEL_PATTERN.test(id));
}

async function discoverAllGenerateContentModels(apiKey: string, keyFingerprint: string): Promise<string[]> {
  const cached = MODEL_DISCOVERY_CACHE.get(keyFingerprint);
  if (cached && Date.now() - cached.fetchedAt < MODEL_DISCOVERY_TTL_MS) return cached.models;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`
    );
    if (!response.ok) throw new Error(`ListModels returned ${response.status}`);
    const payload = await response.json() as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };

    // Cache the unfiltered generateContent list; each feature filters it by the family
    // it can actually use, so one network call serves both text and image agents.
    const models = (payload.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean);

    MODEL_DISCOVERY_CACHE.set(keyFingerprint, { models, fetchedAt: Date.now() });
    console.log(`[AI Router] key ${keyFingerprint}: discovered ${models.length} generateContent models.`);
    return models;
  } catch (err: any) {
    console.error(`[AI Router] model discovery failed for key ${keyFingerprint}:`, err.message);
    // A discovery failure must not disable the agent; the registry preferences alone
    // are still a valid chain.
    MODEL_DISCOVERY_CACHE.set(keyFingerprint, { models: [], fetchedAt: Date.now() });
    return [];
  }
}

function refreshExpiredCooldowns(now = Date.now()) {
  for (const slot of MODEL_SLOT_STATE.values()) {
    if (!slot.available && slot.unavailableUntil && now > slot.unavailableUntil) {
      slot.available = true;
      slot.status = 'AVAILABLE';
      slot.unavailableUntil = undefined;
      slot.quotaScope = undefined;
      slot.retryAfterSeconds = undefined;
      console.log(`[AI Router] key ${slot.keyFingerprint} model ${slot.modelId} cooldown finished; restored.`);
    }
  }
}

function classifyProviderError(err: any) {
  const status = err?.status || err?.code || 500;
  const msg = String(err?.message || '').toUpperCase();
  return {
    status,
    isQuota: status === 429 || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("QUOTA") || msg.includes("RATE LIMIT"),
    isTemporary: (status >= 500 && status < 600) || msg.includes("TIMEOUT") || msg.includes("TEMPORARILY UNAVAILABLE") || msg.includes("UNAVAILABLE"),
    isNotFound: status === 404 || msg.includes("NOT FOUND"),
    isAuth: status === 401 || status === 403 || msg.includes("API_KEY_INVALID") || msg.includes("PERMISSION_DENIED"),
    isSafety: msg.includes("SAFETY") || msg.includes("BLOCKED"),
    isInvalid: status === 400 || msg.includes("INVALID_ARGUMENT") || msg.includes("BAD_REQUEST")
  };
}

export interface GenerationAttempt {
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
}

async function generateWithFallback(options: { feature?: FeatureName, contents: any, config: any, __waited?: boolean }) {
  const feature = options.feature ?? "content";
  const featureConfig = FEATURE_MODEL_REGISTRY[feature];
  const apiKey = getFeatureApiKey(feature);
  if (!apiKey) {
    throw new Error(`${feature.toUpperCase()} feature requires its dedicated API key: ${featureConfig.apiKeyEnv}`);
  }

  const ai = getGeminiAI(feature);
  const keyFingerprint = fingerprintKey(apiKey);
  const now = Date.now();
  refreshExpiredCooldowns(now);

  // Registry order IS the priority order for this feature (AI_MODELS.md defines a
  // deliberate per-feature preference, e.g. content is flash-first while keyword is
  // pro-first). Do not re-sort by any global ranking, that would silently override it.
  // Anything the provider additionally exposes is appended AFTER the preferences, so
  // the documented order still wins while the agent stops dying when both preferred
  // models are cooling down.
  const discovered = featureConfig.provider === "gemini" && featureConfig.modelKind
    ? await discoverModels(apiKey, keyFingerprint, featureConfig.modelKind)
    : [];
  const extendedChain = [
    ...featureConfig.models,
    ...discovered.filter(id => !featureConfig.models.includes(id))
  ].filter(id => !RETIRED_MODELS.has(id)).slice(0, MAX_CHAIN_LENGTH);

  const orderedSlots = extendedChain
    .map(modelId => getSlotState(keyFingerprint, modelId))
    .filter(slot => slot.available);

  if (orderedSlots.length === 0) {
    // Everything is cooling. If the soonest to recover is only briefly unavailable
    // (a 503 spike), wait for it once rather than failing the whole stage.
    const soonest = extendedChain
      .map(modelId => getSlotState(keyFingerprint, modelId))
      .filter(slot => slot.status === 'TEMPORARILY_UNAVAILABLE' && slot.unavailableUntil)
      .sort((a, b) => (a.unavailableUntil! - b.unavailableUntil!))[0];
    const waitMs = soonest ? soonest.unavailableUntil! - Date.now() : Infinity;
    if (!options.__waited && waitMs > 0 && waitMs <= 50_000) {
      console.log(`[AI Router] feature=${feature}: all models cooling; waiting ${Math.ceil(waitMs / 1000)}s for ${soonest!.modelId} then retrying once.`);
      await new Promise(r => setTimeout(r, waitMs + 500));
      return generateWithFallback({ ...options, __waited: true });
    }
    const cooling = extendedChain.map(modelId => {
      const slot = getSlotState(keyFingerprint, modelId);
      const secondsLeft = slot.unavailableUntil ? Math.max(0, Math.ceil((slot.unavailableUntil - now) / 1000)) : 0;
      return `${modelId} (${slot.status}, ${secondsLeft}s left)`;
    }).join('; ');
    throw new Error(`All models for feature ${feature} are cooling down on its key. ${cooling}`);
  }

  const attempts: GenerationAttempt[] = [];
  const primaryModelId = orderedSlots[0].modelId;
  let fallbackOccurred = false;

  for (const slot of orderedSlots) {
    try {
      if (slot.modelId !== primaryModelId) fallbackOccurred = true;
      console.log(`[AI Router] feature=${feature} key=${keyFingerprint} model=${slot.modelId}`);

      // Low thinking effort: every agent here is a structured extraction/writing task
      // whose rules arrive in the prompt (the contract), and default "thinking" on a
      // long prompt was measured at ~49 s for one audit call vs ~2 s without. The
      // parameter is not accepted by every model (a 400 was observed on
      // flash-lite for thinkingBudget), so a rejection is remembered per model and
      // the same slot is retried once without it -- never counted as a slot failure.
      const wantsThinkingHint = featureConfig.modelKind === "text" && !THINKING_HINT_UNSUPPORTED.has(slot.modelId);
      const configWithHint = wantsThinkingHint
        ? { ...options.config, thinkingConfig: { thinkingLevel: "low" } }
        : options.config;

      let response;
      try {
        response = await ai.models.generateContent({ model: slot.modelId, contents: options.contents, config: configWithHint });
      } catch (firstErr: any) {
        const c = classifyProviderError(firstErr);
        if (wantsThinkingHint && c.isInvalid) {
          THINKING_HINT_UNSUPPORTED.add(slot.modelId);
          console.warn(`[AI Router] model ${slot.modelId} rejected thinkingConfig; retrying without it (remembered).`);
          response = await ai.models.generateContent({ model: slot.modelId, contents: options.contents, config: options.config });
        } else {
          throw firstErr;
        }
      }

      slot.successCount++;
      slot.lastUsedAt = Date.now();
      attempts.push({ model: slot.modelId, ok: true });
      persistSlotState();

      return {
        modelUsed: slot.modelId,
        modelName: slot.modelName,
        fallbackOccurred,
        keyFingerprint,
        attempts,
        response
      };
    } catch (err: any) {
      const classified = classifyProviderError(err);
      console.error(`[AI Router] feature=${feature} key=${keyFingerprint} model=${slot.modelId} failed:`, err.message);

      attempts.push({ model: slot.modelId, ok: false, status: classified.status, error: err.message });
      slot.failureCount++;
      slot.lastErrorStatus = classified.status;
      slot.lastErrorMessage = String(err.message || '').slice(0, 300);

      // Caller-side problems (bad key, bad prompt, safety block) are not the model's
      // fault. Rolling to another model would just repeat them and burn quota.
      if (classified.isAuth || classified.isInvalid || classified.isSafety) throw err;

      slot.available = false;
      if (classified.isQuota) {
        const detail = parseGeminiQuota(err);
        slot.status = 'QUOTA_EXHAUSTED';
        slot.quotaScope = detail.scope;
        slot.retryAfterSeconds = detail.retryAfterMs ? Math.ceil(detail.retryAfterMs / 1000) : undefined;
        slot.unavailableUntil = Date.now() + quotaCooldownMs(detail);
        console.warn(`[AI Router] quota scope=${detail.scope} model=${slot.modelId} retryAfter=${slot.retryAfterSeconds ?? '-'}s metrics=${detail.metrics.join('|') || '-'}`);
      } else if (classified.isNotFound) {
        slot.status = 'MODEL_NOT_FOUND';
        slot.unavailableUntil = Date.now() + COOLDOWN_MS.notFound;
        if (!RETIRED_MODELS.has(slot.modelId)) {
          RETIRED_MODELS.add(slot.modelId);
          persistRetiredModels();
          console.warn(`[AI Router] model ${slot.modelId} is retired (404); excluded from every chain from now on.`);
        }
      } else if (classified.isTemporary) {
        slot.status = 'TEMPORARILY_UNAVAILABLE';
        slot.unavailableUntil = Date.now() + COOLDOWN_MS.temporary;
      } else {
        slot.status = 'ERROR';
        slot.unavailableUntil = Date.now() + COOLDOWN_MS.unknown;
      }
      persistSlotState();
    }
  }

  // The whole chain failed in one pass. If any of those failures were transient
  // (503 "high demand" spikes last seconds), waiting briefly and walking the chain
  // once more is far cheaper than failing the stage and, with it, every stage after.
  const sawTransient = attempts.some(a => !a.ok && a.status && a.status >= 500 && a.status < 600);
  if (sawTransient && !options.__waited) {
    const soonest = extendedChain
      .map(modelId => getSlotState(keyFingerprint, modelId))
      .filter(slot => slot.status === 'TEMPORARILY_UNAVAILABLE' && slot.unavailableUntil)
      .sort((a, b) => (a.unavailableUntil! - b.unavailableUntil!))[0];
    const waitMs = Math.min(50_000, Math.max(8_000, soonest ? soonest.unavailableUntil! - Date.now() : 20_000));
    console.log(`[AI Router] feature=${feature}: chain exhausted by transient errors; waiting ${Math.ceil(waitMs / 1000)}s and retrying once.`);
    await new Promise(r => setTimeout(r, waitMs + 500));
    return generateWithFallback({ ...options, __waited: true });
  }

  throw new Error(`All models for feature ${feature} failed. Attempts: ${JSON.stringify(attempts)}`);
}

// ------------------- API ROUTES -------------------

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Extension Zip Generator Helper
async function generateExtensionZipBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder("dongkrakusaha-publisher-extension");

  const files = [
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "styles.css"
  ];

  // SINGLE SOURCE OF TRUTH: always read from public/extension.
  for (const file of files) {
    const filePath = path.join(process.cwd(), "public", "extension", file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      folder?.file(file, content);
    } else {
      console.error(`[Zip Server] Missing expected extension file: ${filePath}`);
    }
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  
  try {
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(path.join(publicDir, "dongkrakusaha-publisher-extension.zip"), buffer);
  } catch (err) {
    console.error("[Zip Server] Failed to save static zip file:", err);
  }

  return buffer;
}

// Generate ZIP on server start
generateExtensionZipBuffer().catch(err => console.error("Initial Zip build error:", err));

// Extension ZIP Download API
app.get("/api/download-extension-zip", async (req, res) => {
  try {
    const zipBuffer = await generateExtensionZipBuffer();
    // Force-bust any edge/CDN/browser cache sitting in front of this route.
    // Without this, Express auto-generates an ETag for the buffer and any
    // caching layer (Google Frontend, browser HTTP cache, etc.) may keep
    // serving an old cached zip even after the source files and server
    // process have both been updated.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.removeHeader("ETag");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="dongkrakusaha-publisher-extension.zip"');
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate Chrome Extension ZIP" });
  }
});

// AI Agent / Key Slot / Model Quota Status API.
// Never returns key values -- only a one-way fingerprint, so the UI can show which
// agents share a key (and therefore share a quota) without exposing the secret.
app.get("/api/gemini/status", async (req, res) => {
  try {
    const now = Date.now();
    refreshExpiredCooldowns(now);

    const featureNames = Object.keys(FEATURE_MODEL_REGISTRY) as FeatureName[];
    const features = await Promise.all(featureNames.map(async feature => {
      const config = FEATURE_MODEL_REGISTRY[feature];
      const apiKey = config.provider === 'local' ? undefined : getFeatureApiKey(feature);
      const keyFingerprint = apiKey ? fingerprintKey(apiKey) : null;

      // Report the real reachable chain, not just the hand-written preferences, so
      // the UI stops implying a key only has two models when it actually has dozens.
      const discovered = apiKey && config.provider === 'gemini' && config.modelKind
        ? await discoverModels(apiKey, keyFingerprint as string, config.modelKind)
        : [];
      const extendedChain = [
        ...config.models,
        ...discovered.filter(id => !config.models.includes(id))
      ].filter(id => !RETIRED_MODELS.has(id)).slice(0, MAX_CHAIN_LENGTH);

      return {
        preferredModels: config.models,
        discoveredModelCount: discovered.length,
        activeChain: extendedChain,
        feature,
        label: config.label,
        provider: config.provider,
        apiKeyEnv: config.apiKeyEnv,
        keyConfigured: config.provider === 'local' ? true : !!apiKey,
        keyFingerprint,
        models: extendedChain.map(modelId => {
          if (!keyFingerprint) {
            return {
              modelId,
              name: KNOWN_MODEL_NAMES[modelId] ?? modelId,
              status: config.provider === 'local' ? 'AVAILABLE' : 'NO_KEY',
              available: config.provider === 'local',
              cooldownSecondsLeft: 0,
              successCount: 0,
              failureCount: 0
            };
          }
          const slot = getSlotState(keyFingerprint, modelId);
          return {
            modelId,
            name: slot.modelName,
            status: slot.status,
            available: slot.available,
            cooldownSecondsLeft: slot.unavailableUntil ? Math.max(0, Math.ceil((slot.unavailableUntil - now) / 1000)) : 0,
            quotaScope: slot.quotaScope,
            retryAfterSeconds: slot.retryAfterSeconds,
            successCount: slot.successCount,
            failureCount: slot.failureCount,
            lastErrorStatus: slot.lastErrorStatus,
            lastErrorMessage: slot.lastErrorMessage
          };
        })
      };
    }));

    // Any fingerprint claimed by more than one agent means those agents are drawing
    // from the same provider allowance -- worth surfacing, it changes how quota behaves.
    const byFingerprint = new Map<string, string[]>();
    for (const entry of features) {
      if (!entry.keyFingerprint) continue;
      byFingerprint.set(entry.keyFingerprint, [...(byFingerprint.get(entry.keyFingerprint) || []), entry.feature]);
    }
    const sharedKeys = [...byFingerprint.entries()]
      .filter(([, sharing]) => sharing.length > 1)
      .map(([keyFingerprint, sharing]) => ({ keyFingerprint, features: sharing }));

    res.json({
      features,
      sharedKeys,
      missingKeys: features.filter(f => !f.keyConfigured).map(f => f.apiKeyEnv),
      generatedAt: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read model status' });
  }
});

// Provider model discovery. AI_MODELS.md Rule 4 forbids claiming a model is available
// on assumption, and model IDs published in docs/blog posts do not prove what a given
// account can actually call. This route asks the provider itself, using one feature's
// own key, and reports the real list. It never returns the key or the fingerprint's
// source value.
app.get("/api/gemini/models", async (req, res) => {
  try {
    const feature = String(req.query.feature || "bitmap") as FeatureName;
    const config = FEATURE_MODEL_REGISTRY[feature];
    if (!config) {
      return res.status(400).json({ error: `Unknown feature '${feature}'.` });
    }
    if (config.provider !== "gemini") {
      return res.status(400).json({ error: `Feature '${feature}' is provider '${config.provider}', not gemini.` });
    }

    const apiKey = getFeatureApiKey(feature);
    if (!apiKey) {
      return res.status(503).json({
        error: `Feature '${feature}' has no key configured. Add ${config.apiKeyEnv} to .env, then retry.`,
        apiKeyEnv: config.apiKeyEnv
      });
    }

    const providerResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`
    );
    const payload = await providerResponse.json() as {
      models?: Array<{ name?: string; displayName?: string; description?: string; supportedGenerationMethods?: string[] }>;
      error?: { message?: string };
    };

    if (!providerResponse.ok) {
      return res.status(providerResponse.status).json({
        error: payload.error?.message || "Provider model listing failed",
        feature
      });
    }

    const models = (payload.models || []).map(m => {
      const modelId = String(m.name || "").replace(/^models\//, "");
      return {
        modelId,
        displayName: m.displayName,
        supportedGenerationMethods: m.supportedGenerationMethods || [],
        // Heuristic marker only, to shorten the list a human has to scan. The proof
        // that a model renders bitmaps is a successful /api/image/generate call.
        looksImageCapable: /image|imagen/i.test(modelId)
      };
    });

    res.json({
      feature,
      apiKeyEnv: config.apiKeyEnv,
      keyFingerprint: fingerprintKey(apiKey),
      registryCandidates: config.models,
      candidatesPresentOnAccount: config.models.filter(id => models.some(m => m.modelId === id)),
      imageCapableModels: models.filter(m => m.looksImageCapable),
      totalModels: models.length,
      models
    });
  } catch (err: any) {
    console.error("Model Discovery Error:", err);
    res.status(500).json({ error: err.message || "Failed to list provider models" });
  }
});

// 2. Campaigns API
app.get("/api/campaigns", (req, res) => {
  res.json(campaignsStore);
});

app.post("/api/campaigns", (req, res) => {
  const newCampaign: Campaign = req.body;
  if (!newCampaign.id) {
    newCampaign.id = `cmp-${Date.now()}`;
  }
  newCampaign.updatedAt = new Date().toISOString();
  
  const existingIndex = campaignsStore.findIndex(c => c.id === newCampaign.id);
  if (existingIndex >= 0) {
    campaignsStore[existingIndex] = newCampaign;
  } else {
    campaignsStore.unshift(newCampaign);
  }
  persistCampaigns();
  res.json(newCampaign);
});

app.put("/api/campaigns/:id", (req, res) => {
  const { id } = req.params;
  const index = campaignsStore.findIndex(c => c.id === id);
  if (index >= 0) {
    campaignsStore[index] = { ...campaignsStore[index], ...req.body, updatedAt: new Date().toISOString() };
    persistCampaigns();
    return res.json(campaignsStore[index]);
  }
  res.status(404).json({ error: "Campaign not found" });
});

// Only Draft campaigns may be deleted. Anything that has been submitted or published
// has a real listing behind it and a history row referencing it; deleting the campaign
// would orphan both, so the API refuses rather than trusting the caller.
app.delete("/api/campaigns/:id", (req, res) => {
  const { id } = req.params;
  const index = campaignsStore.findIndex(c => c.id === id);
  if (index === -1) return res.status(404).json({ error: "Campaign not found" });
  const target = campaignsStore[index];
  if (target.status !== "Draft") {
    return res.status(409).json({ error: `Only Draft campaigns can be deleted; '${id}' is '${target.status}'.` });
  }
  campaignsStore.splice(index, 1);
  persistCampaigns();
  res.json({ ok: true, deleted: id, remaining: campaignsStore.length });
});

// ---- Market siege ("kepung pasar") ----
// One business, many sub-areas (kecamatan). Drafting a clone per area is pure string
// substitution -- deliberately NO AI call -- so a business can draft every kecamatan
// in a city for free and only spend Gemini quota on the ones it actually chooses to
// realise (which happens later, per clone, through the normal orchestrator route).
//
// Substitution rule, applied to every string leaf in the cloned campaign: if the text
// contains a bracket placeholder such as "[Nama Daerah Target]" (the convention the
// sample campaigns already use), the placeholder is replaced; otherwise the parent's
// primary target city is replaced wherever it literally appears. A generic walker is
// used rather than a hand-kept field list so new fields are covered automatically.
const AREA_PLACEHOLDER = /\[[^\]]*\]/g;

function substituteAreaInValue(value: any, primaryCity: string, areaName: string): any {
  if (typeof value === "string") {
    if (AREA_PLACEHOLDER.test(value)) {
      AREA_PLACEHOLDER.lastIndex = 0;
      return value.replace(AREA_PLACEHOLDER, areaName);
    }
    AREA_PLACEHOLDER.lastIndex = 0;
    if (primaryCity && value.includes(primaryCity)) {
      return value.split(primaryCity).join(areaName);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(v => substituteAreaInValue(v, primaryCity, areaName));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = substituteAreaInValue(v, primaryCity, areaName);
    return out;
  }
  return value;
}

function cloneCampaignForArea(parent: Campaign, areaName: string, batchId: string, seq: number): Campaign {
  const primaryCity = String(parent.businessData?.targetCities?.[0] || "").trim();
  const clone = substituteAreaInValue(JSON.parse(JSON.stringify(parent)), primaryCity, areaName) as Campaign;

  // A siege clone targets exactly one area; do not inherit the parent's broader list.
  clone.businessData.targetCities = [areaName];
  if (clone.seoStrategy) clone.seoStrategy.targetCities = [areaName];

  // Safety net for parents that use neither the placeholder convention nor their city
  // name in the title: clones must never be indistinguishable in the campaign picker.
  if (!clone.title.includes(areaName)) clone.title = `${clone.title} — ${areaName}`;

  clone.id = `cmp-siege-${Date.now()}-${seq}`;
  clone.businessData.id = `biz-siege-${Date.now()}-${seq}`;
  clone.siegeBatchId = batchId;
  clone.siegeTargetArea = areaName;
  clone.siegeParentId = parent.id;
  clone.status = "Draft";
  // Must never inherit the parent's live listing identity or its audit verdict.
  delete clone.externalListingId;
  delete clone.publishedUrl;
  delete clone.validationScore;
  clone.updatedAt = new Date().toISOString();
  return clone;
}

app.post("/api/campaigns/siege", (req, res) => {
  const { parentCampaignId, areaNames } = req.body || {};
  const parent = campaignsStore.find(c => c.id === parentCampaignId);
  if (!parent) {
    return res.status(404).json({ error: `Parent campaign '${parentCampaignId}' not found.` });
  }

  const cleaned = Array.isArray(areaNames)
    ? [...new Set(areaNames.map((a: any) => String(a || "").trim()).filter((a: string) => a.length > 0))]
    : [];
  if (cleaned.length === 0) {
    return res.status(400).json({ error: "areaNames must contain at least one non-empty area name." });
  }
  if (cleaned.length > 100) {
    return res.status(400).json({ error: "At most 100 areas per batch." });
  }

  const batchId = `siege-${Date.now()}`;
  const created = cleaned.map((area, i) => cloneCampaignForArea(parent, area, batchId, i));
  // Newest first, matching how single creates are unshifted.
  campaignsStore.unshift(...created);
  persistCampaigns();

  res.json({
    ok: true,
    batchId,
    parentCampaignId: parent.id,
    parentName: parent.businessData.name,
    created: created.length,
    campaigns: created,
    aiCallsMade: 0
  });
});

// ------------------- SPECIALIST AGENT RUNNERS -------------------
// One runner per contract in ai-agents/. The standalone routes AND the orchestrator
// pipeline both call these, so each agent's prompt exists in exactly one place and
// cannot drift between the "run this stage alone" and "run the whole chain" paths.

interface AgentMeta {
  feature: FeatureName;
  modelUsed: string;
  modelName: string;
  fallbackOccurred: boolean;
  keyFingerprint: string;
  attempts: GenerationAttempt[];
}

// ---- Live agent contracts ----
// Each agent's ai-agents/<name>.md is its binding rulebook. It is read from disk on
// every call (no caching): call volume here is a handful of marketing generations,
// not a hot path, and always-current beats saving a few milliseconds. The payoff is
// that editing the markdown changes the agent's behaviour on its very next call with
// no server restart and no code change.
const AGENT_CONTRACTS_DIR = path.join(process.cwd(), "ai-agents");
const SELF_IMPROVEMENT_HEADING = "## Self-Improvement Log (auto-recorded)";
const MAX_SELF_IMPROVEMENT_ENTRIES = 20;

// In gcs mode the container filesystem is disposable, so the agents' auto-recorded
// notes cannot live in the repo file. The RULES still come from the repo (baked into
// the image; editing them = redeploy), while the log section is kept in the bucket and
// merged in at boot. The merged text is cached in memory so appends stay a synchronous
// read-modify-write (no interleaving), then uploaded asynchronously.
const CONTRACT_CACHE = new Map<string, string>();
const contractStorageKey = (contractFile: string) => `ai-agents/${contractFile}`;

function readRepoContract(contractFile: string): string {
  try {
    return fs.readFileSync(path.join(AGENT_CONTRACTS_DIR, contractFile), "utf-8");
  } catch (err) {
    console.error(`[Agent Contract] Could not read ${contractFile}, proceeding without it:`, err);
    return "";
  }
}

function extractLogEntries(text: string): string[] {
  const idx = text.indexOf(SELF_IMPROVEMENT_HEADING);
  if (idx === -1) return [];
  const rest = text.slice(idx + SELF_IMPROVEMENT_HEADING.length);
  const next = rest.match(/\n(?=#{1,2}\s)/);
  const body = next ? rest.slice(0, next.index) : rest;
  return body.split("\n").map(l => l.trim()).filter(l => l.startsWith("- ["));
}

async function primeContractCache(): Promise<void> {
  if (storage.STORAGE_MODE !== "gcs") return;
  const files = Object.values(FEATURE_MODEL_REGISTRY).map(c => c.contractFile).filter((f): f is string => !!f);
  for (const file of files) {
    const repoText = readRepoContract(file).replace(/\r\n/g, "\n");
    const bucketText = (await storage.readText(contractStorageKey(file)).catch(() => null)) || "";
    // Fresh rules from the repo, previously recorded notes from the bucket.
    const entries = extractLogEntries(bucketText);
    const headIdx = repoText.indexOf(SELF_IMPROVEMENT_HEADING);
    const rulesOnly = headIdx === -1 ? repoText : repoText.slice(0, headIdx);
    const merged = entries.length
      ? `${rulesOnly.replace(/\s+$/, "")}\n\n${SELF_IMPROVEMENT_HEADING}\n${entries.join("\n")}\n`
      : repoText;
    CONTRACT_CACHE.set(file, merged);
  }
  console.log(`[Agent Contract] gcs mode: ${files.length} contracts primed (repo rules + bucket logs).`);
}

function loadAgentContract(contractFile: string): string {
  if (storage.STORAGE_MODE === "gcs") return CONTRACT_CACHE.get(contractFile) ?? readRepoContract(contractFile);
  return readRepoContract(contractFile);
}

const SELF_IMPROVEMENT_INSTRUCTION = `

=== CATATAN PENGEMBANGAN DIRI (OPSIONAL) ===
Jika dari tugas ini Anda menemukan SATU hal konkret yang layak diingat untuk tugas
berikutnya (pola yang berhasil, kesalahan yang harus dihindari, wawasan baru soal
kategori bisnis ini), isi field "selfImprovementNote" dengan satu kalimat singkat dan
spesifik. Jika tidak ada temuan yang benar-benar layak dicatat, HILANGKAN field ini
sepenuhnya -- jangan mengarang catatan hanya supaya field terisi.`;

// Append-only writeback so an agent's own contract accumulates real lessons without
// the builder hand-editing it every time. Deliberately ONE synchronous read-modify-
// write with no `await` in between: Node runs a sync function to completion before
// any other request handler gets a turn, so two concurrent requests cannot interleave
// on the same file. That is the same property persistCampaigns()/persistHistory()
// already rely on. It assumes a single Node process (true today); a multi-process
// deployment would need a real lock.
//
// The model may only ADD to the auto-recorded section. It can never rewrite or delete
// the rules above it -- those stay builder-owned, and the builder periodically reviews
// the log, promotes durable lessons into the real rules, and prunes noise.
function appendSelfImprovementNote(contractFile: string, note: string): void {
  const filePath = path.join(AGENT_CONTRACTS_DIR, contractFile);
  try {
    const raw = storage.STORAGE_MODE === "gcs"
      ? (CONTRACT_CACHE.get(contractFile) ?? readRepoContract(contractFile))
      : (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "");
    const current = raw.replace(/\r\n/g, "\n");
    const dateStamp = new Date().toISOString().slice(0, 10);
    const newEntry = `- [${dateStamp}] ${note.replace(/\s*\n\s*/g, " ").trim()}`;

    const headingIndex = current.indexOf(SELF_IMPROVEMENT_HEADING);
    let head: string;
    let existingEntries: string[];
    let tail: string;

    if (headingIndex === -1) {
      head = `${current.replace(/\s+$/, "")}\n\n${SELF_IMPROVEMENT_HEADING}\n`;
      existingEntries = [];
      tail = "";
    } else {
      head = current.slice(0, headingIndex) + SELF_IMPROVEMENT_HEADING + "\n";
      const rest = current.slice(headingIndex + SELF_IMPROVEMENT_HEADING.length);
      // The section runs until the next level-1/2 heading or EOF. It is machine-owned
      // (hence "auto-recorded" in its name): hand-added prose inside it will not
      // survive the next append, so human notes belong in the sections above.
      const nextHeading = rest.match(/\n(?=#{1,2}\s)/);
      const body = nextHeading ? rest.slice(0, nextHeading.index) : rest;
      tail = nextHeading ? rest.slice(nextHeading.index as number).replace(/^\n/, "") : "";
      existingEntries = body.split("\n").map(l => l.trim()).filter(l => l.startsWith("- ["));
    }

    // A note that merely restates an existing one adds nothing to the rulebook and
    // bloats every future prompt. Skip near-duplicates (same normalised text, or a
    // very high token overlap with an existing entry).
    const normalise = (t: string) => t.replace(/^- \[[^\]]*\]\s*/, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const tokens = (t: string) => new Set(normalise(t).split(" ").filter(w => w.length > 3));
    const newNorm = normalise(newEntry);
    const newTok = tokens(newEntry);
    const isDuplicate = existingEntries.some(e => {
      if (normalise(e) === newNorm) return true;
      const et = tokens(e);
      const inter = [...newTok].filter(w => et.has(w)).length;
      const union = new Set([...newTok, ...et]).size || 1;
      return inter / union >= 0.7;
    });
    if (isDuplicate) {
      console.log(`[Agent Contract] ${contractFile}: self-improvement note skipped (duplicate of an existing entry).`);
      return;
    }
    const capped = [...existingEntries, newEntry].slice(-MAX_SELF_IMPROVEMENT_ENTRIES);
    const updated = `${head}${capped.join("\n")}\n${tail ? "\n" + tail : ""}`;
    if (storage.STORAGE_MODE === "gcs") {
      CONTRACT_CACHE.set(contractFile, updated); // synchronous: the next call sees it immediately
      storage.writeText(contractStorageKey(contractFile), updated)
        .catch(err => console.error(`[Agent Contract] gcs upload failed for ${contractFile}:`, err));
    } else {
      fs.writeFileSync(filePath, updated);
    }
    console.log(`[Agent Contract] ${contractFile}: self-improvement note recorded (${capped.length} entries).`);
  } catch (err) {
    console.error(`[Agent Contract] Failed to append self-improvement note to ${contractFile}:`, err);
  }
}

async function runAgent<T = any>(feature: FeatureName, prompt: string, responseSchema: any): Promise<{ result: T; meta: AgentMeta }> {
  const contractFile = FEATURE_MODEL_REGISTRY[feature].contractFile;
  const contract = contractFile ? loadAgentContract(contractFile) : "";

  const finalPrompt = contract
    ? `=== KONTRAK AGENT ANDA (ai-agents/${contractFile}) - WAJIB DIPATUHI ===\n${contract}\n=== AKHIR KONTRAK. TUGAS ANDA: ===\n${prompt}${SELF_IMPROVEMENT_INSTRUCTION}`
    : prompt;

  const run = await generateWithFallback({
    feature,
    contents: finalPrompt,
    config: { responseMimeType: "application/json", responseSchema }
  });

  const result = JSON.parse(run.response.text || '{}') as T;

  // Only write back when the contract actually loaded and was shown to the model this
  // call; if the read failed, the model was never invited to produce this field.
  if (contract && contractFile) {
    const note = (result as any)?.selfImprovementNote;
    if (typeof note === "string" && note.trim().length > 0) {
      appendSelfImprovementNote(contractFile, note.trim());
    }
  }

  return {
    result,
    meta: {
      feature,
      modelUsed: run.modelUsed,
      modelName: run.modelName,
      fallbackOccurred: run.fallbackOccurred,
      keyFingerprint: run.keyFingerprint,
      attempts: run.attempts
    }
  };
}

const asList = (value: any, fallback = 'Umum') =>
  Array.isArray(value) ? value.join(', ') : (value || fallback);

// --- Campaign Strategy Agent (ai-agents/campaign-strategy.md) ---
const STRATEGY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    positioning: { type: Type.STRING },
    offerAngle: { type: Type.STRING },
    campaignObjective: { type: Type.STRING },
    primaryCTA: { type: Type.STRING },
    recommendedChannels: { type: Type.ARRAY, items: { type: Type.STRING } },
    brandTone: { type: Type.STRING },
    contentAngle: { type: Type.STRING },
    targetSegments: { type: Type.ARRAY, items: { type: Type.STRING } },
    successMetrics: { type: Type.ARRAY, items: { type: Type.STRING } },
    selfImprovementNote: { type: Type.STRING }
  },
  required: ["positioning", "offerAngle", "campaignObjective", "primaryCTA", "recommendedChannels", "brandTone", "contentAngle", "targetSegments", "successMetrics"]
};

function runStrategyAgent(businessData: any, objective = "Meningkatkan penjualan dan visibilitas lokal") {
  const prompt = `Anda adalah Senior Growth Strategist untuk bisnis lokal Indonesia.
Tujuan utama: membantu bisnis naik di percepatan penjualan dan visibilitas lokal.

Data Bisnis:
- Nama: ${businessData?.name || 'Bisnis'}
- Kategori: ${businessData?.category || 'Umum'}
- Deskripsi: ${businessData?.description || 'Tidak ada deskripsi'}
- Produk/Layanan: ${asList(businessData?.productsServices)}
- Kota Target: ${asList(businessData?.targetCities)}
- Harga: ${businessData?.priceRange || 'Tidak disebutkan'}
- Brand Tone: ${businessData?.tags?.join(', ') || 'Profesional, terpercaya, modern'}

Tujuan Strategi: ${objective}

Kriteria wajib:
1. Fokus pada positioning bisnis yang nyata dan meyakinkan.
2. Hindari klaim yang tidak didukung fakta.
3. Buat strategi campaign yang cocok untuk usaha lokal di Indonesia.
4. Prioritaskan pesan yang mendorong conversion dan trust.
5. Format output harus JSON dan mudah dipakai oleh sistem konten.`;

  return runAgent("strategy", prompt, STRATEGY_SCHEMA);
}

// --- Keyword Strategy Agent (ai-agents/keyword-strategy.md) ---
const KEYWORD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mainKeyword: { type: Type.STRING },
    secondaryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    lsiKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    searchIntent: { type: Type.STRING },
    targetCities: { type: Type.ARRAY, items: { type: Type.STRING } },
    contentAngle: { type: Type.STRING },
    selfImprovementNote: { type: Type.STRING }
  },
  required: ["mainKeyword", "secondaryKeywords", "lsiKeywords", "searchIntent", "targetCities", "contentAngle"]
};

function runKeywordAgent(businessData: any, objective = "Meningkatkan visibilitas lokal dan konversi", strategy?: any) {
  const prompt = `Anda adalah SEO Strategist Lokal untuk bisnis Indonesia.

Data Bisnis:
- Nama: ${businessData?.name || 'Bisnis'}
- Kategori: ${businessData?.category || 'Umum'}
- Deskripsi: ${businessData?.description || 'Tidak ada deskripsi'}
- Produk / Layanan: ${asList(businessData?.productsServices)}
- Kota Target: ${asList(businessData?.targetCities)}
- Tujuan: ${objective}
${strategy ? `
Arahan dari Campaign Strategy Agent:
- Positioning: ${strategy.positioning || ''}
- Content Angle: ${strategy.contentAngle || ''}
- Target Segmen: ${asList(strategy.targetSegments, '')}` : ''}

Kriteria wajib:
1. Prioritaskan keyword dengan intent lokal & commercial yang relevan.
2. Hindari keyword yang terlalu umum dan tidak bisa menghasilkan lead.
3. Berikan cluster keyword yang terarah untuk content marketing, landing page, dan promos lokal.
4. Jangan mengarang area atau kota yang tidak ada dalam data.`;

  return runAgent("keyword", prompt, KEYWORD_SCHEMA);
}

// --- Content Generation Agent (ai-agents/content-generator.md) ---
const CONTENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    seoTitle: { type: Type.STRING },
    metaDescription: { type: Type.STRING },
    seoDescription: { type: Type.STRING },
    shortSnippet: { type: Type.STRING },
    productHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
    callToAction: { type: Type.STRING },
    mappedCategory: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    selfImprovementNote: { type: Type.STRING }
  },
  required: ["seoTitle", "metaDescription", "seoDescription", "shortSnippet", "productHighlights", "callToAction", "mappedCategory", "tags"]
};

// `revision` carries the previous draft plus the audit's objections. When present the
// agent is rewriting rather than writing fresh, which is what lets the orchestrator
// close the loop instead of shipping content the auditor already rejected.
function runContentAgent(businessData: any, seoStrategy: any, revision?: { previousContent: any; audit: any }) {
  const revisionBlock = revision
    ? `

INI ADALAH REVISI, BUKAN TULISAN BARU.
Draft sebelumnya sudah dinilai oleh Quality Audit Agent dan DITOLAK/diberi catatan.

Draft sebelumnya:
- SEO Title: ${revision.previousContent?.seoTitle || ''}
- Meta Description: ${revision.previousContent?.metaDescription || ''}
- Deskripsi: ${String(revision.previousContent?.seoDescription || '').slice(0, 800)}

Hasil audit (status ${revision.audit?.publishingReadiness || 'WARNINGS'}, skor SEO ${revision.audit?.seoScore ?? '-'}, kualitas ${revision.audit?.contentQuality ?? '-'}, relevansi lokal ${revision.audit?.localRelevance ?? '-'}):
${(revision.audit?.findings || [])
  .filter((f: any) => f.type === 'warning' || f.type === 'error')
  .map((f: any) => `- [${f.type.toUpperCase()}] ${f.category}: ${f.message}`)
  .join('\n') || '- Tidak ada temuan spesifik, tingkatkan kualitas secara umum.'}

INSTRUKSI REVISI:
- Perbaiki setiap temuan di atas yang bisa diperbaiki lewat penulisan ulang.
- Temuan soal data yang memang TIDAK ADA (misal nomor WhatsApp atau alamat tidak diisi user) TIDAK BOLEH diperbaiki dengan mengarang data. Biarkan, jangan diisi dengan tebakan.
- Pertahankan bagian yang sudah baik; jangan menulis ulang total tanpa alasan.`
    : '';

  const prompt = `Anda adalah pakar Copywriting Local SEO Indonesia untuk listing bisnis di DongkrakUsaha (dongkrakusaha.com).

Data Bisnis:
- Nama: ${businessData.name}
- Kategori: ${businessData.category}
- Deskripsi Asli: ${businessData.description}
- Layanan/Produk: ${asList(businessData.productsServices)}
- Kota Target: ${asList(seoStrategy?.targetCities ?? businessData.targetCities)}
- Alamat: ${businessData.address}
- Harga: ${businessData.priceRange}

Strategi SEO:
- Main Keyword: ${seoStrategy?.mainKeyword || businessData.mainKeyword}
- Secondary Keywords: ${seoStrategy?.secondaryKeywords?.join(', ') || ''}
- Content Angle: ${seoStrategy?.contentAngle || ''}

PRINSIP WAJIB:
1. Relevan dengan lokasi target tanpa melakukan keyword stuffing.
2. Gaya bahasa natural, profesional, persuasif.
3. JANGAN mengarang fakta bisnis, harga, sertifikasi, alamat, atau nomor kontak yang tidak diberikan user.
4. Buat SEO Title yang menarik (maks 65 karakter).
5. Buat Meta Description yang persuasif (120-160 karakter).
6. Tulis deskripsi lengkap (SEO Content) yang terstruktur rapi.${revisionBlock}`;

  return runAgent("content", prompt, CONTENT_SCHEMA);
}

// --- Quality Audit Agent (ai-agents/quality-audit.md) ---
const AUDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    seoScore: { type: Type.NUMBER },
    contentQuality: { type: Type.NUMBER },
    localRelevance: { type: Type.NUMBER },
    publishingReadiness: { type: Type.STRING },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          category: { type: Type.STRING },
          message: { type: Type.STRING },
          // Who can act on this finding. "ai": the content agent can fix it by
          // rewriting. "human": it needs the business owner to change or supply data
          // (wrong/unclear area name, missing WhatsApp, missing address...). The
          // orchestrator only re-commissions rewrites for "ai" findings; "human"
          // findings are handed to the operator as editable fields instead of being
          // looped on pointlessly.
          fixableBy: { type: Type.STRING },
          field: { type: Type.STRING },
          suggestion: { type: Type.STRING }
        },
        required: ["type", "category", "message", "fixableBy"]
      }
    },
    selfImprovementNote: { type: Type.STRING }
  },
  required: ["seoScore", "contentQuality", "localRelevance", "publishingReadiness", "findings"]
};

// Campaign fields a human may be asked to correct. Kept as a closed list so the UI
// can render the right editor and the audit cannot name a field that does not exist.
const HUMAN_FIXABLE_FIELDS = ["targetCities", "address", "phoneWhatsApp", "businessName", "category", "description", "productsServices", "priceRange", "website", "other"] as const;
type HumanFixableField = typeof HUMAN_FIXABLE_FIELDS[number];

interface AuditFinding {
  type: "pass" | "warning" | "error";
  category: string;
  message: string;
  fixableBy?: "ai" | "human";
  field?: HumanFixableField;
  suggestion?: string;
}

// The model is asked to classify, but a missing/odd value must not break the loop.
// Findings about required data or location default to human; everything else to ai.
function normaliseFinding(f: any): AuditFinding {
  const type = (["pass", "warning", "error"].includes(f?.type) ? f.type : "warning") as AuditFinding["type"];
  const category = String(f?.category || "Required Fields");
  let fixableBy: "ai" | "human" = f?.fixableBy === "human" ? "human" : f?.fixableBy === "ai" ? "ai"
    : /required|location|contact|address|alamat|kontak|lokasi|daerah/i.test(category + " " + String(f?.message || "")) ? "human" : "ai";
  const field = HUMAN_FIXABLE_FIELDS.includes(f?.field) ? f.field : undefined;
  if (fixableBy === "human" && !field) {
    // Best-effort field guess so the UI can still open an editor.
    const m = String(f?.message || "").toLowerCase();
    const guessed: HumanFixableField =
      /whatsapp|telepon|phone|kontak|nomor/.test(m) ? "phoneWhatsApp"
      : /alamat|address/.test(m) ? "address"
      : /daerah|kota|lokasi|wilayah|area|kecamatan|city|location|placeholder/.test(m) ? "targetCities"
      : /harga|price/.test(m) ? "priceRange"
      : /nama bisnis|business name/.test(m) ? "businessName"
      : "other";
    return { type, category, message: String(f?.message || ""), fixableBy, field: guessed, suggestion: f?.suggestion ? String(f.suggestion) : undefined };
  }
  return { type, category, message: String(f?.message || ""), fixableBy, field, suggestion: f?.suggestion ? String(f.suggestion) : undefined };
}

function runAuditAgent(campaign: any) {
  const prompt = `Evaluasi Kualitas SEO dan Kesiapan Publishing untuk listing DongkrakUsaha berikut:

Title: ${campaign.generatedContent?.seoTitle || campaign.businessData.name}
Meta Description: ${campaign.generatedContent?.metaDescription || ''}
SEO Content: ${campaign.generatedContent?.seoDescription || campaign.businessData.description}
Main Keyword: ${campaign.seoStrategy?.mainKeyword || campaign.businessData.mainKeyword}
Target Cities: ${asList(campaign.businessData.targetCities)}
Category: ${campaign.businessData.category}
WhatsApp/Phone: ${campaign.businessData.phoneWhatsApp}
Address: ${campaign.businessData.address}

Jalankan evaluasi komprehensif:
1. Keyword Relevance & Stuffing check
2. Location Relevance check
3. Factual Consistency check
4. Missing Required Business Info check
5. Quality Scores (0-100)

publishingReadiness harus salah satu dari: READY, WARNINGS, BLOCKED.

KLASIFIKASI SETIAP TEMUAN (field "fixableBy") -- ini menentukan apa yang terjadi berikutnya:
- "ai"    : bisa diperbaiki Content Agent dengan MENULIS ULANG teks (keyword stuffing, nada,
            struktur, CTA lemah, panjang, duplikasi, kalimat kurang lokal).
- "human" : TIDAK bisa diperbaiki dengan menulis ulang karena DATA-nya yang bermasalah dan hanya
            pemilik usaha yang boleh mengubahnya: nomor WhatsApp kosong/tidak valid, alamat kosong,
            nama daerah target kosong / bukan nama tempat nyata / masih placeholder seperti
            "[Nama Daerah Target]", nama bisnis tidak jelas, harga tidak masuk akal.
Untuk temuan "human", isi "field" dengan salah satu dari: targetCities, address, phoneWhatsApp,
businessName, category, description, productsServices, priceRange, website, other -- dan isi
"suggestion" dengan satu kalimat apa yang harus diubah pemilik usaha.
Jangan pernah menyarankan mengarang data untuk temuan "human".`;

  return runAgent("audit", prompt, AUDIT_SCHEMA);
}

// --- Image Brief Agent (ai-agents/image-generator.md) ---
const IMAGE_BRIEF_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    conceptTitle: { type: Type.STRING },
    visualPrompt: { type: Type.STRING },
    negativePrompt: { type: Type.STRING },
    recommendedDimensions: {
      type: Type.OBJECT,
      properties: {
        width: { type: Type.NUMBER },
        height: { type: Type.NUMBER }
      },
      required: ["width", "height"]
    },
    style: { type: Type.STRING },
    textOverlay: { type: Type.STRING },
    webpGuidance: { type: Type.STRING },
    // Caption copy for the local composite renderer (/api/image/compose). These are
    // final strings drawn verbatim onto a real base photo -- nothing interprets them
    // afterwards -- so they carry hard length limits and must not invent offers.
    caption: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        subtitle: { type: Type.STRING },
        badge: { type: Type.STRING }
      },
      required: ["title", "subtitle", "badge"]
    },
    selfImprovementNote: { type: Type.STRING }
  },
  required: ["conceptTitle", "visualPrompt", "negativePrompt", "recommendedDimensions", "style", "textOverlay", "webpGuidance", "caption"]
};

function runImageBriefAgent(businessData: any, seoStrategy: any, generatedContent: any, audit: any) {
  const prompt = `Anda adalah Image Generation Specialist untuk campaign bisnis lokal Indonesia.

Data Bisnis:
- Nama: ${businessData?.name || 'Bisnis'}
- Kategori: ${businessData?.category || 'Umum'}
- Deskripsi: ${businessData?.description || 'Tidak ada deskripsi'}
- Kota Target: ${asList(businessData?.targetCities)}
- Produk/Layanan: ${asList(businessData?.productsServices)}

Strategi SEO:
- Main Keyword: ${seoStrategy?.mainKeyword || ''}
- Content Angle: ${seoStrategy?.contentAngle || ''}

Konten:
- SEO Title: ${generatedContent?.seoTitle || ''}
- CTA: ${generatedContent?.callToAction || ''}

Audit:
- Status: ${audit?.publishingReadiness || 'WARNINGS'}
- Skor SEO: ${audit?.seoScore ?? 'Belum tersedia'}

Buat creative brief visual yang realistis, relevan dengan bisnis, dan tidak membuat klaim visual yang tidak didukung data.

PENTING - field "caption":
Caption ini akan dicetak apa adanya sebagai teks di atas FOTO ASLI milik pemilik usaha (bukan gambar AI). Tidak ada model lain yang menafsirkan ulang teks ini, jadi tulis string final yang siap tampil.
- caption.title: headline pendek dan kuat. Maksimal 28 karakter.
- caption.subtitle: layanan + kota. Maksimal 40 karakter.
- caption.badge: tag promo singkat, contoh "GRATIS SURVEI". Maksimal 14 karakter. Kosongkan dengan string kosong jika tidak ada promo yang benar-benar disebut di data bisnis.
- Dilarang mengarang diskon, harga, garansi, atau klaim yang tidak ada di data bisnis di atas.
- Gunakan Bahasa Indonesia yang wajar untuk pelanggan lokal.`;

  return runAgent("image", prompt, IMAGE_BRIEF_SCHEMA);
}

// ------------------- STANDALONE AGENT ROUTES -------------------

// 3. SEO Research Route (legacy shape: flat business fields, keyword agent)
app.post("/api/gemini/research", async (req, res) => {
  try {
    const { businessName, category, description, productsServices, targetCities } = req.body;
    const { result, meta } = await runKeywordAgent({
      name: businessName,
      category,
      description,
      productsServices,
      targetCities
    });
    res.json({ ...result, _meta: meta });
  } catch (err: any) {
    console.error("Gemini Research Error:", err);
    res.status(500).json({ error: err.message || "Failed to run AI Keyword Research" });
  }
});

// 4A. Dedicated Keyword Strategy Route (Phase 2)
app.post("/api/gemini/keyword", async (req, res) => {
  try {
    const { businessData, objective, strategy } = req.body || {};
    const { result, meta } = await runKeywordAgent(businessData, objective, strategy);
    res.json({ ...result, _meta: meta });
  } catch (err: any) {
    console.error("Keyword Strategy Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate keyword strategy" });
  }
});

// 4. Campaign Strategy Route (Phase 2)
app.post("/api/gemini/strategy", async (req, res) => {
  try {
    const { businessData, objective } = req.body || {};
    const { result, meta } = await runStrategyAgent(businessData, objective);
    res.json({ ...result, _meta: meta });
  } catch (err: any) {
    console.error("Gemini Campaign Strategy Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate campaign strategy" });
  }
});

// 5. Content Generator Route
app.post("/api/gemini/generate-content", async (req, res) => {
  try {
    const { businessData, seoStrategy } = req.body;
    const { result, meta } = await runContentAgent(businessData, seoStrategy);
    res.json({ ...result, _meta: meta });
  } catch (err: any) {
    console.error("Gemini Content Generation Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate AI content" });
  }
});

// 6. Quality Control Route
app.post("/api/gemini/validate", async (req, res) => {
  try {
    const { campaign } = req.body;
    const { result, meta } = await runAuditAgent(campaign);
    res.json({ ...result, _meta: meta });
  } catch (err: any) {
    console.error("Gemini Validation Error:", err);
    res.status(500).json({ error: err.message || "Failed to run AI Quality Control validation" });
  }
});

// 7. Image Creative Brief Route (Phase 2)
app.post("/api/gemini/image-brief", async (req, res) => {
  try {
    const { businessData, seoStrategy, generatedContent, audit } = req.body || {};
    const { result, meta } = await runImageBriefAgent(businessData, seoStrategy, generatedContent, audit);
    res.json({ ...result, _meta: meta });
  } catch (err: any) {
    console.error("Image Creative Brief Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate image creative brief" });
  }
});

// 8. Bitmap Image Generation Route (Phase 2)
// Provider is Gemini, not OpenAI: Gemini's image models return the bitmap from the
// same generateContent call as text, as inline base64 parts. Going through
// generateWithFallback means this route inherits the project's model chain, per-key
// quota cooldown, and fallback accounting instead of re-implementing them.
function extractInlineImage(response: any): { data: string; mimeType: string } | null {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
      return { data: inline.data, mimeType: inline.mimeType || inline.mime_type || "image/png" };
    }
  }
  return null;
}

app.post("/api/image/generate", async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body || {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 20) {
      return res.status(400).json({ error: "A detailed image prompt is required." });
    }

    const bitmapConfig = FEATURE_MODEL_REGISTRY.bitmap;
    if (!getFeatureApiKey("bitmap")) {
      return res.status(503).json({
        error: `Bitmap renderer is not configured. Add ${bitmapConfig.apiKeyEnv} to .env before generating a bitmap.`,
        apiKeyEnv: bitmapConfig.apiKeyEnv
      });
    }

    const contents = prompt.trim();
    const baseConfig: any = { responseModalities: ["TEXT", "IMAGE"] };
    if (aspectRatio && typeof aspectRatio === "string") {
      baseConfig.imageConfig = { aspectRatio };
    }

    let generation;
    try {
      generation = await generateWithFallback({ feature: "bitmap", contents, config: baseConfig });
    } catch (err: any) {
      // Some model revisions reject the explicit modality/imageConfig hints as an
      // invalid argument. That is rethrown by the router without rolling models (it is
      // a caller-side error), so retry once with a bare config before giving up.
      const classified = classifyProviderError(err);
      if (!classified.isInvalid) throw err;
      console.warn("[Bitmap] provider rejected image config, retrying without hints:", err.message);
      generation = await generateWithFallback({ feature: "bitmap", contents, config: {} });
    }

    const image = extractInlineImage(generation.response);
    if (!image) {
      return res.status(502).json({
        error: "Provider returned no inline image data.",
        provider: "gemini",
        model: generation.modelUsed,
        textResponse: String((generation.response as any)?.text || "").slice(0, 500)
      });
    }

    const extension = image.mimeType.includes("jpeg") ? "jpg" : image.mimeType.includes("webp") ? "webp" : "png";
    const fileName = `dongkrak-${Date.now()}.${extension}`;
    await storage.writeBinary(`generated-images/${fileName}`, Buffer.from(image.data, "base64"));
    const storedPath = `/generated-images/${fileName}`;

    res.json({
      ok: true,
      provider: "gemini",
      model: generation.modelUsed,
      modelName: generation.modelName,
      fallbackOccurred: generation.fallbackOccurred,
      keyFingerprint: generation.keyFingerprint,
      attempts: generation.attempts,
      assetUrl: storedPath,
      storedPath,
      format: extension,
      mimeType: image.mimeType,
      source: "local-persisted"
    });
  } catch (err: any) {
    console.error("Bitmap Image Generation Error:", err);
    const classified = classifyProviderError(err);
    const status = classified.isQuota ? 429 : classified.isAuth ? 401 : 500;
    res.status(status).json({ error: err.message || "Failed to generate bitmap image", provider: "gemini" });
  }
});

// 8b. Local Caption Composite Route (Phase 2)
// One real base photo per service category, reused across listings with different
// per-listing text. This deliberately uses NO image provider: sharp is already a
// dependency, the render is free/instant/deterministic, text always renders exactly
// as written (image models garble exact strings, especially Indonesian), and the
// underlying photo stays a real product photo, which the audit agent's factual rules
// prefer over a generated image of furniture that does not exist.

// Maps a public asset URL path ("/base-photos/x.jpg") to a storage key. Only the two
// asset prefixes are allowed and any traversal is rejected, so a caller can never read
// outside the asset space regardless of storage mode.
function assetKeyFromPublicPath(candidate: string): string | null {
  const cleaned = candidate.replace(/^\/+/, "").replace(/\\/g, "/");
  if (cleaned.includes("..") || cleaned.includes("\0")) return null;
  const ok = ["base-photos/", "generated-images/"].some(p => cleaned.startsWith(p) && cleaned.length > p.length);
  return ok ? cleaned : null;
}

function slugifyCategory(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Caption text reaches the renderer inside an SVG document, so XML metacharacters
// must be escaped or a quote/ampersand in a business name would break the render.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---- Caption text as vector paths ----
// The caption used to be <text font-family="Segoe UI, Arial, sans-serif">. On a Linux
// container with no fonts installed (AI Studio, Cloud Run) librsvg has nothing to draw
// with and renders every glyph as a box -- the operator saw exactly that. So the text
// is now converted to <path> outlines with a font bundled in the repo (Inter, SIL OFL,
// server/fonts). No system font is consulted at any point; output is byte-identical on
// every machine.
//
// Shaping is intentionally per-glyph (char -> glyph, advance width, pair kerning) and
// bypasses opentype.js's GSUB pipeline, which throws on Inter's contextual lookups.
// Indonesian is Latin script with no required shaping, so this loses nothing.
const CAPTION_FONTS_DIR = path.join(process.cwd(), "server", "fonts");
function loadCaptionFont(file: string): opentype.Font | null {
  try {
    const buf = fs.readFileSync(path.join(CAPTION_FONTS_DIR, file));
    return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch (err) {
    console.error(`[Caption] could not load font ${file}; captions will fall back to system text:`, err);
    return null;
  }
}
const CAPTION_FONT_REGULAR = loadCaptionFont("Inter-Regular.woff");
const CAPTION_FONT_BOLD = loadCaptionFont("Inter-Bold.woff");

function textToPath(font: opentype.Font, text: string, x: number, y: number, size: number): { d: string; width: number } {
  const scale = size / font.unitsPerEm;
  let cx = x;
  let d = "";
  let prev: opentype.Glyph | null = null;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    if (prev && g) cx += font.getKerningValue(prev, g) * scale;
    if (g && g.path) {
      const p = g.getPath(cx, y, size).toPathData(2);
      if (p) d += p + " ";
    }
    cx += (g && g.advanceWidth != null ? g.advanceWidth : font.unitsPerEm * 0.5) * scale;
    prev = g;
  }
  return { d: d.trim(), width: cx - x };
}

// Emits a vector <path> when the bundled font loaded, else a <text> element as a last
// resort (works only where a system font exists, i.e. the developer's Windows box).
function captionText(font: opentype.Font | null, text: string, x: number, y: number, size: number, fill: string, weight: 400 | 700): { svg: string; width: number } {
  if (font) {
    const { d, width } = textToPath(font, text, x, y, size);
    return { svg: `<path d="${d}" fill="${fill}"/>`, width };
  }
  return {
    svg: `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(text)}</text>`,
    width: text.length * size * 0.55
  };
}

function buildCaptionSvg(width: number, height: number, title: string, subtitle: string, badge?: string): Buffer {
  const barH = Math.round(height * 0.18);
  const padX = Math.round(width * 0.06);
  const titleSize = Math.round(height * 0.058);
  const subtitleSize = Math.round(height * 0.036);
  const badgeSize = Math.round(height * 0.032);

  const titleEl = captionText(CAPTION_FONT_BOLD, title, padX, height - barH * 0.72, titleSize, "#ffffff", 700);
  const subtitleEl = subtitle
    ? captionText(CAPTION_FONT_REGULAR, subtitle, padX, height - barH * 0.26, subtitleSize, "#e2e8f0", 400)
    : null;

  let badgeBlock = "";
  if (badge) {
    const badgeInnerPad = Math.round(height * 0.018);
    const badgeTop = Math.round(height * 0.05);
    const badgeH = Math.round(height * 0.062);
    // Baseline ~= vertical centre of the box plus a third of the cap height.
    const badgeText = captionText(CAPTION_FONT_BOLD, badge, padX + badgeInnerPad, badgeTop + badgeH / 2 + badgeSize * 0.36, badgeSize, "#ffffff", 700);
    const badgeW = Math.min(width - padX * 2, Math.round(badgeText.width + badgeInnerPad * 2));
    badgeBlock = `<g>
         <rect x="${padX}" y="${badgeTop}" rx="${Math.round(height * 0.012)}" width="${badgeW}" height="${badgeH}" fill="#dc2626"/>
         ${badgeText.svg}
       </g>`;
  }

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="captionFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(15,23,42,0)"/>
          <stop offset="45%" stop-color="rgba(15,23,42,0.82)"/>
          <stop offset="100%" stop-color="rgba(15,23,42,0.94)"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${height - barH * 1.7}" width="${width}" height="${barH * 1.7}" fill="url(#captionFade)"/>
      ${titleEl.svg}
      ${subtitleEl ? subtitleEl.svg : ""}
      ${badgeBlock}
    </svg>`);
}

// Shared by the manual-upload route and the AI-generate route below, so both produce
// an identical, validated, normalised file and an identical response shape.
class BasePhotoError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function storeBasePhotoBuffer(category: string, raw: Buffer) {
  const slug = slugifyCategory(category);
  if (!slug) throw new BasePhotoError("Category did not produce a usable file name.", 400);
  if (raw.length === 0) throw new BasePhotoError("Image is empty.", 400);

  // Re-encode through sharp: this both validates that the bytes really are an image
  // and normalises whatever the source produced into one predictable format. sharp
  // throws on undecodable bytes, which is a caller problem (400), not a server fault.
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(raw).metadata();
  } catch {
    throw new BasePhotoError("File is not a readable image.", 400);
  }
  if (!metadata.width || !metadata.height) {
    throw new BasePhotoError("File is not a readable image.", 400);
  }

  const fileName = `${slug}.jpg`;
  const normalised = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
  await storage.writeBinary(`base-photos/${fileName}`, normalised);

  return {
    ok: true,
    category,
    slug,
    basePath: `/base-photos/${fileName}`,
    width: metadata.width,
    height: metadata.height,
    bytes: normalised.length
  };
}

// Register/replace the one real base photo used for a service category.
app.post("/api/image/base-photo", async (req, res) => {
  try {
    const { category, imageBase64 } = req.body || {};
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "A category is required." });
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "imageBase64 is required." });
    }

    const raw = Buffer.from(imageBase64.replace(/^data:image\/[^;]+;base64,/, ""), "base64");
    res.json(await storeBasePhotoBuffer(category, raw));
  } catch (err: any) {
    console.error("Base Photo Upload Error:", err);
    res.status(err instanceof BasePhotoError ? err.status : 500).json({ error: err.message || "Failed to store base photo" });
  }
});

// ---- AI-generated base photos (Cloudflare Workers AI primary, Hugging Face fallback) ----
// This generates the PHOTO UNDERNEATH the caption, as an alternative to uploading a
// real one. It never produces the final text-bearing listing image: AI_MODELS.md Rule
// 1F still stands -- image models cannot be trusted to render exact Indonesian text,
// so the caption is always composited locally afterwards by /api/image/compose.
//
// Neither provider shares the Gemini SDK, so neither can go through
// generateWithFallback. They reuse its generic pieces instead: classifyProviderError
// for a consistent read of failures, and the same per-token cooldown bookkeeping so a
// broken or exhausted provider is skipped for a while rather than hammered.
//
// Cloudflare is primary on the evidence gathered 2026-09-14: ~10,000 free Neurons/day
// with no card (roughly 170 flux-1-schnell images/day by its published per-unit
// prices), no model gating, fully documented request/response. Hugging Face routes
// this model to a paid third-party provider and gives free users only ~$0.10/month
// (~30 images), and the model itself is gated behind a click-through on its page.
const CLOUDFLARE_FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const HUGGINGFACE_FLUX_MODEL = "black-forest-labs/FLUX.1-schnell";
const BASE_PHOTO_PROVIDER_ENV = {
  cloudflareAccountId: "CLOUDFLARE_ACCOUNT_ID",
  cloudflareToken: "CLOUDFLARE_API_TOKEN_BITMAP",
  huggingfaceToken: "HUGGINGFACE_API_TOKEN_BITMAP"
} as const;

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

// Plain fetch does not throw on non-2xx, unlike the Gemini SDK. Attach the HTTP
// status so classifyProviderError (which reads err.status) treats 429/5xx/401 the
// same way it does for Gemini and the cooldown logic stays uniform.
function providerHttpError(provider: string, status: number, detail: string): Error {
  return Object.assign(new Error(`${provider} returned HTTP ${status}: ${detail.slice(0, 300)}`), { status });
}

async function generateImageViaCloudflare(prompt: string): Promise<Buffer> {
  const accountId = readEnv(BASE_PHOTO_PROVIDER_ENV.cloudflareAccountId);
  const token = readEnv(BASE_PHOTO_PROVIDER_ENV.cloudflareToken);
  if (!accountId || !token) {
    throw new Error(`Cloudflare is not configured (needs ${BASE_PHOTO_PROVIDER_ENV.cloudflareAccountId} and ${BASE_PHOTO_PROVIDER_ENV.cloudflareToken}).`);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CLOUDFLARE_FLUX_MODEL}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // flux-1-schnell's published input schema accepts exactly: prompt (required) and
    // steps (optional, default 4, max 8). Nothing else -- no width/height/seed.
    body: JSON.stringify({ prompt, steps: 4 })
  });

  const text = await response.text();
  if (!response.ok) throw providerHttpError("Cloudflare Workers AI", response.status, text);

  // flux-1-schnell specifically returns JSON with base64 inside result.image. This is
  // MODEL-SPECIFIC: Cloudflare's Stable Diffusion models return raw PNG bytes instead,
  // so this parsing must change if the model ever changes.
  let payload: any;
  try { payload = JSON.parse(text); } catch { throw providerHttpError("Cloudflare Workers AI", 502, `non-JSON body: ${text}`); }
  if (payload.success === false) {
    const detail = JSON.stringify(payload.errors || payload.messages || payload);
    throw providerHttpError("Cloudflare Workers AI", 502, detail);
  }
  const b64 = payload?.result?.image;
  if (typeof b64 !== "string" || b64.length === 0) {
    throw providerHttpError("Cloudflare Workers AI", 502, "response had no result.image");
  }
  return Buffer.from(b64, "base64");
}

async function generateImageViaHuggingFace(prompt: string): Promise<Buffer> {
  const token = readEnv(BASE_PHOTO_PROVIDER_ENV.huggingfaceToken);
  if (!token) {
    throw new Error(`Hugging Face is not configured (needs ${BASE_PHOTO_PROVIDER_ENV.huggingfaceToken}).`);
  }

  // The official SDK is used deliberately: HF does not publish a stable raw URL for
  // text-to-image under its Inference Providers router, only for chat completions.
  const client = new InferenceClient(token);
  const blob = await client.textToImage(
    {
      provider: "auto",
      model: HUGGINGFACE_FLUX_MODEL,
      inputs: prompt,
      parameters: { num_inference_steps: 4 }
    },
    { outputType: "blob" }
  );
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length === 0) throw providerHttpError("Hugging Face", 502, "empty image response");
  return bytes;
}

interface BasePhotoGeneration {
  buffer: Buffer;
  provider: "cloudflare" | "huggingface";
  attempts: Array<{ provider: string; ok: boolean; status?: number; error?: string }>;
}

async function generateBasePhotoWithAI(prompt: string): Promise<BasePhotoGeneration> {
  const attempts: BasePhotoGeneration["attempts"] = [];
  const cloudflareReady = !!(readEnv(BASE_PHOTO_PROVIDER_ENV.cloudflareAccountId) && readEnv(BASE_PHOTO_PROVIDER_ENV.cloudflareToken));
  const huggingfaceReady = !!readEnv(BASE_PHOTO_PROVIDER_ENV.huggingfaceToken);

  if (!cloudflareReady && !huggingfaceReady) {
    throw Object.assign(new Error(
      `No AI image provider is configured. Add ${BASE_PHOTO_PROVIDER_ENV.cloudflareAccountId} + ${BASE_PHOTO_PROVIDER_ENV.cloudflareToken} (recommended) or ${BASE_PHOTO_PROVIDER_ENV.huggingfaceToken} to .env.`
    ), { status: 503 });
  }

  const chain: Array<{ provider: BasePhotoGeneration["provider"]; ready: boolean; token: string; run: (p: string) => Promise<Buffer> }> = [
    { provider: "cloudflare", ready: cloudflareReady, token: readEnv(BASE_PHOTO_PROVIDER_ENV.cloudflareToken) || "", run: generateImageViaCloudflare },
    { provider: "huggingface", ready: huggingfaceReady, token: readEnv(BASE_PHOTO_PROVIDER_ENV.huggingfaceToken) || "", run: generateImageViaHuggingFace }
  ];

  refreshExpiredCooldowns();
  for (const entry of chain) {
    if (!entry.ready) continue;
    // Same per-(key x model) cooldown bookkeeping the Gemini router uses, so the
    // status page can show these slots and a rate-limited provider is skipped.
    const slot = getSlotState(fingerprintKey(entry.token), `${entry.provider}:flux-1-schnell`);
    if (!slot.available) {
      attempts.push({ provider: entry.provider, ok: false, error: `cooling down (${slot.status})` });
      continue;
    }
    try {
      console.log(`[Base Photo AI] trying ${entry.provider}`);
      const buffer = await entry.run(prompt);
      slot.successCount++;
      slot.lastUsedAt = Date.now();
      attempts.push({ provider: entry.provider, ok: true });
      return { buffer, provider: entry.provider, attempts };
    } catch (err: any) {
      const classified = classifyProviderError(err);
      console.error(`[Base Photo AI] ${entry.provider} failed:`, err.message);
      attempts.push({ provider: entry.provider, ok: false, status: classified.status, error: String(err.message).slice(0, 200) });
      slot.failureCount++;
      slot.lastErrorStatus = classified.status;
      slot.lastErrorMessage = String(err.message || "").slice(0, 300);
      slot.available = false;
      slot.status = classified.isQuota ? "QUOTA_EXHAUSTED" : classified.isTemporary ? "TEMPORARILY_UNAVAILABLE" : "ERROR";
      slot.unavailableUntil = Date.now() + (classified.isQuota ? COOLDOWN_MS.quota : classified.isTemporary ? COOLDOWN_MS.temporary : COOLDOWN_MS.unknown);
    }
  }

  throw Object.assign(new Error(`All AI image providers failed. Attempts: ${JSON.stringify(attempts)}`), { status: 502, attempts });
}

app.post("/api/image/generate-base-photo", async (req, res) => {
  try {
    const { category, prompt } = req.body || {};
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "A category is required." });
    }
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 15) {
      return res.status(400).json({ error: "A descriptive image prompt is required (at least 15 characters)." });
    }

    const startedAt = Date.now();
    const generation = await generateBasePhotoWithAI(prompt.trim());
    const stored = await storeBasePhotoBuffer(category, generation.buffer);
    res.json({ ...stored, provider: generation.provider, attempts: generation.attempts, durationMs: Date.now() - startedAt });
  } catch (err: any) {
    console.error("AI Base Photo Error:", err);
    const status = err instanceof BasePhotoError ? err.status : (err.status && err.status >= 400 && err.status < 600 ? err.status : 500);
    res.status(status).json({ error: err.message || "Failed to generate base photo", attempts: err.attempts });
  }
});

app.get("/api/image/base-photos", async (req, res) => {
  try {
    const entries = await storage.list("base-photos/");
    const basePhotos = entries
      .filter(e => /\.(jpe?g|png|webp)$/i.test(e.key))
      .map(e => {
        const name = e.key.slice("base-photos/".length);
        return {
          slug: name.replace(/\.[^.]+$/, ""),
          basePath: `/${e.key}`,
          bytes: e.bytes,
          updatedAt: e.updatedAt
        };
      });
    res.json({ basePhotos });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list base photos" });
  }
});

app.post("/api/image/compose", async (req, res) => {
  try {
    const { basePath, baseBase64, title, subtitle = "", badge, outputFormat = "webp", quality = 85 } = req.body || {};

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "A caption title is required." });
    }

    let sourceBuffer: Buffer;
    if (baseBase64 && typeof baseBase64 === "string") {
      sourceBuffer = Buffer.from(baseBase64.replace(/^data:image\/[^;]+;base64,/, ""), "base64");
    } else if (basePath && typeof basePath === "string") {
      const key = assetKeyFromPublicPath(basePath);
      if (!key) {
        return res.status(400).json({ error: "Base path must remain inside the public directory." });
      }
      const found = await storage.readBinary(key);
      if (!found) {
        return res.status(404).json({ error: "Base photo was not found. Upload one for this category first." });
      }
      sourceBuffer = found;
    } else {
      return res.status(400).json({ error: "Provide basePath or baseBase64." });
    }

    if (sourceBuffer.length === 0) {
      return res.status(400).json({ error: "Base image is empty." });
    }
    if (!["webp", "png", "jpeg"].includes(outputFormat)) {
      return res.status(400).json({ error: "outputFormat must be webp, png, or jpeg." });
    }

    const startedAt = Date.now();
    const metadata = await sharp(sourceBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      return res.status(400).json({ error: "Base file is not a readable image." });
    }

    const overlay = buildCaptionSvg(metadata.width, metadata.height, title.trim(), String(subtitle).trim(), badge);
    let pipeline = sharp(sourceBuffer).composite([{ input: overlay, top: 0, left: 0 }]);
    if (outputFormat === "webp") pipeline = pipeline.webp({ quality: Number(quality) });
    else if (outputFormat === "jpeg") pipeline = pipeline.jpeg({ quality: Number(quality) });
    else pipeline = pipeline.png();

    const rendered = await pipeline.toBuffer();
    const fileName = `composed-${Date.now()}.${outputFormat === "jpeg" ? "jpg" : outputFormat}`;
    await storage.writeBinary(`generated-images/${fileName}`, rendered);

    res.json({
      ok: true,
      renderer: "local-sharp",
      assetUrl: `/generated-images/${fileName}`,
      storedPath: `/generated-images/${fileName}`,
      format: outputFormat,
      width: metadata.width,
      height: metadata.height,
      bytes: rendered.length,
      durationMs: Date.now() - startedAt
    });
  } catch (err: any) {
    console.error("Caption Composite Error:", err);
    res.status(500).json({ error: err.message || "Failed to compose captioned image" });
  }
});

// 9. Local WebP Conversion Route (Phase 2)
app.post("/api/image/convert-webp", async (req, res) => {
  try {
    const { sourcePath, sourceBase64, quality = 82 } = req.body || {};
    let sourceBuffer: Buffer;
    let originalPath = sourcePath || "inline-base64";

    if (sourceBase64 && typeof sourceBase64 === "string") {
      sourceBuffer = Buffer.from(sourceBase64.replace(/^data:image\/[^;]+;base64,/, ""), "base64");
    } else if (sourcePath && typeof sourcePath === "string") {
      const key = assetKeyFromPublicPath(sourcePath);
      if (!key) {
        return res.status(400).json({ error: "Source path must remain inside the public directory." });
      }
      const found = await storage.readBinary(key);
      if (!found) {
        return res.status(404).json({ error: "Source image was not found." });
      }
      sourceBuffer = found;
      originalPath = `/${key}`;
    } else {
      return res.status(400).json({ error: "Provide sourcePath or sourceBase64." });
    }

    if (sourceBuffer.length === 0) {
      return res.status(400).json({ error: "Source image is empty." });
    }

    const numericQuality = Number(quality);
    if (!Number.isInteger(numericQuality) || numericQuality < 1 || numericQuality > 100) {
      return res.status(400).json({ error: "Quality must be an integer between 1 and 100." });
    }

    const fileName = `dongkrak-${Date.now()}.webp`;
    const converted = await sharp(sourceBuffer).webp({ quality: numericQuality }).toBuffer();
    await storage.writeBinary(`generated-images/${fileName}`, converted);

    const metadata = await sharp(converted).metadata();
    res.json({
      ok: true,
      originalPath,
      convertedPath: `/generated-images/${fileName}`,
      format: "webp",
      quality: numericQuality,
      originalBytes: sourceBuffer.length,
      convertedBytes: converted.length,
      width: metadata.width,
      height: metadata.height,
      status: "converted"
    });
  } catch (err: any) {
    console.error("WebP Conversion Error:", err);
    res.status(422).json({ error: err.message || "Failed to convert image to WebP" });
  }
});

// 10. Final Orchestrator Package Route (Phase 2)
app.post("/api/orchestrator/package", (req, res) => {
  try {
    const {
      businessData,
      strategy,
      seoStrategy,
      generatedContent,
      audit,
      imageBrief,
      imageAsset,
      webpAsset
    } = req.body || {};

    if (!businessData || !strategy || !seoStrategy || !generatedContent || !audit) {
      return res.status(400).json({
        error: "businessData, strategy, seoStrategy, generatedContent, and audit are required."
      });
    }

    const auditStatus = String(audit.publishingReadiness || "BLOCKED").toUpperCase();
    if (!["READY", "WARNINGS", "BLOCKED"].includes(auditStatus)) {
      return res.status(400).json({ error: "audit.publishingReadiness must be READY, WARNINGS, or BLOCKED." });
    }

    const blockers: string[] = [];
    if (auditStatus === "BLOCKED") {
      blockers.push("Quality audit is BLOCKED.");
    }
    if (!imageAsset) {
      blockers.push("No bitmap image asset is attached.");
    }
    if (!webpAsset) {
      blockers.push("No WebP asset is attached.");
    }

    const warnings = Array.isArray(audit.findings)
      ? audit.findings.filter((finding: any) => finding?.type === "warning" || finding?.type === "error")
      : [];

    res.json({
      ok: true,
      packageStatus: blockers.length === 0 ? "COMPLETE" : "INCOMPLETE",
      readyForPublishing: blockers.length === 0 && auditStatus === "READY",
      blockers,
      warnings,
      package: {
        businessData,
        strategy,
        seoStrategy,
        generatedContent,
        audit,
        image: { brief: imageBrief || null, asset: imageAsset || null },
        webp: webpAsset || null
      },
      stages: {
        strategy: "complete",
        keyword: "complete",
        content: "complete",
        audit: auditStatus === "BLOCKED" ? "blocked" : "complete-with-warnings",
        image: imageAsset ? "complete" : "awaiting-asset",
        webp: webpAsset ? "complete" : "awaiting-asset"
      }
    });
  } catch (err: any) {
    console.error("Final Orchestrator Package Error:", err);
    res.status(500).json({ error: err.message || "Failed to package orchestrator output" });
  }
});

// ------------------- ORCHESTRATOR PIPELINE -------------------
// The orchestrator actually delegates now: it runs each specialist in the order
// mandated by ai-agents/phase2-workflow.md, feeds each stage's output into the next,
// and keeps a task ledger (required by ai-agents/orchestrator.md).
//
// Stage order is fixed by project rule, NOT chosen by the model -- the orchestrator
// agent contributes a plan/briefing for the user, and its own failure is non-fatal so
// a missing orchestrator key can't block specialists that are correctly configured.

// The fixed pipeline stages, plus the dynamically numbered revision/re-audit stages
// the orchestrator adds when the auditor rejects a draft (e.g. `content-revisi-1`).
type StageName = 'plan' | 'strategy' | 'keyword' | 'content' | 'audit' | 'image' | 'handoff' | `content-revisi-${number}` | `audit-ulang-${number}`;

interface LedgerEntry {
  order: number;
  stage: StageName;
  agent: string;
  feature: FeatureName;
  status: 'done' | 'failed' | 'skipped';
  reason?: string;
  modelUsed?: string;
  modelName?: string;
  fallbackOccurred?: boolean;
  keyFingerprint?: string;
  attempts?: GenerationAttempt[];
  durationMs: number;
}

// ---- Live orchestrator progress ----
// A run takes 30-150 s and the HTTP response only arrives at the end. The client
// polls this snapshot (keyed by the runId it sent) to show "tahap 3/6 · Audit" in
// its job tray while the user is on another tab. Entries expire 2 min after finish.
interface OrchestratorProgress {
  runId: string;
  campaignId?: string;
  label: string;
  completed: number;
  total: number;
  ledger: LedgerEntry[];
  startedAt: number;
  updatedAt: number;
  finished: boolean;
}
const ORCH_PROGRESS = new Map<string, OrchestratorProgress>();
const ORCH_PROGRESS_TTL_MS = 2 * 60 * 1000;

app.get("/api/orchestrator/progress/:runId", (req, res) => {
  const p = ORCH_PROGRESS.get(String(req.params.runId));
  if (!p) return res.status(404).json({ error: "Run tidak ditemukan atau sudah kedaluwarsa." });
  res.json(p);
});

const ORCHESTRATOR_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    objective: { type: Type.STRING },
    taskBreakdown: { type: Type.ARRAY, items: { type: Type.STRING } },
    risks: { type: Type.ARRAY, items: { type: Type.STRING } },
    expectedOutcome: { type: Type.STRING },
    selfImprovementNote: { type: Type.STRING }
  },
  required: ["objective", "taskBreakdown", "risks", "expectedOutcome"]
};

function runOrchestratorPlan(businessData: any, objective: string) {
  const prompt = `Anda adalah master orchestrator untuk sistem AI marketing DongkrakUsaha.

Data Bisnis:
- Nama: ${businessData?.name || 'Bisnis'}
- Kategori: ${businessData?.category || 'Umum'}
- Deskripsi: ${businessData?.description || 'Tidak ada deskripsi'}
- Kota Target: ${asList(businessData?.targetCities)}
- Produk/Layanan: ${asList(businessData?.productsServices)}

Tujuan campaign: ${objective}

Spesialis yang akan dijalankan aplikasi secara berurutan:
1. Campaign Strategy Agent - positioning, offer framing
2. Keyword Strategy Agent - keyword cluster & local intent
3. Content Generation Agent - judul SEO, meta description, deskripsi
4. Quality Audit Agent - skor & kesiapan publish
5. Image Brief Agent - konsep visual & prompt

Buat briefing singkat untuk pemilik bisnis: objective yang diperjelas, rincian tugas tiap
spesialis untuk bisnis ini secara spesifik, risiko atau keterbatasan yang perlu disadari,
dan hasil akhir yang realistis diharapkan. Jangan mengarang fakta bisnis yang tidak ada di data.`;

  return runAgent("orchestrator", prompt, ORCHESTRATOR_PLAN_SCHEMA);
}

app.post("/api/orchestrator/run", async (req, res) => {
  const startedAt = Date.now();
  const ledger: LedgerEntry[] = [];
  const outputs: Record<string, any> = {};
  const revisionHistory: Array<{
    round: number;
    scoreBefore: number;
    scoreAfter: number;
    readinessBefore: string;
    readinessAfter: string;
    accepted: boolean;
  }> = [];

  const {
    businessData,
    objective = "Meningkatkan penjualan dan visibilitas lokal",
    campaign,
    runId: requestedRunId
  } = req.body || {};

  if (!businessData) {
    return res.status(400).json({ error: "businessData is required to run the orchestrator pipeline." });
  }

  const runId = String(requestedRunId || `run-${startedAt}-${Math.random().toString(36).slice(2, 8)}`);
  const progress: OrchestratorProgress = {
    runId,
    campaignId: campaign?.id,
    label: "Menyiapkan pipeline",
    completed: 0,
    total: 6,
    ledger,
    startedAt,
    updatedAt: startedAt,
    finished: false
  };
  ORCH_PROGRESS.set(runId, progress);
  const stage = (label: string) => { progress.label = label; progress.updatedAt = Date.now(); };

  let order = 0;

  const record = (stage: StageName, agent: string, feature: FeatureName, status: LedgerEntry['status'], startMs: number, extra: Partial<LedgerEntry> = {}) => {
    ledger.push({
      order: ++order,
      stage,
      agent,
      feature,
      status,
      durationMs: Date.now() - startMs,
      ...extra
    });
    // Hand-off is an extra, unplanned entry; keep the fraction honest.
    if (stage === 'handoff') progress.total += 1;
    progress.completed = ledger.length;
    progress.updatedAt = Date.now();
  };

  // Turns a thrown provider/config error into a short, user-actionable reason.
  const explain = (err: any) => String(err?.message || 'Unknown error').slice(0, 400);

  // Stage 0 + Stage 1 run concurrently. The briefing is advisory and feeds nothing
  // downstream; strategy is the first real dependency. They use different keys, so
  // running them together costs no extra quota on either and saves the briefing's
  // full latency (~8 s measured) from every run.
  stage("Briefing & strategi kampanye");
  {
    const t0 = Date.now();
    const [planRes, strategyRes] = await Promise.allSettled([
      runOrchestratorPlan(businessData, objective),
      runStrategyAgent(businessData, objective)
    ]);
    if (planRes.status === 'fulfilled') {
      const { result, meta } = planRes.value;
      outputs.plan = result;
      record('plan', 'Orchestrator', 'orchestrator', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } else {
      record('plan', 'Orchestrator', 'orchestrator', 'failed', t0, { reason: explain(planRes.reason) });
    }
    if (strategyRes.status === 'fulfilled') {
      const { result, meta } = strategyRes.value;
      outputs.strategy = result;
      record('strategy', 'Campaign Strategy', 'strategy', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } else {
      record('strategy', 'Campaign Strategy', 'strategy', 'failed', t0, { reason: explain(strategyRes.reason) });
    }
  }

  // Stage 2: keyword strategy (uses strategy when available, still runs without it)
  stage("Riset keyword SEO");
  {
    const t0 = Date.now();
    try {
      const { result, meta } = await runKeywordAgent(businessData, objective, outputs.strategy);
      outputs.seoStrategy = result;
      record('keyword', 'SEO Keyword Strategy', 'keyword', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } catch (err: any) {
      record('keyword', 'SEO Keyword Strategy', 'keyword', 'failed', t0, { reason: explain(err) });
    }
  }

  // Stage 3: content (hard dependency on keyword output)
  stage("Menulis konten listing");
  if (!outputs.seoStrategy) {
    record('content', 'Content Generation', 'content', 'skipped', Date.now(), {
      reason: 'Keyword stage did not produce an SEO strategy, so content has no keyword basis to write against.'
    });
  } else {
    const t0 = Date.now();
    try {
      const { result, meta } = await runContentAgent(businessData, outputs.seoStrategy);
      outputs.generatedContent = result;
      record('content', 'Content Generation', 'content', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } catch (err: any) {
      record('content', 'Content Generation', 'content', 'failed', t0, { reason: explain(err) });
    }
  }

  // Stage 4: audit (hard dependency on content)
  stage("Audit kualitas");
  if (!outputs.generatedContent) {
    record('audit', 'Quality Control Audit', 'audit', 'skipped', Date.now(), {
      reason: 'No generated content to audit.'
    });
  } else {
    const t0 = Date.now();
    try {
      const auditInput = {
        businessData,
        seoStrategy: outputs.seoStrategy,
        generatedContent: outputs.generatedContent,
        ...(campaign || {})
      };
      const { result, meta } = await runAuditAgent(auditInput);
      outputs.audit = result;
      record('audit', 'Quality Control Audit', 'audit', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } catch (err: any) {
      record('audit', 'Quality Control Audit', 'audit', 'failed', t0, { reason: explain(err) });
    }
  }

  // Stage 4b: revision loop. The audit result is fed back to the orchestrator, and if
  // the auditor is not satisfied the orchestrator re-commissions the content agent
  // with the specific findings, then re-audits. Without this the pipeline would
  // happily hand over content its own auditor had just rejected.
  const MAX_REVISIONS = 2;
  let revisionRound = 0;
  const findingsOf = (audit: any): AuditFinding[] => (Array.isArray(audit?.findings) ? audit.findings.map(normaliseFinding) : []);
  const actionable = (audit: any) => findingsOf(audit).filter(f => f.type !== 'pass');
  const aiFixableOf = (audit: any) => actionable(audit).filter(f => f.fixableBy === 'ai');
  const humanRequiredOf = (audit: any) => actionable(audit).filter(f => f.fixableBy === 'human');

  // Normalise the audit output once so the UI and the loop see the same shape.
  if (outputs.audit && Array.isArray(outputs.audit.findings)) outputs.audit.findings = findingsOf(outputs.audit);

  // Hand-off instead of a pointless loop: if the auditor's complaints are all about
  // DATA only the owner can change (wrong area name, missing WhatsApp), no amount of
  // rewriting will satisfy it. Skip the revision rounds and surface the fields.
  if (outputs.audit && outputs.generatedContent &&
      ['WARNINGS', 'BLOCKED'].includes(String(outputs.audit.publishingReadiness || '').toUpperCase()) &&
      aiFixableOf(outputs.audit).length === 0 && humanRequiredOf(outputs.audit).length > 0) {
    record('handoff', 'Orchestrator Hand-off', 'orchestrator', 'done', Date.now(), {
      reason: `Audit: ${humanRequiredOf(outputs.audit).length} temuan hanya bisa diperbaiki pemilik usaha (${[...new Set(humanRequiredOf(outputs.audit).map(f => f.field))].join(', ')}). Revisi AI dilewati -- tidak ada yang bisa diperbaiki dengan menulis ulang.`
    });
  }

  // Hand-off comes FIRST. Copy problems the auditor labels "ai" are almost always a
  // consequence of the data problems it labels "human" (a placeholder area name
  // shows up in the title, the keywords, the address...). Rewriting on top of bad
  // data burns two rounds of quota and changes nothing the owner will keep. So while
  // any human-required finding exists, revisions are deferred until the owner has
  // corrected the data and re-run.
  if (outputs.audit && humanRequiredOf(outputs.audit).length > 0 && aiFixableOf(outputs.audit).length > 0) {
    record('handoff', 'Orchestrator Hand-off', 'orchestrator', 'done', Date.now(), {
      reason: `Audit: ${humanRequiredOf(outputs.audit).length} temuan butuh pemilik usaha (${[...new Set(humanRequiredOf(outputs.audit).map(f => f.field))].join(', ')}); ${aiFixableOf(outputs.audit).length} temuan tulisan ditunda sampai data diperbaiki -- merevisi di atas data yang salah hanya membuang kuota.`
    });
  }

  while (
    outputs.audit &&
    outputs.generatedContent &&
    ['WARNINGS', 'BLOCKED'].includes(String(outputs.audit.publishingReadiness || '').toUpperCase()) &&
    aiFixableOf(outputs.audit).length > 0 &&
    humanRequiredOf(outputs.audit).length === 0 &&
    revisionRound < MAX_REVISIONS
  ) {
    revisionRound++;
    const auditBefore = outputs.audit;
    const scoreBefore = Number(auditBefore.seoScore) || 0;
    progress.total += 2;
    stage(`Revisi konten ke-${revisionRound}`);

    const tRewrite = Date.now();
    let rewritten: any = null;
    try {
      const { result, meta } = await runContentAgent(businessData, outputs.seoStrategy, {
        previousContent: outputs.generatedContent,
        audit: auditBefore
      });
      rewritten = result;
      record(`content-revisi-${revisionRound}`, `Content Revision ${revisionRound}`, 'content', 'done', tRewrite, {
        reason: `Audit sebelumnya ${auditBefore.publishingReadiness} (skor ${scoreBefore}); orchestrator meminta perbaikan.`,
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } catch (err: any) {
      record(`content-revisi-${revisionRound}`, `Content Revision ${revisionRound}`, 'content', 'failed', tRewrite, {
        reason: explain(err)
      });
      break;
    }

    const tReaudit = Date.now();
    stage(`Audit ulang ke-${revisionRound}`);
    try {
      const { result: reaudit, meta } = await runAuditAgent({
        businessData,
        seoStrategy: outputs.seoStrategy,
        generatedContent: rewritten,
        ...(campaign || {})
      });

      // Only keep the rewrite if the auditor actually rates it better. A revision that
      // scores worse is discarded, so the loop cannot degrade a draft.
      if (Array.isArray(reaudit?.findings)) reaudit.findings = findingsOf(reaudit);
      const scoreAfter = Number(reaudit.seoScore) || 0;
      const improved = scoreAfter >= scoreBefore;
      if (improved) {
        outputs.generatedContent = rewritten;
        outputs.audit = reaudit;
      }
      revisionHistory.push({
        round: revisionRound,
        scoreBefore,
        scoreAfter,
        readinessBefore: auditBefore.publishingReadiness,
        readinessAfter: reaudit.publishingReadiness,
        accepted: improved
      });
      record(`audit-ulang-${revisionRound}`, `Re-Audit ${revisionRound}`, 'audit', 'done', tReaudit, {
        reason: improved
          ? `Revisi diterima: skor ${scoreBefore} -> ${scoreAfter}, status ${reaudit.publishingReadiness}.`
          : `Revisi DITOLAK dan dibuang: skor turun ${scoreBefore} -> ${scoreAfter}. Draft lama dipertahankan.`,
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });

      if (!improved) break;
      if (String(reaudit.publishingReadiness || '').toUpperCase() === 'READY') break;
    } catch (err: any) {
      record(`audit-ulang-${revisionRound}`, `Re-Audit ${revisionRound}`, 'audit', 'failed', tReaudit, {
        reason: explain(err)
      });
      break;
    }
  }

  // Stage 5: image brief (needs content; audit is optional context)
  stage("Brief visual & caption");
  if (!outputs.generatedContent) {
    record('image', 'Image Brief', 'image', 'skipped', Date.now(), {
      reason: 'No generated content to base a visual concept on.'
    });
  } else {
    const t0 = Date.now();
    try {
      const { result, meta } = await runImageBriefAgent(businessData, outputs.seoStrategy, outputs.generatedContent, outputs.audit);
      outputs.imageBrief = result;
      record('image', 'Image Brief', 'image', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } catch (err: any) {
      record('image', 'Image Brief', 'image', 'failed', t0, { reason: explain(err) });
    }
  }

  // Readiness reflects what actually succeeded. Audit warnings are never silently
  // upgraded, and a bitmap/WebP asset is never implied from a brief alone.
  const auditStatus = String(outputs.audit?.publishingReadiness || '').toUpperCase();
  const blockers: string[] = [];
  if (!outputs.seoStrategy) blockers.push('Keyword strategy belum dihasilkan.');
  if (!outputs.generatedContent) blockers.push('Konten belum dihasilkan.');
  if (!outputs.audit) blockers.push('Audit kualitas belum dijalankan.');
  if (auditStatus === 'BLOCKED') blockers.push('Audit kualitas menandai status BLOCKED.');
  const humanActionRequired = outputs.audit ? humanRequiredOf(outputs.audit) : [];
  if (auditStatus === 'WARNINGS' || auditStatus === 'BLOCKED') {
    if (humanActionRequired.length > 0) {
      blockers.push(`${humanActionRequired.length} temuan audit butuh input pemilik usaha (lihat "Perlu Input Anda").`);
    }
    if (auditStatus === 'WARNINGS' && humanActionRequired.length === 0) {
      blockers.push(
        revisionHistory.length > 0
          ? `Audit masih WARNINGS setelah ${revisionHistory.length} kali revisi otomatis; sisa temuan perlu ditinjau manual.`
          : 'Audit kualitas menghasilkan WARNINGS yang perlu ditinjau.'
      );
    }
  }
  blockers.push('Gambar listing dibuat di tab Visual Aset (foto asli + caption), bukan oleh stage ini.');

  const failedStages = ledger.filter(entry => entry.status === 'failed');
  const skippedStages = ledger.filter(entry => entry.status === 'skipped');
  const pipelineStatus = failedStages.length === 0 && skippedStages.length === 0
    ? 'COMPLETE'
    : outputs.generatedContent ? 'PARTIAL' : 'FAILED';

  progress.finished = true;
  progress.label = "Selesai";
  progress.updatedAt = Date.now();
  setTimeout(() => ORCH_PROGRESS.delete(runId), ORCH_PROGRESS_TTL_MS).unref?.();

  res.json({
    ok: pipelineStatus !== 'FAILED',
    runId,
    pipelineStatus,
    readyForPublishing: false,
    blockers,
    ledger,
    outputs,
    revisionHistory,
    humanActionRequired,
    summary: {
      total: ledger.length,
      done: ledger.filter(e => e.status === 'done').length,
      failed: failedStages.length,
      skipped: skippedStages.length,
      fallbacksUsed: ledger.filter(e => e.fallbackOccurred).length,
      revisions: revisionHistory.length,
      revisionsAccepted: revisionHistory.filter(r => r.accepted).length
    },
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt
  });
});

// 7. DongkrakUsaha Connection Status & Account Login API
app.get("/api/dongkrakusaha/connection", async (req, res) => {
  const config = await adapter.validateConnection();
  res.json(config);
});

app.post("/api/dongkrakusaha/connection", async (req, res) => {
  const newConfig = req.body;
  const updated = await adapter.connect(newConfig);
  res.json(updated);
});

// Removed account-login and account-logout routes for manual assist workflow

// 7. Single Campaign Publishing Endpoint (Manual Assist Workflow)
app.post("/api/dongkrakusaha/mark-published", async (req, res) => {
  try {
    const { campaignId, publishedUrl, historyRecordId } = req.body;
    const campaign = campaignsStore.find(c => c.id === campaignId);

    if (!campaign) {
      return res.status(404).json({ success: false, errorMessage: `Campaign with ID '${campaignId}' not found.` });
    }

    if (!publishedUrl || !publishedUrl.startsWith('http')) {
      return res.status(400).json({ success: false, errorMessage: `Valid Published URL is required.` });
    }

    // Update campaign status to Published
    campaign.status = 'Published';

    const result: PublishResult = await adapter.markPublished(campaign, publishedUrl);

    campaign.externalListingId = result.externalListingId;
    campaign.publishedUrl = result.publishedUrl;
    campaign.updatedAt = new Date().toISOString();
    persistCampaigns();

    // If this finalizes an existing 'Submitted' history record (e.g. the URL was
    // added later from the History page), update that record in place instead of
    // creating a duplicate row for the same campaign.
    let historyRecord: PublishRecord | null = historyRecordId
      ? OfficialDongkrakUsahaAdapter.updateHistoryRecord(historyRecordId, {
          status: 'Published',
          externalListingId: result.externalListingId,
          publishedUrl: result.publishedUrl,
          accountUsed: result.accountUsed
        })
      : null;

    if (!historyRecord) {
      historyRecord = {
        id: `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        campaignId: campaign.id,
        businessName: campaign.businessData.name,
        campaignTitle: campaign.title,
        platform: 'DongkrakUsaha',
        publishedAt: new Date().toISOString(),
        status: 'Published',
        externalListingId: result.externalListingId,
        publishedUrl: result.publishedUrl,
        lastUpdated: new Date().toISOString(),
        accountUsed: result.accountUsed
      };
      OfficialDongkrakUsahaAdapter.addHistoryRecord(historyRecord);
    }

    return res.json({
      success: true,
      campaign,
      publishResult: result
    });
  } catch (err: any) {
    console.error("Publish Error:", err);
    res.status(500).json({ success: false, errorMessage: `Server error during publishing: ${err.message}` });

  }
});



// 8. Autopost Submit Confirmation Endpoint (dispatch + image upload succeeded, but
// DongkrakUsaha does not expose a public listing URL until ~24h later via its own
// "List DU1000" gate -- see PROJECT_KNOWLEDGE.md "Share web" / platform constraint
// finding). This records real evidence of a successful submit without fabricating a
// URL we don't have yet; the real URL is added later via mark-published once known.
app.post("/api/dongkrakusaha/mark-submitted", async (req, res) => {
  try {
    const { campaignId } = req.body;
    const campaign = campaignsStore.find(c => c.id === campaignId);

    if (!campaign) {
      return res.status(404).json({ success: false, errorMessage: `Campaign with ID '${campaignId}' not found.` });
    }

    campaign.status = 'Submitted';
    campaign.updatedAt = new Date().toISOString();
    persistCampaigns();

    const historyRecord: PublishRecord = {
      id: `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      campaignId: campaign.id,
      businessName: campaign.businessData.name,
      campaignTitle: campaign.title,
      platform: 'DongkrakUsaha',
      publishedAt: new Date().toISOString(),
      status: 'Submitted',
      lastUpdated: new Date().toISOString(),
      accountUsed: 'Browser Session User'
    };
    OfficialDongkrakUsahaAdapter.addHistoryRecord(historyRecord);

    return res.json({ success: true, campaign });
  } catch (err: any) {
    console.error("Mark Submitted Error:", err);
    res.status(500).json({ success: false, errorMessage: `Server error during submit bookkeeping: ${err.message}` });
  }
});

// 9. History API Endpoint
app.get("/api/dongkrakusaha/history", (req, res) => {
  res.json(OfficialDongkrakUsahaAdapter.getHistory());
});

// ------------------- VITE & STATIC SERVING -------------------

// Listing images are fetched by the extension's content script from INSIDE the
// dongkrakusaha.com tab, so every asset request is cross-origin. The Unsplash sample
// image worked only because Unsplash returns permissive CORS headers; a locally
// served file without them fails at `response.blob()` and the upload silently dies.
// These two directories hold generated/uploaded listing artwork only -- no secrets --
// so serving them with an open CORS header is safe and is what makes autopost work.
// Served through the storage layer so the SAME URLs work in both modes (local disk or
// GCS). URL shape is unchanged, which is what the extension and stored campaign image
// URLs depend on.
app.get(["/base-photos/:name", "/generated-images/:name"], async (req, res) => {
  const prefix = req.path.startsWith("/base-photos/") ? "base-photos/" : "generated-images/";
  const key = assetKeyFromPublicPath(prefix + req.params.name);
  if (!key) return res.status(400).end();
  try {
    const data = await storage.readBinary(key);
    if (!data) return res.status(404).end();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Content-Type", storage.contentTypeFor(key));
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(data);
  } catch (err: any) {
    console.error("[Assets] read failed:", err);
    res.status(500).end();
  }
});

async function startServer() {
  // Load persisted state before accepting traffic. In gcs mode this is the only way
  // data survives a container restart; in local mode it is the same disk read as before.
  await loadCampaigns();
  await OfficialDongkrakUsahaAdapter.loadHistory();
  await primeContractCache();
  await loadSlotState();
  await loadRetiredModels();

  // Startup summary: storage mode and which provider slots are configured -- NAMES
  // only, never values. This is the first thing to read in Cloud Run logs when an
  // agent reports "not configured".
  const configured = Object.values(FEATURE_MODEL_REGISTRY)
    .filter(c => c.provider === "gemini")
    .map(c => `${c.apiKeyEnv}=${process.env[c.apiKeyEnv]?.trim() ? "set" : "MISSING"}`);
  console.log(`[Startup] storage=${storage.STORAGE_MODE}${storage.STORAGE_MODE === "gcs" ? ` bucket=${process.env.GCS_BUCKET}` : ""} node_env=${process.env.NODE_ENV || "development"}`);
  console.log(`[Startup] keys: ${configured.join(", ")}`);
  console.log(`[Startup] cloudflare: ${process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN_BITMAP?.trim() ? "set" : "not configured"}`);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DongkrakUsaha AI Publisher Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
