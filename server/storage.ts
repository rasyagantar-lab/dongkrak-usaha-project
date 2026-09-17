// Persistence backend for everything the app writes at runtime: campaigns, publish
// history, base photos, generated images, and the agents' self-improvement logs.
//
// Two modes, chosen ONLY by whether GCS_BUCKET is set:
//   local (default)  -> the local disk under process.cwd(), exactly as before. This is
//                       the proven path and the fallback if the cloud experiment fails.
//   gcs              -> a Google Cloud Storage bucket. Cloud Run's filesystem is wiped
//                       on every restart and scale-to-zero, so anything worth keeping
//                       must live outside the container.
//
// Keys are POSIX-style relative paths ("data/campaigns.json", "base-photos/x.jpg").
// In local mode a key maps to <cwd>/<key> for data/, and <cwd>/public/<key> for the two
// asset directories, preserving the on-disk layout the rest of the app already uses.
import fs from "fs";
import path from "path";

const ASSET_PREFIXES = ["base-photos/", "generated-images/"];

export type StorageMode = "local" | "gcs";

export const STORAGE_MODE: StorageMode = process.env.GCS_BUCKET && process.env.GCS_BUCKET.trim() ? "gcs" : "local";
const BUCKET_NAME = (process.env.GCS_BUCKET || "").trim();

function localPathFor(key: string): string {
  const isAsset = ASSET_PREFIXES.some(p => key.startsWith(p));
  return path.join(process.cwd(), isAsset ? "public" : "", key);
}

// Lazy so local mode never even loads the (large) GCS client.
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

// Creates the bucket on first boot if it does not exist yet, so the operator's only
// step on the hosting side is setting GCS_BUCKET. Region defaults to Jakarta. The
// service account on Cloud Run (default compute SA) normally holds
// storage.buckets.create; if it does not, the probe that runs right after reports
// the exact permission problem instead of this failing silently.
export async function ensureBucket(): Promise<{ mode: StorageMode; bucket: string | null; existed: boolean; created: boolean; error?: string }> {
  const base = { mode: STORAGE_MODE, bucket: STORAGE_MODE === "gcs" ? BUCKET_NAME : null };
  if (STORAGE_MODE !== "gcs") return { ...base, existed: false, created: false };
  try {
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

export async function readText(key: string): Promise<string | null> {
  if (STORAGE_MODE === "local") {
    const p = localPathFor(key);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
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
  await (await bucket()).file(key).save(text, { contentType: contentTypeFor(key), resumable: false });
}

export async function readBinary(key: string): Promise<Buffer | null> {
  if (STORAGE_MODE === "local") {
    const p = localPathFor(key);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }
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
  await (await bucket()).file(key).delete({ ignoreNotFound: true });
}

export interface StorageProbe {
  mode: StorageMode;
  bucket: string | null;
  persistent: boolean;      // true only when writes survive a container restart
  ok: boolean;              // write -> read -> delete round trip succeeded
  latencyMs: number;
  error?: string;
  hint?: string;            // what to do about the error, for the operator
  checkedAt: string;
}

// Writes, reads back and deletes one small object. This is the only way to KNOW
// that the hosted copy can keep data: the mode alone says what was configured, not
// whether the bucket exists or the service account may write to it.
export async function probe(): Promise<StorageProbe> {
  const t0 = Date.now();
  const key = `data/.probe-${t0}.json`;
  const payload = JSON.stringify({ probe: true, at: t0 });
  const base = { mode: STORAGE_MODE, bucket: STORAGE_MODE === "gcs" ? BUCKET_NAME : null, persistent: STORAGE_MODE === "gcs", checkedAt: new Date(t0).toISOString() };
  try {
    await writeText(key, payload);
    const back = await readText(key);
    await remove(key);
    if (back !== payload) throw new Error("read-back mismatch");
    return { ...base, ok: true, latencyMs: Date.now() - t0 };
  } catch (err: any) {
    const msg = String(err?.message || err);
    let hint: string | undefined;
    if (STORAGE_MODE === "gcs") {
      if (/billing/i.test(msg)) hint = "Project Google Cloud ini belum punya akun billing aktif. Cloud Storage butuh billing walau pemakaian kecil gratis: Cloud Console -> Billing -> hubungkan akun billing ke project ini, lalu periksa ulang.";
      else if (/403|permission|forbidden|does not have/i.test(msg)) hint = "Service account layanan belum punya izin: bucket -> Permissions -> Grant access -> role Storage Object Admin.";
      else if (/409|already exists|already own|conflict/i.test(msg)) hint = "Nama bucket sudah dipakai orang lain (nama bucket unik sedunia): ganti GCS_BUCKET ke nama lain, misalnya tambah angka.";
      else if (/404|notfound|not found|no such bucket|does not exist/i.test(msg)) hint = "Bucket tidak ditemukan dan tidak bisa dibuat otomatis: cek ejaan GCS_BUCKET, atau buat manual di Cloud Storage lalu beri izin Storage Object Admin ke service account.";
      else if (/could not load the default credentials|ADC|credential/i.test(msg)) hint = "Kredensial tidak ditemukan: di Cloud Run pakai service account layanan (ADC); di laptop butuh gcloud auth application-default login.";
      else hint = "Lihat log server untuk detail; data TIDAK tersimpan sampai ini hijau.";
    }
    return { ...base, persistent: false, ok: false, latencyMs: Date.now() - t0, error: msg.slice(0, 300), hint };
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
