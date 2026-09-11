import express from "express";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
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

// In-memory campaign store initialized with sample Indonesian business campaigns
let campaignsStore: Campaign[] = [...INITIAL_CAMPAIGNS];

// Lazy Gemini AI initialization helper
function getGeminiAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment variables.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

// ------------------- AI MODEL ROUTER & FALLBACK -------------------

interface ModelRegistryEntry {
  id: string;
  name: string;
  priority: number;
  available: boolean;
  status: 'AVAILABLE' | 'QUOTA_EXHAUSTED' | 'TEMPORARILY_UNAVAILABLE';
  lastError?: number;
  unavailableUntil?: number;
}

const MODEL_REGISTRY: ModelRegistryEntry[] = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", priority: 1, available: true, status: 'AVAILABLE' },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", priority: 2, available: true, status: 'AVAILABLE' },
  { id: "gemini-latest-pro", name: "Gemini Latest Pro", priority: 3, available: true, status: 'AVAILABLE' },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", priority: 4, available: true, status: 'AVAILABLE' },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", priority: 5, available: true, status: 'AVAILABLE' },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", priority: 6, available: true, status: 'AVAILABLE' }
];

async function generateWithFallback(options: { contents: any, config: any }) {
  const ai = getGeminiAI();
  const now = Date.now();
  
  // 1. Recovery Check: restore models whose cooldown has passed
  for (const model of MODEL_REGISTRY) {
    if (!model.available && model.unavailableUntil && now > model.unavailableUntil) {
      model.available = true;
      model.status = 'AVAILABLE';
      console.log(`[AI Router] Model ${model.id} cooldown finished. Restored as available.`);
    }
  }

  // 2. Select available models by priority (highest quality/preference first)
  const availableModels = MODEL_REGISTRY.filter(m => m.available).sort((a, b) => a.priority - b.priority);
  
  if (availableModels.length === 0) {
    throw new Error("All configured Gemini models are currently unavailable.");
  }

  const errors = [];
  const primaryModelId = MODEL_REGISTRY[0].id;
  let fallbackOccurred = false;

  for (const model of availableModels) {
    try {
      if (model.id !== primaryModelId) {
        fallbackOccurred = true;
      }
      
      console.log(`[AI Router] Attempting generation with model: ${model.id}`);
      
      const response = await ai.models.generateContent({
        model: model.id,
        contents: options.contents,
        config: options.config
      });

      return {
        modelUsed: model.id,
        modelName: model.name,
        fallbackOccurred,
        response
      };
      
    } catch (err: any) {
      console.error(`[AI Router] Model ${model.id} failed:`, err.message);
      
      const status = err.status || err.code || 500;
      const msg = (err.message || "").toUpperCase();
      
      const isQuota = status === 429 || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("QUOTA") || msg.includes("RATE LIMIT");
      const isTemporary = (status >= 500 && status < 600) || msg.includes("TIMEOUT") || msg.includes("TEMPORARILY UNAVAILABLE");
      const isNotFound = status === 404 || msg.includes("NOT FOUND");
      const isAuth = status === 401 || status === 403 || msg.includes("API_KEY_INVALID");
      const isSafety = msg.includes("SAFETY") || msg.includes("BLOCKED");
      const isInvalid = status === 400 || msg.includes("INVALID_ARGUMENT") || msg.includes("BAD_REQUEST");

      // Critical errors that shouldn't trigger fallback
      if (isAuth || isInvalid || isSafety) {
        throw err;
      }

      errors.push({ model: model.id, status, error: err.message });
      
      // Update model health
      const modelEntry = MODEL_REGISTRY.find(m => m.id === model.id);
      if (modelEntry) {
        modelEntry.available = false;
        modelEntry.lastError = status;
        
        if (isQuota) {
          modelEntry.status = 'QUOTA_EXHAUSTED';
          modelEntry.unavailableUntil = now + 15 * 60 * 1000; // 15 mins cooldown
        } else if (isTemporary) {
          modelEntry.status = 'TEMPORARILY_UNAVAILABLE';
          modelEntry.unavailableUntil = now + 5 * 60 * 1000; // 5 mins cooldown
        } else if (isNotFound) {
           modelEntry.unavailableUntil = now + 24 * 60 * 60 * 1000; // 24 hours cooldown
        } else {
           modelEntry.unavailableUntil = now + 2 * 60 * 1000; // unknown error, 2 mins cooldown
        }
      }
    }
  }

  throw new Error(`All configured Gemini models failed. \nDetails: ${JSON.stringify(errors)}`);
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

// AI Model Status API
app.get("/api/gemini/status", (req, res) => {
  try {
    // Briefly re-evaluate cooldowns before returning
    const now = Date.now();
    for (const model of MODEL_REGISTRY) {
      if (!model.available && model.unavailableUntil && now > model.unavailableUntil) {
        model.available = true;
        model.status = 'AVAILABLE';
      }
    }
    res.json(MODEL_REGISTRY);
  } catch {
    res.json(MODEL_REGISTRY);
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
  res.json(newCampaign);
});

app.put("/api/campaigns/:id", (req, res) => {
  const { id } = req.params;
  const index = campaignsStore.findIndex(c => c.id === id);
  if (index >= 0) {
    campaignsStore[index] = { ...campaignsStore[index], ...req.body, updatedAt: new Date().toISOString() };
    return res.json(campaignsStore[index]);
  }
  res.status(404).json({ error: "Campaign not found" });
});

// 3. Gemini SEO Research Route
app.post("/api/gemini/research", async (req, res) => {
  try {
    const { businessName, category, description, productsServices, targetCities } = req.body;
    const ai = getGeminiAI();

    const prompt = `Anda adalah Spesialis Local SEO Indonesia untuk platform bisnis directory seperti DongkrakUsaha.
Lakukan Keyword Research dan Strategi SEO untuk bisnis berikut:
- Nama Bisnis: ${businessName}
- Kategori: ${category}
- Deskripsi: ${description}
- Produk / Layanan: ${Array.isArray(productsServices) ? productsServices.join(', ') : productsServices}
- Kota Target: ${Array.isArray(targetCities) ? targetCities.join(', ') : targetCities}

Berikan output JSON terstruktur dengan format berikut:
{
  "mainKeyword": "string - keyword utama lokal intent yang sangat relevan",
  "secondaryKeywords": ["string", "string", "string"],
  "lsiKeywords": ["string", "string", "string"],
  "searchIntent": "Local Intent" | "Transactional" | "Commercial" | "Informational",
  "targetCities": ["string"],
  "contentAngle": "string - sudut pandang promosi yang meyakinkan tanpa klaim palsu"
}`;

    const { modelUsed, modelName, fallbackOccurred, response } = await generateWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mainKeyword: { type: Type.STRING },
            secondaryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            lsiKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            searchIntent: { type: Type.STRING },
            targetCities: { type: Type.ARRAY, items: { type: Type.STRING } },
            contentAngle: { type: Type.STRING }
          },
          required: ["mainKeyword", "secondaryKeywords", "lsiKeywords", "searchIntent", "targetCities", "contentAngle"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    res.json({
      ...result,
      _meta: { modelUsed, modelName, fallbackOccurred }
    });
  } catch (err: any) {
    console.error("Gemini Research Error:", err);
    res.status(500).json({ error: err.message || "Failed to run AI Keyword Research" });
  }
});

// 4. Gemini Content Generator Route
app.post("/api/gemini/generate-content", async (req, res) => {
  try {
    const { businessData, seoStrategy } = req.body;
    const ai = getGeminiAI();

    const prompt = `Anda adalah pakar Copywriting Local SEO Indonesia untuk listing bisnis di DongkrakUsaha (dongkrakusaha.com).

Data Bisnis:
- Nama: ${businessData.name}
- Kategori: ${businessData.category}
- Deskripsi Asli: ${businessData.description}
- Layanan/Produk: ${Array.isArray(businessData.productsServices) ? businessData.productsServices.join(', ') : businessData.productsServices}
- Kota Target: ${Array.isArray(seoStrategy?.targetCities) ? seoStrategy.targetCities.join(', ') : businessData.targetCities.join(', ')}
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
6. Tulis deskripsi lengkap (SEO Content) yang terstruktur rapi.

Format JSON Response:
{
  "seoTitle": "string",
  "metaDescription": "string",
  "seoDescription": "string",
  "shortSnippet": "string",
  "productHighlights": ["string"],
  "callToAction": "string",
  "mappedCategory": "string",
  "tags": ["string"]
}`;

    const { modelUsed, modelName, fallbackOccurred, response } = await generateWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            seoTitle: { type: Type.STRING },
            metaDescription: { type: Type.STRING },
            seoDescription: { type: Type.STRING },
            shortSnippet: { type: Type.STRING },
            productHighlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            callToAction: { type: Type.STRING },
            mappedCategory: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["seoTitle", "metaDescription", "seoDescription", "shortSnippet", "productHighlights", "callToAction", "mappedCategory", "tags"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    res.json({
      ...result,
      _meta: { modelUsed, modelName, fallbackOccurred }
    });
  } catch (err: any) {
    console.error("Gemini Content Generation Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate AI content" });
  }
});

// 5. Gemini AI Quality Control Route
app.post("/api/gemini/validate", async (req, res) => {
  try {
    const { campaign } = req.body;
    const ai = getGeminiAI();

    const prompt = `Evaluasi Kualitas SEO dan Kesiapan Publishing untuk listing DongkrakUsaha berikut:

Title: ${campaign.generatedContent?.seoTitle || campaign.businessData.name}
Meta Description: ${campaign.generatedContent?.metaDescription || ''}
SEO Content: ${campaign.generatedContent?.seoDescription || campaign.businessData.description}
Main Keyword: ${campaign.seoStrategy?.mainKeyword || campaign.businessData.mainKeyword}
Target Cities: ${campaign.businessData.targetCities.join(', ')}
Category: ${campaign.businessData.category}
WhatsApp/Phone: ${campaign.businessData.phoneWhatsApp}
Address: ${campaign.businessData.address}

Jalankan evaluasi komprehensif:
1. Keyword Relevance & Stuffing check
2. Location Relevance check
3. Factual Consistency check
4. Missing Required Business Info check
5. Quality Scores (0-100)

Return Output JSON format:
{
  "seoScore": number (0-100),
  "contentQuality": number (0-100),
  "localRelevance": number (0-100),
  "publishingReadiness": "READY" | "WARNINGS" | "BLOCKED",
  "findings": [
    {
      "type": "pass" | "warning" | "error",
      "category": "Keywords" | "Location" | "Factual Consistency" | "Duplicate Content" | "Required Fields",
      "message": "string"
    }
  ]
}`;

    const { modelUsed, modelName, fallbackOccurred, response } = await generateWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
            }
          },
          required: ["seoScore", "contentQuality", "localRelevance", "publishingReadiness", "findings"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    res.json({
      ...result,
      _meta: { modelUsed, modelName, fallbackOccurred }
    });
  } catch (err: any) {
    console.error("Gemini Validation Error:", err);
    res.status(500).json({ error: err.message || "Failed to run AI Quality Control validation" });
  }
});

// 6. DongkrakUsaha Connection Status & Account Login API
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
    const { campaignId, publishedUrl } = req.body;
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

    // Record in History Store
    const historyRecord: PublishRecord = {
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



// 9. History API Endpoint
app.get("/api/dongkrakusaha/history", (req, res) => {
  res.json(OfficialDongkrakUsahaAdapter.getHistory());
});

// ------------------- VITE & STATIC SERVING -------------------

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
