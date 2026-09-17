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

const ASSET_PREFIXES = ["base-photos/", "generated-images/"];

export type StorageMode = "local" | "gcs" | "firestore";

const BUCKET_NAME = (process.env.GCS_BUCKET || "").trim();
const FIRESTORE_COLLECTION = (process.env.FIRESTORE_COLLECTION || "du_storage").trim();
const FIRESTORE_CHUNKS = `${FIRESTORE_COLLECTION}_chunks`;
// AI Studio provisions Firestore in the OWNER'S project (e.g. civic-ally-…) with a named
// database, while the container itself runs in a Google-managed sandbox project (the
// metadata server answers with that one). So project and database must be explicit.
// Order: env vars, then the applet config file AI Studio writes next to the app
// (firebase-applet-config.json), then the client's own default.
function appletConfig(): { projectId?: string; databaseId?: string } {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf-8");
    const j: any = JSON.parse(raw);
    const fc = j.firebaseConfig || j.firebase || j;
    const projectId = j.projectId || fc.projectId || j.project_id || fc.project_id;
    const databaseId = j.firestoreDatabaseId || j.databaseId || j.firestore?.databaseId || j.database_id || j.firestore?.database_id || fc.firestoreDatabaseId;
    return { projectId: projectId ? String(projectId) : undefined, databaseId: databaseId ? String(databaseId) : undefined };
  } catch { return {}; }
}
const APPLET = appletConfig();
const FIRESTORE_PROJECT = (process.env.FIRESTORE_PROJECT || APPLET.projectId || "").trim();      // "" = from ADC/metadata
const FIRESTORE_DATABASE = (process.env.FIRESTORE_DATABASE || APPLET.databaseId || "").trim();   // "" = (default)
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
  if (STORAGE_MODE === "firestore") return `Firestore ${FIRESTORE_PROJECT || "(project dari metadata)"} / ${FIRESTORE_DATABASE || "(default)"} · koleksi ${FIRESTORE_COLLECTION}`;
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

// ---- Firestore (lazy; overridable for tests) ----
let dbPromise: Promise<any> | null = null;
let dbOverride: any = null;
export function __setFirestoreForTests(client: any) { dbOverride = client; dbPromise = null; }
async function db() {
  if (dbOverride) return dbOverride;
  if (!dbPromise) {
    dbPromise = (async () => {
      const { Firestore } = await import("@google-cloud/firestore");
      // Project id comes from ADC / the Cloud Run metadata server; no key file.
      return new Firestore({
        ...(FIRESTORE_PROJECT ? { projectId: FIRESTORE_PROJECT } : {}),
        ...(FIRESTORE_DATABASE ? { databaseId: FIRESTORE_DATABASE } : {})
      });
    })();
  }
  return dbPromise;
}
const docId = (key: string) => encodeURIComponent(key);
// Firestore's Node client returns Bytes fields as Buffer; be tolerant of Uint8Array and
// of wrapper objects exposing toUint8Array() (some client versions / fakes).
function toBuffer(v: any): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (v && typeof v.toUint8Array === "function") return Buffer.from(v.toUint8Array());
  if (v && v.type === "Buffer" && Array.isArray(v.data)) return Buffer.from(v.data);
  return Buffer.from(v ?? []);
}

async function fsWrite(key: string, data: Buffer, kind: "text" | "binary"): Promise<void> {
  const client = await db();
  const main = client.collection(FIRESTORE_COLLECTION).doc(docId(key));
  const chunksCol = client.collection(FIRESTORE_CHUNKS);
  // Drop stale chunks from a previous, larger version of the same key.
  const old = await chunksCol.where("key", "==", key).get();
  for (const d of old.docs) await d.ref.delete();
  const meta = { key, kind, contentType: contentTypeFor(key), size: data.length, updatedAt: new Date().toISOString() };
  if (data.length <= CHUNK_BYTES) {
    await main.set({ ...meta, chunks: 0, data });
    return;
  }
  const n = Math.ceil(data.length / CHUNK_BYTES);
  for (let i = 0; i < n; i++) {
    await chunksCol.doc(`${docId(key)}%23${i}`).set({ key, part: i, data: data.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) });
  }
  await main.set({ ...meta, chunks: n });
}

async function fsRead(key: string): Promise<Buffer | null> {
  const client = await db();
  const snap = await client.collection(FIRESTORE_COLLECTION).doc(docId(key)).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (!d.chunks) return toBuffer(d.data);
  const parts: Buffer[] = [];
  for (let i = 0; i < d.chunks; i++) {
    const c = await client.collection(FIRESTORE_CHUNKS).doc(`${docId(key)}%23${i}`).get();
    if (!c.exists) throw new Error(`Firestore object ${key} is missing chunk ${i}/${d.chunks}`);
    parts.push(toBuffer(c.data().data));
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
    const client = await db();
    const snap = await client.collection(FIRESTORE_COLLECTION)
      .where("key", ">=", prefix)
      .where("key", "<", prefix + "")
      .get();
    return snap.docs.map((d: any) => {
      const v = d.data();
      return { key: String(v.key), bytes: Number(v.size || 0), updatedAt: String(v.updatedAt || new Date().toISOString()) };
    });
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
    const client = await db();
    const old = await client.collection(FIRESTORE_CHUNKS).where("key", "==", key).get();
    for (const d of old.docs) await d.ref.delete();
    await client.collection(FIRESTORE_COLLECTION).doc(docId(key)).delete();
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
      const client = await db();
      await client.collection(FIRESTORE_COLLECTION).doc("__readiness__").get();
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
