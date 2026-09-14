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
