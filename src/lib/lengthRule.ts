/*
  How long should the listing description be? One answer, shared by server.ts (the
  gate, the corrective pass, the audit finding) and the UI (the "Terbaca:" line under
  the instruction field, the badge on the Konten node). Numbers live here and nowhere
  else, so the day the DongkrakUsaha field limit is verified only DEFAULT_LENGTH and
  LENGTH_LIMITS change.

  The operator's instruction wins: "40-60 kalimat" or "maksimal 2000 karakter" typed
  into the orchestrator's instruction field replaces the supervisor's default, in that
  unit, and the server measures the draft in that unit. A request beyond what the
  models can deliver inside the call timeouts is clamped, never silently -- the rule
  carries a sentence saying what was asked and what will be used.
*/

export type LengthUnit = 'kata' | 'kalimat' | 'karakter';

export interface LengthRule {
  unit: LengthUnit;
  min: number;
  max: number;
  target: number;
  source: 'operator' | 'default';
  /** What the operator literally asked for, before any clamping. */
  requested?: { unit: LengthUnit; min: number; max: number };
  /** Human sentence when the request had to be adjusted; shown to the operator. */
  clamped?: string;
}

export interface Measured { kata: number; kalimat: number; karakter: number; }

/** The owner's supervisor's rule (2026-09-18): a 500-1000 word SEO article. */
export const DEFAULT_LENGTH: LengthRule = { unit: 'kata', min: 500, max: 1000, target: 650, source: 'default' };

/** Technical ceilings: tied to the 30/60 s call timeouts (AI_MODELS.md Rule 1L). */
export const LENGTH_LIMITS: Record<LengthUnit, { floor: number; ceiling: number }> = {
  kata: { floor: 100, ceiling: 1500 },
  kalimat: { floor: 5, ceiling: 120 },
  karakter: { floor: 500, ceiling: 10000 }
};

/** Unverified claim about the DongkrakUsaha description field; shown as a warning
    threshold until a real publish measures the field (PROJECT_KNOWLEDGE 2026-09-18). */
export const UNVERIFIED_FIELD_CHARS = 2000;

// Built from regex literals, not strings, so no escaping layer can eat a backslash.
const UNIT = /(kata|kalimat|karakter)/.source;
const NUM = /(\d[\d.,]*)(k)?/.source;
const SP = /\s*/.source;
const RANGE_SEP = /(?:-|–|—|sampai|s\/d|sd|hingga)/.source;
const APPROX = /(?:sekitar|kira-kira|kurang lebih|±|~)/.source;
const MIN_WORD = /(?:minimal|min\.?|paling sedikit|setidaknya)/.source;
const MAX_WORD = /(?:maksimal|maks\.?|max\.?|paling banyak|tidak lebih dari)/.source;
const rx = (...parts: string[]) => new RegExp(parts.join(''));
const toNumber = (digits: string, k?: string) => {
  const n = Number(digits.replace(/[.,](?=\d{3}\b)/g, '').replace(/[.,]/g, '.'));
  return Math.round(k ? n * 1000 : n);
};
const fmt = (n: number) => n.toLocaleString('id-ID');
const clampTo = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function parseLengthRule(text: string | undefined | null, defaults: LengthRule = DEFAULT_LENGTH): LengthRule {
  const t = String(text || '').toLowerCase();
  let unit: LengthUnit | null = null;
  let min = 0, max = 0, target: number | null = null;
  let asked = ''; // the operator's own words, quoted back when the request is adjusted

  const range = t.match(rx(NUM, SP, RANGE_SEP, SP, NUM, SP, UNIT));
  const approx = t.match(rx(APPROX, SP, NUM, SP, UNIT));
  const minOnly = t.match(rx(MIN_WORD, SP, NUM, SP, UNIT));
  const maxOnly = t.match(rx(MAX_WORD, SP, NUM, SP, UNIT));
  const bare = t.match(rx(NUM, SP, UNIT));

  if (range) {
    unit = range[5] as LengthUnit; min = toNumber(range[1], range[2]); max = toNumber(range[3], range[4]);
    asked = `${fmt(min)}–${fmt(max)} ${unit}`;
  } else if (approx) {
    unit = approx[3] as LengthUnit; target = toNumber(approx[1], approx[2]);
    min = Math.round(target * 0.9); max = Math.round(target * 1.1); asked = `sekitar ${fmt(target)} ${unit}`;
  } else if (minOnly) {
    unit = minOnly[3] as LengthUnit; min = toNumber(minOnly[1], minOnly[2]); asked = `minimal ${fmt(min)} ${unit}`;
    max = unit === defaults.unit && defaults.max > min ? defaults.max : min * 2;
  } else if (maxOnly) {
    unit = maxOnly[3] as LengthUnit; max = toNumber(maxOnly[1], maxOnly[2]); asked = `maksimal ${fmt(max)} ${unit}`;
    min = unit === defaults.unit && defaults.min < max ? defaults.min : Math.round(max * 0.5);
    target = Math.round(max * 0.8);
  } else if (bare) {
    unit = bare[3] as LengthUnit; target = toNumber(bare[1], bare[2]);
    min = Math.round(target * 0.9); max = Math.round(target * 1.1); asked = `${fmt(target)} ${unit}`;
  }
  if (!unit) return { ...defaults };

  const requested = { unit, min, max };
  const { floor, ceiling } = LENGTH_LIMITS[unit];
  let lo = clampTo(min, floor, ceiling), hi = clampTo(max, floor, ceiling);
  if (lo > hi) [lo, hi] = [hi, lo];
  // Both ends beyond the ceiling collapse to one number; open a window below it so a
  // weak model still has room to land inside.
  if (lo === hi) { lo = Math.max(floor, Math.round(hi * 0.6)); if (lo === hi) hi = Math.min(ceiling, Math.round(lo * 1.4)); }
  const changed = lo !== min || hi !== max;
  const tgt = target !== null && target >= lo && target <= hi ? target : Math.round((lo + hi) / 2);

  const rule: LengthRule = { unit, min: lo, max: hi, target: tgt, source: 'operator', requested };
  if (changed) {
    const approxWords = unit === 'kalimat' ? ` (≈ ${fmt(min * 12)}–${fmt(max * 12)} kata)` : '';
    rule.clamped = `Diminta ${asked}${approxWords}; dipakai ${fmt(lo)}–${fmt(hi)} ${unit} — plafon batas waktu model.`;
  }
  return rule;
}

// Abbreviations whose trailing dot does not end a sentence.
const ABBREVIATIONS = /\b(rp|dll|dsb|dst|no|jl|tel|telp|hp|wa|dr|bpk|ibu|sdr|tgl|thn|ca|a\.n|u\.p)\./gi;

export function measure(text: unknown): Measured {
  const raw = String(text ?? '').trim();
  if (!raw) return { kata: 0, kalimat: 0, karakter: 0 };
  const kata = raw.split(/\s+/).filter(Boolean).length;
  // Sentences: terminal punctuation followed by space/end, or a line break (a
  // sub-heading on its own line counts as one). An approximation, documented as such.
  const kalimat = raw
    .replace(ABBREVIATIONS, (m) => m.replace('.', ''))
    .split(/[.!?]+(?=\s|$)|\n+/)
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).filter(Boolean).length >= 2).length;
  return { kata, kalimat, karakter: raw.length };
}

export const inRange = (rule: LengthRule, m: Measured) => m[rule.unit] >= rule.min && m[rule.unit] <= rule.max;

export const describe = (rule: LengthRule) =>
  `${fmt(rule.min)}–${fmt(rule.max)} ${rule.unit} (${rule.source === 'operator' ? 'instruksi operator' : 'default pembimbing'})`;
