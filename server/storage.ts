// Persistence backend for everything the app writes at runtime: campaigns, publish
// history, base photos, generated images, and the agents' self-improvement logs.
//
// Three modes:
//   local      -> the local disk under process.cwd(), exactly as before. The proven
//                 path for laptops/LAN and the fallback if hosting fails.
//   gcs        -> a Google Cloud Storage bucket (GCS_BUCKET). Needs a standard Google
//                 Cloud project with billing; the bucket is created at boot if missing.
//   firestore  -> a Firestore collection. This is what the AI Studio "Starter Tier"
//                 project offers without billing or IAM changes (Cloud Storage is NOT
//                 available there and IAM roles cannot be granted -- verified against
//                 Google's docs on 2026-09-17). Objects > ~900 KB are split into
//                 chunk documents because a Firestore document is capped at 1 MiB.
//
// Mode selection: STORAGE_BACKEND if set; else gcs when GCS_BUCKET is set; else
// firestore when running on Cloud Run (K_SERVICE is set -- the container disk there
// is disposable, so local mode would only pretend to save); else local.
//
// Keys are POSIX-style relative paths ("data/campaigns.json", "base-photos/x.jpg").
// In local mode a key maps to <cwd>/<key> for data/, and <cwd>/public/<key> for the two
// asset directories, preserving the on-disk layout the rest of the app already uses.
import fs from "fs";
import path from "path";
import { adminTransport, restTransport, resolveTarget, selectTransport, type Transport } from "./firestoreTransport";

const ASSET_PREFIXES = ["base-photos/", "generated-images/"];

export type StorageMode = "local" | "gcs" | "firestore";

const BUCKET_NAME = (process.env.GCS_BUCKET || "").trim();
const FIRESTORE_COLLECTION = (process.env.FIRESTORE_COLLECTION || "du_storage").trim();
const FIRESTORE_CHUNKS = `${FIRESTORE_COLLECTION}_chunks`;
// Project / database / API key: env, else AI Studio's firebase-applet-config.json
// (see firestoreTransport.ts). The container may run in a Google sandbox project while
// Firestore lives in the owner's project, so nothing here relies on the metadata default.
const TARGET = resolveTarget();
const FIRESTORE_PROJECT = TARGET.projectId || "";
const FIRESTORE_DATABASE = TARGET.databaseId || "";
const CHUNK_BYTES = 900_000; // under Firestore's 1 MiB document limit with headroom for fields

function decideMode(): StorageMode {
  const explicit = (process.env.STORAGE_BACKEND || "").trim().toLowerCase();
  if (explicit === "local" || explicit === "gcs" || explicit === "firestore") return explicit;
  if (BUCKET_NAME) return "gcs";
  if (process.env.K_SERVICE) return "firestore";
  return "local";
}
export const STORAGE_MODE: StorageMode = decideMode();

// Human label for logs and the Koneksi status line.
export function backendLabel(): string {
  if (STORAGE_MODE === "gcs") return `bucket ${BUCKET_NAME}`;
  if (STORAGE_MODE === "firestore") return `Firestore ${FIRESTORE_PROJECT || "(project dari metadata)"} / ${FIRESTORE_DATABASE || "(default)"} · koleksi ${FIRESTORE_COLLECTION}${activeTransport ? ` · via ${activeTransport.name}` : ""}`;
  return "disk lokal";
}

function localPathFor(key: string): string {
  const isAsset = ASSET_PREFIXES.some(p => key.startsWith(p));
  return path.join(process.cwd(), isAsset ? "public" : "", key);
}

// ---- GCS (lazy so other modes never load the client) ----
let bucketPromise: Promise<any> | null = null;
async function bucket() {
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const { Storage } = await import("@google-cloud/storage");
      // Credentials come from Application Default Credentials: on Cloud Run that is the
      // service's own service account, no key file needed.
      return new Storage().bucket(BUCKET_NAME);
    })();
  }
  return bucketPromise;
}

// ---- Firestore: a transport chosen at boot (see firestoreTransport.ts) ----
let activeTransport: Transport | null = null;
let transportAttempts: Array<{ name: string; error: string }> = [];
let transportOverride: Transport | null = null;
export function __setFirestoreForTests(client: any) { transportOverride = adminTransport(client); activeTransport = transportOverride; }
export function activeTransportName(): string | null { return activeTransport?.name ?? null; }

async function makeAdmin(): Promise<Transport> {
  const { Firestore } = await import("@google-cloud/firestore");
  return adminTransport(new Firestore({
    ...(FIRESTORE_PROJECT ? { projectId: FIRESTORE_PROJECT } : {}),
    ...(FIRESTORE_DATABASE ? { databaseId: FIRESTORE_DATABASE } : {})
  }));
}
// Order matters: the service account is the proper path where it has IAM access; the
// REST paths are what AI Studio's sandbox needs (its service account has none).
async function chooseTransport(): Promise<{ transport: Transport | null; attempts: typeof transportAttempts }> {
  if (transportOverride) return { transport: transportOverride, attempts: [] };
  const restTarget = { projectId: FIRESTORE_PROJECT, databaseId: FIRESTORE_DATABASE || "(default)", apiKey: TARGET.apiKey };
  const candidates: Array<() => Promise<Transport>> = [makeAdmin];
  if (TARGET.apiKey && FIRESTORE_PROJECT) {
    candidates.push(async () => restTransport(restTarget, true));
    candidates.push(async () => restTransport(restTarget, false));
  }
  const result = await selectTransport(candidates, FIRESTORE_COLLECTION);
  activeTransport = result.transport;
  transportAttempts = result.attempts;
  return result;
}
async function transport(): Promise<Transport> {
  if (activeTransport) return activeTransport;
  const r = await chooseTransport();
  if (!r.transport) throw new Error(r.attempts.map(a => `${a.name}: ${a.error}`).join(" | ") || "no Firestore transport");
  return r.transport;
}
const docId = (key: string) => encodeURIComponent(key);

async function fsWrite(key: string, data: Buffer, kind: "text" | "binary"): Promise<void> {
  const t = await transport();
  // Drop stale chunks from a previous, larger version of the same key.
  for (const old of await t.queryKeyEq(FIRESTORE_CHUNKS, key)) await t.deleteDoc(FIRESTORE_CHUNKS, old.id);
  const meta = { key, kind, contentType: contentTypeFor(key), size: data.length, updatedAt: new Date().toISOString() };
  if (data.length <= CHUNK_BYTES) {
    await t.setDoc(FIRESTORE_COLLECTION, docId(key), { ...meta, chunks: 0, data });
    return;
  }
  const n = Math.ceil(data.length / CHUNK_BYTES);
  for (let i = 0; i < n; i++) {
    await t.setDoc(FIRESTORE_CHUNKS, `${docId(key)}%23${i}`, { key, part: i, data: data.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) });
  }
  await t.setDoc(FIRESTORE_COLLECTION, docId(key), { ...meta, chunks: n });
}

async function fsRead(key: string): Promise<Buffer | null> {
  const t = await transport();
  const d = await t.getDoc(FIRESTORE_COLLECTION, docId(key));
  if (!d) return null;
  const chunks = Number(d.chunks || 0);
  if (!chunks) return Buffer.isBuffer(d.data) ? d.data : Buffer.from([]);
  const parts: Buffer[] = [];
  for (let i = 0; i < chunks; i++) {
    const c = await t.getDoc(FIRESTORE_CHUNKS, `${docId(key)}%23${i}`);
    if (!c || !Buffer.isBuffer(c.data)) throw new Error(`Firestore object ${key} is missing chunk ${i}/${chunks}`);
    parts.push(c.data);
  }
  return Buffer.concat(parts);
}

export async function readText(key: string): Promise<string | null> {
  if (STORAGE_MODE === "local") {
    const p = localPathFor(key);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
  }
  if (STORAGE_MODE === "firestore") {
    const buf = await fsRead(key);
    return buf ? buf.toString("utf-8") : null;
  }
  const file = (await bucket()).file(key);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  return buf.toString("utf-8");
}

export async function writeText(key: string, text: string): Promise<void> {
  if (STORAGE_MODE === "local") {
    const p = localPathFor(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    return;
  }
  if (STORAGE_MODE === "firestore") return fsWrite(key, Buffer.from(text, "utf-8"), "text");
  await (await bucket()).file(key).save(text, { contentType: contentTypeFor(key), resumable: false });
}

export async function readBinary(key: string): Promise<Buffer | null> {
  if (STORAGE_MODE === "local") {
    const p = localPathFor(key);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }
  if (STORAGE_MODE === "firestore") return fsRead(key);
  const file = (await bucket()).file(key);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  return buf;
}

export async function writeBinary(key: string, data: Buffer): Promise<void> {
  if (STORAGE_MODE === "local") {
    const p = localPathFor(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
    return;
  }
  if (STORAGE_MODE === "firestore") return fsWrite(key, data, "binary");
  await (await bucket()).file(key).save(data, { contentType: contentTypeFor(key), resumable: false });
}

export interface StoredEntry { key: string; bytes: number; updatedAt: string; }

export async function list(prefix: string): Promise<StoredEntry[]> {
  if (STORAGE_MODE === "local") {
    const dir = localPathFor(prefix);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(name => fs.statSync(path.join(dir, name)).isFile())
      .map(name => {
        const stat = fs.statSync(path.join(dir, name));
        return { key: prefix + name, bytes: stat.size, updatedAt: stat.mtime.toISOString() };
      });
  }
  if (STORAGE_MODE === "firestore") {
    // Range query on the single "key" field (auto-indexed); chunks live in their own
    // collection so no composite index is needed.
    const rows = await (await transport()).queryKeyRange(FIRESTORE_COLLECTION, prefix, prefix + "");
    return rows.map(v => ({ key: String(v.key), bytes: Number(v.size || 0), updatedAt: String(v.updatedAt || new Date().toISOString()) }));
  }
  const [files] = await (await bucket()).getFiles({ prefix });
  return files
    .filter((f: any) => !f.name.endsWith("/"))
    .map((f: any) => ({
      key: f.name,
      bytes: Number(f.metadata?.size || 0),
      updatedAt: String(f.metadata?.updated || new Date().toISOString())
    }));
}

export async function remove(key: string): Promise<void> {
  if (STORAGE_MODE === "local") {
    const p = localPathFor(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return;
  }
  if (STORAGE_MODE === "firestore") {
    const t = await transport();
    for (const old of await t.queryKeyEq(FIRESTORE_CHUNKS, key)) await t.deleteDoc(FIRESTORE_CHUNKS, old.id);
    await t.deleteDoc(FIRESTORE_COLLECTION, docId(key));
    return;
  }
  await (await bucket()).file(key).delete({ ignoreNotFound: true });
}

// ---- Readiness ----

// gcs: creates the bucket on first boot if it does not exist (needs storage.buckets.create,
// i.e. Storage Admin on the project -- NOT available in a Starter Tier project).
// firestore: verifies the database answers at all (a read that may legitimately find nothing).
export async function ensureBackend(): Promise<{ mode: StorageMode; bucket: string | null; existed: boolean; created: boolean; error?: string }> {
  const base = { mode: STORAGE_MODE, bucket: STORAGE_MODE === "gcs" ? BUCKET_NAME : null };
  if (STORAGE_MODE === "local") return { ...base, existed: true, created: false };
  try {
    if (STORAGE_MODE === "firestore") {
      activeTransport = transportOverride; // re-evaluate on every check (operator's "periksa ulang")
      const r = await chooseTransport();
      if (!r.transport) {
        const detail = r.attempts.map(a => `[${a.name}] ${a.error}`).join(" · ");
        return { ...base, existed: false, created: false, error: detail || "no transport could reach Firestore" };
      }
      return { ...base, existed: true, created: false };
    }
    const { Storage } = await import("@google-cloud/storage");
    const client = new Storage();
    const [exists] = await client.bucket(BUCKET_NAME).exists();
    if (exists) return { ...base, existed: true, created: false };
    await client.createBucket(BUCKET_NAME, {
      location: (process.env.GCS_LOCATION || "asia-southeast2").trim(),
      storageClass: "STANDARD",
      iam: { uniformBucketLevelAccess: { enabled: true } }
    } as any);
    return { ...base, existed: false, created: true };
  } catch (err: any) {
    return { ...base, existed: false, created: false, error: String(err?.message || err).slice(0, 300) };
  }
}
// Old name kept for callers/docs written before the Firestore backend existed.
export const ensureBucket = ensureBackend;

export interface StorageProbe {
  mode: StorageMode;
  label: string;
  bucket: string | null;
  persistent: boolean;      // true only when writes survive a container restart
  ok: boolean;              // write -> read -> delete round trip succeeded
  latencyMs: number;
  error?: string;
  hint?: string;            // what to do about the error, for the operator
  checkedAt: string;
}

// Maps the provider's error text to what the operator should do about it.
export function hintFor(msg: string): string | undefined {
  if (STORAGE_MODE === "local") return undefined;
  if (STORAGE_MODE === "firestore") {
    if (/has not been used|is disabled|firestore.googleapis.com|Enable it by visiting/i.test(msg)) return "API Firestore belum diaktifkan / database belum disediakan di project ini. Di AI Studio: minta agent-nya menjalankan penyediaan Firestore (set_up_firebase) TANPA mengubah file repo, lalu periksa ulang. Di project standar: Cloud Console -> Firestore -> Create database (Native, Jakarta).";
    if (/NOT_FOUND|does not exist|no database|not found/i.test(msg)) return "Database Firestore belum ada di project ini. Di AI Studio: minta agent-nya menyediakan Firestore untuk app ini (atau Cloud Console -> Firestore -> Create database, mode Native, region Jakarta), lalu periksa ulang.";
    if (/no Firestore transport|\[rest-/i.test(msg) && /PERMISSION_DENIED|403|Missing or insufficient permissions/i.test(msg)) return "Semua jalur ditolak: service account container tidak punya akses IAM, dan Security Rules Firestore menolak client (anonim maupun tanpa login). Perbaikan di Firebase Console -> Firestore -> Rules: izinkan koleksi du_storage dan du_storage_chunks untuk request.auth != null, dan aktifkan provider Anonymous di Authentication -> Sign-in method. Lalu periksa ulang.";
    if (/anonymous sign-in failed/i.test(msg)) return "Provider Anonymous belum aktif di Firebase Authentication (Sign-in method -> Anonymous -> Enable), atau rules menolak client tanpa login.";
    if (/REST transport needs a Firebase web API key/i.test(msg)) return "API key Firebase tidak ditemukan: set FIREBASE_API_KEY, atau pastikan firebase-applet-config.json ada di folder app.";
    if (/PERMISSION_DENIED|403|permission|forbidden/i.test(msg)) return `Service account container (project sandbox) tidak diizinkan mengakses Firestore di project ${FIRESTORE_PROJECT || "(tidak diset)"}. Butuh role Cloud Datastore User untuk service account itu di project tersebut (IAM), atau Firestore harus disediakan di project yang sama dengan container.`;
    if (/could not load the default credentials|ADC|credential|Unable to detect a Project Id/i.test(msg)) return "Kredensial/project tidak terdeteksi: di Cloud Run pakai service account layanan (ADC); di laptop butuh gcloud auth application-default login dan GOOGLE_CLOUD_PROJECT.";
    if (/billing/i.test(msg)) return "Project ini butuh billing untuk Firestore -- di Starter Tier seharusnya tidak; cek apakah project yang dipakai benar.";
    return "Lihat log server untuk detail; data TIDAK tersimpan sampai ini hijau.";
  }
  if (/billing/i.test(msg)) return "Project Google Cloud ini belum punya akun billing aktif. Cloud Storage butuh billing walau pemakaian kecil gratis: Cloud Console -> Billing -> hubungkan akun billing ke project ini, lalu periksa ulang.";
  if (/403|permission|forbidden|does not have/i.test(msg)) return "Service account layanan belum punya izin. Di project standar: IAM -> service account Cloud Run (…-compute@developer.gserviceaccount.com) -> tambah role Storage Admin, lalu periksa ulang. Di project Starter Tier (AI Studio) izin ini TIDAK bisa diberikan -- pakai backend firestore (hapus GCS_BUCKET).";
  if (/409|already exists|already own|conflict/i.test(msg)) return "Nama bucket sudah dipakai orang lain (nama bucket unik sedunia): ganti GCS_BUCKET ke nama lain, misalnya tambah angka.";
  if (/404|notfound|not found|no such bucket|does not exist/i.test(msg)) return "Bucket tidak ditemukan dan tidak bisa dibuat otomatis: cek ejaan GCS_BUCKET, atau buat manual di Cloud Storage lalu beri izin Storage Object Admin ke service account.";
  if (/could not load the default credentials|ADC|credential/i.test(msg)) return "Kredensial tidak ditemukan: di Cloud Run pakai service account layanan (ADC); di laptop butuh gcloud auth application-default login.";
  return "Lihat log server untuk detail; data TIDAK tersimpan sampai ini hijau.";
}

// Writes, reads back and deletes one small object. This is the only way to KNOW
// that the hosted copy can keep data: the mode alone says what was configured, not
// whether the backend exists or the service account may write to it.
export async function probe(creationError?: string): Promise<StorageProbe> {
  const t0 = Date.now();
  const key = `data/.probe-${t0}.json`;
  const payload = JSON.stringify({ probe: true, at: t0 });
  const base = { mode: STORAGE_MODE, label: backendLabel(), bucket: STORAGE_MODE === "gcs" ? BUCKET_NAME : null, persistent: STORAGE_MODE !== "local", checkedAt: new Date(t0).toISOString() };
  if (creationError && STORAGE_MODE !== "local") {
    const prefix = STORAGE_MODE === "gcs" ? "Bucket tidak bisa dibuat otomatis" : "Firestore tidak bisa diakses";
    return { ...base, persistent: false, ok: false, latencyMs: 0, error: `${prefix}: ${creationError}`, hint: hintFor(creationError) };
  }
  try {
    await writeText(key, payload);
    const back = await readText(key);
    await remove(key);
    if (back !== payload) throw new Error("read-back mismatch");
    return { ...base, ok: true, latencyMs: Date.now() - t0 };
  } catch (err: any) {
    const msg = String(err?.message || err);
    return { ...base, persistent: false, ok: false, latencyMs: Date.now() - t0, error: msg.slice(0, 300), hint: hintFor(msg) };
  }
}

export function contentTypeFor(key: string): string {
  const ext = key.toLowerCase().split(".").pop();
  switch (ext) {
    case "json": return "application/json";
    case "md": return "text/markdown; charset=utf-8";
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    default: return "application/octet-stream";
  }
}
