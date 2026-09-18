import React, { useMemo, useState } from 'react';
import { Play, RefreshCw, XCircle, ClipboardCopy, CheckCircle2, ArrowRightLeft, UserRoundPen } from 'lucide-react';
import { Campaign } from '../types';
import { useJobCenter, useJob, pollOrchestratorProgress } from '../jobs';
import { AgentCanvas } from './orchestrator/AgentCanvas';
import { NodeInspector, type HumanFinding } from './orchestrator/NodeInspector';
import { deriveGraphState, type LedgerEntry } from './orchestrator/canvasGraph';
import { parseLengthRule, describe as describeRule, type LengthRule, type Measured } from '../lib/lengthRule';

/*
  The orchestrator tab is a canvas of the pipeline, not a stack of report blocks.

  Why: the product's real subject is seven agents handing work to each other, and a
  vertical list hid exactly that. The canvas shows who is working, what came before,
  where it stalled, and -- through the hand-off node -- what only the owner can fix.
  Detail lives in the inspector, attached to the node it belongs to.

  Animation here is a status signal, never decoration: only edges feeding the stage
  the server reports as running are lit, a running node shows an indeterminate bar
  (the server cannot say how far along a stage is, so the UI does not pretend), and
  everything stops when the run stops. See AgentCanvas for the performance rules.
*/

interface OrchestratorRun {
  ok: boolean;
  runId?: string;
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
  revisionHistory?: Array<{ round: number; scoreBefore: number; scoreAfter: number; readinessBefore: string; readinessAfter: string; accepted: boolean }>;
  summary: { total: number; done: number; failed: number; skipped: number; fallbacksUsed: number; revisions?: number; revisionsAccepted?: number };
  durationMs: number;
  /** The length rule the server actually applied (parsed from the instruction field). */
  rules?: { length: LengthRule };
  measured?: Measured;
}

interface OrchestratorPanelProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
}

export const OrchestratorPanel: React.FC<OrchestratorPanelProps> = ({ campaign, onUpdateCampaign }) => {
  const [objective, setObjective] = useState('Meningkatkan penjualan dan visibilitas lokal');
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [humanEdits, setHumanEdits] = useState<Record<string, string>>({});

  // The run lives in the App-level Job Center, keyed by campaign, so it keeps going --
  // and its result stays readable -- when the operator switches tabs or campaigns.
  const { startJob } = useJobCenter();
  const jobId = `orchestrator:${campaign.id}`;
  const job = useJob<OrchestratorRun>(jobId);
  const isRunning = job?.status === 'running';
  const run = job?.status === 'done' ? job.result || null : null;
  const error = job?.status === 'error' ? job.error || null : null;
  const liveLedger: LedgerEntry[] = isRunning && Array.isArray(job?.meta?.ledger) ? job!.meta.ledger : [];
  const ledger: LedgerEntry[] = run?.ledger ?? liveLedger;

  const humanFindings = (run?.humanActionRequired || []).filter(f => f.fixableBy === 'human');
  const humanFields = [...new Set(humanFindings.map(f => f.field || 'other'))] as Array<NonNullable<HumanFinding['field']>>;
  const revisionRounds = run?.revisionHistory?.length ?? 0;

  const graph = useMemo(() => deriveGraphState({
    ledger,
    isRunning,
    progressLabel: job?.detail,
    hasHumanFindings: humanFindings.length > 0,
    revisionRounds,
    finished: !!run,
    pipelineOk: run?.pipelineStatus !== 'FAILED'
  }), [ledger, isRunning, job?.detail, humanFindings.length, revisionRounds, run]);

  const handleRun = (override?: Campaign) => {
    const target = override || campaign;
    setApplied(false);
    setSelectedNode(null);
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

  const canApply = !!(run?.outputs.seoStrategy || run?.outputs.generatedContent || run?.outputs.audit);

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
  const handleSaveAndRerun = () => {
    const fixed = applyHumanEdits();
    onUpdateCampaign(fixed);
    setHumanEdits({});
    handleRun(fixed);
  };

  const copyLedger = () => {
    if (!run) return;
    const text = JSON.stringify({ pipelineStatus: run.pipelineStatus, durationMs: run.durationMs, summary: run.summary, ledger: run.ledger, humanActionRequired: run.humanActionRequired }, null, 2);
    navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
    setTimeout(() => setCopied(false), 2000);
  };

  // The same parser the server runs, so what this line promises is what the run
  // enforces. It answers "did it understand me?" before a single call is spent.
  const readRule = useMemo(() => parseLengthRule(objective), [objective]);
  const toolbar = (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-2.5 sm:p-3 space-y-2.5 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-3xs text-slate-500 uppercase tracking-wider">Campaign</div>
          <div className="text-xs font-bold text-slate-100 truncate">{campaign.businessData.name}</div>
        </div>
        <input
          type="text"
          value={objective}
          onChange={e => setObjective(e.target.value)}
          placeholder="Tujuan & instruksi untuk semua agent"
          title="Diteruskan ke agent Plan, Strategi, Keyword, Konten, dan Audit. Contoh: tonjolkan garansi; artikel sekitar 700 kata."
          className="w-full sm:w-72 text-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 placeholder:text-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => handleRun()}
          disabled={isRunning || !objective.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-400 text-slate-950 text-xs font-bold rounded-lg cursor-pointer shrink-0"
        >
          {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {isRunning ? 'Berjalan...' : 'Jalankan'}
        </button>
      </div>

      <div className={`text-2xs leading-snug ${readRule.clamped ? 'text-amber-300' : readRule.source === 'operator' ? 'text-sky-300' : 'text-slate-500'}`}>
        <span className="font-bold">Terbaca:</span>{' '}
        {readRule.clamped
          ? readRule.clamped
          : readRule.source === 'operator'
            ? `panjang ${describeRule(readRule)} — diukur server, dikoreksi otomatis kalau meleset.`
            : `tidak ada instruksi panjang; dipakai default pembimbing ${describeRule(readRule).replace(' (default pembimbing)', '')}. Tulis mis. "40–60 kalimat" atau "maksimal 2.000 karakter" untuk mengubahnya.`}
      </div>

      {(run || isRunning || error) && (
        <div className="flex flex-wrap items-center gap-1.5 text-3xs">
          {run && (
            <span className={`px-2 py-0.5 rounded font-bold ${
              run.pipelineStatus === 'COMPLETE' ? 'bg-emerald-500/15 text-emerald-300'
                : run.pipelineStatus === 'PARTIAL' ? 'bg-amber-500/15 text-amber-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}>{run.pipelineStatus}</span>
          )}
          {run && <span className="text-slate-400">{run.summary.done}/{run.summary.total} tahap</span>}
          {run && run.summary.fallbacksUsed > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-300"><ArrowRightLeft className="w-3 h-3" />{run.summary.fallbacksUsed} fallback</span>
          )}
          {run && <span className="text-slate-500 font-mono">{(run.durationMs / 1000).toFixed(1)}s</span>}
          {humanFindings.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedNode('handoff')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold hover:bg-amber-500/25 cursor-pointer"
            >
              <UserRoundPen className="w-3 h-3" />{humanFindings.length} perlu input Anda
            </button>
          )}
          {run && canApply && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applied}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold hover:bg-emerald-500/25 disabled:opacity-60 cursor-pointer"
            >
              <CheckCircle2 className="w-3 h-3" />{applied ? 'diterapkan' : 'terapkan ke campaign'}
            </button>
          )}
          {run && (
            <button type="button" onClick={copyLedger} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 cursor-pointer">
              <ClipboardCopy className="w-3 h-3" />{copied ? 'tersalin' : 'salin ledger'}
            </button>
          )}
          {error && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 font-semibold">
              <XCircle className="w-3 h-3" />{error}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 items-stretch">
        <AgentCanvas
          graph={graph}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          isRunning={isRunning}
          progressLabel={job?.detail}
          toolbar={toolbar}
        />
        {selectedNode && (
          <div className="h-[62vh] min-h-[380px] rounded-2xl border border-slate-800 overflow-hidden animate-du-fade-in motion-reduce:animate-none">
            <NodeInspector
              nodeId={selectedNode}
              graph={graph}
              outputs={run?.outputs || {}}
              lengthRule={run?.rules?.length || readRule}
              blockers={run?.blockers || []}
              revisionHistory={run?.revisionHistory || []}
              humanFindings={humanFindings}
              humanFields={humanFields}
              editValue={editValue}
              onEditField={(field, value) => setHumanEdits(prev => ({ ...prev, [field]: value }))}
              onSaveHumanEdits={handleSaveHumanEdits}
              onSaveAndRerun={handleSaveAndRerun}
              onApply={handleApply}
              applied={applied}
              canApply={canApply}
              businessName={campaign.businessData.name}
              isRunning={isRunning}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        )}
      </div>

      <p className="text-2xs text-slate-500 px-1">
        Klik node untuk melihat model yang dipakai, durasinya, dan hasil tahap itu. Scroll untuk zoom, seret untuk menggeser, tombol di kanan bawah untuk paskan layar dan layar penuh.
      </p>
    </div>
  );
};
