// How the server talks to Firestore. Two transports, tried in order at boot:
//
//   admin  -> @google-cloud/firestore with the container's service account (ADC).
//             Works on a normal Cloud Run service in the owner's project.
//   rest   -> Firestore's REST API with the Firebase web API key, as an ordinary
//             client under Security Rules -- with an anonymous Firebase sign-in
//             first when the Anonymous provider is enabled, otherwise unauthenticated.
//             This is the path AI Studio's own apps use: on the Starter Tier the
//             container runs as a Google sandbox service account that has NO IAM
//             access to the owner's Firestore (PERMISSION_DENIED observed 2026-09-17),
//             so the admin transport cannot work there.
//
// Both expose the same tiny surface storage.ts needs: get/set/delete a document and
// two key queries. Values are plain JS (string, number, Buffer); the REST transport
// converts to and from Firestore's typed JSON.
import fs from "fs";
import path from "path";

export interface DocFields { [k: string]: string | number | Buffer | undefined; }
export interface Transport {
  name: "admin" | "rest-anonymous" | "rest-unauthenticated";
  getDoc(col: string, id: string): Promise<DocFields | null>;
  setDoc(col: string, id: string, fields: DocFields): Promise<void>;
  deleteDoc(col: string, id: string): Promise<void>;
  queryKeyRange(col: string, from: string, toExclusive: string): Promise<DocFields[]>;
  queryKeyEq(col: string, key: string): Promise<Array<{ id: string }>>;
}

export interface FirestoreTarget { projectId: string; databaseId: string; apiKey?: string; }

// ---------------- admin (service account) ----------------
export function adminTransport(client: any): Transport {
  const toBuffer = (v: any): Buffer => {
    if (Buffer.isBuffer(v)) return v;
    if (v instanceof Uint8Array) return Buffer.from(v);
    if (v && typeof v.toUint8Array === "function") return Buffer.from(v.toUint8Array());
    if (v && v.type === "Buffer" && Array.isArray(v.data)) return Buffer.from(v.data);
    return Buffer.from(v ?? []);
  };
  const norm = (d: any): DocFields => {
    const out: DocFields = {};
    for (const [k, v] of Object.entries(d || {})) out[k] = k === "data" ? toBuffer(v) : (v as any);
    return out;
  };
  return {
    name: "admin",
    async getDoc(col, id) { const s = await client.collection(col).doc(id).get(); return s.exists ? norm(s.data()) : null; },
    async setDoc(col, id, fields) { await client.collection(col).doc(id).set(fields); },
    async deleteDoc(col, id) { await client.collection(col).doc(id).delete(); },
    async queryKeyRange(col, from, to) {
      const snap = await client.collection(col).where("key", ">=", from).where("key", "<", to).get();
      return snap.docs.map((d: any) => norm(d.data()));
    },
    async queryKeyEq(col, key) {
      const snap = await client.collection(col).where("key", "==", key).get();
      return snap.docs.map((d: any) => ({ id: d.id }));
    }
  };
}

// ---------------- REST (API key, optional anonymous auth) ----------------
const enc = (fields: DocFields) => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Buffer.isBuffer(v)) out[k] = { bytesValue: v.toString("base64") };
    else if (typeof v === "number") out[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else out[k] = { stringValue: String(v) };
  }
  return out;
};
const dec = (fields: Record<string, any> | undefined): DocFields => {
  const out: DocFields = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if ("bytesValue" in v) out[k] = Buffer.from(v.bytesValue, "base64");
    else if ("integerValue" in v) out[k] = Number(v.integerValue);
    else if ("doubleValue" in v) out[k] = Number(v.doubleValue);
    else if ("stringValue" in v) out[k] = v.stringValue;
  }
  return out;
};

class RestAuth {
  private idToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;
  constructor(private apiKey: string) {}
  // Anonymous sign-in (Identity Toolkit). Fails with ADMIN_ONLY_OPERATION when the
  // Anonymous provider is disabled in Firebase Auth -- the caller then goes unauthenticated.
  async token(): Promise<string> {
    const now = Date.now();
    if (this.idToken && now < this.expiresAt - 60_000) return this.idToken;
    if (this.refreshToken) {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.refreshToken)}`,
        signal: AbortSignal.timeout(10_000)
      });
      if (r.ok) {
        const j: any = await r.json();
        this.idToken = j.id_token; this.refreshToken = j.refresh_token; this.expiresAt = now + Number(j.expires_in || 3600) * 1000;
        return this.idToken!;
      }
    }
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }),
      signal: AbortSignal.timeout(10_000)
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`anonymous sign-in failed: ${j?.error?.message || r.status}`);
    this.idToken = j.idToken; this.refreshToken = j.refreshToken; this.expiresAt = now + Number(j.expiresIn || 3600) * 1000;
    return this.idToken!;
  }
}

export function restTransport(target: FirestoreTarget, anonymous: boolean): Transport {
  if (!target.apiKey) throw new Error("REST transport needs a Firebase web API key");
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(target.projectId)}/databases/${encodeURIComponent(target.databaseId)}/documents`;
  const auth = anonymous ? new RestAuth(target.apiKey) : null;
  const headers = async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) h.Authorization = `Bearer ${await auth.token()}`;
    return h;
  };
  const call = async (method: string, url: string, body?: any) => {
    const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}key=${target.apiKey}`, {
      method, headers: await headers(), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000)
    });
    if (r.status === 404) return null;
    const text = await r.text();
    if (!r.ok) {
      let msg = text;
      try { msg = JSON.parse(text)?.error?.message || text; } catch {}
      throw new Error(`${r.status} ${msg}`.slice(0, 300));
    }
    return text ? JSON.parse(text) : {};
  };
  const docUrl = (col: string, id: string) => `${base}/${encodeURIComponent(col)}/${encodeURIComponent(id)}`;
  return {
    name: anonymous ? "rest-anonymous" : "rest-unauthenticated",
    async getDoc(col, id) { const d = await call("GET", docUrl(col, id)); return d ? dec(d.fields) : null; },
    async setDoc(col, id, fields) { await call("PATCH", docUrl(col, id), { fields: enc(fields) }); },
    async deleteDoc(col, id) { await call("DELETE", docUrl(col, id)); },
    async queryKeyRange(col, from, to) {
      const rows = await call("POST", `${base}:runQuery`, { structuredQuery: {
        from: [{ collectionId: col }],
        where: { compositeFilter: { op: "AND", filters: [
          { fieldFilter: { field: { fieldPath: "key" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: from } } },
          { fieldFilter: { field: { fieldPath: "key" }, op: "LESS_THAN", value: { stringValue: to } } }
        ] } }
      } });
      return (rows || []).filter((r: any) => r.document).map((r: any) => dec(r.document.fields));
    },
    async queryKeyEq(col, key) {
      const rows = await call("POST", `${base}:runQuery`, { structuredQuery: {
        from: [{ collectionId: col }],
        where: { fieldFilter: { field: { fieldPath: "key" }, op: "EQUAL", value: { stringValue: key } } }
      } });
      return (rows || []).filter((r: any) => r.document).map((r: any) => ({ id: String(r.document.name).split("/").pop()! }));
    }
  };
}

// ---------------- target resolution ----------------
// Project / database / API key: env first, then AI Studio's firebase-applet-config.json
// (written by its provisioning next to the app), then nothing.
export function resolveTarget(): Partial<FirestoreTarget> {
  let applet: any = {};
  try { applet = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf-8")); } catch {}
  const fc = applet.firebaseConfig || applet.firebase || applet;
  const projectId = (process.env.FIRESTORE_PROJECT || applet.projectId || fc.projectId || applet.project_id || "").trim();
  const databaseId = (process.env.FIRESTORE_DATABASE || applet.firestoreDatabaseId || applet.databaseId || applet.firestore?.databaseId || fc.firestoreDatabaseId || "").trim();
  const apiKey = (process.env.FIREBASE_API_KEY || applet.apiKey || fc.apiKey || "").trim();
  return { projectId: projectId || undefined, databaseId: databaseId || undefined, apiKey: apiKey || undefined };
}

// Tries each transport with a real write/read/delete of one readiness document and
// returns the first that works, plus every failure so the operator sees why the
// earlier ones were skipped.
export async function selectTransport(candidates: Array<() => Promise<Transport>>, col: string): Promise<{ transport: Transport | null; attempts: Array<{ name: string; error: string }> }> {
  const attempts: Array<{ name: string; error: string }> = [];
  for (const make of candidates) {
    let t: Transport | null = null;
    try {
      t = await make();
      const id = `__readiness__${Date.now()}`;
      await t.setDoc(col, id, { key: `__readiness__/${id}`, kind: "text", size: 2, updatedAt: new Date().toISOString(), chunks: 0, data: Buffer.from("ok") });
      const back = await t.getDoc(col, id);
      await t.deleteDoc(col, id);
      if (!back || !Buffer.isBuffer(back.data) || back.data.toString() !== "ok") throw new Error("read-back mismatch");
      return { transport: t, attempts };
    } catch (err: any) {
      attempts.push({ name: t?.name || "(init)", error: String(err?.message || err).slice(0, 220) });
    }
  }
  return { transport: null, attempts };
}
