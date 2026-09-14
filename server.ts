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
import { 
  OfficialDongkrakUsahaAdapter, 
  PublishResult 
} from "./server/dongkrakusahaAdapter";
import { INITIAL_CAMPAIGNS } from "./src/data/sampleBusinesses";
import { Campaign, PublishRecord } from "./src/types";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize DongkrakUsaha Publisher Adapter
const adapter = new OfficialDongkrakUsahaAdapter();

// Campaigns used to live only in memory, seeded from the samples on every boot. That
// meant any restart -- which happens constantly during development -- silently threw
// away real user work and reset the list back to the three samples. Campaigns are now
// persisted to disk and the samples are only used to seed a first run.
const CAMPAIGN_FILE = path.join(process.cwd(), "data", "campaigns.json");

function loadCampaignsFromDisk(): Campaign[] {
  try {
    if (!fs.existsSync(CAMPAIGN_FILE)) return [...INITIAL_CAMPAIGNS];
    const parsed = JSON.parse(fs.readFileSync(CAMPAIGN_FILE, "utf-8"));
    // An empty stored array is a legitimate state (user deleted everything); only a
    // missing/corrupt file falls back to the samples.
    return Array.isArray(parsed) ? parsed : [...INITIAL_CAMPAIGNS];
  } catch (err) {
    console.error("[Campaigns] Could not read stored campaigns, seeding from samples:", err);
    return [...INITIAL_CAMPAIGNS];
  }
}

let campaignsStore: Campaign[] = loadCampaignsFromDisk();

function persistCampaigns() {
  try {
    fs.mkdirSync(path.dirname(CAMPAIGN_FILE), { recursive: true });
    fs.writeFileSync(CAMPAIGN_FILE, JSON.stringify(campaignsStore, null, 2));
  } catch (err) {
    console.error("[Campaigns] Failed to persist campaigns:", err);
  }
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
      }
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
  temporary: 5 * 60 * 1000,
  notFound: 24 * 60 * 60 * 1000,
  unknown: 2 * 60 * 1000
};

const MODEL_SLOT_STATE = new Map<string, ModelSlotState>();

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

async function generateWithFallback(options: { feature?: FeatureName, contents: any, config: any }) {
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
  ].slice(0, MAX_CHAIN_LENGTH);

  const orderedSlots = extendedChain
    .map(modelId => getSlotState(keyFingerprint, modelId))
    .filter(slot => slot.available);

  if (orderedSlots.length === 0) {
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

      const response = await ai.models.generateContent({
        model: slot.modelId,
        contents: options.contents,
        config: options.config
      });

      slot.successCount++;
      slot.lastUsedAt = Date.now();
      attempts.push({ model: slot.modelId, ok: true });

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
        slot.status = 'QUOTA_EXHAUSTED';
        slot.unavailableUntil = Date.now() + COOLDOWN_MS.quota;
      } else if (classified.isNotFound) {
        slot.status = 'MODEL_NOT_FOUND';
        slot.unavailableUntil = Date.now() + COOLDOWN_MS.notFound;
      } else if (classified.isTemporary) {
        slot.status = 'TEMPORARILY_UNAVAILABLE';
        slot.unavailableUntil = Date.now() + COOLDOWN_MS.temporary;
      } else {
        slot.status = 'ERROR';
        slot.unavailableUntil = Date.now() + COOLDOWN_MS.unknown;
      }
    }
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
      ].slice(0, MAX_CHAIN_LENGTH);

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

function loadAgentContract(contractFile: string): string {
  const filePath = path.join(AGENT_CONTRACTS_DIR, contractFile);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error(`[Agent Contract] Could not read ${contractFile}, proceeding without it:`, err);
    return "";
  }
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
    const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
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

    const capped = [...existingEntries, newEntry].slice(-MAX_SELF_IMPROVEMENT_ENTRIES);
    fs.writeFileSync(filePath, `${head}${capped.join("\n")}\n${tail ? "\n" + tail : ""}`);
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
          message: { type: Type.STRING }
        },
        required: ["type", "category", "message"]
      }
    },
    selfImprovementNote: { type: Type.STRING }
  },
  required: ["seoScore", "contentQuality", "localRelevance", "publishingReadiness", "findings"]
};

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

publishingReadiness harus salah satu dari: READY, WARNINGS, BLOCKED.`;

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
    const outputDir = path.join(process.cwd(), "public", "generated-images");
    fs.mkdirSync(outputDir, { recursive: true });
    const fileName = `dongkrak-${Date.now()}.${extension}`;
    fs.writeFileSync(path.join(outputDir, fileName), Buffer.from(image.data, "base64"));
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

const BASE_PHOTO_DIR = path.join(process.cwd(), "public", "base-photos");

// Shared guard: a caller-supplied path must stay inside public/ (no traversal).
function resolvePublicPath(candidate: string): string | null {
  const publicRoot = path.resolve(process.cwd(), "public");
  const resolved = path.resolve(publicRoot, candidate.replace(/^\/+/, ""));
  if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${path.sep}`)) return null;
  return resolved;
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

function buildCaptionSvg(width: number, height: number, title: string, subtitle: string, badge?: string): Buffer {
  const barH = Math.round(height * 0.18);
  const padX = Math.round(width * 0.06);
  const titleSize = Math.round(height * 0.058);
  const subtitleSize = Math.round(height * 0.036);

  const badgeBlock = badge
    ? `<g>
         <rect x="${padX}" y="${Math.round(height * 0.05)}" rx="${Math.round(height * 0.012)}"
               width="${Math.min(width - padX * 2, badge.length * titleSize * 0.62 + padX)}"
               height="${Math.round(height * 0.062)}" fill="#dc2626"/>
         <text x="${padX + Math.round(height * 0.018)}" y="${Math.round(height * 0.05 + height * 0.045)}"
               font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(height * 0.032)}"
               font-weight="700" fill="#ffffff">${escapeXml(badge)}</text>
       </g>`
    : "";

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
      <text x="${padX}" y="${height - barH * 0.72}" font-family="Segoe UI, Arial, sans-serif"
            font-size="${titleSize}" font-weight="700" fill="#ffffff">${escapeXml(title)}</text>
      ${subtitle ? `<text x="${padX}" y="${height - barH * 0.26}" font-family="Segoe UI, Arial, sans-serif"
            font-size="${subtitleSize}" fill="#e2e8f0">${escapeXml(subtitle)}</text>` : ""}
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

  fs.mkdirSync(BASE_PHOTO_DIR, { recursive: true });
  const fileName = `${slug}.jpg`;
  const normalised = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(BASE_PHOTO_DIR, fileName), normalised);

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

app.get("/api/image/base-photos", (req, res) => {
  try {
    if (!fs.existsSync(BASE_PHOTO_DIR)) return res.json({ basePhotos: [] });
    const basePhotos = fs.readdirSync(BASE_PHOTO_DIR)
      .filter(name => /\.(jpe?g|png|webp)$/i.test(name))
      .map(name => {
        const stat = fs.statSync(path.join(BASE_PHOTO_DIR, name));
        return {
          slug: name.replace(/\.[^.]+$/, ""),
          basePath: `/base-photos/${name}`,
          bytes: stat.size,
          updatedAt: stat.mtime.toISOString()
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
      const resolved = resolvePublicPath(basePath);
      if (!resolved) {
        return res.status(400).json({ error: "Base path must remain inside the public directory." });
      }
      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: "Base photo was not found. Upload one for this category first." });
      }
      sourceBuffer = fs.readFileSync(resolved);
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
    const outputDir = path.join(process.cwd(), "public", "generated-images");
    fs.mkdirSync(outputDir, { recursive: true });
    const fileName = `composed-${Date.now()}.${outputFormat === "jpeg" ? "jpg" : outputFormat}`;
    fs.writeFileSync(path.join(outputDir, fileName), rendered);

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
      const publicRoot = path.resolve(process.cwd(), "public");
      const requestedPath = path.resolve(publicRoot, sourcePath.replace(/^\/+/, ""));
      if (requestedPath !== publicRoot && !requestedPath.startsWith(`${publicRoot}${path.sep}`)) {
        return res.status(400).json({ error: "Source path must remain inside the public directory." });
      }
      if (!fs.existsSync(requestedPath)) {
        return res.status(404).json({ error: "Source image was not found." });
      }
      sourceBuffer = fs.readFileSync(requestedPath);
      originalPath = requestedPath;
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

    const outputDir = path.join(process.cwd(), "public", "generated-images");
    fs.mkdirSync(outputDir, { recursive: true });
    const fileName = `dongkrak-${Date.now()}.webp`;
    const outputPath = path.join(outputDir, fileName);
    const converted = await sharp(sourceBuffer).webp({ quality: numericQuality }).toBuffer();
    fs.writeFileSync(outputPath, converted);

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
type StageName = 'plan' | 'strategy' | 'keyword' | 'content' | 'audit' | 'image' | `content-revisi-${number}` | `audit-ulang-${number}`;

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
    campaign
  } = req.body || {};

  if (!businessData) {
    return res.status(400).json({ error: "businessData is required to run the orchestrator pipeline." });
  }

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
  };

  // Turns a thrown provider/config error into a short, user-actionable reason.
  const explain = (err: any) => String(err?.message || 'Unknown error').slice(0, 400);

  // Stage 0: orchestrator briefing (advisory, non-fatal)
  {
    const t0 = Date.now();
    try {
      const { result, meta } = await runOrchestratorPlan(businessData, objective);
      outputs.plan = result;
      record('plan', 'Orchestrator', 'orchestrator', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } catch (err: any) {
      record('plan', 'Orchestrator', 'orchestrator', 'failed', t0, { reason: explain(err) });
    }
  }

  // Stage 1: campaign strategy (independent)
  {
    const t0 = Date.now();
    try {
      const { result, meta } = await runStrategyAgent(businessData, objective);
      outputs.strategy = result;
      record('strategy', 'Campaign Strategy', 'strategy', 'done', t0, {
        modelUsed: meta.modelUsed, modelName: meta.modelName,
        fallbackOccurred: meta.fallbackOccurred, keyFingerprint: meta.keyFingerprint, attempts: meta.attempts
      });
    } catch (err: any) {
      record('strategy', 'Campaign Strategy', 'strategy', 'failed', t0, { reason: explain(err) });
    }
  }

  // Stage 2: keyword strategy (uses strategy when available, still runs without it)
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
  while (
    outputs.audit &&
    outputs.generatedContent &&
    ['WARNINGS', 'BLOCKED'].includes(String(outputs.audit.publishingReadiness || '').toUpperCase()) &&
    revisionRound < MAX_REVISIONS
  ) {
    revisionRound++;
    const auditBefore = outputs.audit;
    const scoreBefore = Number(auditBefore.seoScore) || 0;

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
    try {
      const { result: reaudit, meta } = await runAuditAgent({
        businessData,
        seoStrategy: outputs.seoStrategy,
        generatedContent: rewritten,
        ...(campaign || {})
      });

      // Only keep the rewrite if the auditor actually rates it better. A revision that
      // scores worse is discarded, so the loop cannot degrade a draft.
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
  if (auditStatus === 'WARNINGS') {
    blockers.push(
      revisionHistory.length > 0
        ? `Audit masih WARNINGS setelah ${revisionHistory.length} kali revisi otomatis; sisa temuan perlu ditinjau manual.`
        : 'Audit kualitas menghasilkan WARNINGS yang perlu ditinjau.'
    );
  }
  blockers.push('Gambar listing dibuat di tab Visual Aset (foto asli + caption), bukan oleh stage ini.');

  const failedStages = ledger.filter(entry => entry.status === 'failed');
  const skippedStages = ledger.filter(entry => entry.status === 'skipped');
  const pipelineStatus = failedStages.length === 0 && skippedStages.length === 0
    ? 'COMPLETE'
    : outputs.generatedContent ? 'PARTIAL' : 'FAILED';

  res.json({
    ok: pipelineStatus !== 'FAILED',
    pipelineStatus,
    readyForPublishing: false,
    blockers,
    ledger,
    outputs,
    revisionHistory,
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
const CORS_ASSET_DIRS = ["generated-images", "base-photos"];
for (const dir of CORS_ASSET_DIRS) {
  app.use(
    `/${dir}`,
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(process.cwd(), "public", dir))
  );
}

async function startServer() {
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
