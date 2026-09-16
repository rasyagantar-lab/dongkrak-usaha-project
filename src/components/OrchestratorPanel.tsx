import React, { useState } from 'react';
import {
  Workflow,
  Play,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  AlertTriangle,
  Cpu,
  ArrowRightLeft,
  Download,
  UserRoundPen,
  Save
} from 'lucide-react';
import { Campaign } from '../types';
import { useJobCenter, useJob, pollOrchestratorProgress } from '../jobs';

interface LedgerAttempt {
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  durationMs?: number;
  kind?: 'call' | 'wait';
  note?: string;
}

interface LedgerEntry {
  order: number;
  stage: string;
  agent: string;
  feature: string;
  status: 'done' | 'failed' | 'skipped';
  reason?: string;
  modelUsed?: string;
  modelName?: string;
  fallbackOccurred?: boolean;
  keyFingerprint?: string;
  attempts?: LedgerAttempt[];
  durationMs: number;
}

// A finding the auditor says only the business owner can resolve (data, not copy).
interface HumanFinding {
  type: 'pass' | 'warning' | 'error';
  category: string;
  message: string;
  fixableBy?: 'ai' | 'human';
  field?: 'targetCities' | 'address' | 'phoneWhatsApp' | 'businessName' | 'category' | 'description' | 'productsServices' | 'priceRange' | 'website' | 'other';
  suggestion?: string;
}

const FIELD_LABELS: Record<NonNullable<HumanFinding['field']>, string> = {
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

interface OrchestratorRun {
  ok: boolean;
  pipelineStatus: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  blockers: string[];
  ledger: LedgerEntry[];
  outputs: {
    plan?: { objective: string; taskBreakdown: string[]; risks: string[]; expectedOutcome: string };
    strategy?: any;
    seoStrategy?: any;
    generatedContent?: any;
    audit?: any;
    imageBrief?: any;
  };
  humanActionRequired?: HumanFinding[];
  revisionHistory?: {
    round: number;
    scoreBefore: number;
    scoreAfter: number;
    readinessBefore: string;
    readinessAfter: string;
    accepted: boolean;
  }[];
  summary: {
    total: number; done: number; failed: number; skipped: number; fallbacksUsed: number;
    revisions?: number; revisionsAccepted?: number;
  };
  durationMs: number;
}

interface OrchestratorPanelProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
}

const statusIcon = (status: LedgerEntry['status']) => {
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-rose-600" />;
  return <MinusCircle className="w-3.5 h-3.5 text-slate-400" />;
};

const rowTone = (status: LedgerEntry['status']) =>
  status === 'done' ? 'bg-emerald-50/60' : status === 'failed' ? 'bg-rose-50/60' : 'bg-slate-50';

export const OrchestratorPanel: React.FC<OrchestratorPanelProps> = ({ campaign, onUpdateCampaign }) => {
  const [objective, setObjective] = useState('Meningkatkan penjualan dan visibilitas lokal');
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);

  // The run itself lives in the App-level Job Center, keyed by campaign, so it keeps
  // going -- and its result stays readable -- when the user switches tabs or
  // campaigns while the agents are working (see src/jobs.tsx).
  const { startJob } = useJobCenter();
  const jobId = `orchestrator:${campaign.id}`;
  const job = useJob<OrchestratorRun>(jobId);
  const isRunning = job?.status === 'running';
  const run = job?.status === 'done' ? job.result || null : null;
  const error = job?.status === 'error' ? job.error || null : null;
  const liveLedger: LedgerEntry[] = isRunning && Array.isArray(job?.meta?.ledger) ? job!.meta.ledger : [];

  // Draft values for the "Perlu Input Anda" editors, keyed by field.
  const [humanEdits, setHumanEdits] = useState<Record<string, string>>({});

  const handleRun = (override?: Campaign) => {
    const target = override || campaign;
    setApplied(false);
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    startJob<OrchestratorRun>(
      { id: jobId, tab: 'orchestrator', campaignId: target.id, label: 'AI Orchestrator', subject: target.businessData.name },
      async (update, signal) => {
        const stopPolling = pollOrchestratorProgress(runId, update, signal);
        try {
          const response = await fetch('/api/orchestrator/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessData: target.businessData, objective, campaign: target, runId }),
            signal
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'Orchestrator gagal dijalankan');
          const s = data.summary || {};
          update({
            detail: `${data.pipelineStatus} · ${s.done ?? 0}/${s.total ?? 0} stage${data.humanActionRequired?.length ? ` · ${data.humanActionRequired.length} perlu input Anda` : ''}`,
            meta: { ledger: data.ledger }
          });
          return data as OrchestratorRun;
        } finally {
          stopPolling();
        }
      }
    );
  };

  const handleApply = () => {
    if (!run) return;
    const { seoStrategy, generatedContent, audit, imageBrief } = run.outputs;
    onUpdateCampaign({
      ...campaign,
      seoStrategy: seoStrategy || campaign.seoStrategy,
      generatedContent: generatedContent || campaign.generatedContent,
      validationScore: audit || campaign.validationScore,
      imageBrief: imageBrief || campaign.imageBrief,
      status: audit?.publishingReadiness === 'READY' ? 'Ready to Publish' : campaign.status,
      updatedAt: new Date().toISOString()
    });
    setApplied(true);
  };

  const hasApplicableOutput = !!(run?.outputs.seoStrategy || run?.outputs.generatedContent || run?.outputs.audit);

  const humanFindings = (run?.humanActionRequired || []).filter(f => f.fixableBy === 'human');
  const humanFields = [...new Set(humanFindings.map(f => f.field || 'other'))] as NonNullable<HumanFinding['field']>[];

  const currentValueFor = (field: NonNullable<HumanFinding['field']>): string => {
    const b = campaign.businessData;
    switch (field) {
      case 'targetCities': return (b.targetCities || []).join(', ');
      case 'productsServices': return (b.productsServices || []).join(', ');
      case 'businessName': return b.name || '';
      case 'other': return '';
      default: return String((b as any)[field] ?? '');
    }
  };
  const editValue = (field: NonNullable<HumanFinding['field']>) =>
    field in humanEdits ? humanEdits[field] : currentValueFor(field);

  // Builds the corrected campaign from the editors. targetCities is mirrored into
  // seoStrategy.targetCities so the next run's keyword/content stages see the fix.
  const applyHumanEdits = (): Campaign => {
    const b: any = { ...campaign.businessData };
    for (const field of humanFields) {
      if (!(field in humanEdits) || field === 'other') continue;
      const v = humanEdits[field];
      if (field === 'targetCities' || field === 'productsServices') {
        b[field] = v.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
      } else if (field === 'businessName') {
        b.name = v.trim();
      } else {
        b[field] = v.trim();
      }
    }
    return {
      ...campaign,
      businessData: b,
      seoStrategy: { ...campaign.seoStrategy, targetCities: b.targetCities },
      updatedAt: new Date().toISOString()
    };
  };
  const handleSaveHumanEdits = () => { onUpdateCampaign(applyHumanEdits()); };
  const handleSaveAndRerun = () => { const fixed = applyHumanEdits(); onUpdateCampaign(fixed); setHumanEdits({}); handleRun(fixed); };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Workflow className="w-5 h-5 text-violet-600" />
              AI Orchestrator
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Menjalankan seluruh spesialis secara berurutan: Strategy → Keyword → Content → Audit → Image Brief.
              Temuan audit yang bisa diperbaiki AI direvisi otomatis; yang butuh data dari Anda diserahkan lewat kolom "Perlu Input Anda".
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tujuan Campaign</label>
            <input
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-violet-500 focus:outline-none"
              placeholder="Contoh: Tambah leads WhatsApp dari pencarian lokal"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-2xs text-slate-500">
              Bisnis aktif: <strong className="text-slate-700">{campaign.businessData.name}</strong>
            </span>
            <button
              onClick={() => handleRun()}
              disabled={isRunning || !objective.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {isRunning ? 'Menjalankan semua agent...' : 'Jalankan Orchestrator'}
            </button>
          </div>
        </div>
      </div>

      {isRunning && (
        <div className="bg-white rounded-xl border border-violet-200 shadow-xs p-4 space-y-2.5 animate-du-fade-in motion-reduce:animate-none">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <RefreshCw className="w-3.5 h-3.5 text-violet-600 animate-spin" />
              {job?.detail || 'Menyiapkan pipeline...'}
            </div>
            <span className="text-3xs text-slate-400">Boleh pindah tab — proses tetap jalan di latar belakang.</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 origin-left transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `scaleX(${job?.progress ?? 0.05})` }}
            />
          </div>
          {liveLedger.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {liveLedger.map(entry => (
                <span key={entry.order} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-semibold border ${
                  entry.status === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : entry.status === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  {statusIcon(entry.status)}
                  {entry.agent}
                  <span className="text-slate-400 font-mono">{(entry.durationMs / 1000).toFixed(1)}s</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {run && (
        <>
          {/* Summary */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800">Hasil Eksekusi</h3>
              <span className={`px-2.5 py-1 rounded-full text-2xs font-bold ${
                run.pipelineStatus === 'COMPLETE' ? 'bg-emerald-100 text-emerald-800'
                  : run.pipelineStatus === 'PARTIAL' ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {run.pipelineStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
              {[
                { label: 'Total', value: run.summary.total, tone: 'text-slate-800' },
                { label: 'Berhasil', value: run.summary.done, tone: 'text-emerald-600' },
                { label: 'Gagal', value: run.summary.failed, tone: 'text-rose-600' },
                { label: 'Dilewati', value: run.summary.skipped, tone: 'text-slate-500' },
                { label: 'Fallback', value: run.summary.fallbacksUsed, tone: 'text-amber-600' }
              ].map(stat => (
                <div key={stat.label} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className={`text-lg font-extrabold ${stat.tone}`}>{stat.value}</div>
                  <div className="text-3xs text-slate-500 uppercase tracking-wider font-semibold">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const text = JSON.stringify({ pipelineStatus: run.pipelineStatus, durationMs: run.durationMs, summary: run.summary, ledger: run.ledger, humanActionRequired: run.humanActionRequired }, null, 2);
                  navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-3xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                {copied ? 'Tersalin ✓' : 'Salin ledger (JSON) untuk laporan'}
              </button>
              <div className="text-3xs text-slate-400 text-right">
                Durasi total: {(run.durationMs / 1000).toFixed(1)} detik
              </div>
            </div>
          </div>

          {/* Task Ledger */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-800">Task Ledger</h3>
              <p className="text-2xs text-slate-500 mt-0.5">
                Catatan tiap agent: model yang benar-benar dipakai, apakah terjadi rollback ke model cadangan, dan alasan jika gagal.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {run.ledger.map(entry => (
                <div key={entry.order} className={`p-3.5 ${rowTone(entry.status)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {statusIcon(entry.status)}
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-800">
                          {entry.order}. {entry.agent}
                        </div>
                        {entry.modelUsed && (
                          <div className="text-3xs text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                            <Cpu className="w-3 h-3" />
                            {entry.modelName || entry.modelUsed}
                            {entry.keyFingerprint && <span className="text-slate-400">· key {entry.keyFingerprint.slice(0, 6)}</span>}
                          </div>
                        )}
                        {entry.reason && (
                          <div className="text-3xs text-slate-600 mt-1 leading-relaxed">{entry.reason}</div>
                        )}
                        {/* Attempt trail: every provider call and every router wait, with
                            its cost. This is what explains a slow stage -- read it before
                            touching any timing parameter. */}
                        {entry.attempts && entry.attempts.length > 1 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {entry.attempts.map((a, i) => (
                              <span
                                key={i}
                                title={a.note || a.error || ''}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-3xs font-mono ${
                                  a.kind === 'wait' ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : a.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : 'bg-rose-50 border-rose-200 text-rose-700'
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
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {entry.fallbackOccurred && (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-3xs font-bold">
                          <ArrowRightLeft className="w-2.5 h-2.5" />
                          FALLBACK
                        </span>
                      )}
                      <span className="text-3xs text-slate-400 font-mono">{entry.durationMs}ms</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit feedback loop */}
          {run.revisionHistory && run.revisionHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-violet-600" />
                  Loop Revisi Audit
                </h3>
                <p className="text-2xs text-slate-500 mt-0.5">
                  Audit menilai konten, hasilnya dibaca orchestrator, lalu orchestrator memerintahkan Content Agent
                  menulis ulang dengan temuan itu. Revisi yang skornya turun dibuang otomatis.
                </p>
              </div>
              <div className="space-y-2">
                {run.revisionHistory.map(rev => (
                  <div
                    key={rev.round}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border text-2xs ${
                      rev.accepted ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800">Revisi #{rev.round}</div>
                      <div className="text-slate-600">
                        {rev.readinessBefore} → {rev.readinessAfter}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono font-bold text-slate-800">
                          {rev.scoreBefore} → {rev.scoreAfter}
                        </div>
                        <div className="text-3xs text-slate-500">skor SEO</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                        rev.accepted ? 'bg-emerald-600 text-white' : 'bg-slate-400 text-white'
                      }`}>
                        {rev.accepted ? 'DIPAKAI' : 'DIBUANG'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hand-off: findings only the owner can fix */}
          {humanFindings.length > 0 && (
            <div className="bg-white border-2 border-amber-300 rounded-xl shadow-xs p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center text-white shrink-0">
                  <UserRoundPen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Perlu Input Anda</h3>
                  <p className="text-2xs text-slate-600 mt-0.5 leading-relaxed">
                    Audit menemukan {humanFindings.length} masalah yang <strong>bukan soal tulisan</strong> tapi soal data —
                    AI sengaja tidak mengarang jawabannya. Perbaiki di bawah, lalu jalankan ulang.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {humanFields.map(field => {
                  const related = humanFindings.filter(f => (f.field || 'other') === field);
                  const isList = field === 'targetCities' || field === 'productsServices';
                  const isLong = field === 'description';
                  return (
                    <div key={field} className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-2">
                      <div className="text-xs font-bold text-slate-800">{FIELD_LABELS[field]}</div>
                      <ul className="space-y-1">
                        {related.map((f, i) => (
                          <li key={i} className="text-2xs text-slate-700">
                            <span className={f.type === 'error' ? 'text-rose-600 font-bold' : 'text-amber-700 font-bold'}>
                              {f.type === 'error' ? '✕ ' : '! '}
                            </span>
                            {f.message}
                            {f.suggestion && <span className="block text-slate-500 mt-0.5">→ {f.suggestion}</span>}
                          </li>
                        ))}
                      </ul>
                      {field !== 'other' && (
                        isLong ? (
                          <textarea
                            rows={3}
                            value={editValue(field)}
                            onChange={e => setHumanEdits(p => ({ ...p, [field]: e.target.value }))}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={editValue(field)}
                            onChange={e => setHumanEdits(p => ({ ...p, [field]: e.target.value }))}
                            placeholder={isList ? 'Pisahkan dengan koma, mis. Ciputat, Pamulang' : ''}
                            className="w-full text-xs border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        )
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <button
                  onClick={handleSaveHumanEdits}
                  disabled={isRunning || Object.keys(humanEdits).length === 0}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  Simpan ke Campaign
                </button>
                <button
                  onClick={handleSaveAndRerun}
                  disabled={isRunning || Object.keys(humanEdits).length === 0}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Simpan & Jalankan Ulang
                </button>
              </div>
            </div>
          )}

          {/* Blockers */}
          {run.blockers.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Belum Siap Publish
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-2xs text-amber-900">
                {run.blockers.map((blocker, index) => (
                  <li key={index}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Orchestrator briefing */}
          {run.outputs.plan && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3 text-xs text-violet-900">
              <h3 className="font-bold text-sm">Briefing Orchestrator</h3>
              <div>
                <div className="font-semibold text-violet-800">Objective</div>
                <div>{run.outputs.plan.objective}</div>
              </div>
              <div>
                <div className="font-semibold text-violet-800">Rincian Tugas</div>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  {run.outputs.plan.taskBreakdown?.map((task, index) => <li key={index}>{task}</li>)}
                </ul>
              </div>
              {run.outputs.plan.risks?.length > 0 && (
                <div>
                  <div className="font-semibold text-violet-800">Risiko</div>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    {run.outputs.plan.risks.map((risk, index) => <li key={index}>{risk}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Outputs preview + apply */}
          {hasApplicableOutput && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Hasil Spesialis</h3>
                  <p className="text-2xs text-slate-500 mt-0.5">
                    Terapkan ke campaign aktif untuk mengisi SEO strategy, konten, dan skor audit.
                  </p>
                </div>
                <button
                  onClick={handleApply}
                  disabled={applied}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  {applied ? 'Sudah Diterapkan' : 'Terapkan ke Campaign'}
                </button>
              </div>

              {/* SEO strategy */}
              {run.outputs.seoStrategy && (
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="font-bold text-xs text-slate-700">SEO & Keyword</div>
                  <div className="text-2xs text-slate-600">
                    <span className="font-semibold">Keyword utama:</span> {run.outputs.seoStrategy.mainKeyword}
                    <span className="text-slate-400"> · {run.outputs.seoStrategy.searchIntent}</span>
                  </div>
                  {run.outputs.seoStrategy.secondaryKeywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {run.outputs.seoStrategy.secondaryKeywords.map((kw: string, i: number) => (
                        <span key={i} className="bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-3xs">{kw}</span>
                      ))}
                    </div>
                  )}
                  {run.outputs.seoStrategy.contentAngle && (
                    <div className="text-2xs text-slate-600"><span className="font-semibold">Angle:</span> {run.outputs.seoStrategy.contentAngle}</div>
                  )}
                </div>
              )}

              {/* Full generated content */}
              {run.outputs.generatedContent && (
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
                  <div className="font-bold text-xs text-slate-700">Konten yang Dihasilkan</div>
                  <div>
                    <div className="text-3xs font-semibold text-slate-500 uppercase tracking-wide">SEO Title</div>
                    <div className="text-2xs text-slate-700">{run.outputs.generatedContent.seoTitle}</div>
                  </div>
                  <div>
                    <div className="text-3xs font-semibold text-slate-500 uppercase tracking-wide">Meta Description</div>
                    <div className="text-2xs text-slate-700">{run.outputs.generatedContent.metaDescription}</div>
                  </div>
                  <div>
                    <div className="text-3xs font-semibold text-slate-500 uppercase tracking-wide">Deskripsi</div>
                    <div className="text-2xs text-slate-700 whitespace-pre-line max-h-52 overflow-y-auto bg-white rounded border border-slate-200 p-2">
                      {run.outputs.generatedContent.seoDescription}
                    </div>
                  </div>
                  {run.outputs.generatedContent.callToAction && (
                    <div>
                      <div className="text-3xs font-semibold text-slate-500 uppercase tracking-wide">CTA</div>
                      <div className="text-2xs text-slate-700">{run.outputs.generatedContent.callToAction}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Full audit findings */}
              {run.outputs.audit && (
                <div className={`p-3.5 rounded-lg border space-y-2.5 ${
                  run.outputs.audit.publishingReadiness === 'READY' ? 'bg-emerald-50 border-emerald-200'
                    : run.outputs.audit.publishingReadiness === 'BLOCKED' ? 'bg-rose-50 border-rose-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs text-slate-800">Hasil Audit</div>
                    <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-white/70 border border-slate-200">
                      {run.outputs.audit.publishingReadiness}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'SEO', value: run.outputs.audit.seoScore },
                      { label: 'Kualitas', value: run.outputs.audit.contentQuality },
                      { label: 'Lokal', value: run.outputs.audit.localRelevance }
                    ].map(s => (
                      <div key={s.label} className="bg-white/70 rounded-lg border border-slate-200 py-1.5">
                        <div className="text-sm font-extrabold text-slate-800">{s.value}</div>
                        <div className="text-3xs text-slate-500 uppercase tracking-wider font-semibold">{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {run.outputs.audit.findings?.length > 0 && (
                    <ul className="space-y-1">
                      {run.outputs.audit.findings.map((f: any, i: number) => (
                        <li key={i} className="text-2xs text-slate-700 flex items-start gap-1.5">
                          <span className={`mt-0.5 shrink-0 font-bold ${
                            f.type === 'error' ? 'text-rose-600' : f.type === 'warning' ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {f.type === 'error' ? '✕' : f.type === 'warning' ? '!' : '✓'}
                          </span>
                          <span>
                            <span className="font-semibold">{f.category}:</span> {f.message}
                            {f.type !== 'pass' && (
                              <span className={`ml-1.5 inline-block text-3xs font-bold px-1 py-0.5 rounded ${
                                f.fixableBy === 'human' ? 'bg-amber-200 text-amber-900' : 'bg-violet-100 text-violet-800'
                              }`}>
                                {f.fixableBy === 'human' ? 'PERLU ANDA' : 'DIPERBAIKI AI'}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Image brief + caption */}
              {run.outputs.imageBrief && (
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="font-bold text-xs text-slate-700">Konsep Visual</div>
                  <div className="text-2xs text-slate-600">{run.outputs.imageBrief.conceptTitle}</div>
                  {run.outputs.imageBrief.caption && (
                    <div className="bg-white rounded border border-slate-200 p-2 space-y-1">
                      <div className="text-3xs font-semibold text-slate-500 uppercase tracking-wide">
                        Caption untuk gambar listing
                      </div>
                      <div className="text-2xs text-slate-800 font-bold">{run.outputs.imageBrief.caption.title}</div>
                      <div className="text-2xs text-slate-600">{run.outputs.imageBrief.caption.subtitle}</div>
                      {run.outputs.imageBrief.caption.badge && (
                        <span className="inline-block bg-rose-600 text-white text-3xs font-bold px-1.5 py-0.5 rounded">
                          {run.outputs.imageBrief.caption.badge}
                        </span>
                      )}
                      <div className="text-3xs text-slate-400 pt-1">
                        Setelah "Terapkan ke Campaign", caption dan deskripsi foto ini otomatis terisi di tab Visual Aset.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
