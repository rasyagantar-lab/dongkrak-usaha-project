import React from 'react';
import {
  X, Cpu, ArrowRightLeft, CheckCircle2, XCircle, MinusCircle, AlertTriangle,
  UserRoundPen, Save, RefreshCw, Play
} from 'lucide-react';
import { NODES, type GraphState, type LedgerEntry } from './canvasGraph';

/*
  The detail side of the canvas: pick a node, read exactly what that agent did.

  Everything the old stacked panel showed lives here, but attached to the node it
  belongs to -- the ledger row, the attempt trail, and that stage's actual output.
  The operator's mental question is "what did THIS agent produce, and why did it take
  that long", and the answer should be one click away from the thing they clicked.
*/

export interface HumanFinding {
  type: 'pass' | 'warning' | 'error';
  category: string;
  message: string;
  fixableBy?: 'ai' | 'human';
  field?: 'targetCities' | 'address' | 'phoneWhatsApp' | 'businessName' | 'category' | 'description' | 'productsServices' | 'priceRange' | 'website' | 'other';
  suggestion?: string;
}

export const FIELD_LABELS: Record<NonNullable<HumanFinding['field']>, string> = {
  targetCities: 'Nama daerah / kota target',
  address: 'Alamat usaha',
  phoneWhatsApp: 'Nomor WhatsApp',
  businessName: 'Nama bisnis',
  category: 'Kategori bisnis',
  description: 'Deskripsi bisnis',
  productsServices: 'Produk / layanan',
  priceRange: 'Kisaran harga',
  website: 'Website',
  other: 'Lainnya'
};

interface InspectorProps {
  nodeId: string;
  graph: GraphState;
  outputs: any;
  blockers: string[];
  revisionHistory: Array<{ round: number; scoreBefore: number; scoreAfter: number; readinessBefore: string; readinessAfter: string; accepted: boolean }>;
  humanFindings: HumanFinding[];
  humanFields: Array<NonNullable<HumanFinding['field']>>;
  editValue: (field: NonNullable<HumanFinding['field']>) => string;
  onEditField: (field: NonNullable<HumanFinding['field']>, value: string) => void;
  onSaveHumanEdits: () => void;
  onSaveAndRerun: () => void;
  onApply: () => void;
  applied: boolean;
  canApply: boolean;
  businessName: string;
  isRunning: boolean;
  onClose: () => void;
}

const statusIcon = (status: LedgerEntry['status']) =>
  status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
    : status === 'failed' ? <XCircle className="w-3.5 h-3.5 text-rose-400" />
    : <MinusCircle className="w-3.5 h-3.5 text-slate-500" />;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-1.5">
    <div className="text-3xs font-semibold text-slate-500 uppercase tracking-wider">{title}</div>
    {children}
  </div>
);

const Field: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) =>
  value === undefined || value === null || value === '' ? null : (
    <div className="text-xs">
      <span className="text-slate-500">{label}: </span>
      <span className="text-slate-200">{value}</span>
    </div>
  );

const Chips: React.FC<{ items: string[]; tone?: string }> = ({ items, tone = 'bg-slate-800 text-slate-300 border-slate-700' }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.filter(Boolean).map((k, i) => (
      <span key={i} className={`text-3xs px-1.5 py-0.5 rounded border ${tone}`}>{k}</span>
    ))}
  </div>
);

export const NodeInspector: React.FC<InspectorProps> = ({
  nodeId, graph, outputs, blockers, revisionHistory, humanFindings, humanFields,
  editValue, onEditField, onSaveHumanEdits, onSaveAndRerun, onApply, applied, canApply,
  businessName, isRunning, onClose
}) => {
  const node = NODES.find(n => n.id === nodeId);
  const state = graph.nodes[nodeId];
  if (!node) return null;

  return (
    <aside className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-200">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">{node.label}</div>
          <div className="text-2xs text-slate-400 mt-0.5">{node.role}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup detail" className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {/* What the router actually did for this stage. */}
        {state?.entries.map((entry, i) => (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-100">
                {statusIcon(entry.status)}
                {entry.agent}{state.entries.length > 1 ? ` · ronde ${i + 1}` : ''}
              </span>
              <span className="text-3xs text-slate-500 font-mono">{(entry.durationMs / 1000).toFixed(1)}s</span>
            </div>
            {entry.modelUsed && (
              <div className="flex items-center gap-1.5 text-3xs text-slate-400 font-mono">
                <Cpu className="w-3 h-3" />
                {entry.modelName || entry.modelUsed}
                {entry.keyFingerprint && <span className="text-slate-600">· key {entry.keyFingerprint.slice(0, 6)}</span>}
                {entry.fallbackOccurred && (
                  <span className="inline-flex items-center gap-1 text-amber-400"><ArrowRightLeft className="w-3 h-3" />fallback</span>
                )}
              </div>
            )}
            {entry.reason && <div className="text-3xs text-slate-400 leading-relaxed">{entry.reason}</div>}
            {entry.attempts && entry.attempts.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {entry.attempts.map((a, j) => (
                  <span
                    key={j}
                    title={a.note || a.error || ''}
                    className={`text-3xs px-1.5 py-0.5 rounded border font-mono ${
                      a.kind === 'wait' ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                        : a.ok ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {a.kind === 'wait' ? 'tunggu' : a.model.replace('gemini-', '')}
                    {a.kind !== 'wait' && !a.ok && a.status ? ` · ${a.status}` : ''}
                    {typeof a.durationMs === 'number' ? ` · ${(a.durationMs / 1000).toFixed(1)}s` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {!state?.entries.length && nodeId !== 'source' && nodeId !== 'sink' && nodeId !== 'handoff' && (
          <p className="text-xs text-slate-500">
            {isRunning ? 'Agent ini belum dapat giliran pada run yang sedang berjalan.' : 'Belum ada data. Jalankan orchestrator untuk mengisi tahap ini.'}
          </p>
        )}

        {/* Stage output, in the node it came from. */}
        {nodeId === 'source' && (
          <Section title="Masukan pipeline">
            <div className="text-sm font-bold text-white">{businessName}</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Semua agent bekerja dari data bisnis campaign ini. Kalau hasilnya terasa meleset, biasanya sumbernya di sini — perbaiki di tab Data Bisnis.
            </p>
          </Section>
        )}

        {nodeId === 'plan' && outputs?.plan && (
          <Section title="Briefing">
            <Field label="Tujuan" value={outputs.plan.objective} />
            {Array.isArray(outputs.plan.taskBreakdown) && (
              <ol className="list-decimal pl-4 text-xs text-slate-300 space-y-0.5">
                {outputs.plan.taskBreakdown.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ol>
            )}
            {Array.isArray(outputs.plan.risks) && outputs.plan.risks.length > 0 && (
              <div className="text-xs text-amber-300/90">Risiko: {outputs.plan.risks.join(' · ')}</div>
            )}
            <Field label="Hasil diharapkan" value={outputs.plan.expectedOutcome} />
          </Section>
        )}

        {nodeId === 'strategy' && outputs?.strategy && (
          <Section title="Strategi kampanye">
            <Field label="Posisi" value={outputs.strategy.positioning} />
            <Field label="Penawaran" value={outputs.strategy.offerAngle} />
            <Field label="CTA" value={outputs.strategy.primaryCTA} />
            <Field label="Nada" value={outputs.strategy.brandTone} />
            {Array.isArray(outputs.strategy.targetSegments) && <Chips items={outputs.strategy.targetSegments} />}
          </Section>
        )}

        {nodeId === 'keyword' && outputs?.seoStrategy && (
          <Section title="Keyword">
            <Field label="Utama" value={outputs.seoStrategy.mainKeyword} />
            {Array.isArray(outputs.seoStrategy.secondaryKeywords) && <Chips items={outputs.seoStrategy.secondaryKeywords} />}
            {Array.isArray(outputs.seoStrategy.lsiKeywords) && (
              <Chips items={outputs.seoStrategy.lsiKeywords} tone="bg-slate-800/60 text-slate-400 border-slate-700" />
            )}
            <Field label="Intent" value={outputs.seoStrategy.searchIntent} />
            <Field label="Kota target" value={(outputs.seoStrategy.targetCities || []).join(', ')} />
          </Section>
        )}

        {nodeId === 'content' && outputs?.generatedContent && (
          <Section title="Konten listing">
            <Field label="Judul SEO" value={outputs.generatedContent.seoTitle} />
            <Field label="Meta" value={outputs.generatedContent.metaDescription} />
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{outputs.generatedContent.seoDescription}</p>
            {Array.isArray(outputs.generatedContent.productHighlights) && <Chips items={outputs.generatedContent.productHighlights} />}
            <Field label="CTA" value={outputs.generatedContent.callToAction} />
          </Section>
        )}

        {nodeId === 'audit' && outputs?.audit && (
          <>
            <Section title="Hasil audit">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-3xs font-bold ${
                  outputs.audit.publishingReadiness === 'READY' ? 'bg-emerald-500/15 text-emerald-300'
                    : outputs.audit.publishingReadiness === 'BLOCKED' ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-amber-500/15 text-amber-300'
                }`}>{outputs.audit.publishingReadiness}</span>
                <span className="text-xs text-slate-300">SEO {outputs.audit.seoScore}</span>
              </div>
              <div className="space-y-1.5">
                {(outputs.audit.findings || []).map((f: HumanFinding, i: number) => (
                  <div key={i} className="text-3xs text-slate-300 flex items-start gap-1.5">
                    <span className={`px-1 py-0.5 rounded font-bold shrink-0 ${
                      f.fixableBy === 'human' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
                    }`}>{f.fixableBy === 'human' ? 'PERLU ANDA' : 'AI'}</span>
                    <span className="leading-relaxed">{f.message}</span>
                  </div>
                ))}
              </div>
            </Section>
            {revisionHistory.length > 0 && (
              <Section title="Revisi">
                {revisionHistory.map(r => (
                  <div key={r.round} className="text-3xs text-slate-400">
                    Ronde {r.round}: {r.scoreBefore} → {r.scoreAfter} ({r.readinessBefore} → {r.readinessAfter}){r.accepted ? '' : ' · ditolak'}
                  </div>
                ))}
              </Section>
            )}
          </>
        )}

        {nodeId === 'image' && outputs?.imageBrief && (
          <Section title="Konsep gambar">
            <p className="text-xs text-slate-300 leading-relaxed">{outputs.imageBrief.visualPrompt}</p>
            {outputs.imageBrief.caption && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 space-y-0.5">
                <div className="text-xs font-bold text-white">{outputs.imageBrief.caption.title}</div>
                <div className="text-3xs text-slate-400">{outputs.imageBrief.caption.subtitle}</div>
                {outputs.imageBrief.caption.badge && (
                  <span className="inline-block text-3xs font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded">{outputs.imageBrief.caption.badge}</span>
                )}
              </div>
            )}
          </Section>
        )}

        {/* The hand-off node: the only place in the canvas where the operator types. */}
        {nodeId === 'handoff' && (
          <div className="space-y-3">
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Audit menemukan {humanFindings.length} hal yang <strong>bukan soal tulisan</strong> — data yang hanya Anda tahu. Selama ini belum diisi, AI tidak merevisi apa pun, karena menulis ulang di atas data yang salah cuma membuang kuota.
            </p>
            {humanFields.map(field => {
              const related = humanFindings.filter(f => (f.field || 'other') === field);
              const isList = field === 'targetCities' || field === 'productsServices';
              return (
                <div key={field} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                  <label className="text-xs font-bold text-amber-200">{FIELD_LABELS[field]}</label>
                  {related.map((f, i) => (
                    <p key={i} className="text-3xs text-amber-200/80 leading-relaxed">
                      {f.message}{f.suggestion ? ` — ${f.suggestion}` : ''}
                    </p>
                  ))}
                  {field === 'description' ? (
                    <textarea
                      value={editValue(field)}
                      onChange={e => onEditField(field, e.target.value)}
                      rows={3}
                      className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={editValue(field)}
                      onChange={e => onEditField(field, e.target.value)}
                      placeholder={isList ? 'Pisahkan dengan koma' : ''}
                      className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onSaveHumanEdits} className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg cursor-pointer">
                <Save className="w-3.5 h-3.5" /> Simpan ke Campaign
              </button>
              <button type="button" onClick={onSaveAndRerun} disabled={isRunning} className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-xs font-bold rounded-lg cursor-pointer">
                {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Simpan & Jalankan Ulang
              </button>
            </div>
          </div>
        )}

        {nodeId === 'sink' && (
          <div className="space-y-3">
            {blockers.length > 0 && (
              <Section title="Catatan sebelum terbit">
                {blockers.map((b, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-3xs text-amber-200/90">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span className="leading-relaxed">{b}</span>
                  </div>
                ))}
              </Section>
            )}
            <button
              type="button"
              onClick={onApply}
              disabled={!canApply || applied}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-400 text-slate-900 text-xs font-bold rounded-lg cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {applied ? 'Sudah diterapkan' : 'Terapkan ke Campaign'}
            </button>
            <p className="text-3xs text-slate-500 leading-relaxed">
              Menyalin strategi, keyword, konten, skor audit, dan konsep gambar ke campaign aktif. Gambar listing tetap dibuat di tab Visual Aset.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export const HumanIcon = UserRoundPen;
